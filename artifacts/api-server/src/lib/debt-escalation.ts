/**
 * Debt Escalation Scheduler
 *
 * Scans unpaid appels-de-fonds daily and automatically creates escalation
 * records when overdue thresholds are crossed.
 *
 * Levels (months overdue):
 *   reminder        ≥ 1 month
 *   warning         ≥ 3 months
 *   final_warning   ≥ 6 months
 *   agm_proposal    ≥ 12 months
 *   legal_action    ≥ legalThresholdMonths (configurable per syndicate, default 18)
 */
import { db } from "@workspace/db";
import {
  appelsDeFondsTable,
  buildingsTable,
  debtEscalationsTable,
  lotsTable,
  membersTable,
  syndicatesTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and, inArray, ne } from "drizzle-orm";
import { createAlert, sendPushToUsers } from "./notify.js";
import { logger } from "./logger.js";

export type EscalationLevel =
  | "reminder"
  | "warning"
  | "final_warning"
  | "agm_proposal"
  | "legal_action";

export const LEVEL_ORDER: EscalationLevel[] = [
  "reminder",
  "warning",
  "final_warning",
  "agm_proposal",
  "legal_action",
];

export const LEVEL_LABELS: Record<EscalationLevel, string> = {
  reminder: "Rappel (1 mois)",
  warning: "Mise en demeure (3 mois)",
  final_warning: "Dernière mise en demeure (6 mois)",
  agm_proposal: "Proposition AG Extraordinaire (12 mois)",
  legal_action: "Action Juridique (contentieux)",
};

export const LEVEL_COLORS: Record<EscalationLevel, string> = {
  reminder: "#f59e0b",
  warning: "#f97316",
  final_warning: "#ef4444",
  agm_proposal: "#9333ea",
  legal_action: "#1e293b",
};

export function levelIndex(level: string): number {
  return LEVEL_ORDER.indexOf(level as EscalationLevel);
}

export function computeLevel(
  overdueMonths: number,
  legalThresholdMonths: number,
): EscalationLevel | null {
  if (overdueMonths >= legalThresholdMonths) return "legal_action";
  if (overdueMonths >= 12) return "agm_proposal";
  if (overdueMonths >= 6) return "final_warning";
  if (overdueMonths >= 3) return "warning";
  if (overdueMonths >= 1) return "reminder";
  return null;
}

export interface EscalationScanResult {
  created: number;
  skipped: number;
  errors: number;
  timestamp: string;
}

/**
 * Main scan logic — idempotent, safe to run repeatedly.
 * For each lot with unpaid charges, computes required escalation level
 * and creates a new record only if the lot has crossed a higher threshold.
 */
