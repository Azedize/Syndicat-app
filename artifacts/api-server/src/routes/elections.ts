import { Router } from "express";
import { z } from "zod";
import { sql, inArray, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  electionsTable,
  candidatesTable,
  votesTable,
  voteReceiptsTable,
  electionProxiesTable,
  electionQuestionsTable,
  conseilSyndicalTable,
  membersTable,
  lotsTable,
  tenantsTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and, or } from "drizzle-orm";
import { requireAuth, requireNotTenant, requireOperationalAccess } from "../middleware/auth.js";
import { serverAuditLog } from "../lib/audit.js";
import { createAlert, sendPushToUsers, sendEmailToMany } from "../lib/notify.js";

/** A member may hold at most this many proxies (own vote + delegated votes) — prevents
 *  concentration of voting power in a single hand (common condo-syndic governance rule). */
const MAX_PROXIES_PER_GRANTEE = 2;

const router = Router();

const MANDATE_ROLE_BY_TYPE: Record<string, string[]> = {
  president: ["president"],
  board: ["president", "vice_president", "secretary", "treasurer", "committee_member"],
  financial_committee: ["treasurer", "committee_member"],
  maintenance_committee: ["committee_member"],
  building_representative: ["building_representative"],
  special: ["committee_member"],
};

/** Resolves the list of userIds eligible to vote/candidate for a given election scope. */
async function getEligibleVoterIds(syndicateId: string | null, buildingId: string | null, tenantsCanVote: boolean): Promise<string[]> {
  if (!syndicateId) return [];

  // Owners (members) — scoped to a building via their lot when buildingId is set
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

  const userConditions = [eq(usersTable.syndicateId, syndicateId), eq(usersTable.role, "member" as const), inArray(usersTable.email, eligibleEmails.length ? eligibleEmails : [""])];
  let eligibleUsers = await db.select({ id: usersTable.id }).from(usersTable).where(and(...userConditions));

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

async function isUserEligible(userId: string, syndicateId: string | null, buildingId: string | null, tenantsCanVote: boolean): Promise<boolean> {
  const ids = await getEligibleVoterIds(syndicateId, buildingId, tenantsCanVote);
  return ids.includes(userId);
}

function assertAccess(req: any, election: { syndicateId: string | null }): boolean {
  return req.user!.role === "super_admin" || election.syndicateId === req.user!.syndicateId;
}

// ─── List / Detail ────────────────────────────────────────────────────────────

router.get("/elections", requireAuth, async (req, res) => {
  try {
    const syndicateId = req.user!.syndicateId;
    if (req.user!.role !== "super_admin" && !syndicateId) {
      return void res.status(403).json({ error: "Syndicat non défini dans le token" });
    }
    const elections = syndicateId
      ? await db.select().from(electionsTable).where(eq(electionsTable.syndicateId, syndicateId))
      : await db.select().from(electionsTable);

    if (req.user!.role === "tenant") {
      // Tenants only ever see elections explicitly opened to them, and never in draft
      const visible = elections.filter((e) => e.tenantsCanVote && e.status !== "draft");
      res.json({ data: await enrichElections(visible, req.user!.userId) });
      return;
    }

    const visible = req.user!.role === "member" ? elections.filter((e) => e.status !== "draft") : elections;
    res.json({ data: await enrichElections(visible, req.user!.userId) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

async function enrichElections(elections: (typeof electionsTable.$inferSelect)[], userId: string) {
  if (elections.length === 0) return [];
  const electionIds = elections.map((e) => e.id);

  // Note: ballots are anonymous (no voterId) by design — see votesTable comment. We can only
  // know THAT a user voted (via voteReceiptsTable), never what they voted for, even for themselves.
  const [allCandidates, myReceipts] = await Promise.all([
    db.select().from(candidatesTable).where(inArray(candidatesTable.electionId, electionIds)),
    db.select().from(voteReceiptsTable).where(and(inArray(voteReceiptsTable.electionId, electionIds), eq(voteReceiptsTable.voterId, userId))),
  ]);

  const candidatesByElection = new Map<string, typeof allCandidates>();
  for (const c of allCandidates) {
    if (!candidatesByElection.has(c.electionId)) candidatesByElection.set(c.electionId, []);
    candidatesByElection.get(c.electionId)!.push(c);
  }
  const votedElectionIds = new Set(myReceipts.map((r) => r.electionId));

  return elections.map((e) => ({
    ...e,
    candidates: candidatesByElection.get(e.id) ?? [],
    hasVoted: votedElectionIds.has(e.id),
  }));
}

// NOTE: this exact-path route MUST stay registered before GET /elections/:id below —
// Express matches routes in registration order, and ":id" would otherwise greedily
// match the literal segment "mandates", making this handler permanently unreachable
// (found during the production election audit: GET /elections/mandates was 404'ing
// via the wrong handler for every caller, including the mobile elected-members screen).
router.get("/elections/mandates", requireAuth, async (req, res) => {
  try {
    const syndicateId = req.user!.syndicateId;
    if (req.user!.role !== "super_admin" && !syndicateId) {
      return void res.status(403).json({ error: "Syndicat non défini dans le token" });
    }
    const mandates = syndicateId
      ? await db.select().from(conseilSyndicalTable).where(eq(conseilSyndicalTable.syndicateId, syndicateId))
      : await db.select().from(conseilSyndicalTable);
    res.json({ data: mandates });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/elections/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  try {
    const [election] = await db.select().from(electionsTable).where(eq(electionsTable.id, id));
    if (!election) { res.status(404).json({ error: "Élection introuvable" }); return; }
    if (!assertAccess(req, election)) { res.status(403).json({ error: "Accès refusé" }); return; }

    const isAdmin = req.user!.role === "super_admin" || req.user!.role === "syndicate_admin";
    const candidateStatusFilter = isAdmin ? undefined : eq(candidatesTable.status, "approved");
    const candidates = await db
      .select()
      .from(candidatesTable)
      .where(candidateStatusFilter ? and(eq(candidatesTable.electionId, id), candidateStatusFilter) : eq(candidatesTable.electionId, id));

    // Include the requester's own submitted/pending/rejected candidacy even if not approved
    const own = !isAdmin ? await db.select().from(candidatesTable).where(and(eq(candidatesTable.electionId, id), eq(candidatesTable.userId, req.user!.userId))) : [];
    const candidateMap = new Map(candidates.map((c) => [c.id, c]));
    for (const c of own) candidateMap.set(c.id, c);

    const questions = candidateMap.size
      ? await db.select().from(electionQuestionsTable).where(inArray(electionQuestionsTable.candidateId, [...candidateMap.keys()]))
      : [];

    const [receipt] = await db.select().from(voteReceiptsTable).where(and(eq(voteReceiptsTable.electionId, id), eq(voteReceiptsTable.voterId, req.user!.userId)));
    const eligible = req.user!.role === "super_admin" ? false : await isUserEligible(req.user!.userId, election.syndicateId, election.buildingId, !!election.tenantsCanVote);

    const mandates = election.status === "completed"
      ? await db.select().from(conseilSyndicalTable).where(eq(conseilSyndicalTable.electionId, id))
      : [];

    // Proxy delegations involving the current user for this election (as grantor or grantee)
    const myProxies = await db.select().from(electionProxiesTable).where(
      and(eq(electionProxiesTable.electionId, id), or(eq(electionProxiesTable.grantorId, req.user!.userId), eq(electionProxiesTable.granteeId, req.user!.userId))),
    );
    const delegatedToMe = await Promise.all(
      myProxies
        .filter((p) => p.granteeId === req.user!.userId && p.status === "active")
        .map(async (p) => {
          const [r] = await db.select().from(voteReceiptsTable).where(and(eq(voteReceiptsTable.electionId, id), eq(voteReceiptsTable.voterId, p.grantorId)));
          return { ...p, grantorHasVoted: !!r };
        }),
    );

    res.json({
      data: election,
      candidates: [...candidateMap.values()],
      questions,
      // Ballots are anonymous — we can confirm participation but never reveal the choice, even to the voter.
      hasVoted: !!receipt,
      isEligible: eligible,
      mandates,
      myDelegation: myProxies.find((p) => p.grantorId === req.user!.userId && p.status !== "revoked") ?? null,
      delegatedToMe,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Phase 1 — Election creation (Syndicate Admin only) ──────────────────────

router.post("/elections", requireAuth, requireOperationalAccess, async (req, res) => {
  const schema = z.object({
    title: z.string().min(1),
    description: z.string().default(""),
    electionType: z.enum(["president", "board", "financial_committee", "maintenance_committee", "building_representative", "special"]).default("special"),
    buildingId: z.string().nullable().optional(),
    votingMethod: z.enum(["simple_majority", "absolute_majority"]).default("simple_majority"),
    quorumPercent: z.number().int().min(0).max(100).default(50),
    majorityPercent: z.number().int().min(0).max(100).default(50),
    seatsCount: z.number().int().min(1).default(1),
    tenantsCanVote: z.boolean().default(false),
    candidacyStart: z.string(),
    candidacyEnd: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    isEmergency: z.boolean().default(false),
    // Fixed mandate length for winners, in months. Omit/null = indefinite mandate (no auto-expiry).
    mandateDurationMonths: z.number().int().min(1).max(120).nullable().optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Données invalides", details: result.error.flatten() }); return; }

  const d = result.data;
  if (d.candidacyEnd < d.candidacyStart || d.startDate < d.candidacyEnd || d.endDate <= d.startDate) {
    res.status(400).json({ error: "Le calendrier de l'élection est incohérent (candidature → vote)" });
    return;
  }

  try {
    if (req.user!.role !== "super_admin" && !req.user!.syndicateId) {
      return void res.status(403).json({ error: "Syndicat non défini dans le token" });
    }
    const syndicateId = req.user!.syndicateId || "";
    const [election] = await db
      .insert(electionsTable)
      .values({
        syndicateId,
        title: d.title,
        description: d.description,
        electionType: d.electionType,
        buildingId: d.buildingId ?? null,
        votingMethod: d.votingMethod,
        quorumPercent: d.quorumPercent,
        majorityPercent: d.majorityPercent,
        seatsCount: d.seatsCount,
        tenantsCanVote: d.tenantsCanVote,
        candidacyStart: d.candidacyStart,
        candidacyEnd: d.candidacyEnd,
        startDate: d.startDate,
        endDate: d.endDate,
        isEmergency: d.isEmergency,
        mandateDurationMonths: d.mandateDurationMonths ?? null,
        status: d.isEmergency ? "candidacy_open" : "draft",
        createdBy: req.user!.userId,
      } as any)
      .returning();

    await serverAuditLog(req, { action: "CREATE", entity: "election", entityId: election.id, details: `Élection créée: ${election.title}` });
    res.status(201).json({ data: election, message: "Élection créée avec succès" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.put("/elections/:id", requireAuth, requireOperationalAccess, async (req, res) => {
  const id = String(req.params.id);
  const schema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    quorumPercent: z.number().int().min(0).max(100).optional(),
    majorityPercent: z.number().int().min(0).max(100).optional(),
    seatsCount: z.number().int().min(1).optional(),
    tenantsCanVote: z.boolean().optional(),
    candidacyStart: z.string().optional(),
    candidacyEnd: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
  try {
    const [election] = await db.select().from(electionsTable).where(eq(electionsTable.id, id));
    if (!election) { res.status(404).json({ error: "Élection introuvable" }); return; }
    if (!assertAccess(req, election)) { res.status(403).json({ error: "Accès refusé" }); return; }
    if (election.status !== "draft") { res.status(400).json({ error: "Seule une élection en brouillon peut être modifiée" }); return; }

    const [updated] = await db.update(electionsTable).set(result.data as any).where(eq(electionsTable.id, id)).returning();
    await serverAuditLog(req, { action: "UPDATE", entity: "election", entityId: id, details: "Configuration mise à jour" });
    res.json({ data: updated, message: "Élection mise à jour" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Lifecycle transitions (state machine) ───────────────────────────────────

const TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  open_candidacy: { from: ["draft"], to: "candidacy_open" },
  start_campaign: { from: ["candidacy_open"], to: "campaign" },
  open_voting: { from: ["campaign", "candidacy_open"], to: "open" },
  close_voting: { from: ["open"], to: "closed" },
  publish_results: { from: ["closed"], to: "completed" },
  cancel: { from: ["draft", "candidacy_open", "campaign", "open"], to: "cancelled" },
  contest: { from: ["closed", "completed"], to: "contested" },
  reopen_round: { from: ["quorum_failed", "contested", "cancelled"], to: "candidacy_open" },
};

router.post("/elections/:id/transition", requireAuth, requireOperationalAccess, async (req, res) => {
  const id = String(req.params.id);
  const schema = z.object({
    action: z.enum(Object.keys(TRANSITIONS) as [string, ...string[]]),
    reason: z.string().optional(),
    // Required only when publish_results hits a tie at the seat cutoff — the admin
    // must explicitly pick which tied candidate(s) take the remaining seat(s).
    tiebreakWinnerIds: z.array(z.string()).optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Action invalide" }); return; }

  try {
    const [election] = await db.select().from(electionsTable).where(eq(electionsTable.id, id));
    if (!election) { res.status(404).json({ error: "Élection introuvable" }); return; }
    if (!assertAccess(req, election)) { res.status(403).json({ error: "Accès refusé" }); return; }

    const transition = TRANSITIONS[result.data.action];
    if (!transition.from.includes(election.status ?? "")) {
      res.status(400).json({ error: `Transition impossible depuis le statut "${election.status}"` });
      return;
    }

    if (result.data.action === "close_voting") {
      await closeElectionVoting(election);
      await serverAuditLog(req, { action: "CLOSE_VOTING", entity: "election", entityId: id, details: "Vote clôturé, résultats calculés" });
      const [refreshed] = await db.select().from(electionsTable).where(eq(electionsTable.id, id));
      res.json({ data: refreshed, message: "Vote clôturé" });
      return;
    }

    if (result.data.action === "publish_results") {
      const candidates = await db
        .select()
        .from(candidatesTable)
        .where(and(eq(candidatesTable.electionId, election.id), eq(candidatesTable.status, "approved")));
      const ranked = [...candidates].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
      const seats = election.seatsCount ?? 1;
      const cutoffVotes = ranked[seats - 1]?.votes ?? -1;
      const tie = ranked.length > seats && ranked[seats]?.votes === cutoffVotes;

      if (tie) {
        // Candidates tied exactly at the seat cutoff — the admin must explicitly
        // choose who fills the remaining seat(s) instead of silently picking by
        // array order. Return the tied group so the client can render a chooser.
        const tiedGroup = ranked.filter((c) => (c.votes ?? 0) === cutoffVotes);
        const confirmedIds = result.data.tiebreakWinnerIds ?? [];
        const remainingSeats = seats - ranked.filter((c) => (c.votes ?? 0) > cutoffVotes).length;
        const validSelection = confirmedIds.length === remainingSeats && confirmedIds.every((cid) => tiedGroup.some((c) => c.id === cid));
        if (!validSelection) {
          res.status(409).json({
            error: `Égalité détectée pour ${remainingSeats} siège(s) restant(s) — sélection manuelle requise`,
            code: "TIE_DETECTED",
            tiedCandidates: tiedGroup.map((c) => ({ id: c.id, name: c.name, votes: c.votes })),
            remainingSeats,
          });
          return;
        }
      }

      const winners = await publishElectionResults(election, result.data.tiebreakWinnerIds);
      await serverAuditLog(req, { action: "PUBLISH_RESULTS", entity: "election", entityId: id, details: `Résultats publiés, ${winners.length} mandat(s) créé(s)${tie ? " (égalité résolue manuellement)" : ""}` });
      await createAlert({ title: "Résultats publiés", message: `Les résultats de "${election.title}" sont disponibles.`, type: "info", syndicateId: election.syndicateId, target: "all" });
      const winnerUserIds = winners.map((w) => w.userId).filter((uid): uid is string => !!uid);
      if (winnerUserIds.length) {
        await sendPushToUsers(winnerUserIds, "Élu(e) !", `Vous avez été élu(e) suite à "${election.title}". Félicitations.`, { electionId: id });
        const winnerUsers = await db.select({ email: usersTable.email }).from(usersTable).where(inArray(usersTable.id, winnerUserIds));
        await sendEmailToMany(winnerUsers.map((u) => u.email), "Résultats — " + election.title, `<p>Vous avez été élu(e) suite à l'élection "${election.title}". Félicitations.</p>`);
      }
      const [refreshed] = await db.select().from(electionsTable).where(eq(electionsTable.id, id));
      res.json({ data: refreshed, message: "Résultats publiés, mandats créés" });
      return;
    }

    const updates: Record<string, unknown> = { status: transition.to };
    if (result.data.action === "cancel") updates.cancelReason = result.data.reason ?? null;
    if (result.data.action === "contest") updates.contestReason = result.data.reason ?? null;

    const [updated] = await db.update(electionsTable).set(updates as any).where(eq(electionsTable.id, id)).returning();

    if (result.data.action === "open_candidacy") {
      await createAlert({ title: "Élection annoncée", message: `Candidatures ouvertes pour "${election.title}"`, type: "info", syndicateId: election.syndicateId, target: "all" });
    }
    if (result.data.action === "open_voting") {
      const voterIds = await getEligibleVoterIds(election.syndicateId, election.buildingId, !!election.tenantsCanVote);
      await sendPushToUsers(voterIds, "Vote ouvert", `Le vote pour "${election.title}" est maintenant ouvert.`, { electionId: id });
      await createAlert({ title: "Vote ouvert", message: `Le vote pour "${election.title}" est ouvert.`, type: "info", syndicateId: election.syndicateId, target: "all" });
    }

    await serverAuditLog(req, { action: `TRANSITION_${result.data.action.toUpperCase()}`, entity: "election", entityId: id, details: result.data.reason });
    res.json({ data: updated, message: "Statut mis à jour" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/** Phase 5/6 — Quorum + result computation, run once when voting closes. */
async function closeElectionVoting(election: typeof electionsTable.$inferSelect) {
  const voterIds = await getEligibleVoterIds(election.syndicateId, election.buildingId, !!election.tenantsCanVote);
  // Participation is counted via receipts (proof of "someone voted"), not the anonymous
  // ballots table — the two tables have no shared key by design (ballot secrecy).
  const receipts = await db.select().from(voteReceiptsTable).where(eq(voteReceiptsTable.electionId, election.id));

  const eligibleCount = voterIds.length;
  const participantCount = receipts.length;
  const participationRate = eligibleCount > 0 ? (participantCount / eligibleCount) * 100 : 0;
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
async function publishElectionResults(election: typeof electionsTable.$inferSelect, tiebreakWinnerIds?: string[]) {
  const candidates = await db
    .select()
    .from(candidatesTable)
    .where(and(eq(candidatesTable.electionId, election.id), eq(candidatesTable.status, "approved")));

  const ranked = [...candidates].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
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

  const roles = MANDATE_ROLE_BY_TYPE[election.electionType ?? "special"] ?? ["committee_member"];
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

// ─── Phase 2 — Candidate registration ────────────────────────────────────────

router.post("/elections/:id/candidates", requireAuth, requireNotTenant, async (req, res) => {
  const id = String(req.params.id);
  const schema = z.object({
    apartmentNumber: z.string().optional(),
    buildingId: z.string().nullable().optional(),
    bio: z.string().default(""),
    motivationLetter: z.string().default(""),
    program: z.string().default(""),
    photo: z.string().nullable().optional(),
    post: z.string().optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }

  try {
    const [election] = await db.select().from(electionsTable).where(eq(electionsTable.id, id));
    if (!election) { res.status(404).json({ error: "Élection introuvable" }); return; }
    if (!assertAccess(req, election)) { res.status(403).json({ error: "Accès refusé" }); return; }
    if (election.status !== "candidacy_open") { res.status(400).json({ error: "Les candidatures ne sont pas ouvertes" }); return; }

    const eligible = await isUserEligible(req.user!.userId, election.syndicateId, election.buildingId, !!election.tenantsCanVote);
    if (!eligible) { res.status(403).json({ error: "Vous n'êtes pas éligible pour cette élection" }); return; }

    const [existing] = await db.select().from(candidatesTable).where(and(eq(candidatesTable.electionId, id), eq(candidatesTable.userId, req.user!.userId)));
    if (existing && existing.status !== "withdrawn" && existing.status !== "rejected") {
      res.status(400).json({ error: "Vous avez déjà déposé une candidature pour cette élection" });
      return;
    }

    const isAdmin = req.user!.role === "super_admin" || req.user!.role === "syndicate_admin";
    const [candidate] = await db
      .insert(candidatesTable)
      .values({
        electionId: id,
        userId: req.user!.userId,
        name: req.user!.name,
        post: result.data.post ?? election.electionType ?? "candidat",
        apartmentNumber: result.data.apartmentNumber ?? null,
        buildingId: result.data.buildingId ?? election.buildingId ?? null,
        bio: result.data.bio,
        motivationLetter: result.data.motivationLetter,
        program: result.data.program,
        photo: result.data.photo ?? null,
        status: isAdmin ? "approved" : "pending_validation",
      } as any)
      .returning();

    await serverAuditLog(req, { action: "SUBMIT_CANDIDACY", entity: "election", entityId: id, details: `Candidature de ${req.user!.name}` });
    res.status(201).json({ data: candidate, message: "Candidature déposée" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.put("/elections/:id/candidates/:candidateId/validate", requireAuth, requireOperationalAccess, async (req, res) => {
  const { id, candidateId } = req.params as { id: string; candidateId: string };
  const schema = z.object({ decision: z.enum(["approved", "rejected"]), reason: z.string().optional() });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Décision invalide" }); return; }

  try {
    const [election] = await db.select().from(electionsTable).where(eq(electionsTable.id, id));
    if (!election || !assertAccess(req, election)) { res.status(404).json({ error: "Élection introuvable" }); return; }
    const [candidate] = await db.select().from(candidatesTable).where(and(eq(candidatesTable.id, candidateId), eq(candidatesTable.electionId, id)));
    if (!candidate) { res.status(404).json({ error: "Candidat introuvable" }); return; }

    const [updated] = await db
      .update(candidatesTable)
      .set({ status: result.data.decision, rejectionReason: result.data.decision === "rejected" ? result.data.reason ?? null : null } as any)
      .where(eq(candidatesTable.id, candidateId))
      .returning();

    if (candidate.userId) {
      const decisionText = result.data.decision === "approved"
        ? `Votre candidature pour "${election.title}" a été approuvée.`
        : `Votre candidature pour "${election.title}" a été rejetée.${result.data.reason ? " Motif : " + result.data.reason : ""}`;
      await sendPushToUsers([candidate.userId], result.data.decision === "approved" ? "Candidature approuvée" : "Candidature rejetée", decisionText, { electionId: id });
      const [candidateUser] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, candidate.userId));
      if (candidateUser?.email) await sendEmailToMany([candidateUser.email], "Candidature — " + election.title, `<p>${decisionText}</p>`);
    }

    await serverAuditLog(req, { action: "VALIDATE_CANDIDACY", entity: "election", entityId: id, details: `${candidate.name} → ${result.data.decision}` });
    res.json({ data: updated, message: "Candidature mise à jour" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/elections/:id/candidates/:candidateId/withdraw", requireAuth, async (req, res) => {
  const { id, candidateId } = req.params as { id: string; candidateId: string };
  try {
    const [candidate] = await db.select().from(candidatesTable).where(and(eq(candidatesTable.id, candidateId), eq(candidatesTable.electionId, id)));
    if (!candidate) { res.status(404).json({ error: "Candidat introuvable" }); return; }
    const isAdmin = req.user!.role === "super_admin" || req.user!.role === "syndicate_admin";
    if (!isAdmin && candidate.userId !== req.user!.userId) { res.status(403).json({ error: "Accès refusé" }); return; }

    const [updated] = await db
      .update(candidatesTable)
      .set({ status: "withdrawn", withdrawnAt: new Date() } as any)
      .where(eq(candidatesTable.id, candidateId))
      .returning();

    await serverAuditLog(req, { action: "WITHDRAW_CANDIDACY", entity: "election", entityId: id, details: `${candidate.name} s'est retiré(e)` });
    res.json({ data: updated, message: "Candidature retirée" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Phase 3 — Campaign: program updates & Q&A ───────────────────────────────

router.put("/elections/:id/candidates/:candidateId/program", requireAuth, async (req, res) => {
  const { id, candidateId } = req.params as { id: string; candidateId: string };
  const schema = z.object({ program: z.string().optional(), motivationLetter: z.string().optional(), bio: z.string().optional() });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
  try {
    const [candidate] = await db.select().from(candidatesTable).where(and(eq(candidatesTable.id, candidateId), eq(candidatesTable.electionId, id)));
    if (!candidate) { res.status(404).json({ error: "Candidat introuvable" }); return; }
    if (candidate.userId !== req.user!.userId) { res.status(403).json({ error: "Accès refusé" }); return; }
    if (candidate.status !== "approved") { res.status(400).json({ error: "Candidature non approuvée" }); return; }

    const [updated] = await db.update(candidatesTable).set(result.data as any).where(eq(candidatesTable.id, candidateId)).returning();
    res.json({ data: updated, message: "Programme mis à jour" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/elections/:id/candidates/:candidateId/questions", requireAuth, requireNotTenant, async (req, res) => {
  const { id, candidateId } = req.params as { id: string; candidateId: string };
  const schema = z.object({ question: z.string().min(1) });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Question requise" }); return; }
  try {
    const [candidate] = await db.select().from(candidatesTable).where(and(eq(candidatesTable.id, candidateId), eq(candidatesTable.electionId, id), eq(candidatesTable.status, "approved")));
    if (!candidate) { res.status(404).json({ error: "Candidat introuvable" }); return; }
    const [q] = await db
      .insert(electionQuestionsTable)
      .values({ electionId: id, candidateId, askedBy: req.user!.userId, askedByName: req.user!.name, question: result.data.question } as any)
      .returning();
    if (candidate.userId) {
      await sendPushToUsers([candidate.userId], "Nouvelle question", `${req.user!.name} vous a posé une question.`, { electionId: id });
    }
    res.status(201).json({ data: q, message: "Question envoyée" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.put("/elections/:id/questions/:questionId/answer", requireAuth, async (req, res) => {
  const { questionId } = req.params as { questionId: string };
  const schema = z.object({ answer: z.string().min(1) });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Réponse requise" }); return; }
  try {
    const [question] = await db.select().from(electionQuestionsTable).where(eq(electionQuestionsTable.id, questionId));
    if (!question) { res.status(404).json({ error: "Question introuvable" }); return; }
    const [candidate] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, question.candidateId));
    const isAdmin = req.user!.role === "super_admin" || req.user!.role === "syndicate_admin";
    if (!isAdmin && candidate?.userId !== req.user!.userId) { res.status(403).json({ error: "Accès refusé" }); return; }

    const [updated] = await db.update(electionQuestionsTable).set({ answer: result.data.answer, answeredAt: new Date() } as any).where(eq(electionQuestionsTable.id, questionId)).returning();
    res.json({ data: updated, message: "Réponse publiée" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Phase 4 — Voting ─────────────────────────────────────────────────────────

router.post("/elections/:id/vote", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const schema = z.object({
    candidateId: z.string().min(1).optional(),
    abstain: z.boolean().default(false),
    // Present when the caller is casting a delegated (proxy) vote on behalf of a grantor,
    // instead of voting for themselves.
    onBehalfOfUserId: z.string().optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success || (!result.data.candidateId && !result.data.abstain)) {
    res.status(400).json({ error: "Candidat ou abstention requis" });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      const [election] = await tx.select().from(electionsTable).where(eq(electionsTable.id, id));
      if (!election) throw Object.assign(new Error("NOT_FOUND"), { status: 404, msg: "Élection introuvable" });
      if (election.status !== "open") throw Object.assign(new Error("NOT_OPEN"), { status: 400, msg: "Cette élection n'est pas ouverte au vote" });
      if (req.user!.syndicateId && election.syndicateId !== req.user!.syndicateId) throw Object.assign(new Error("FORBIDDEN"), { status: 403, msg: "Accès refusé" });

      // The voter of record — either the caller, or (for a proxy vote) the person who delegated to them.
      let voterId = req.user!.userId;
      let castByProxyId: string | null = null;

      if (result.data.onBehalfOfUserId) {
        const [proxy] = await tx
          .select()
          .from(electionProxiesTable)
          .where(and(eq(electionProxiesTable.electionId, id), eq(electionProxiesTable.grantorId, result.data.onBehalfOfUserId), eq(electionProxiesTable.granteeId, req.user!.userId), eq(electionProxiesTable.status, "active")));
        if (!proxy) throw Object.assign(new Error("NO_PROXY"), { status: 403, msg: "Vous ne détenez pas de pouvoir actif pour ce copropriétaire" });
        voterId = result.data.onBehalfOfUserId;
        castByProxyId = req.user!.userId;
      }

      const eligible = await isUserEligible(voterId, election.syndicateId, election.buildingId, !!election.tenantsCanVote);
      if (!eligible) throw Object.assign(new Error("NOT_ELIGIBLE"), { status: 403, msg: "Vous n'êtes pas éligible pour voter à cette élection" });

      let candidateId: string | null = null;
      if (!result.data.abstain) {
        const [candidate] = await tx
          .select()
          .from(candidatesTable)
          .where(and(eq(candidatesTable.id, result.data.candidateId!), eq(candidatesTable.electionId, id), eq(candidatesTable.status, "approved")));
        if (!candidate) throw Object.assign(new Error("BAD_CANDIDATE"), { status: 400, msg: "Ce candidat n'appartient pas à cette élection" });
        candidateId = candidate.id;
      }

      const existing = await tx.select().from(voteReceiptsTable).where(and(eq(voteReceiptsTable.electionId, id), eq(voteReceiptsTable.voterId, voterId)));
      if (existing.length > 0) throw Object.assign(new Error("ALREADY_VOTED"), { status: 400, msg: castByProxyId ? "Ce copropriétaire a déjà voté" : "Vous avez déjà voté pour cette élection" });

      // Receipt proves participation (ties to voterId) — the ballot itself never does.
      await tx.insert(voteReceiptsTable).values({ electionId: id, voterId, castByProxyId } as any);
      await tx.insert(votesTable).values({
        electionId: id,
        candidateId,
        isAbstention: result.data.abstain,
        device: req.headers["user-agent"]?.toString().slice(0, 200) ?? null,
        ipAddress: req.ip ?? req.socket?.remoteAddress ?? null,
      } as any);

      if (candidateId) {
        await tx.update(candidatesTable).set({ votes: sql`${candidatesTable.votes} + 1` }).where(eq(candidatesTable.id, candidateId));
      }
      await tx.update(electionsTable).set({ participantCount: sql`${electionsTable.participantCount} + 1` }).where(eq(electionsTable.id, id));

      if (castByProxyId) {
        await tx.update(electionProxiesTable).set({ status: "used" } as any).where(and(eq(electionProxiesTable.electionId, id), eq(electionProxiesTable.grantorId, voterId), eq(electionProxiesTable.granteeId, castByProxyId)));
      }
    });

    if (result.data.onBehalfOfUserId) {
      await sendPushToUsers([result.data.onBehalfOfUserId], "Vote par pouvoir", "Votre mandataire a voté en votre nom pour cette élection.", { electionId: id });
    }
    await serverAuditLog(req, { action: "VOTE", entity: "election", entityId: id, details: result.data.onBehalfOfUserId ? `Vote par pouvoir pour ${result.data.onBehalfOfUserId}` : "Vote enregistré (bulletin anonyme)" });
    res.json({ message: "Vote enregistré avec succès" });
  } catch (err: any) {
    if (err.status) { res.status(err.status).json({ error: err.msg }); return; }
    if (err.code === "23505") { res.status(400).json({ error: "Vous avez déjà voté pour cette élection" }); return; }
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Proxy voting (pouvoirs) ──────────────────────────────────────────────────

router.get("/elections/:id/eligible-voters", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  try {
    const [election] = await db.select().from(electionsTable).where(eq(electionsTable.id, id));
    if (!election || !assertAccess(req, election)) { res.status(404).json({ error: "Élection introuvable" }); return; }
    const ids = await getEligibleVoterIds(election.syndicateId, election.buildingId, !!election.tenantsCanVote);
    if (ids.length === 0) { res.json({ data: [] }); return; }
    const rows = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, ids));
    res.json({ data: rows.filter((u) => u.id !== req.user!.userId) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/elections/:id/delegate", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const schema = z.object({ granteeId: z.string().min(1), documentUrl: z.string().nullable().optional() });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Mandataire requis" }); return; }
  try {
    const [election] = await db.select().from(electionsTable).where(eq(electionsTable.id, id));
    if (!election) { res.status(404).json({ error: "Élection introuvable" }); return; }
    if (!assertAccess(req, election)) { res.status(403).json({ error: "Accès refusé" }); return; }
    if (!["candidacy_open", "campaign", "open"].includes(election.status ?? "")) {
      res.status(400).json({ error: "Les pouvoirs ne peuvent être donnés qu'avant la clôture du vote" });
      return;
    }
    if (result.data.granteeId === req.user!.userId) { res.status(400).json({ error: "Vous ne pouvez pas vous donner un pouvoir à vous-même" }); return; }

    const eligible = await getEligibleVoterIds(election.syndicateId, election.buildingId, !!election.tenantsCanVote);
    if (!eligible.includes(req.user!.userId) || !eligible.includes(result.data.granteeId)) {
      res.status(403).json({ error: "Le mandant et le mandataire doivent tous deux être éligibles pour cette élection" });
      return;
    }

    const [[alreadyVoted], activeProxyCount, [grantee]] = await Promise.all([
      db.select().from(voteReceiptsTable).where(and(eq(voteReceiptsTable.electionId, id), eq(voteReceiptsTable.voterId, req.user!.userId))),
      db.select({ count: sql<number>`count(*)::int` }).from(electionProxiesTable).where(and(eq(electionProxiesTable.electionId, id), eq(electionProxiesTable.granteeId, result.data.granteeId), eq(electionProxiesTable.status, "active"))),
      db.select().from(usersTable).where(eq(usersTable.id, result.data.granteeId)),
    ]);
    if (alreadyVoted) { res.status(400).json({ error: "Vous avez déjà voté — un pouvoir ne peut plus être donné" }); return; }
    if ((activeProxyCount[0]?.count ?? 0) >= MAX_PROXIES_PER_GRANTEE) {
      res.status(400).json({ error: `Ce mandataire détient déjà le nombre maximal de pouvoirs (${MAX_PROXIES_PER_GRANTEE})` });
      return;
    }
    if (!grantee) { res.status(404).json({ error: "Mandataire introuvable" }); return; }

    const [proxy] = await db
      .insert(electionProxiesTable)
      .values({
        electionId: id,
        syndicateId: election.syndicateId,
        grantorId: req.user!.userId,
        grantorName: req.user!.name,
        granteeId: result.data.granteeId,
        granteeName: grantee.name,
        documentUrl: result.data.documentUrl ?? null,
        status: "active",
      } as any)
      .returning();

    await sendPushToUsers([result.data.granteeId], "Pouvoir reçu", `${req.user!.name} vous a donné pouvoir pour voter à sa place à "${election.title}".`, { electionId: id });
    await serverAuditLog(req, { action: "DELEGATE_VOTE", entity: "election", entityId: id, details: `${req.user!.name} → ${grantee.name}` });
    res.status(201).json({ data: proxy, message: "Pouvoir donné avec succès" });
  } catch (err: any) {
    if (err.code === "23505") { res.status(409).json({ error: "Vous avez déjà donné un pouvoir pour cette élection" }); return; }
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/elections/:id/delegate", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  try {
    const [proxy] = await db.select().from(electionProxiesTable).where(and(eq(electionProxiesTable.electionId, id), eq(electionProxiesTable.grantorId, req.user!.userId), eq(electionProxiesTable.status, "active")));
    if (!proxy) { res.status(404).json({ error: "Aucun pouvoir actif à révoquer" }); return; }

    const [updated] = await db.update(electionProxiesTable).set({ status: "revoked" } as any).where(eq(electionProxiesTable.id, proxy.id)).returning();
    await sendPushToUsers([proxy.granteeId], "Pouvoir révoqué", `${req.user!.name} a révoqué le pouvoir qu'il/elle vous avait donné pour une élection.`, { electionId: id });
    await serverAuditLog(req, { action: "REVOKE_DELEGATION", entity: "election", entityId: id, details: `${req.user!.name} a révoqué le pouvoir donné à ${proxy.granteeName}` });
    res.json({ data: updated, message: "Pouvoir révoqué" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Phase 6 — Results ────────────────────────────────────────────────────────

router.get("/elections/:id/results", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  try {
    const [election] = await db.select().from(electionsTable).where(eq(electionsTable.id, id));
    if (!election) { res.status(404).json({ error: "Élection introuvable" }); return; }
    if (!assertAccess(req, election)) { res.status(403).json({ error: "Accès refusé" }); return; }
    if (!["closed", "completed", "contested"].includes(election.status ?? "")) {
      res.status(400).json({ error: "Les résultats ne sont pas encore disponibles" });
      return;
    }

    const candidates = await db.select().from(candidatesTable).where(and(eq(candidatesTable.electionId, id), eq(candidatesTable.status, "approved")));
    const [{ abstentions }] = await db
      .select({ abstentions: sql<number>`count(*)::int` })
      .from(votesTable)
      .where(and(eq(votesTable.electionId, id), eq(votesTable.isAbstention, true)));
    const invalidVotes = election.invalidVotesCount ?? 0;

    const totalCandidateVotes = candidates.reduce((s, c) => s + (c.votes ?? 0), 0);
    const totalVotes = totalCandidateVotes + Number(abstentions ?? 0) + invalidVotes;
    const ranked = [...candidates].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0)).map((c, i) => ({
      ...c,
      rank: i + 1,
      pct: totalCandidateVotes > 0 ? Math.round(((c.votes ?? 0) / totalCandidateVotes) * 1000) / 10 : 0,
    }));

    const seats = election.seatsCount ?? 1;
    const cutoffVotes = ranked[seats - 1]?.votes ?? -1;
    const tie = ranked.length > seats && ranked[seats]?.votes === cutoffVotes;

    const majorityThreshold = election.majorityPercent ?? 50;
    const winners = ranked.slice(0, seats);
    const majorityMet = election.votingMethod === "absolute_majority"
      ? winners.every((w) => w.pct >= majorityThreshold)
      : true;

    res.json({
      data: {
        election,
        ranking: ranked,
        totalVotes,
        totalCandidateVotes,
        abstentions: Number(abstentions ?? 0),
        invalidVotes,
        participationRate: election.eligibleCount ? Math.round(((election.participantCount ?? 0) / election.eligibleCount) * 1000) / 10 : 0,
        quorumReached: election.quorumReached,
        winners: election.status === "completed" ? winners : quorumMetAndNoTie(election, tie) ? winners : [],
        tie,
        majorityMet,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

function quorumMetAndNoTie(election: typeof electionsTable.$inferSelect, tie: boolean) {
  return !!election.quorumReached && !tie;
}

// Manually recorded spoiled/invalid ballots (e.g. from a hybrid paper-assisted tally at the
// physical AG). Editable only while the tally is still open to correction (closed, before
// results are published) so it cannot be used to retroactively alter a completed election.
router.put("/elections/:id/invalid-votes", requireAuth, requireOperationalAccess, async (req, res) => {
  const id = String(req.params.id);
  const schema = z.object({ count: z.number().int().min(0) });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Nombre invalide" }); return; }
  try {
    const [election] = await db.select().from(electionsTable).where(eq(electionsTable.id, id));
    if (!election) { res.status(404).json({ error: "Élection introuvable" }); return; }
    if (!assertAccess(req, election)) { res.status(403).json({ error: "Accès refusé" }); return; }
    if (election.status !== "closed") { res.status(400).json({ error: "Les bulletins invalides ne peuvent être enregistrés qu'après clôture du vote, avant publication" }); return; }

    const [updated] = await db.update(electionsTable).set({ invalidVotesCount: result.data.count } as any).where(eq(electionsTable.id, id)).returning();
    await serverAuditLog(req, { action: "UPDATE", entity: "election", entityId: id, details: `Bulletins invalides enregistrés: ${result.data.count}` });
    res.json({ data: updated, message: "Bulletins invalides enregistrés" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Phase 7 — Elected members / mandates ────────────────────────────────────

router.post("/elections/mandates/:mandateId/resign", requireAuth, async (req, res) => {
  const { mandateId } = req.params as { mandateId: string };
  const schema = z.object({ reason: z.string().optional() });
  const result = schema.safeParse(req.body);
  try {
    const [mandate] = await db.select().from(conseilSyndicalTable).where(eq(conseilSyndicalTable.id, mandateId));
    if (!mandate) { res.status(404).json({ error: "Mandat introuvable" }); return; }
    const isAdmin = req.user!.role === "super_admin" || req.user!.role === "syndicate_admin";
    if (!isAdmin && mandate.userId !== req.user!.userId) { res.status(403).json({ error: "Accès refusé" }); return; }

    const [updated] = await db
      .update(conseilSyndicalTable)
      .set({ status: "resigned", resignedAt: new Date(), resignReason: result.data?.reason ?? null } as any)
      .where(eq(conseilSyndicalTable.id, mandateId))
      .returning();

    await createAlert({ title: "Démission", message: `${mandate.name} (${mandate.role}) a démissionné de son mandat.`, type: "warning", syndicateId: mandate.syndicateId, target: "admin" });
    await serverAuditLog(req, { action: "RESIGN_MANDATE", entity: "conseil_syndical", entityId: mandateId, details: result.data?.reason });
    res.json({ data: updated, message: "Démission enregistrée" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Admin-initiated removal-for-cause — distinct from the voluntary resignation above.
// Always leaves a full audit trail (who revoked, why, when) since this removes an elected
// mandate against the holder's will.
router.post("/elections/mandates/:mandateId/revoke", requireAuth, requireOperationalAccess, async (req, res) => {
  const { mandateId } = req.params as { mandateId: string };
  const schema = z.object({ reason: z.string().min(1) });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Motif de révocation requis" }); return; }
  try {
    const [mandate] = await db.select().from(conseilSyndicalTable).where(eq(conseilSyndicalTable.id, mandateId));
    if (!mandate) { res.status(404).json({ error: "Mandat introuvable" }); return; }
    if (req.user!.role !== "super_admin" && mandate.syndicateId !== req.user!.syndicateId) { res.status(403).json({ error: "Accès refusé" }); return; }
    if (mandate.status !== "active") { res.status(400).json({ error: "Ce mandat n'est plus actif" }); return; }

    const [updated] = await db
      .update(conseilSyndicalTable)
      .set({ status: "revoked", revokedAt: new Date(), revokedBy: req.user!.userId, revokeReason: result.data.reason } as any)
      .where(eq(conseilSyndicalTable.id, mandateId))
      .returning();

    if (mandate.userId) {
      await sendPushToUsers([mandate.userId], "Mandat révoqué", `Votre mandat de ${mandate.role} a été révoqué par l'administration. Motif : ${result.data.reason}`, { mandateId });
      const [mandateUser] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, mandate.userId));
      if (mandateUser?.email) await sendEmailToMany([mandateUser.email], "Mandat révoqué", `<p>Votre mandat de ${mandate.role} a été révoqué par l'administration.</p><p>Motif : ${result.data.reason}</p>`);
    }
    await createAlert({ title: "Révocation de mandat", message: `${mandate.name} (${mandate.role}) a été révoqué(e) de son mandat par l'administration.`, type: "warning", syndicateId: mandate.syndicateId, target: "admin" });
    await serverAuditLog(req, { action: "REVOKE_MANDATE", entity: "conseil_syndical", entityId: mandateId, details: result.data.reason });
    res.json({ data: updated, message: "Mandat révoqué" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
