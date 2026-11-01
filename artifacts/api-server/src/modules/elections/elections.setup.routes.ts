// elections: setup endpoints (mounted by elections.routes.ts, in order).
import { sendRouteError } from "../../lib/route-error.js";
import { Router } from "express";
import { z } from "zod";
import { inArray, eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { electionsTable, candidatesTable, usersTable, buildingsTable } from "@workspace/db/schema";
import { requireAuth, requireOperationalAccess } from "../../middleware/auth.js";
import { serverAuditLog } from "../../lib/audit.js";
import { createAlert, sendPushToUsers, sendEmailToMany } from "../../lib/notify.js";
import { getEligibleVoterIds, closeElectionVoting, publishElectionResults } from "./elections.service.js";
import { assertAccess } from "./elections.access.js";

const router = Router();

// ─── Phase 1 — Election creation (Syndicate Admin only) ──────────────────────

router.post(
  "/elections",
  requireAuth,
  requireOperationalAccess,
  async (req, res) => {
    const schema = z.object({
      title: z.string().min(1),
      description: z.string().default(""),
      electionType: z
        .enum([
          "president",
          "board",
          "financial_committee",
          "maintenance_committee",
          "building_representative",
          "special",
        ])
        .default("special"),
      buildingId: z.string().nullable().optional(),
      votingMethod: z
        .enum(["simple_majority", "absolute_majority"])
        .default("simple_majority"),
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
      mandateDurationMonths: z
        .number()
        .int()
        .min(1)
        .max(120)
        .nullable()
        .optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res
        .status(400)
        .json({ error: "Données invalides", details: result.error.flatten() });
      return;
    }

    const d = result.data;
    if (
      d.candidacyEnd < d.candidacyStart ||
      d.startDate < d.candidacyEnd ||
      d.endDate <= d.startDate
    ) {
      res
        .status(400)
        .json({
          error:
            "Le calendrier de l'élection est incohérent (candidature → vote)",
        });
      return;
    }

    try {
      if (req.user!.role !== "super_admin" && !req.user!.syndicateId) {
        return void res
          .status(403)
          .json({ error: "Syndicat non défini dans le token" });
      }
      const syndicateId =
        req.user!.role === "super_admin"
          ? String(req.query.syndicateId ?? "")
          : (req.user!.syndicateId ?? "");
      if (!syndicateId) {
        return void res
          .status(400)
          .json({
            error: "Un syndicat cible est requis pour créer une élection",
          });
      }

      if (d.buildingId) {
        const [building] = await db
          .select({ syndicateId: buildingsTable.syndicateId })
          .from(buildingsTable)
          .where(eq(buildingsTable.id, d.buildingId));
        if (!building || building.syndicateId !== syndicateId) {
          return void res
            .status(403)
            .json({ error: "Bâtiment hors du périmètre du syndicat" });
        }
      }

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

      await serverAuditLog(req, {
        action: "CREATE",
        entity: "election",
        entityId: election.id,
        details: `Élection créée: ${election.title}`,
      });
      res
        .status(201)
        .json({ data: election, message: "Élection créée avec succès" });
    } catch (err) {
      sendRouteError(req, res, err);
    }
  },
);

router.put(
  "/elections/:id",
  requireAuth,
  requireOperationalAccess,
  async (req, res) => {
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
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
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
      if (election.status !== "draft") {
        res
          .status(400)
          .json({
            error: "Seule une élection en brouillon peut être modifiée",
          });
        return;
      }

      const [updated] = await db
        .update(electionsTable)
        .set(result.data as any)
        .where(eq(electionsTable.id, id))
        .returning();
      await serverAuditLog(req, {
        action: "UPDATE",
        entity: "election",
        entityId: id,
        details: "Configuration mise à jour",
      });
      res.json({ data: updated, message: "Élection mise à jour" });
    } catch (err) {
      sendRouteError(req, res, err);
    }
  },
);

// ─── Lifecycle transitions (state machine) ───────────────────────────────────

const TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  open_candidacy: { from: ["draft"], to: "candidacy_open" },
  start_campaign: { from: ["candidacy_open"], to: "campaign" },
  open_voting: { from: ["campaign", "candidacy_open"], to: "open" },
  close_voting: { from: ["open"], to: "closed" },
  publish_results: { from: ["closed"], to: "completed" },
  cancel: {
    from: ["draft", "candidacy_open", "campaign", "open"],
    to: "cancelled",
  },
  contest: { from: ["closed", "completed"], to: "contested" },
  reopen_round: {
    from: ["quorum_failed", "contested", "cancelled"],
    to: "candidacy_open",
  },
};

