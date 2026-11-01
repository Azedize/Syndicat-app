import { db } from "@workspace/db";
import { electionsTable, voteReceiptsTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { createAlert, sendPushToUsers } from "../lib/notify.js";
import { logger } from "../lib/logger.js";
import { scheduleJob } from "../lib/scheduler.js";
// Same eligibility rule as the voting endpoints.
import { getEligibleVoterIds } from "../modules/elections/elections.service.js";

/** Reminder thresholds, in whole days remaining before an election's voting closes. */
const THRESHOLDS = [3, 1];

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(dateStr);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Scans open elections nearing their voting deadline (3 and 1 days out) and
 * push-notifies every eligible voter who has not yet cast a ballot. Sends at
 * most once per threshold per election — deduped via electionsTable.remindersSent,
 * mirroring the notifiedThresholds pattern used for contract-expiry reminders.
 */
export async function checkClosingSoonElections(): Promise<void> {
  try {
    const elections = await db.select().from(electionsTable).where(eq(electionsTable.status, "open"));

    for (const election of elections) {
      if (!election.endDate || !election.syndicateId) continue;
      const daysLeft = daysUntil(election.endDate);
      const sent: number[] = JSON.parse(election.remindersSent ?? "[]");
      const threshold = THRESHOLDS.find((t) => daysLeft === t && !sent.includes(t));
      if (!threshold) continue;

      const eligibleIds = await getEligibleVoterIds(election.syndicateId, election.buildingId, !!election.tenantsCanVote);
      if (eligibleIds.length === 0) continue;

      const receipts = eligibleIds.length
        ? await db.select({ voterId: voteReceiptsTable.voterId }).from(voteReceiptsTable).where(and(eq(voteReceiptsTable.electionId, election.id), inArray(voteReceiptsTable.voterId, eligibleIds)))
        : [];
      const votedIds = new Set(receipts.map((r) => r.voterId));
      const pendingIds = eligibleIds.filter((id) => !votedIds.has(id));

      if (pendingIds.length > 0) {
        await sendPushToUsers(
          pendingIds,
          "Vote — clôture imminente",
          `Le vote pour "${election.title}" se termine dans ${threshold} jour${threshold > 1 ? "s" : ""}. Pensez à voter.`,
          { electionId: election.id },
        );
      }

      await createAlert({
        key: "election.closingSoon",
        params: { title: election.title, days: threshold, pending: pendingIds.length, eligible: eligibleIds.length },
        type: "info",
        syndicateId: election.syndicateId,
        target: "admin",
      });

      await db
        .update(electionsTable)
        .set({ remindersSent: JSON.stringify([...sent, threshold]) } as any)
        .where(eq(electionsTable.id, election.id));
    }
  } catch (err) {
    logger.error({ err }, "checkClosingSoonElections failed");
  }
}

/** Starts the periodic closing-soon check (on boot + every 6 hours — same cadence as contract-expiry). */
export function startElectionReminderScheduler(): void {
  // Claimed per run in scheduled_job_runs: executes once per interval
  // across all API instances, and not again on every restart.
  scheduleJob("election-reminders", 6 * 60 * 60 * 1000, checkClosingSoonElections);
}
