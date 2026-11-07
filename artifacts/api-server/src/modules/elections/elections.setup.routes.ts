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
import { defaultsFor, ELECTION_TYPES, validateConfig } from "./elections.rules.js";

import { isoDateSchema, optionalIsoDateSchema } from "../../lib/dateSchemas.js";
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
      electionType: z.enum(ELECTION_TYPES).default("special"),
      buildingId: z.string().nullable().optional(),
      votingMethod: z.enum(["simple_majority", "absolute_majority", "three_quarters"]).optional(),
      quorumPercent: z.number().int().min(0).max(100).default(50),
      majorityPercent: z.number().int().min(0).max(100).default(50),
      seatsCount: z.number().int().min(1).max(50).optional(),
      ballotMode: z.enum(["single", "multiple"]).optional(),
      weighting: z.enum(["per_voter", "quote_part"]).optional(),
      majorityBase: z.enum(["votes_cast", "all_voices"]).optional(),
      tenantsCanVote: z.boolean().optional(),
      candidacyStart: z.string(),
      candidacyEnd: z.string(),
      startDate: isoDateSchema,
      endDate: isoDateSchema,
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

    // The type's legal settings first, then what the organizer chose for the rest.
    const preset = defaultsFor(result.data.electionType);
    const d = {
      ...result.data,
      seatsCount: result.data.seatsCount ?? preset.seatsCount ?? 1,
      ballotMode: result.data.ballotMode ?? preset.ballotMode ?? ((result.data.seatsCount ?? 1) > 1 ? "multiple" : "single"),
      weighting: result.data.weighting ?? preset.weighting ?? "per_voter",
      votingMethod: result.data.votingMethod ?? preset.votingMethod ?? "simple_majority",
      majorityBase: result.data.majorityBase ?? preset.majorityBase ?? "votes_cast",
      tenantsCanVote: result.data.tenantsCanVote ?? preset.tenantsCanVote ?? false,
    };
    const ruleErrors = validateConfig({ ...d, buildingId: d.buildingId ?? null });
    if (ruleErrors.length) {
      res.status(422).json({ error: ruleErrors[0].message, code: ruleErrors[0].code, field: ruleErrors[0].field, errors: ruleErrors });
      return;
    }
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
          ballotMode: d.ballotMode,
          weighting: d.weighting,
          majorityBase: d.majorityBase,
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
      seatsCount: z.number().int().min(1).max(50).optional(),
      ballotMode: z.enum(["single", "multiple"]).optional(),
      weighting: z.enum(["per_voter", "quote_part"]).optional(),
      majorityBase: z.enum(["votes_cast", "all_voices"]).optional(),
      votingMethod: z.enum(["simple_majority", "absolute_majority", "three_quarters"]).optional(),
      tenantsCanVote: z.boolean().optional(),
      candidacyStart: z.string().optional(),
      candidacyEnd: z.string().optional(),
      startDate: optionalIsoDateSchema,
      endDate: optionalIsoDateSchema,
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

      // A second round keeps the seats and candidates of its tie: only the dates
      // (and the texts) are the organizer's to set.
      if ((election.round ?? 1) > 1 && ["seatsCount", "ballotMode", "weighting", "majorityBase", "votingMethod", "majorityPercent", "tenantsCanVote"].some((k) => k in result.data)) {
        res.status(400).json({ error: "Un second tour garde les règles du premier : seules les dates et les textes se modifient", code: "RUNOFF_RULES_FIXED" });
        return;
      }
      const merged = { ...election, ...result.data };
      const ruleErrors = validateConfig({
        electionType: merged.electionType ?? "special",
        seatsCount: merged.seatsCount ?? 1,
        ballotMode: merged.ballotMode as "single" | "multiple",
        weighting: merged.weighting as "per_voter" | "quote_part",
        votingMethod: (merged.votingMethod ?? "simple_majority") as "simple_majority",
        majorityBase: merged.majorityBase as "votes_cast" | "all_voices",
        majorityPercent: merged.majorityPercent ?? 50,
        tenantsCanVote: !!merged.tenantsCanVote,
        buildingId: merged.buildingId ?? null,
      });
      if (ruleErrors.length) {
        res.status(422).json({ error: ruleErrors[0].message, code: ruleErrors[0].code, field: ruleErrors[0].field, errors: ruleErrors });
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
  // from draft only for a second round (its candidates are the tied ones)
  open_voting: { from: ["campaign", "candidacy_open", "draft"], to: "open" },
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
  // A tie that persisted, or no candidate reaching the majority: the organizer
  // plans a new ballot (a new election, candidacies open again). The
  // deliberation_required election and its results stay as they are.
  schedule_new_ballot: { from: ["deliberation_required"], to: "deliberation_required" },
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
      // Formerly the administrator's pick among tied candidates: refused now (nobody breaks a tie).
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
      if (result.data.tiebreakWinnerIds?.length) {
        res.status(400).json({
          error: "Le départage manuel n'est plus possible : une égalité mène à un second tour, puis à une nouvelle délibération",
          code: "TIEBREAK_NOT_ALLOWED",
        });
        return;
      }
      if (result.data.action === "open_voting" && election.status === "draft") {
        if ((election.round ?? 1) < 2) {
          res.status(400).json({ error: "Ouvrez d'abord les candidatures", code: "CANDIDACY_FIRST" });
          return;
        }
        if (!election.startDate || !election.endDate) {
          res.status(400).json({ error: "Fixez les dates du second tour avant d'ouvrir le vote", code: "RUNOFF_DATES_REQUIRED" });
          return;
        }
      }

      if (result.data.action === "schedule_new_ballot") {
        const [next] = await db
          .insert(electionsTable)
          .values({
            syndicateId: election.syndicateId,
            title: `${election.title.replace(/ — 2e tour$/, "")} — nouveau scrutin`,
            description: election.description,
            electionType: election.electionType,
            buildingId: election.buildingId,
            votingMethod: election.votingMethod,
            quorumPercent: election.quorumPercent,
            majorityPercent: election.majorityPercent,
            seatsCount: (election.outcomeDetails as any)?.seatsInPlay || (election.outcomeDetails as any)?.vacantSeats || election.seatsCount,
            ballotMode: election.ballotMode,
            weighting: election.weighting,
            majorityBase: election.majorityBase,
            tenantsCanVote: election.tenantsCanVote,
            mandateDurationMonths: election.mandateDurationMonths,
            round: 1,
            parentElectionId: election.id,
            status: "draft",
            createdBy: req.user!.userId,
          } as any)
          .returning();
        // Seats must stay coherent with the ballot mode of the new election.
        if ((next.seatsCount ?? 1) < 2 && next.ballotMode === "multiple") {
          await db.update(electionsTable).set({ ballotMode: "single" } as any).where(eq(electionsTable.id, next.id));
        }
        await serverAuditLog(req, {
          action: "SCHEDULE_NEW_BALLOT",
          entity: "election",
          entityId: id,
          details: `Nouveau scrutin préparé : ${next.id}`,
        });
        res.status(201).json({ data: next, message: "Nouveau scrutin préparé (brouillon)" });
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
        // The count decides: elected, second round between tied candidates, or a
        // new deliberation. Nobody picks among tied candidates.
        const published = await publishElectionResults(election);
        const winners = published.mandates;
        const OUTCOME_TEXT: Record<string, string> = {
          elected: "élu(s)",
          runoff_required: "égalité : second tour préparé",
          deliberation_required: "égalité persistante : nouvelle délibération requise",
          no_majority: "aucun candidat n'atteint la majorité requise",
        };
        await serverAuditLog(req, {
          action: "PUBLISH_RESULTS",
          entity: "election",
          entityId: id,
          details: `Résultats publiés (${OUTCOME_TEXT[published.count.outcome]}), ${winners.length} mandat(s) créé(s)${published.runoffElectionId ? `, second tour ${published.runoffElectionId}` : ""}`,
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
          outcome: published.count.outcome,
          runoffElectionId: published.runoffElectionId,
          message: `Résultats publiés : ${OUTCOME_TEXT[published.count.outcome]}`,
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
