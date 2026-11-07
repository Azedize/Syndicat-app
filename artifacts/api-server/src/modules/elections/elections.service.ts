import { inArray, eq, and, sql } from "drizzle-orm";
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
import { localToday } from "../../lib/charge-time.js";
import { countOutcome, rolesForWinners, toUnits, type MajorityBase, type Tally, type VotingMethod, type Weighting } from "./elections.rules.js";

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

/**
 * Voices of each voter (Loi 18-00, art. 16 decies): the tantièmes of the lots
 * he currently owns, times his share of each lot, within the election's
 * building when it has one. A voter with no recorded quote-part has 0 voices.
 * Returned as decimal strings (4 decimals), never floats.
 */
export async function voicesOf(syndicateId: string, buildingId: string | null, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>(userIds.map((id) => [id, "0.0000"]));
  if (!userIds.length) return out;
  const rows = (await db.execute(sql`
    SELECT u.id AS user_id, COALESCE(SUM(l.tantiemes * o.share_percent / 100), 0)::numeric(14,4)::text AS voices
    FROM users u
    JOIN members m ON m.syndicate_id = ${syndicateId} AND lower(m.email) = lower(u.email)
    JOIN lot_ownerships o ON o.member_id = m.id AND o.end_date IS NULL
    JOIN lots l ON l.id = o.lot_id AND l.archived_at IS NULL
    JOIN buildings b ON b.id = l.building_id AND b.syndicate_id = ${syndicateId}
    WHERE u.id IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})
      ${buildingId ? sql`AND l.building_id = ${buildingId}` : sql``}
    GROUP BY u.id`)) as unknown as { user_id: string; voices: string }[];
  for (const r of rows) out.set(r.user_id, r.voices);
  return out;
}

/** Same statuses as GET /elections/:id/results: before them, no one reads the running tally. */
export const RESULTS_VISIBLE_STATUSES = ["closed", "completed", "contested", "deliberation_required"];

export function hideRunningTally<C extends { votes: number | null; voices?: string | null }>(status: string | null, candidates: C[]): C[] {
  if (RESULTS_VISIBLE_STATUSES.includes(status ?? "")) return candidates;
  return candidates.map((c) => ({ ...c, votes: null, ...("voices" in c ? { voices: null } : {}) }));
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
    candidates: hideRunningTally(e.status, candidatesByElection.get(e.id) ?? []),
    hasVoted: votedElectionIds.has(e.id),
  }));
}

/** Phase 5/6 — Quorum, run once when voting closes (eligible voters and their voices are frozen). */
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
  let eligibleVoices: string | null = null;
  if (election.weighting === "quote_part" && election.syndicateId) {
    const voices = await voicesOf(election.syndicateId, election.buildingId, voterIds);
    eligibleVoices = (Array.from(voices.values()).reduce((t, v) => t + toUnits(v), 0) / 10_000).toFixed(4);
  }

  await db
    .update(electionsTable)
    .set({
      eligibleCount,
      participantCount,
      quorumReached,
      eligibleVoices,
      status: quorumReached ? "closed" : "quorum_failed",
    })
    .where(eq(electionsTable.id, election.id));
}

/** The figures a count needs, read from the database. */
export async function tallyOf(election: typeof electionsTable.$inferSelect) {
  const candidates = await db
    .select()
    .from(candidatesTable)
    .where(and(eq(candidatesTable.electionId, election.id), eq(candidatesTable.status, "approved")));
  const tally: Tally = {
    candidates: candidates.map((c) => ({ id: c.id, votes: c.votes ?? 0, voices: c.voices })),
    ballotsCast: (election.participantCount ?? 0) + (election.invalidVotesCount ?? 0),
    voicesCast: election.voicesCast,
    eligibleCount: election.eligibleCount ?? 0,
    eligibleVoices: election.eligibleVoices,
  };
  return { candidates, tally };
}

export const configOf = (e: typeof electionsTable.$inferSelect) => ({
  seatsCount: e.seatsCount ?? 1,
  weighting: (e.weighting ?? "per_voter") as Weighting,
  votingMethod: (e.votingMethod ?? "simple_majority") as VotingMethod,
  majorityBase: (e.majorityBase ?? "votes_cast") as MajorityBase,
  majorityPercent: e.majorityPercent ?? 50,
});

/**
 * Phase 7 — publishes a count: mandates for the candidates elected outright
 * (never for tied ones), then either the election is completed, a second
 * round is prepared between the tied candidates, or a new deliberation is
 * required. One transaction; results and history are kept.
 */
