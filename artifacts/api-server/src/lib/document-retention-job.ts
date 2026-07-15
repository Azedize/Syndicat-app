/**
 * Document Retention / Purge Scheduler
 *
 * Enforces the retention policy computed in lib/retention.ts:
 *   - Notifies syndicate admins when documents enter the 30/60/90-day
 *     expiring-soon window (retentionUntil approaching).
 *   - Once retentionUntil has passed AND the document is already soft-deleted
 *     (isDeleted=true) for at least `purgeGraceDays`, hard-deletes the PDF
 *     from GCS and the DB row — never before, and never for documents that
 *     are still "live" (not in the recycle bin).
 *
 * Safety:
 *   - Runs in DRY_RUN mode by default (env DOCUMENT_PURGE_DRY_RUN=false to disable).
 *   - Every purge decision — real or dry-run — is written to the audit log.
 *   - A document already legally retained (retentionUntil in the future) is
 *     NEVER purged, even if soft-deleted.
 */
import { db } from "@workspace/db";
import { documentsTable } from "@workspace/db/schema";
import { and, eq, lt, isNotNull } from "drizzle-orm";
import { logger } from "./logger.js";
import { systemAuditLog } from "./audit.js";
import { deleteDocumentFromGcs } from "./documentPdf.js";
import { createAlert } from "./notify.js";
import { expiryBucket } from "./retention.js";

const PURGE_GRACE_DAYS = Number(process.env.DOCUMENT_PURGE_GRACE_DAYS ?? 30);
const DRY_RUN = process.env.DOCUMENT_PURGE_DRY_RUN !== "false"; // default: dry-run (safe)

export interface RetentionScanResult {
  timestamp: string;
  dryRun: boolean;
  notified30: number;
  notified60: number;
  notified90: number;
  eligibleForPurge: number;
  purged: number;
  errors: number;
}

/**
 * Scans all non-deleted documents approaching their retention expiry and
 * sends a single admin notification per syndicate summarizing the count.
 */
async function notifyExpiringDocuments(result: RetentionScanResult): Promise<void> {
  const rows = await db
    .select({
      id: documentsTable.id,
      title: documentsTable.title,
      syndicateId: documentsTable.syndicateId,
      retentionUntil: documentsTable.retentionUntil,
    })
    .from(documentsTable)
    .where(and(eq(documentsTable.isDeleted, false), isNotNull(documentsTable.retentionUntil)));

  const bySyndicateBucket = new Map<string, { in30: number; in60: number; in90: number }>();

  for (const row of rows) {
    const bucket = expiryBucket(row.retentionUntil);
    if (!bucket || !row.syndicateId) continue;
    const key = row.syndicateId;
    const entry = bySyndicateBucket.get(key) ?? { in30: 0, in60: 0, in90: 0 };
    if (bucket === 30) { entry.in30++; result.notified30++; }
    else if (bucket === 60) { entry.in60++; result.notified60++; }
    else if (bucket === 90) { entry.in90++; result.notified90++; }
    bySyndicateBucket.set(key, entry);
  }

  // Only alert admins about the urgent (30-day) bucket to avoid noise —
  // 60/90-day counts are still tallied above for the dashboard summary.
  for (const [syndicateId, buckets] of bySyndicateBucket) {
    if (buckets.in30 === 0) continue;
    await createAlert({
      title: "Documents approchant la fin de conservation légale",
      message: `${buckets.in30} document(s) atteindront leur date limite de conservation dans les 30 prochains jours.`,
      type: "warning",
      syndicateId,
      target: "admin",
    }).catch(() => {});
  }
}

/**
 * Purges (hard-deletes) documents that are BOTH past their legal retention
 * date AND already sitting in the recycle bin (soft-deleted) for at least
 * `PURGE_GRACE_DAYS`. In dry-run mode, only logs what WOULD be purged.
 */
async function purgeExpiredDeletedDocuments(result: RetentionScanResult): Promise<void> {
  const now = new Date();
  const graceCutoff = new Date(now.getTime() - PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await db
    .select()
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.isDeleted, true),
        isNotNull(documentsTable.retentionUntil),
        lt(documentsTable.retentionUntil, now),
        lt(documentsTable.deletedAt, graceCutoff),
      ),
    );

  result.eligibleForPurge = candidates.length;

  for (const doc of candidates) {
    try {
      await systemAuditLog({
        action: DRY_RUN ? "DOCUMENT_PURGE_DRY_RUN" : "DOCUMENT_PURGED",
        entity: "document",
        entityId: doc.id,
        syndicateId: doc.syndicateId ?? undefined,
        details: `"${doc.title}" — retentionUntil=${doc.retentionUntil?.toISOString()}, deletedAt=${doc.deletedAt?.toISOString()}`,
      });

      if (DRY_RUN) {
        logger.info({ docId: doc.id, title: doc.title }, "Retention job (dry-run): would purge document");
        continue;
      }

      if (doc.fileUrl) {
        await deleteDocumentFromGcs(doc.fileUrl).catch((err) =>
          logger.warn({ err, docId: doc.id }, "Retention job: GCS delete failed, continuing with DB delete"),
        );
      }
      await db.delete(documentsTable).where(eq(documentsTable.id, doc.id));
      result.purged++;
    } catch (err) {
      logger.error({ err, docId: doc.id }, "Retention job: purge failed for document");
      result.errors++;
    }
  }
}

export async function runRetentionScan(): Promise<RetentionScanResult> {
  const result: RetentionScanResult = {
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    notified30: 0,
    notified60: 0,
    notified90: 0,
    eligibleForPurge: 0,
    purged: 0,
    errors: 0,
  };

  try {
    await notifyExpiringDocuments(result);
  } catch (err) {
    logger.error({ err }, "Retention job: expiry notification pass failed");
    result.errors++;
  }

  try {
    await purgeExpiredDeletedDocuments(result);
  } catch (err) {
    logger.error({ err }, "Retention job: purge pass failed");
    result.errors++;
  }

  logger.info(result, "Document retention scan complete");
  return result;
}

/** Starts the daily retention scan (on boot + every 24 hours). Dry-run by default. */
export function startDocumentRetentionScheduler(): void {
  runRetentionScan().catch((err) => logger.warn({ err }, "Boot retention scan failed"));
  setInterval(() => {
    runRetentionScan().catch((err) => logger.warn({ err }, "Scheduled retention scan failed"));
  }, 24 * 60 * 60 * 1000);
}
