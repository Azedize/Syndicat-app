// elections: candidates endpoints (mounted by elections.routes.ts, in order).
import { sendRouteError } from "../../lib/route-error.js";
import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { electionsTable, candidatesTable, electionQuestionsTable, usersTable } from "@workspace/db/schema";
import { requireAuth, requireNotTenant, requireOperationalAccess } from "../../middleware/auth.js";
import { serverAuditLog } from "../../lib/audit.js";
import { sendPushToUsers, sendEmailToMany } from "../../lib/notify.js";
import { isUserEligible } from "./elections.service.js";
import { assertAccess } from "./elections.access.js";

const router = Router();

// ─── Phase 2 — Candidate registration ────────────────────────────────────────

router.post(
  "/elections/:id/candidates",
  requireAuth,
  requireNotTenant,
  async (req, res) => {
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
      if (election.status !== "candidacy_open") {
        res
          .status(400)
          .json({ error: "Les candidatures ne sont pas ouvertes" });
        return;
      }

      const eligible = await isUserEligible(
        req.user!.userId,
        election.syndicateId,
        election.buildingId,
        !!election.tenantsCanVote,
      );
      if (!eligible) {
        res
          .status(403)
          .json({ error: "Vous n'êtes pas éligible pour cette élection" });
        return;
      }

      const [existing] = await db
        .select()
        .from(candidatesTable)
        .where(
          and(
            eq(candidatesTable.electionId, id),
            eq(candidatesTable.userId, req.user!.userId),
          ),
        );
      if (
        existing &&
        existing.status !== "withdrawn" &&
        existing.status !== "rejected"
      ) {
        res
          .status(400)
          .json({
            error: "Vous avez déjà déposé une candidature pour cette élection",
          });
        return;
      }

      const isAdmin =
        req.user!.role === "super_admin" ||
        req.user!.role === "syndicate_admin";
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

      await serverAuditLog(req, {
        action: "SUBMIT_CANDIDACY",
        entity: "election",
        entityId: id,
        details: `Candidature de ${req.user!.name}`,
      });
      res.status(201).json({ data: candidate, message: "Candidature déposée" });
    } catch (err) {
      sendRouteError(req, res, err);
    }
  },
);

router.put(
  "/elections/:id/candidates/:candidateId/validate",
  requireAuth,
  requireOperationalAccess,
  async (req, res) => {
    const { id, candidateId } = req.params as {
      id: string;
      candidateId: string;
    };
    const schema = z.object({
      decision: z.enum(["approved", "rejected"]),
      reason: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Décision invalide" });
      return;
    }

    try {
      const [election] = await db
        .select()
        .from(electionsTable)
        .where(eq(electionsTable.id, id));
      if (!election || !assertAccess(req, election)) {
        res.status(404).json({ error: "Élection introuvable" });
        return;
      }
      const [candidate] = await db
        .select()
        .from(candidatesTable)
        .where(
          and(
            eq(candidatesTable.id, candidateId),
            eq(candidatesTable.electionId, id),
          ),
        );
      if (!candidate) {
        res.status(404).json({ error: "Candidat introuvable" });
        return;
      }

      const [updated] = await db
        .update(candidatesTable)
        .set({
          status: result.data.decision,
          rejectionReason:
            result.data.decision === "rejected"
              ? (result.data.reason ?? null)
              : null,
        } as any)
        .where(eq(candidatesTable.id, candidateId))
        .returning();

      if (candidate.userId) {
        const decisionText =
          result.data.decision === "approved"
            ? `Votre candidature pour "${election.title}" a été approuvée.`
            : `Votre candidature pour "${election.title}" a été rejetée.${result.data.reason ? " Motif : " + result.data.reason : ""}`;
        await sendPushToUsers(
          [candidate.userId],
          result.data.decision === "approved"
            ? "Candidature approuvée"
            : "Candidature rejetée",
          decisionText,
          { electionId: id },
        );
        const [candidateUser] = await db
          .select({ email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.id, candidate.userId));
        if (candidateUser?.email)
          await sendEmailToMany(
            [candidateUser.email],
            "Candidature — " + election.title,
            `<p>${decisionText}</p>`,
          );
      }

      await serverAuditLog(req, {
        action: "VALIDATE_CANDIDACY",
        entity: "election",
        entityId: id,
        details: `${candidate.name} → ${result.data.decision}`,
      });
      res.json({ data: updated, message: "Candidature mise à jour" });
    } catch (err) {
      sendRouteError(req, res, err);
    }
  },
);

router.post(
  "/elections/:id/candidates/:candidateId/withdraw",
  requireAuth,
  async (req, res) => {
    const { id, candidateId } = req.params as {
      id: string;
      candidateId: string;
    };
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

      const [candidate] = await db
        .select()
        .from(candidatesTable)
        .where(
          and(
            eq(candidatesTable.id, candidateId),
            eq(candidatesTable.electionId, id),
          ),
        );
      if (!candidate) {
        res.status(404).json({ error: "Candidat introuvable" });
        return;
      }
      const isAdmin =
        req.user!.role === "super_admin" ||
        req.user!.role === "syndicate_admin";
      if (!isAdmin && candidate.userId !== req.user!.userId) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }

      const [updated] = await db
        .update(candidatesTable)
        .set({ status: "withdrawn", withdrawnAt: new Date() } as any)
        .where(
          and(
            eq(candidatesTable.id, candidateId),
            eq(candidatesTable.electionId, id),
          ),
        )
        .returning();

      await serverAuditLog(req, {
        action: "WITHDRAW_CANDIDACY",
        entity: "election",
        entityId: id,
        details: `${candidate.name} s'est retiré(e)`,
      });
      res.json({ data: updated, message: "Candidature retirée" });
    } catch (err) {
      sendRouteError(req, res, err);
    }
  },
);