export async function publishElectionResults(election: typeof electionsTable.$inferSelect) {
  const { candidates, tally } = await tallyOf(election);
  const count = countOutcome(configOf(election), tally, election.round ?? 1);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const scored = count.ranking.filter((r) => count.winners.includes(r.id)).map((r) => ({ id: r.id, score: r.score }));
  const roles = rolesForWinners(election.electionType ?? "special", scored);

  // The mandate starts when the results are published, or at the planned end of
  // the vote if that is earlier — never in the future.
  const today = localToday();
  const mandateStart = election.endDate && election.endDate < today ? election.endDate : today;
  let mandateEnd: string | null = null;
  if (election.mandateDurationMonths) {
    const end = new Date(`${mandateStart}T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + election.mandateDurationMonths);
    mandateEnd = end.toISOString().slice(0, 10);
  }

  return db.transaction(async (tx) => {
    // The election row is locked: two publications at once cannot both create mandates.
    const [current] = await tx.select().from(electionsTable).where(eq(electionsTable.id, election.id)).for("update");
    if (current?.status !== "closed") throw Object.assign(new Error("Les résultats ont déjà été publiés"), { status: 409, code: "ALREADY_PUBLISHED" });
    const mandates = [];
    for (const r of roles) {
      const winner = byId.get(r.id)!;
      const [mandate] = await tx
        .insert(conseilSyndicalTable)
        .values({
          syndicateId: election.syndicateId!,
          userId: winner.userId,
          role: r.role,
          name: winner.name,
          mandateStart,
          mandateEnd,
          status: "active",
          electionId: election.id,
          candidateId: winner.id,
          notes: r.roleTie ? "Égalité de voix avec un autre élu : la fonction est à attribuer par un vote distinct." : null,
        } as any)
        .returning();
      mandates.push(mandate);
    }

    let runoffElectionId: string | null = null;
    if (count.outcome === "runoff_required") {
      // Second round between the tied candidates only, for the seats they tie on.
      // Created as a draft: the organizer sets its dates, then opens the vote.
      const [runoff] = await tx
        .insert(electionsTable)
        .values({
          syndicateId: election.syndicateId,
          title: `${election.title} — 2e tour`,
          description: election.description,
          electionType: election.electionType,
          buildingId: election.buildingId,
          votingMethod: election.votingMethod,
          quorumPercent: election.quorumPercent,
          majorityPercent: election.majorityPercent,
          seatsCount: count.seatsInPlay,
          ballotMode: count.seatsInPlay > 1 ? election.ballotMode : "single",
          weighting: election.weighting,
          majorityBase: election.majorityBase,
          tenantsCanVote: election.tenantsCanVote,
          mandateDurationMonths: election.mandateDurationMonths,
          round: (election.round ?? 1) + 1,
          parentElectionId: election.id,
          status: "draft",
          createdBy: election.createdBy,
        } as any)
        .returning();
      runoffElectionId = runoff.id;
      for (const id of count.tied) {
        const c = byId.get(id)!;
        await tx.insert(candidatesTable).values({
          electionId: runoff.id,
          userId: c.userId,
          name: c.name,
          post: c.post,
          apartmentNumber: c.apartmentNumber,
          buildingId: c.buildingId,
          photo: c.photo,
          bio: c.bio,
          motivationLetter: c.motivationLetter,
          program: c.program,
          status: "approved",
        } as any);
      }
    }

    const status = count.outcome === "elected" || count.outcome === "runoff_required" ? "completed" : "deliberation_required";
    const outcomeDetails = {
      winners: count.winners,
      tied: count.tied,
      seatsInPlay: count.seatsInPlay,
      vacantSeats: count.vacantSeats,
      runoffElectionId,
      roleTies: roles.filter((r) => r.roleTie).map((r) => r.id),
      // Syndic or adjoint not designated: the president of the court of first
      // instance designates them on a co-owner's request (art. 19).
      legalPath: count.outcome === "no_majority" && ["syndic", "vice_syndic"].includes(election.electionType ?? "") ? "court_designation_art19" : null,
    };
    await tx
      .update(electionsTable)
      .set({ status, outcome: count.outcome, outcomeDetails, resultsPublishedAt: new Date() } as any)
      .where(eq(electionsTable.id, election.id));
    return { mandates, count, runoffElectionId, status };
  });
}

/** A member may hold at most this many proxies — an internal rule, stricter than the
 *  law (art. 16 decies: at most 3 co-owners and 10 % of the voices per proxy holder). */
export const MAX_PROXIES_PER_GRANTEE = 2;
/** Art. 16 decies: the co-owners a proxy holder represents hold at most 10 % of the voices. */
export const MAX_PROXY_VOICES_PERCENT = 10;
