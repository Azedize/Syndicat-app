import { inArray, eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  electionsTable,
  candidatesTable,
  voteReceiptsTable,
  conseilSyndicalTable,
  membersTable,
  lotsTable,
  tenantsTable,
  usersTable,
} from "@workspace/db/schema";

/** Resolves the list of userIds eligible to vote/candidate for a given election scope. */
export async function getEligibleVoterIds(
  syndicateId: string | null,
  buildingId: string | null,
  tenantsCanVote: boolean,
): Promise<string[]> {
  if (!syndicateId) return [];

  // Owners (members) — scoped to a building via their lot when buildingId is set
  const memberRows = await db
    .select()
    .from(membersTable)
    .where(eq(membersTable.syndicateId, syndicateId));
  let eligibleEmails = memberRows.map((m) => m.email);

  if (buildingId) {
    const ownerIds = memberRows.map((m) => m.id);
    const lots = ownerIds.length
      ? await db
          .select()
          .from(lotsTable)
          .where(
            and(
              eq(lotsTable.buildingId, buildingId),
              inArray(lotsTable.ownerId, ownerIds),
            ),
          )
      : [];
    const ownersInBuilding = new Set(lots.map((l) => l.ownerId));
    eligibleEmails = memberRows
      .filter((m) => ownersInBuilding.has(m.id))
      .map((m) => m.email);
  }

  const userConditions = [
    eq(usersTable.syndicateId, syndicateId),
    eq(usersTable.role, "member" as const),
    inArray(usersTable.email, eligibleEmails.length ? eligibleEmails : [""]),
  ];
  let eligibleUsers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(...userConditions));

  if (tenantsCanVote) {
    const tenantConditions = [
      eq(tenantsTable.syndicateId, syndicateId),
      eq(tenantsTable.status, "active"),
    ];
    if (buildingId)
      tenantConditions.push(eq(tenantsTable.buildingId, buildingId));
    const tenantRows = await db
      .select()
      .from(tenantsTable)
      .where(and(...tenantConditions));
    const tenantEmails = tenantRows
      .map((t) => t.email)
      .filter((e): e is string => !!e);
    const tenantUsers = tenantEmails.length
      ? await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(
            and(
              eq(usersTable.syndicateId, syndicateId),
              eq(usersTable.role, "tenant" as const),
              inArray(usersTable.email, tenantEmails),
            ),
          )
      : [];
    eligibleUsers = [...eligibleUsers, ...tenantUsers];
  }

  return eligibleUsers.map((u) => u.id);
}

export async function isUserEligible(
  userId: string,
  syndicateId: string | null,
  buildingId: string | null,
  tenantsCanVote: boolean,
): Promise<boolean> {
  const ids = await getEligibleVoterIds(
    syndicateId,
    buildingId,
    tenantsCanVote,
  );
  return ids.includes(userId);
}

export async function enrichElections(
  elections: (typeof electionsTable.$inferSelect)[],
  userId: string,
) {
  if (elections.length === 0) return [];
  const electionIds = elections.map((e) => e.id);

  // Note: ballots are anonymous (no voterId) by design — see votesTable comment. We can only
  // know THAT a user voted (via voteReceiptsTable), never what they voted for, even for themselves.
  const [allCandidates, myReceipts] = await Promise.all([
    db
      .select()
      .from(candidatesTable)
      .where(inArray(candidatesTable.electionId, electionIds)),
    db
      .select()
      .from(voteReceiptsTable)
      .where(
        and(
          inArray(voteReceiptsTable.electionId, electionIds),
          eq(voteReceiptsTable.voterId, userId),
        ),
      ),
  ]);

  const candidatesByElection = new Map<string, typeof allCandidates>();
  for (const c of allCandidates) {
    if (!candidatesByElection.has(c.electionId))
      candidatesByElection.set(c.electionId, []);
    candidatesByElection.get(c.electionId)!.push(c);
  }
  const votedElectionIds = new Set(myReceipts.map((r) => r.electionId));

  return elections.map((e) => ({
    ...e,
    candidates: candidatesByElection.get(e.id) ?? [],
    hasVoted: votedElectionIds.has(e.id),
  }));
}