// ─── Phase 3 — Campaign: program updates & Q&A ───────────────────────────────

router.put(
  "/elections/:id/candidates/:candidateId/program",
  requireAuth,
  async (req, res) => {
    const { id, candidateId } = req.params as {
      id: string;
      candidateId: string;
    };
    const schema = z.object({
      program: z.string().optional(),
      motivationLetter: z.string().optional(),
      bio: z.string().optional(),
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

      const [candidate] = await db
        .select()
        .from(candidatesTable)
        .where(
          and(
            eq(candidatesTable.id, candidateId),
            eq(candidatesTable.electionId, id),
          ),
        );
      if (!candidate) {
        res.status(404).json({ error: "Candidat introuvable" });
        return;
      }
      if (candidate.userId !== req.user!.userId) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }
      if (candidate.status !== "approved") {
        res.status(400).json({ error: "Candidature non approuvée" });
        return;
      }

      const [updated] = await db
        .update(candidatesTable)
        .set(result.data as any)
        .where(eq(candidatesTable.id, candidateId))
        .returning();
      res.json({ data: updated, message: "Programme mis à jour" });
    } catch (err) {
      sendRouteError(req, res, err);
    }
  },
);

router.post(
  "/elections/:id/candidates/:candidateId/questions",
  requireAuth,
  requireNotTenant,
  async (req, res) => {
    const { id, candidateId } = req.params as {
      id: string;
      candidateId: string;
    };
    const schema = z.object({ question: z.string().min(1) });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Question requise" });
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

      const [candidate] = await db
        .select()
        .from(candidatesTable)
        .where(
          and(
            eq(candidatesTable.id, candidateId),
            eq(candidatesTable.electionId, id),
            eq(candidatesTable.status, "approved"),
          ),
        );
      if (!candidate) {
        res.status(404).json({ error: "Candidat introuvable" });
        return;
      }
      const [q] = await db
        .insert(electionQuestionsTable)
        .values({
          electionId: id,
          candidateId,
          askedBy: req.user!.userId,
          askedByName: req.user!.name,
          question: result.data.question,
        } as any)
        .returning();
      if (candidate.userId) {
        await sendPushToUsers(
          [candidate.userId],
          "Nouvelle question",
          `${req.user!.name} vous a posé une question.`,
          { electionId: id },
        );
      }
      res.status(201).json({ data: q, message: "Question envoyée" });
    } catch (err) {
      sendRouteError(req, res, err);
    }
  },
);

router.put(
  "/elections/:id/questions/:questionId/answer",
  requireAuth,
  async (req, res) => {
    const { id, questionId } = req.params as { id: string; questionId: string };
    const schema = z.object({ answer: z.string().min(1) });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Réponse requise" });
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

      const [question] = await db
        .select()
        .from(electionQuestionsTable)
        .where(
          and(
            eq(electionQuestionsTable.id, questionId),
            eq(electionQuestionsTable.electionId, id),
          ),
        );
      if (!question) {
        res.status(404).json({ error: "Question introuvable" });
        return;
      }
      const [candidate] = await db
        .select()
        .from(candidatesTable)
        .where(eq(candidatesTable.id, question.candidateId));
      const isAdmin =
        req.user!.role === "super_admin" ||
        req.user!.role === "syndicate_admin";
      if (!isAdmin && candidate?.userId !== req.user!.userId) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }

      const [updated] = await db
        .update(electionQuestionsTable)
        .set({ answer: result.data.answer, answeredAt: new Date() } as any)
        .where(eq(electionQuestionsTable.id, questionId))
        .returning();
      res.json({ data: updated, message: "Réponse publiée" });
    } catch (err) {
      sendRouteError(req, res, err);
    }
  },
);

export default router;