export async function runDailyEscalationScan(): Promise<EscalationScanResult> {
  const result: EscalationScanResult = {
    created: 0,
    skipped: 0,
    errors: 0,
    timestamp: new Date().toISOString(),
  };

  try {
    const unpaidAppels = await db
      .select()
      .from(appelsDeFondsTable)
      .where(inArray(appelsDeFondsTable.status, ["pending", "overdue"]));

    if (unpaidAppels.length === 0) return result;

    // Group appels by lotId
    const byLot = new Map<string, typeof unpaidAppels>();
    for (const appel of unpaidAppels) {
      if (!appel.lotId) continue;
      const list = byLot.get(appel.lotId) ?? [];
      list.push(appel);
      byLot.set(appel.lotId, list);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const [lotId, appels] of byLot) {
      try {
        // Find the oldest unpaid date and sum total overdue
        let oldestDate: Date | null = null;
        let totalUnpaid = 0;

        for (const appel of appels) {
          totalUnpaid += parseFloat(String(appel.amount ?? 0));
          const refDate = appel.dueDate
            ? new Date(appel.dueDate)
            : appel.createdAt ?? null;
          if (refDate && (!oldestDate || refDate < oldestDate)) {
            oldestDate = refDate;
          }
        }

        if (!oldestDate || totalUnpaid <= 0) {
          result.skipped++;
          continue;
        }

        const overdueMs = today.getTime() - oldestDate.getTime();
        const overdueMonths = overdueMs / (1000 * 60 * 60 * 24 * 30.44);

        // Fetch lot and owner
        const [lot] = await db
          .select()
          .from(lotsTable)
          .where(eq(lotsTable.id, lotId));
        if (!lot) {
          result.skipped++;
          continue;
        }

        const ownerId = lot.ownerId;
        let syndicateId: string | null = null;
        let memberName = "Résident inconnu";

        if (ownerId) {
          const [member] = await db
            .select()
            .from(membersTable)
            .where(eq(membersTable.id, ownerId));
          if (member) {
            memberName = member.name;
            syndicateId = member.syndicateId ?? null;
          }
        }

        // Derive syndicateId from building if member lookup missed it
        if (!syndicateId) {
          const [building] = await db
            .select({ syndicateId: buildingsTable.syndicateId })
            .from(buildingsTable)
            .where(eq(buildingsTable.id, lot.buildingId));
          syndicateId = building?.syndicateId ?? null;
        }

        // Get legal threshold from syndicate config
        let legalThresholdMonths = 18;
        if (syndicateId) {
          const [syndicate] = await db
            .select({ legalThresholdMonths: syndicatesTable.legalThresholdMonths })
            .from(syndicatesTable)
            .where(eq(syndicatesTable.id, syndicateId));
          if (syndicate?.legalThresholdMonths != null) {
            legalThresholdMonths = syndicate.legalThresholdMonths;
          }
        }

        const requiredLevel = computeLevel(overdueMonths, legalThresholdMonths);
        if (!requiredLevel) {
          result.skipped++;
          continue;
        }

        // Deduplication: check ALL historical escalations for this lot (including
        // overridden ones) to determine the highest level ever triggered.
        // This prevents the daily scan from recreating an overridden level
        // while the debt amount is unchanged.
        const existing = await db
          .select({ escalationLevel: debtEscalationsTable.escalationLevel })
          .from(debtEscalationsTable)
          .where(
            and(
              eq(debtEscalationsTable.lotId, lotId),
              ne(debtEscalationsTable.status, "resolved"),
            ),
          );

        // Only proceed if we've crossed a strictly higher threshold than anything ever recorded
        const highestExisting = existing.reduce<string | null>((best, e) => {
          const lv = e.escalationLevel ?? "";
          if (!best) return lv;
          return levelIndex(lv) > levelIndex(best) ? lv : best;
        }, null);

        if (highestExisting && levelIndex(highestExisting) >= levelIndex(requiredLevel)) {
          result.skipped++;
          continue;
        }

        // Insert new escalation record
        const [escalation] = await db
          .insert(debtEscalationsTable)
          .values({
            syndicateId,
            memberId: ownerId,
            memberName,
            lotId,
            residentType: "member",
            totalOverdue: totalUnpaid.toFixed(2),
            overdueMonths: Math.floor(overdueMonths),
            escalationLevel: requiredLevel,
            level: requiredLevel,
            status: "open",
            alertSentAt: new Date(),
          })
          .returning();

        if (!escalation) continue;

        // Back-fill the letter URL (generated on demand via GET /pdf/escalation/:id)
        await db
          .update(debtEscalationsTable)
          .set({ letterUrl: `/api/pdf/escalation/${escalation.id}` })
          .where(eq(debtEscalationsTable.id, escalation.id));

        result.created++;

        // Notify syndic admins — generic message avoids leaking debtor details
        // to all users via the broadcast push mechanism in notify.ts.
        const levelLabel = LEVEL_LABELS[requiredLevel];
        await createAlert({
          title: `⚠️ Nouvelle escalade de recouvrement — ${levelLabel}`,
          message: `Un dossier de recouvrement au niveau "${levelLabel}" a été ouvert. Consultez le tableau de bord Recouvrement pour les détails.`,
          type: "warning",
          syndicateId,
          target: "admin",
        });

        // Notify the specific debtor (only them — sendPushToUsers targets by userId)
        if (ownerId) {
          const [ownerUser] = await db
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.id, ownerId));

          if (ownerUser) {
            await sendPushToUsers(
              [ownerUser.id],
              "Avis de recouvrement",
              `Votre solde impayé a atteint le niveau: ${levelLabel}. Veuillez régulariser votre situation auprès du syndic.`,
              { escalationLevel: requiredLevel, escalationId: escalation.id },
            ).catch(() => {});
          }
        }
      } catch (lotErr) {
        logger.error({ lotErr, lotId }, "Escalation scan — lot processing error");
        result.errors++;
      }
    }
  } catch (err) {
    logger.error({ err }, "runDailyEscalationScan failed");
    result.errors++;
  }

  logger.info(result, "Escalation scan complete");
  return result;
}

/** Starts the daily escalation scan (on boot + every 24 hours). */
export function startEscalationScheduler(): void {
  runDailyEscalationScan().catch((err) =>
    logger.warn({ err }, "Boot escalation scan failed"),
  );
  setInterval(() => {
    runDailyEscalationScan().catch((err) =>
      logger.warn({ err }, "Scheduled escalation scan failed"),
    );
  }, 24 * 60 * 60 * 1000);
}
