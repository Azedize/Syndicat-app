// elections: read endpoints (mounted by elections.routes.ts, in order).
import { sendRouteError } from "../../lib/route-error.js";
import { Router } from "express";
import { inArray, eq, and, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  electionsTable,
  candidatesTable,
  voteReceiptsTable,
  electionProxiesTable,
  electionQuestionsTable,
  conseilSyndicalTable,
} from "@workspace/db/schema";
import { requireAuth } from "../../middleware/auth.js";
import { isUserEligible, enrichElections, hideRunningTally } from "./elections.service.js";
import { assertAccess, requireSyndicateScope } from "./elections.access.js";

const router = Router();

// ─── List / Detail ────────────────────────────────────────────────────────────

router.get("/elections", requireAuth, async (req, res) => {
  try {
    if (!requireSyndicateScope(req, res)) return;
    const syndicateId = req.user!.syndicateId;
    const targetSyndicateId =
      req.user!.role === "super_admin"
        ? String(req.query.syndicateId)
        : syndicateId!;
    const elections = targetSyndicateId
      ? await db
          .select()
          .from(electionsTable)
          .where(eq(electionsTable.syndicateId, targetSyndicateId))
      : [];

    if (req.user!.role === "tenant") {
      // Tenants only ever see elections explicitly opened to them, and never in draft
      const visible = elections.filter(
        (e) => e.tenantsCanVote && e.status !== "draft",
      );
      res.json({ data: await enrichElections(visible, req.user!.userId) });
      return;
    }

    const visible =
      req.user!.role === "member"
        ? elections.filter((e) => e.status !== "draft")
        : elections;
    res.json({ data: await enrichElections(visible, req.user!.userId) });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

// NOTE: this exact-path route MUST stay registered before GET /elections/:id below —
// Express matches routes in registration order, and ":id" would otherwise greedily
// match the literal segment "mandates", making this handler permanently unreachable
// (found during the production election audit: GET /elections/mandates was 404'ing
// via the wrong handler for every caller, including the mobile elected-members screen).
router.get("/elections/mandates", requireAuth, async (req, res) => {
  try {
    if (!requireSyndicateScope(req, res)) return;
    const syndicateId =
      req.user!.role === "super_admin"
        ? String(req.query.syndicateId)
        : req.user!.syndicateId!;
    const mandates = syndicateId
      ? await db
          .select()
          .from(conseilSyndicalTable)
          .where(eq(conseilSyndicalTable.syndicateId, syndicateId))
      : [];
    res.json({ data: mandates });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

router.get("/elections/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  try {
    if (!requireSyndicateScope(req, res)) return;
    const [election] = await db
      .select()
      .from(electionsTable)
      .where(eq(electionsTable.id, id));
    if (!election) {
      res.status(404).json({ error: "Élection introuvable" });
      return;
    }
    if (!assertAccess(req, election)) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    const isAdmin =
      req.user!.role === "super_admin" || req.user!.role === "syndicate_admin";
    const candidateStatusFilter = isAdmin
      ? undefined
      : eq(candidatesTable.status, "approved");
    const candidates = await db
      .select()
      .from(candidatesTable)
      .where(
        candidateStatusFilter
          ? and(eq(candidatesTable.electionId, id), candidateStatusFilter)
          : eq(candidatesTable.electionId, id),
      );

    // Include the requester's own submitted/pending/rejected candidacy even if not approved
    const own = !isAdmin
      ? await db
          .select()
          .from(candidatesTable)
          .where(
            and(
              eq(candidatesTable.electionId, id),
              eq(candidatesTable.userId, req.user!.userId),
            ),
          )
      : [];
    const candidateMap = new Map(candidates.map((c) => [c.id, c]));
    for (const c of own) candidateMap.set(c.id, c);

    const questions = candidateMap.size
      ? await db
          .select()
          .from(electionQuestionsTable)
          .where(
            inArray(electionQuestionsTable.candidateId, [
              ...candidateMap.keys(),
            ]),
          )
      : [];

    const [receipt] = await db
      .select()
      .from(voteReceiptsTable)
      .where(
        and(
          eq(voteReceiptsTable.electionId, id),
          eq(voteReceiptsTable.voterId, req.user!.userId),
        ),
      );
    const eligible =
      req.user!.role === "super_admin"
        ? false
        : await isUserEligible(
            req.user!.userId,
            election.syndicateId,
            election.buildingId,
            !!election.tenantsCanVote,
          );

    const mandates =
      ["completed", "deliberation_required"].includes(election.status ?? "")
        ? await db
            .select()
            .from(conseilSyndicalTable)
            .where(eq(conseilSyndicalTable.electionId, id))
        : [];

    // Proxy delegations involving the current user for this election (as grantor or grantee)
    const myProxies = await db
      .select()
      .from(electionProxiesTable)
      .where(
        and(
          eq(electionProxiesTable.electionId, id),
          or(
            eq(electionProxiesTable.grantorId, req.user!.userId),
            eq(electionProxiesTable.granteeId, req.user!.userId),
          ),
        ),
      );
    const delegatedToMe = await Promise.all(
      myProxies
        .filter(
          (p) => p.granteeId === req.user!.userId && p.status === "active",
        )
        .map(async (p) => {
          const [r] = await db
            .select()
            .from(voteReceiptsTable)
            .where(
              and(
                eq(voteReceiptsTable.electionId, id),
                eq(voteReceiptsTable.voterId, p.grantorId),
              ),
            );
          return { ...p, grantorHasVoted: !!r };
        }),
    );

    res.json({
      data: election,
      candidates: hideRunningTally(election.status, [...candidateMap.values()]),
      questions,
      // Ballots are anonymous — we can confirm participation but never reveal the choice, even to the voter.
      hasVoted: !!receipt,
      isEligible: eligible,
      mandates,
      myDelegation:
        myProxies.find(
          (p) => p.grantorId === req.user!.userId && p.status !== "revoked",
        ) ?? null,
      delegatedToMe,
    });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

export default router;
