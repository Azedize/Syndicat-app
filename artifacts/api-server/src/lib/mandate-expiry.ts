import { db } from "@workspace/db";
import { conseilSyndicalTable } from "@workspace/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { createAlert, sendPushToUsers } from "./notify.js";
import { logger } from "./logger.js";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
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
        title: "Mandat expiré",
        message: `Le mandat de ${mandate.name} (${mandate.role}) est arrivé à échéance — une nouvelle élection peut être nécessaire.`,
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
  checkExpiringMandates().catch(() => {});
  setInterval(() => {
    checkExpiringMandates().catch(() => {});
  }, 24 * 60 * 60 * 1000);
}
