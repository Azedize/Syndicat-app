import { db } from "@workspace/db";
import { conseilSyndicalTable } from "@workspace/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { createAlert, sendPushToUsers } from "./notify.js";
import { logger } from "./logger.js";
import { scheduleJob } from "./scheduler.js";
import { localToday } from "./charge-time.js";

function todayStr(): string {
  return localToday();
}

/**
 * Flips active mandates with a fixed mandateEnd date (set at election completion when
 * mandateDurationMonths was specified) to "expired" once that date has passed.
 * Idempotent — only touches rows still in "active" status.
 */
export async function checkExpiringMandates(): Promise<void> {
  try {
    const expired = await db
      .select()
      .from(conseilSyndicalTable)
      .where(and(eq(conseilSyndicalTable.status, "active"), lte(conseilSyndicalTable.mandateEnd, todayStr())));

    for (const mandate of expired) {
      if (!mandate.mandateEnd) continue; // lte() on null never matches, but guard defensively
      await db.update(conseilSyndicalTable).set({ status: "expired" } as any).where(eq(conseilSyndicalTable.id, mandate.id));

      if (mandate.userId) {
        await sendPushToUsers([mandate.userId], "Mandat expiré", `Votre mandat de ${mandate.role} est arrivé à échéance le ${mandate.mandateEnd}.`, { mandateId: mandate.id });
      }
      await createAlert({
        key: "mandate.expired",
        params: { name: mandate.name, role: mandate.role },
        type: "warning",
        syndicateId: mandate.syndicateId,
        target: "admin",
      });
    }
  } catch (err) {
    logger.error({ err }, "checkExpiringMandates failed");
  }
}

/** Starts the periodic mandate-expiry check (on boot + once a day). */
export function startMandateExpiryScheduler(): void {
  // Claimed per run in scheduled_job_runs: executes once per interval
  // across all API instances, and not again on every restart.
  scheduleJob("mandate-expiry", 24 * 60 * 60 * 1000, checkExpiringMandates);
}
