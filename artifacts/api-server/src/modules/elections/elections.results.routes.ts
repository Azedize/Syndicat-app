// elections: results endpoints (mounted by elections.routes.ts, in order).
import { sendRouteError } from "../../lib/route-error.js";
import { Router } from "express";
import { z } from "zod";
import { sql, eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  electionsTable,
  candidatesTable,
  votesTable,
  conseilSyndicalTable,
  usersTable,
} from "@workspace/db/schema";
import { requireAuth, requireOperationalAccess } from "../../middleware/auth.js";
import { serverAuditLog } from "../../lib/audit.js";
import { createAlert, sendPushToUsers, sendEmailToMany } from "../../lib/notify.js";
import { configOf, RESULTS_VISIBLE_STATUSES, tallyOf } from "./elections.service.js";
import { countOutcome } from "./elections.rules.js";
import { assertAccess, requireSyndicateScope } from "./elections.access.js";

const router = Router();

// ─── Phase 6 — Results ────────────────────────────────────────────────────────

router.get("/elections/:id/results", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  try {
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
    if (!RESULTS_VISIBLE_STATUSES.includes(election.status ?? "")) {
      res
        .status(400)
        .json({ error: "Les résultats ne sont pas encore disponibles" });
      return;
    }

    const { candidates, tally } = await tallyOf(election);
    const count = countOutcome(configOf(election), tally, election.round ?? 1);
    const [{ abstentions }] = await db
      .select({ abstentions: sql<number>`count(*)::int` })
      .from(votesTable)
      .where(
        and(eq(votesTable.electionId, id), eq(votesTable.isAbstention, true)),
      );
    const invalidVotes = election.invalidVotesCount ?? 0;
    const weighted = election.weighting === "quote_part";
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const ranking = count.ranking.map((r, i) => ({
      ...byId.get(r.id)!,
      rank: i + 1,
      // share of the majority base (voices or ballots), in %
      pct: r.sharePct,
      meetsMajority: r.meetsMajority,
      tied: count.tied.includes(r.id),
    }));
    const totalCandidateVotes = candidates.reduce((s, c) => s + (c.votes ?? 0), 0);
    // Once published the stored outcome is the record; before, the count shows what it would be.
    const stored = election.outcomeDetails as { winners?: string[] } | null;
    const winnerIds = election.outcome ? (stored?.winners ?? []) : !!election.quorumReached ? count.winners : [];
    res.json({
      data: {
        election,
        ranking,
        totalVotes: (election.participantCount ?? 0) + invalidVotes,
        totalCandidateVotes,
        abstentions: Number(abstentions ?? 0),
        invalidVotes,
        weighting: election.weighting,
        voicesCast: election.voicesCast,
        eligibleVoices: election.eligibleVoices,
        majorityBase: election.majorityBase,
        participationRate: election.eligibleCount
          ? Math.round(
              ((election.participantCount ?? 0) / election.eligibleCount) *
                1000,
            ) / 10
          : 0,
        quorumReached: election.quorumReached,
        outcome: election.outcome ?? count.outcome,
        outcomeDetails: election.outcomeDetails ?? null,
        winners: ranking.filter((c) => winnerIds.includes(c.id)),
        tie: count.tied.length > 0,
        tiedCandidateIds: count.tied,
        seatsInPlay: count.seatsInPlay,
        vacantSeats: count.vacantSeats,
        majorityMet: count.outcome !== "no_majority",
        scoredBy: weighted ? "voices" : "ballots",
      },
    });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

// Manually recorded spoiled/invalid ballots (e.g. from a hybrid paper-assisted tally at the
// physical AG). Editable only while the tally is still open to correction (closed, before
// results are published) so it cannot be used to retroactively alter a completed election.
router.put(
  "/elections/:id/invalid-votes",
  requireAuth,
  requireOperationalAccess,
  async (req, res) => {
    const id = String(req.params.id);
    const schema = z.object({ count: z.number().int().min(0) });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Nombre invalide" });
      return;
    }
    try {
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
      if (election.status !== "closed") {
        res
          .status(400)
          .json({
            error:
              "Les bulletins invalides ne peuvent être enregistrés qu'après clôture du vote, avant publication",
          });
        return;
      }

      const [updated] = await db
        .update(electionsTable)
        .set({ invalidVotesCount: result.data.count } as any)
        .where(eq(electionsTable.id, id))
        .returning();
      await serverAuditLog(req, {
        action: "UPDATE",
        entity: "election",
        entityId: id,
        details: `Bulletins invalides enregistrés: ${result.data.count}`,
      });
      res.json({ data: updated, message: "Bulletins invalides enregistrés" });
    } catch (err) {
      sendRouteError(req, res, err);
    }
  },
);

// ─── Phase 7 — Elected members / mandates ────────────────────────────────────

router.post(
  "/elections/mandates/:mandateId/resign",
  requireAuth,
  async (req, res) => {
    const { mandateId } = req.params as { mandateId: string };
    const schema = z.object({ reason: z.string().optional() });
    const result = schema.safeParse(req.body);
    try {
      const [mandate] = await db
        .select()
        .from(conseilSyndicalTable)
        .where(eq(conseilSyndicalTable.id, mandateId));
      if (!mandate) {
        res.status(404).json({ error: "Mandat introuvable" });
        return;
      }
      if (!requireSyndicateScope(req, res)) return;
      if (
        req.user!.role !== "super_admin" &&
        mandate.syndicateId !== req.user!.syndicateId
      ) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }
      const isAdmin =
        req.user!.role === "super_admin" ||
        req.user!.role === "syndicate_admin";
      if (!isAdmin && mandate.userId !== req.user!.userId) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }
      // The syndic and the adjoint resign through the official procedure: notification,
      // general assembly within 30 days, interim and handover (art. 26 ter, 27, 27 ter).
      if (["syndic", "vice_syndic"].includes(mandate.role)) {
        res.status(409).json({ error: "La démission du syndic ou de son adjoint suit la procédure officielle (POST /governance/resignations)", code: "OFFICIAL_RESIGNATION_REQUIRED" });
        return;
      }

      const [updated] = await db
        .update(conseilSyndicalTable)
        .set({
          status: "resigned",
          resignedAt: new Date(),
          resignReason: result.data?.reason ?? null,
        } as any)
        .where(eq(conseilSyndicalTable.id, mandateId))
        .returning();

      await createAlert({
        key: "mandate.resigned",
        params: { name: mandate.name, role: mandate.role },
        type: "warning",
        syndicateId: mandate.syndicateId,
        target: "admin",
      });
      await serverAuditLog(req, {
        action: "RESIGN_MANDATE",
        entity: "conseil_syndical",
        entityId: mandateId,
        details: result.data?.reason,
      });
      res.json({ data: updated, message: "Démission enregistrée" });
    } catch (err) {
      sendRouteError(req, res, err);
    }
  },
);

