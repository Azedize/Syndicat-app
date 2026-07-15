/**
 * Document Business-Expiration Scheduler
 *
 * Distinct from lib/document-retention-job.ts, which enforces LEGAL retention
 * (how long a document must be kept before it may be purged). This job tracks
 * `documentsTable.expiresAt` — a BUSINESS validity date set by the author
 * (e.g. a contract/mandate/authorization end date) — and:
 *
 *   1. Sends a reminder (push + in-app alert + email) at the 30/15/7/1-day
 *      thresholds before expiresAt, exactly once per threshold per document
 *      (tracked via `expiryNotifiedBucket`, the smallest bucket already sent).
 *   2. Once expiresAt has passed, flips the document's status to "expired"
 *      (skipping already-terminal states: archived) and notifies once more.
 *
 * Runs on boot + every 6 hours so same-day thresholds (7d/1d) aren't missed
 * by a 24h-only cadence.
 */
import { db } from "@workspace/db";
import { documentsTable, usersTable } from "@workspace/db/schema";
import { and, eq, isNotNull, lt, lte } from "drizzle-orm";
import { logger } from "./logger.js";
import { systemAuditLog } from "./audit.js";
import { createAlert, sendEmailToMany } from "./notify.js";

const THRESHOLDS = [30, 15, 7, 1] as const;

export interface ExpiryScanResult {
  timestamp: string;
  remindersSent: number;
  expired: number;
  errors: number;
}

function daysUntil(date: Date, now: Date): number {
  return Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

async function notifyDocumentContacts(
  syndicateId: string | null,
  title: string,
  subject: string,
  message: string,
): Promise<void> {
  if (!syndicateId) return;
  createAlert({ title: subject, message, type: "warning", syndicateId, target: "admin" }).catch(() => {});

  const admins = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.syndicateId, syndicateId), eq(usersTable.role, "syndicate_admin")));

  sendEmailToMany(
    admins.map((a) => a.email),
    subject,
    `<p>${message}</p><p>Document concerné : <strong>${title}</strong></p>`,
    "document_expiring",
    syndicateId,
  ).catch(() => {});
}

/** Sends the 30/15/7/1-day reminder for documents approaching `expiresAt`. */
async function scanExpiringSoon(result: ExpiryScanResult): Promise<void> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: documentsTable.id,
      title: documentsTable.title,
      syndicateId: documentsTable.syndicateId,
      expiresAt: documentsTable.expiresAt,
      status: documentsTable.status,
      expiryNotifiedBucket: documentsTable.expiryNotifiedBucket,
    })
    .from(documentsTable)
    .where(
      and(
        eq(documentsTable.isDeleted, false),
        isNotNull(documentsTable.expiresAt),
        lte(documentsTable.expiresAt, horizon),
      ),
    );

  for (const row of rows) {
    if (!row.expiresAt || row.status === "archived" || row.status === "expired") continue;
    const remaining = daysUntil(row.expiresAt, now);
    if (remaining <= 0) continue; // handled by scanNewlyExpired below

    // Pick the largest threshold at or below the remaining days that hasn't been sent yet.
    const dueBucket = THRESHOLDS.find((th) => remaining <= th);
    if (!dueBucket) continue;
    const alreadySentSmallerOrEqual = row.expiryNotifiedBucket != null && row.expiryNotifiedBucket <= dueBucket;
    if (alreadySentSmallerOrEqual) continue;

    try {
      await db
        .update(documentsTable)
        .set({ expiryNotifiedBucket: dueBucket })
        .where(eq(documentsTable.id, row.id));

      await notifyDocumentContacts(
        row.syndicateId,
        row.title,
        "Document arrivant à expiration",
        `Le document "${row.title}" expirera dans ${dueBucket} jour(s) (le ${row.expiresAt.toLocaleDateString("fr-FR")}).`,
      );
      result.remindersSent++;
    } catch (err) {
      logger.error({ err, docId: row.id }, "Expiry job: reminder failed");
      result.errors++;
    }
  }
}

/** Auto-transitions documents whose expiresAt has already passed to "expired". */
async function scanNewlyExpired(result: ExpiryScanResult): Promise<void> {
  const now = new Date();

  const candidates = await db
    .select({ id: documentsTable.id, title: documentsTable.title, syndicateId: documentsTable.syndicateId, status: documentsTable.status })
    .from(documentsTable)
    .where(and(eq(documentsTable.isDeleted, false), isNotNull(documentsTable.expiresAt), lt(documentsTable.expiresAt, now)));

  for (const row of candidates) {
    if (row.status === "expired" || row.status === "archived") continue;
    try {
      await db
        .update(documentsTable)
        .set({ status: "expired", updatedAt: now })
        .where(eq(documentsTable.id, row.id));

      await systemAuditLog({
        action: "DOCUMENT_EXPIRED",
        entity: "document",
        entityId: row.id,
        syndicateId: row.syndicateId ?? undefined,
        details: `"${row.title}" — statut basculé automatiquement à "expired"`,
      });

      await notifyDocumentContacts(
        row.syndicateId,
        row.title,
        "Document expiré",
        `Le document "${row.title}" a expiré et n'est plus valide.`,
      );
      result.expired++;
    } catch (err) {
      logger.error({ err, docId: row.id }, "Expiry job: auto-expire failed");
      result.errors++;
    }
  }
}

export async function runExpiryScan(): Promise<ExpiryScanResult> {
  const result: ExpiryScanResult = { timestamp: new Date().toISOString(), remindersSent: 0, expired: 0, errors: 0 };

  try {
    await scanExpiringSoon(result);
  } catch (err) {
    logger.error({ err }, "Expiry job: reminder pass failed");
    result.errors++;
  }

  try {
    await scanNewlyExpired(result);
  } catch (err) {
    logger.error({ err }, "Expiry job: auto-expire pass failed");
    result.errors++;
  }

  logger.info(result, "Document expiry scan complete");
  return result;
}

/** Starts the expiration scan (on boot + every 6 hours). */
export function startDocumentExpiryScheduler(): void {
  runExpiryScan().catch((err) => logger.warn({ err }, "Boot expiry scan failed"));
  setInterval(() => {
    runExpiryScan().catch((err) => logger.warn({ err }, "Scheduled expiry scan failed"));
  }, 6 * 60 * 60 * 1000);
}
