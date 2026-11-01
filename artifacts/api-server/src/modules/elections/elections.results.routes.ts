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
import { quorumMetAndNoTie } from "./elections.service.js";
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
    if (!["closed", "completed", "contested"].includes(election.status ?? "")) {
      res
        .status(400)
        .json({ error: "Les résultats ne sont pas encore disponibles" });
      return;
    }

    const candidates = await db
      .select()
      .from(candidatesTable)
      .where(
        and(
          eq(candidatesTable.electionId, id),
          eq(candidatesTable.status, "approved"),
        ),
      );
    const [{ abstentions }] = await db
      .select({ abstentions: sql<number>`count(*)::int` })
      .from(votesTable)
      .where(
        and(eq(votesTable.electionId, id), eq(votesTable.isAbstention, true)),
      );
    const invalidVotes = election.invalidVotesCount ?? 0;

    const totalCandidateVotes = candidates.reduce(
      (s, c) => s + (c.votes ?? 0),
      0,
    );
    const totalVotes =
      totalCandidateVotes + Number(abstentions ?? 0) + invalidVotes;
    const ranked = [...candidates]
      .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
      .map((c, i) => ({
        ...c,
        rank: i + 1,
        pct:
          totalCandidateVotes > 0
            ? Math.round(((c.votes ?? 0) / totalCandidateVotes) * 1000) / 10
            : 0,
      }));

    const seats = election.seatsCount ?? 1;
    const cutoffVotes = ranked[seats - 1]?.votes ?? -1;
    const tie = ranked.length > seats && ranked[seats]?.votes === cutoffVotes;

    const majorityThreshold = election.majorityPercent ?? 50;
    const winners = ranked.slice(0, seats);
    const majorityMet =
      election.votingMethod === "absolute_majority"
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
        participationRate: election.eligibleCount
          ? Math.round(
              ((election.participantCount ?? 0) / election.eligibleCount) *
                1000,
            ) / 10
          : 0,
        quorumReached: election.quorumReached,
        winners:
          election.status === "completed"
            ? winners
            : quorumMetAndNoTie(election, tie)
              ? winners
              : [],
        tie,
        majorityMet,
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