// Admin-initiated removal-for-cause — distinct from the voluntary resignation above.
// Always leaves a full audit trail (who revoked, why, when) since this removes an elected
// mandate against the holder's will.
router.post(
  "/elections/mandates/:mandateId/revoke",
  requireAuth,
  requireOperationalAccess,
  async (req, res) => {
    const { mandateId } = req.params as { mandateId: string };
    const schema = z.object({ reason: z.string().min(1) });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Motif de révocation requis" });
      return;
    }
    try {
      const [mandate] = await db
        .select()
        .from(conseilSyndicalTable)
        .where(eq(conseilSyndicalTable.id, mandateId));
      if (!mandate) {
        res.status(404).json({ error: "Mandat introuvable" });
        return;
      }
      if (
        req.user!.role !== "super_admin" &&
        mandate.syndicateId !== req.user!.syndicateId
      ) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }
      if (mandate.status !== "active") {
        res.status(400).json({ error: "Ce mandat n'est plus actif" });
        return;
      }
      // Art. 27 bis: the syndic and the adjoint are revoked by the general assembly (3/4 of the voices).
      if (["syndic", "vice_syndic"].includes(mandate.role)) {
        res.status(409).json({ error: "Le syndic et son adjoint ne sont révoqués que par l'assemblée générale, à la majorité des trois quarts des voix (art. 27 bis)", code: "REVOCATION_BY_GENERAL_ASSEMBLY" });
        return;
      }

      const [updated] = await db
        .update(conseilSyndicalTable)
        .set({
          status: "revoked",
          revokedAt: new Date(),
          revokedBy: req.user!.userId,
          revokeReason: result.data.reason,
        } as any)
        .where(eq(conseilSyndicalTable.id, mandateId))
        .returning();

      if (mandate.userId) {
        await sendPushToUsers(
          [mandate.userId],
          "Mandat révoqué",
          `Votre mandat de ${mandate.role} a été révoqué par l'administration. Motif : ${result.data.reason}`,
          { mandateId },
        );
        const [mandateUser] = await db
          .select({ email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.id, mandate.userId));
        if (mandateUser?.email)
          await sendEmailToMany(
            [mandateUser.email],
            "Mandat révoqué",
            `<p>Votre mandat de ${mandate.role} a été révoqué par l'administration.</p><p>Motif : ${result.data.reason}</p>`,
          );
      }
      await createAlert({
        key: "mandate.revoked",
        params: { name: mandate.name, role: mandate.role },
        type: "warning",
        syndicateId: mandate.syndicateId,
        target: "admin",
      });
      await serverAuditLog(req, {
        action: "REVOKE_MANDATE",
        entity: "conseil_syndical",
        entityId: mandateId,
        details: result.data.reason,
      });
      res.json({ data: updated, message: "Mandat révoqué" });
    } catch (err) {
      sendRouteError(req, res, err);
    }
  },
);

export default router;
