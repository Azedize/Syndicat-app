import { db } from "@workspace/db";
import { buildingsTable, contratsPrestatairesTable, prestatairesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { createAlert } from "../lib/notify.js";
import { logger } from "../lib/logger.js";
import { scheduleJob } from "../lib/scheduler.js";

const THRESHOLDS = [60, 30, 7];

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(dateStr);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Scans all active provider contracts and:
 *  - sends a one-time alert at 60/30/7 days before expiry (deduped via notifiedThresholds)
 *  - flips status to "expired" once the end date has passed
 * Safe to call repeatedly (e.g. on startup + interval) — every action is idempotent.
 */
export async function checkExpiringContracts(): Promise<void> {
  try {
    const contracts = await db
      .select()
      .from(contratsPrestatairesTable)
      .where(eq(contratsPrestatairesTable.status, "active"));

    for (const contract of contracts) {
      if (!contract.endDate) continue;
      const daysLeft = daysUntil(contract.endDate);

      if (daysLeft < 0) {
        await db
          .update(contratsPrestatairesTable)
          .set({ status: "expired" })
          .where(eq(contratsPrestatairesTable.id, contract.id));
        continue;
      }

      const notified: number[] = JSON.parse(contract.notifiedThresholds ?? "[]");
      const threshold = THRESHOLDS.find((t) => daysLeft === t && !notified.includes(t));
      if (!threshold) continue;

      const [prestataire] = await db
        .select({ name: prestatairesTable.name })
        .from(prestatairesTable)
        .where(eq(prestatairesTable.id, contract.prestataireId));

      const [building] = await db
        .select({ syndicateId: buildingsTable.syndicateId })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, contract.buildingId));
      if (!building?.syndicateId) continue; // no condominium: nobody to notify
      await createAlert({
        key: "contract.expiring",
        params: { days: threshold, title: contract.title, provider: prestataire?.name ?? "—", endDate: contract.endDate },
        type: "warning",
        syndicateId: building.syndicateId,
        target: "admin",
      });

      await db
        .update(contratsPrestatairesTable)
        .set({ notifiedThresholds: JSON.stringify([...notified, threshold]) })
        .where(eq(contratsPrestatairesTable.id, contract.id));
    }
  } catch (err) {
    logger.error({ err }, "checkExpiringContracts failed");
  }
}

/** Starts the periodic expiry check (on boot + every 6 hours). */
export function startContractExpiryScheduler(): void {
  // Claimed per run in scheduled_job_runs: executes once per interval
  // across all API instances, and not again on every restart.
  scheduleJob("contract-expiry", 6 * 60 * 60 * 1000, checkExpiringContracts);
}
