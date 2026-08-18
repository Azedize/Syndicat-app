/**
 * P10 — Financial Transparency
 * - Admins submit expense justifications (title, description, amount, receipt)
 * - All members can view and challenge
 * - Members vote: for / against the challenge
 * - Admin resolves after voting
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  expenseJustificationsTable,
  expenseVotesTable,
  membersTable,
  syndicatesTable,
  transactionsTable,
} from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

function canAccessJustification(
  req: any,
  syndicateId: string | null | undefined,
): boolean {
  const user = req.user!;
  if (user.role === "super_admin") {
    return (
      req.query.supervision === "true" &&
      !!req.query.syndicateId &&
      syndicateId === req.query.syndicateId
    );
  }
  return !!user.syndicateId && syndicateId === user.syndicateId;
}

async function requireActiveMember(req: any, res: any): Promise<boolean> {
  const user = req.user!;
  if (user.role !== "member") {
    res
      .status(403)
      .json({ error: "Cette action est réservée aux copropriétaires actifs" });
    return false;
  }
  if (!user.syndicateId) {
    res.status(403).json({ error: "Syndicat non défini dans le token" });
    return false;
  }
  const [member] = await db
    .select({ id: membersTable.id })
    .from(membersTable)
    .where(
      and(
        eq(membersTable.syndicateId, user.syndicateId),
        eq(membersTable.email, user.email),
        eq(membersTable.status, "active"),
      ),
    )
    .limit(1);
  if (!member) {
    res.status(403).json({ error: "Adhésion active introuvable" });
    return false;
  }
  return true;
}

// GET /transparency — list expense justifications
router.get("/expense-justifications", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { status } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (user.role === "super_admin" && req.query.supervision !== "true") {
      return void res.status(403).json({
        error:
          "Les Super Admins doivent activer le mode supervision pour consulter la transparence.",
        code: "SUPERVISION_REQUIRED",
      });
    }
    const targetSyndicateId =
      user.role === "super_admin"
        ? typeof req.query.syndicateId === "string"
          ? req.query.syndicateId.trim()
          : ""
        : user.syndicateId;
    if (!targetSyndicateId) {
      return void res
        .status(user.role === "super_admin" ? 400 : 403)
        .json({
          error:
            user.role === "super_admin"
              ? "Un syndicat cible est requis"
              : "Syndicat non défini dans le token",
        });
    }
    const [targetSyndicate] = await db
      .select({ id: syndicatesTable.id })
      .from(syndicatesTable)
      .where(eq(syndicatesTable.id, targetSyndicateId))
      .limit(1);
    if (!targetSyndicate) {
      return void res.status(404).json({ error: "Syndicat cible introuvable" });
    }
    conditions.push(
      eq(expenseJustificationsTable.syndicateId, targetSyndicateId),
    );
    if (status) conditions.push(eq(expenseJustificationsTable.status, status));

    const rows = await db
      .select()
      .from(expenseJustificationsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(expenseJustificationsTable.createdAt));

    // Attach user's own vote
    const ids = rows.map((r) => r.id);
    const myVotes = ids.length
      ? await db
          .select({
            justificationId: expenseVotesTable.justificationId,
            vote: expenseVotesTable.vote,
          })
          .from(expenseVotesTable)
          .where(eq(expenseVotesTable.userId, user.userId))
      : [];
    const voteMap = new Map(myVotes.map((v) => [v.justificationId, v.vote]));

    res.json({
      data: rows.map((r) => ({ ...r, myVote: voteMap.get(r.id) ?? null })),
      total: rows.length,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /transparency — admin creates expense justification
router.post(
  "/expense-justifications",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const user = req.user!;
      const {
        title,
        description,
        amount,
        category,
        receiptUrl,
        transactionId,
        syndicateId: requestedSyndicateId,
      } = req.body;

      if (user.role !== "super_admin" && !user.syndicateId) {
        return void res
          .status(403)
          .json({ error: "Syndicat non défini dans le token" });
      }
      if (user.role === "super_admin" && req.query.supervision !== "true") {
        return void res.status(403).json({
          error:
            "Les Super Admins doivent activer le mode supervision pour cibler un syndicat.",
          code: "SUPERVISION_REQUIRED",
        });
      }
      if (!title?.trim() || !amount) {
        return void res
          .status(400)
          .json({ error: "Le titre et le montant sont obligatoires" });
      }

      let targetSyndicateId =
        user.role === "super_admin"
          ? typeof requestedSyndicateId === "string" &&
            requestedSyndicateId.trim()
            ? requestedSyndicateId.trim()
            : null
          : user.syndicateId!;
      let transactionSyndicateId: string | null | undefined;
      if (transactionId) {
        const [transaction] = await db
          .select({ syndicateId: transactionsTable.syndicateId })
          .from(transactionsTable)
          .where(eq(transactionsTable.id, String(transactionId)))
          .limit(1);
        if (!transaction) {
          return void res
            .status(400)
            .json({ error: "Transaction introuvable" });
        }
        if (
          user.role !== "super_admin" &&
          transaction.syndicateId !== user.syndicateId
        ) {
          return void res.status(403).json({ error: "Accès refusé" });
        }
        transactionSyndicateId = transaction.syndicateId;
        if (!transactionSyndicateId) {
          return void res
            .status(400)
            .json({ error: "La transaction doit appartenir à un syndicat" });
        }
        if (
          user.role === "super_admin" &&
          targetSyndicateId &&
          targetSyndicateId !== transactionSyndicateId
        ) {
          return void res.status(400).json({
            error: "Le syndic ciblé ne correspond pas à la transaction",
          });
        }
        targetSyndicateId = transactionSyndicateId;
      }

      if (!targetSyndicateId) {
        return void res.status(400).json({
          error: "Un syndicat cible est obligatoire pour ce justificatif",
        });
      }

      const [targetSyndicate] = await db
        .select({ id: syndicatesTable.id })
        .from(syndicatesTable)
        .where(eq(syndicatesTable.id, targetSyndicateId))
        .limit(1);
      if (!targetSyndicate) {
        return void res
          .status(400)
          .json({ error: "Syndicat cible introuvable" });
      }

      const [row] = await db
        .insert(expenseJustificationsTable)
        .values({
          syndicateId: targetSyndicateId,
          transactionId: transactionId ?? null,
          title: title.trim(),
          description: (description ?? "").trim(),
          amount: String(parseFloat(String(amount))),
          category: category ?? null,
          receiptUrl: receiptUrl ?? null,
          status: "pending",
          submittedBy: user.userId,
          submitterName: user.name,
        })
        .returning();

      res.status(201).json({ data: row, message: "Justificatif soumis" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// POST /transparency/:id/challenge — member challenges a justification
router.post(
  "/expense-justifications/:id/challenge",
  requireAuth,
  async (req, res) => {
    try {
      const user = req.user!;
      const { reason } = req.body;

      if (!(await requireActiveMember(req, res))) return;

      if (!reason?.trim()) {
        return void res
          .status(400)
          .json({ error: "Le motif de contestation est obligatoire" });
      }

      const [row] = await db
        .select()
        .from(expenseJustificationsTable)
        .where(
          eq(expenseJustificationsTable.id, String(req.params.id) as string),
        );

      if (!row)
        return void res.status(404).json({ error: "Justificatif introuvable" });
      if (!canAccessJustification(req, row.syndicateId)) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
      if (row.status !== "pending") {
        return void res
          .status(400)
          .json({ error: "Ce justificatif ne peut plus être contesté" });
      }

      const [updated] = await db
        .update(expenseJustificationsTable)
        .set({
          status: "challenged",
          challengedBy: user.userId,
          challengerName: user.name,
          challengeReason: reason.trim(),
        })
        .where(eq(expenseJustificationsTable.id, row.id))
        .returning();

      res.json({
        data: updated,
        message: "Contestation enregistrée. Les membres peuvent voter.",
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// POST /transparency/:id/vote — vote on a challenged justification
router.post(
  "/expense-justifications/:id/vote",
  requireAuth,
  async (req, res) => {
    try {
      const user = req.user!;
      const { vote } = req.body; // "for" | "against"

      if (!(await requireActiveMember(req, res))) return;

      if (!["for", "against"].includes(vote)) {
        return void res
          .status(400)
          .json({ error: "Vote invalide: 'for' ou 'against'" });
      }

      const [row] = await db
        .select()
        .from(expenseJustificationsTable)
        .where(
          eq(expenseJustificationsTable.id, String(req.params.id) as string),
        );

      if (!row)
        return void res.status(404).json({ error: "Justificatif introuvable" });
      if (!canAccessJustification(req, row.syndicateId)) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
      if (row.status !== "challenged") {
        return void res.status(400).json({
          error: "Le vote n'est ouvert que pour les justificatifs contestés",
        });
      }

      // Upsert vote
      const [existingVote] = await db
        .select()
        .from(expenseVotesTable)
        .where(
          and(
            eq(expenseVotesTable.justificationId, row.id),
            eq(expenseVotesTable.userId, user.userId),
          ),
        );

      if (existingVote) {
        if (existingVote.vote === vote) {
          return void res.status(409).json({ error: "Vous avez déjà voté" });
        }
        await db
          .update(expenseVotesTable)
          .set({ vote })
          .where(eq(expenseVotesTable.id, existingVote.id));
      } else {
        await db.insert(expenseVotesTable).values({
          justificationId: row.id,
          userId: user.userId,
          vote,
        });
      }

      // Recount
      const allVotes = await db
        .select()
        .from(expenseVotesTable)
        .where(eq(expenseVotesTable.justificationId, row.id));

      const votesFor = allVotes.filter((v) => v.vote === "for").length;
      const votesAgainst = allVotes.filter((v) => v.vote === "against").length;

      await db
        .update(expenseJustificationsTable)
        .set({ voteCount: allVotes.length, votesFor, votesAgainst })
        .where(eq(expenseJustificationsTable.id, row.id));

      res.json({
        message: "Vote enregistré",
        votesFor,
        votesAgainst,
        total: allVotes.length,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// PUT /transparency/:id/resolve — admin resolves a challenged justification
router.put(
  "/expense-justifications/:id/resolve",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { status, resolutionNote } = req.body; // "approved" | "resolved"

      if (
        req.user!.role === "super_admin" &&
        req.query.supervision !== "true"
      ) {
        return void res.status(403).json({
          error:
            "Les Super Admins doivent activer le mode supervision pour résoudre un justificatif.",
          code: "SUPERVISION_REQUIRED",
        });
      }

      const [existing] = await db
        .select()
        .from(expenseJustificationsTable)
        .where(
          eq(expenseJustificationsTable.id, String(req.params.id) as string),
        );
      if (!existing)
        return void res.status(404).json({ error: "Justificatif introuvable" });
      if (!canAccessJustification(req, existing.syndicateId)) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
      if (!status || !["approved", "resolved", "rejected"].includes(status)) {
        return void res
          .status(400)
          .json({ error: "Statut de résolution invalide" });
      }

      const [updated] = await db
        .update(expenseJustificationsTable)
        .set({
          status,
          resolutionNote: resolutionNote ?? null,
          resolvedAt: new Date(),
        })
        .where(
          and(
            eq(expenseJustificationsTable.id, String(req.params.id) as string),
            eq(expenseJustificationsTable.syndicateId, existing.syndicateId!),
          ),
        )
        .returning();

      res.json({ data: updated, message: "Justificatif résolu" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

export default router;
