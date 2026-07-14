import { db } from "@workspace/db";
import { electionsTable, voteReceiptsTable, usersTable, membersTable, lotsTable, tenantsTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { createAlert, sendPushToUsers } from "./notify.js";
import { logger } from "./logger.js";

/** Reminder thresholds, in whole days remaining before an election's voting closes. */
const THRESHOLDS = [3, 1];

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(dateStr);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** Duplicated locally (rather than imported from routes/elections.ts) to keep the
 *  scheduler decoupled from route-layer code — same eligibility logic as isUserEligible(). */
async function getEligibleVoterIds(syndicateId: string, buildingId: string | null, tenantsCanVote: boolean): Promise<string[]> {
  const memberRows = await db.select().from(membersTable).where(eq(membersTable.syndicateId, syndicateId));
  let eligibleEmails = memberRows.map((m) => m.email);

  if (buildingId) {
    const ownerIds = memberRows.map((m) => m.id);
    const lots = ownerIds.length
      ? await db.select().from(lotsTable).where(and(eq(lotsTable.buildingId, buildingId), inArray(lotsTable.ownerId, ownerIds)))
      : [];
    const ownersInBuilding = new Set(lots.map((l) => l.ownerId));
    eligibleEmails = memberRows.filter((m) => ownersInBuilding.has(m.id)).map((m) => m.email);
  }

  let eligibleUsers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.syndicateId, syndicateId), eq(usersTable.role, "member" as const), inArray(usersTable.email, eligibleEmails.length ? eligibleEmails : [""])));

  if (tenantsCanVote) {
    const tenantConditions = [eq(tenantsTable.syndicateId, syndicateId), eq(tenantsTable.status, "active")];
    if (buildingId) tenantConditions.push(eq(tenantsTable.buildingId, buildingId));
    const tenantRows = await db.select().from(tenantsTable).where(and(...tenantConditions));
    const tenantEmails = tenantRows.map((t) => t.email).filter((e): e is string => !!e);
    const tenantUsers = tenantEmails.length
      ? await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.syndicateId, syndicateId), eq(usersTable.role, "tenant" as const), inArray(usersTable.email, tenantEmails)))
      : [];
    eligibleUsers = [...eligibleUsers, ...tenantUsers];
  }

  return eligibleUsers.map((u) => u.id);
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
        title: "⏰ Vote clôture bientôt",
        message: `Le vote pour "${election.title}" se termine dans ${threshold} jour${threshold > 1 ? "s" : ""} (${pendingIds.length}/${eligibleIds.length} n'ont pas encore voté).`,
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
  checkClosingSoonElections().catch(() => {});
  setInterval(() => {
    checkClosingSoonElections().catch(() => {});
  }, 6 * 60 * 60 * 1000);
}