router.post(
  "/elections/:id/transition",
  requireAuth,
  requireOperationalAccess,
  async (req, res) => {
    const id = String(req.params.id);
    const schema = z.object({
      action: z.enum(Object.keys(TRANSITIONS) as [string, ...string[]]),
      reason: z.string().optional(),
      // Required only when publish_results hits a tie at the seat cutoff — the admin
      // must explicitly pick which tied candidate(s) take the remaining seat(s).
      tiebreakWinnerIds: z.array(z.string()).optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Action invalide" });
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

      const transition = TRANSITIONS[result.data.action];
      if (!transition.from.includes(election.status ?? "")) {
        res
          .status(400)
          .json({
            error: `Transition impossible depuis le statut "${election.status}"`,
          });
        return;
      }

      if (result.data.action === "close_voting") {
        await closeElectionVoting(election);
        await serverAuditLog(req, {
          action: "CLOSE_VOTING",
          entity: "election",
          entityId: id,
          details: "Vote clôturé, résultats calculés",
        });
        const [refreshed] = await db
          .select()
          .from(electionsTable)
          .where(eq(electionsTable.id, id));
        res.json({ data: refreshed, message: "Vote clôturé" });
        return;
      }

      if (result.data.action === "publish_results") {
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
        const cutoffVotes = ranked[seats - 1]?.votes ?? -1;
        const tie =
          ranked.length > seats && ranked[seats]?.votes === cutoffVotes;

        if (tie) {
          // Candidates tied exactly at the seat cutoff — the admin must explicitly
          // choose who fills the remaining seat(s) instead of silently picking by
          // array order. Return the tied group so the client can render a chooser.
          const tiedGroup = ranked.filter(
            (c) => (c.votes ?? 0) === cutoffVotes,
          );
          const confirmedIds = result.data.tiebreakWinnerIds ?? [];
          const remainingSeats =
            seats - ranked.filter((c) => (c.votes ?? 0) > cutoffVotes).length;
          const validSelection =
            confirmedIds.length === remainingSeats &&
            confirmedIds.every((cid) => tiedGroup.some((c) => c.id === cid));
          if (!validSelection) {
            res.status(409).json({
              error: `Égalité détectée pour ${remainingSeats} siège(s) restant(s) — sélection manuelle requise`,
              code: "TIE_DETECTED",
              tiedCandidates: tiedGroup.map((c) => ({
                id: c.id,
                name: c.name,
                votes: c.votes,
              })),
              remainingSeats,
            });
            return;
          }
        }

        const winners = await publishElectionResults(
          election,
          result.data.tiebreakWinnerIds,
        );
        await serverAuditLog(req, {
          action: "PUBLISH_RESULTS",
          entity: "election",
          entityId: id,
          details: `Résultats publiés, ${winners.length} mandat(s) créé(s)${tie ? " (égalité résolue manuellement)" : ""}`,
        });
        await createAlert({
          key: "election.results",
          params: { title: election.title },
          type: "info",
          syndicateId: election.syndicateId,
          target: "all",
        });
        const winnerUserIds = winners
          .map((w) => w.userId)
          .filter((uid): uid is string => !!uid);
        if (winnerUserIds.length) {
          await sendPushToUsers(
            winnerUserIds,
            "Élu(e) !",
            `Vous avez été élu(e) suite à "${election.title}". Félicitations.`,
            { electionId: id },
          );
          const winnerUsers = await db
            .select({ email: usersTable.email })
            .from(usersTable)
            .where(inArray(usersTable.id, winnerUserIds));
          await sendEmailToMany(
            winnerUsers.map((u) => u.email),
            "Résultats — " + election.title,
            `<p>Vous avez été élu(e) suite à l'élection "${election.title}". Félicitations.</p>`,
          );
        }
        const [refreshed] = await db
          .select()
          .from(electionsTable)
          .where(eq(electionsTable.id, id));
        res.json({
          data: refreshed,
          message: "Résultats publiés, mandats créés",
        });
        return;
      }

      const updates: Record<string, unknown> = { status: transition.to };
      if (result.data.action === "cancel")
        updates.cancelReason = result.data.reason ?? null;
      if (result.data.action === "contest")
        updates.contestReason = result.data.reason ?? null;

      const [updated] = await db
        .update(electionsTable)
        .set(updates as any)
        .where(eq(electionsTable.id, id))
        .returning();

      if (result.data.action === "open_candidacy") {
        await createAlert({
          key: "election.announced",
          params: { title: election.title },
          type: "info",
          syndicateId: election.syndicateId,
          target: "all",
        });
      }
      if (result.data.action === "open_voting") {
        const voterIds = await getEligibleVoterIds(
          election.syndicateId,
          election.buildingId,
          !!election.tenantsCanVote,
        );
        await sendPushToUsers(
          voterIds,
          "Vote ouvert",
          `Le vote pour "${election.title}" est maintenant ouvert.`,
          { electionId: id },
        );
        await createAlert({
          key: "election.voteOpen",
          params: { title: election.title },
          type: "info",
          syndicateId: election.syndicateId,
          target: "all",
        });
      }

      await serverAuditLog(req, {
        action: `TRANSITION_${result.data.action.toUpperCase()}`,
        entity: "election",
        entityId: id,
        details: result.data.reason,
      });
      res.json({ data: updated, message: "Statut mis à jour" });
    } catch (err) {
      sendRouteError(req, res, err);
    }
  },
);

export default router;