/** Phase 5/6 — Quorum + result computation, run once when voting closes. */
export async function closeElectionVoting(
  election: typeof electionsTable.$inferSelect,
) {
  const voterIds = await getEligibleVoterIds(
    election.syndicateId,
    election.buildingId,
    !!election.tenantsCanVote,
  );
  // Participation is counted via receipts (proof of "someone voted"), not the anonymous
  // ballots table — the two tables have no shared key by design (ballot secrecy).
  const receipts = await db
    .select()
    .from(voteReceiptsTable)
    .where(eq(voteReceiptsTable.electionId, election.id));

  const eligibleCount = voterIds.length;
  const participantCount = receipts.length;
  const participationRate =
    eligibleCount > 0 ? (participantCount / eligibleCount) * 100 : 0;
  const quorumReached = participationRate >= (election.quorumPercent ?? 50);

  await db
    .update(electionsTable)
    .set({
      eligibleCount,
      participantCount,
      quorumReached,
      status: quorumReached ? "closed" : "quorum_failed",
    })
    .where(eq(electionsTable.id, election.id));
}

/** Phase 7 — Elected members: promotes winning candidates into conseil_syndical mandates. */
export async function publishElectionResults(
  election: typeof electionsTable.$inferSelect,
  tiebreakWinnerIds?: string[],
) {
  const candidates = await db
    .select()
    .from(candidatesTable)
    .where(
      and(
        eq(candidatesTable.electionId, election.id),
        eq(candidatesTable.status, "approved"),
      ),
    );

  const ranked = [...candidates].sort(
    (a, b) => (b.votes ?? 0) - (a.votes ?? 0),
  );
  const seats = election.seatsCount ?? 1;
  let winners = ranked.slice(0, seats);

  // When the caller already resolved a tie at the cutoff (validated by the
  // transition route before this function is invoked), swap in the admin's
  // explicit picks instead of the raw array-order slice.
  if (tiebreakWinnerIds?.length) {
    const cutoffVotes = ranked[seats - 1]?.votes ?? -1;
    const aboveCutoff = ranked.filter((c) => (c.votes ?? 0) > cutoffVotes);
    const chosen = ranked.filter((c) => tiebreakWinnerIds.includes(c.id));
    winners = [...aboveCutoff, ...chosen].slice(0, seats);
  }

  // Fixed-term mandates: election.mandateDurationMonths (months) is added to the mandate
  // start date to compute an expiry the mandate-expiry scheduler will act on. Null = indefinite.
  let mandateEnd: string | null = null;
  if (election.mandateDurationMonths) {
    const start = new Date(election.endDate ?? new Date().toISOString());
    start.setMonth(start.getMonth() + election.mandateDurationMonths);
    mandateEnd = start.toISOString().slice(0, 10);
  }

  const roles = MANDATE_ROLE_BY_TYPE[election.electionType ?? "special"] ?? [
    "committee_member",
  ];
  const mandates = [];
  for (let i = 0; i < winners.length; i++) {
    const winner = winners[i];
    const role = roles[i] ?? roles[roles.length - 1];
    const [mandate] = await db
      .insert(conseilSyndicalTable)
      .values({
        syndicateId: election.syndicateId!,
        userId: winner.userId,
        role,
        name: winner.name,
        mandateStart: election.endDate,
        mandateEnd,
        status: "active",
        electionId: election.id,
        candidateId: winner.id,
      } as any)
      .returning();
    mandates.push(mandate);
  }

  await db
    .update(electionsTable)
    .set({ status: "completed", resultsPublishedAt: new Date() } as any)
    .where(eq(electionsTable.id, election.id));

  return mandates;
}

export function quorumMetAndNoTie(
  election: typeof electionsTable.$inferSelect,
  tie: boolean,
) {
  return !!election.quorumReached && !tie;
}

export const MANDATE_ROLE_BY_TYPE: Record<string, string[]> = {
  president: ["president"],
  board: [
    "president",
    "vice_president",
    "secretary",
    "treasurer",
    "committee_member",
  ],
  financial_committee: ["treasurer", "committee_member"],
  maintenance_committee: ["committee_member"],
  building_representative: ["building_representative"],
  special: ["committee_member"],
};
