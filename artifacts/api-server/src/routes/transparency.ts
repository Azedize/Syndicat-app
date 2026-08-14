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
} from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

function canAccessJustification(req: any, syndicateId: string | null | undefined): boolean {
  const user = req.user!;
  return user.role === "super_admin" || (!!user.syndicateId && syndicateId === user.syndicateId);
}

// GET /transparency — list expense justifications
router.get("/expense-justifications", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { status } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (user.role !== "super_admin" && !user.syndicateId) {
      return void res.status(403).json({ error: "Syndicat non défini dans le token" });
    }
    if (user.role !== "super_admin") {
      conditions.push(eq(expenseJustificationsTable.syndicateId, user.syndicateId!));
    }
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
          .select({ justificationId: expenseVotesTable.justificationId, vote: expenseVotesTable.vote })
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
router.post("/expense-justifications", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = req.user!;
    const { title, description, amount, category, receiptUrl, transactionId } = req.body;

    if (user.role !== "super_admin" && !user.syndicateId) {
      return void res.status(403).json({ error: "Syndicat non défini dans le token" });
    }
    if (!title?.trim() || !amount) {
      return void res.status(400).json({ error: "Le titre et le montant sont obligatoires" });
    }

    const [row] = await db
      .insert(expenseJustificationsTable)
      .values({
        syndicateId: user.syndicateId ?? null,
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
});

// POST /transparency/:id/challenge — member challenges a justification
router.post("/expense-justifications/:id/challenge", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { reason } = req.body;

    if (!reason?.trim()) {
      return void res.status(400).json({ error: "Le motif de contestation est obligatoire" });
    }

    const [row] = await db
      .select()
      .from(expenseJustificationsTable)
      .where(eq(expenseJustificationsTable.id, String(req.params.id) as string));

    if (!row) return void res.status(404).json({ error: "Justificatif introuvable" });
    if (!canAccessJustification(req, row.syndicateId)) {
      return void res.status(403).json({ error: "Accès refusé" });
    }
    if (row.status !== "pending") {
      return void res.status(400).json({ error: "Ce justificatif ne peut plus être contesté" });
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

    res.json({ data: updated, message: "Contestation enregistrée. Les membres peuvent voter." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /transparency/:id/vote — vote on a challenged justification
router.post("/expense-justifications/:id/vote", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { vote } = req.body; // "for" | "against"

    if (!["for", "against"].includes(vote)) {
      return void res.status(400).json({ error: "Vote invalide: 'for' ou 'against'" });
    }

    const [row] = await db
      .select()
      .from(expenseJustificationsTable)
      .where(eq(expenseJustificationsTable.id, String(req.params.id) as string));

    if (!row) return void res.status(404).json({ error: "Justificatif introuvable" });
    if (!canAccessJustification(req, row.syndicateId)) {
      return void res.status(403).json({ error: "Accès refusé" });
    }
    if (row.status !== "challenged") {
      return void res.status(400).json({ error: "Le vote n'est ouvert que pour les justificatifs contestés" });
    }

    // Upsert vote
    const [existingVote] = await db
      .select()
      .from(expenseVotesTable)
      .where(
        and(
          eq(expenseVotesTable.justificationId, row.id),
          eq(expenseVotesTable.userId, user.userId)
        )
      );

    if (existingVote) {
      if (existingVote.vote === vote) {
        return void res.status(409).json({ error: "Vous avez déjà voté" });
      }
      await db.update(expenseVotesTable).set({ vote }).where(eq(expenseVotesTable.id, existingVote.id));
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

    res.json({ message: "Vote enregistré", votesFor, votesAgainst, total: allVotes.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /transparency/:id/resolve — admin resolves a challenged justification
router.put("/expense-justifications/:id/resolve", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, resolutionNote } = req.body; // "approved" | "resolved"

    const [existing] = await db
      .select()
      .from(expenseJustificationsTable)
      .where(eq(expenseJustificationsTable.id, String(req.params.id) as string));
    if (!existing) return void res.status(404).json({ error: "Justificatif introuvable" });
    if (!canAccessJustification(req, existing.syndicateId)) {
      return void res.status(403).json({ error: "Accès refusé" });
    }

    const [updated] = await db
      .update(expenseJustificationsTable)
      .set({
        status: status ?? "resolved",
        resolutionNote: resolutionNote ?? null,
        resolvedAt: new Date(),
      })
      .where(eq(expenseJustificationsTable.id, String(req.params.id) as string))
      .returning();

    res.json({ data: updated, message: "Justificatif résolu" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
