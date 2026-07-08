/**
 * P6 — Improvement Ideas & Voting
 * Rules:
 *   - Any member/admin can submit an idea (max 1 active per user per syndicate/year)
 *   - Admin reviews: approve / reject / mark implemented
 *   - All syndicate members can vote (one vote per idea per user)
 *   - Voting can be time-limited via voteDeadline
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  ideasTable,
  ideaVotesTable,
  syndicatesTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

// GET /ideas — list ideas for current syndicate
router.get("/ideas", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { status, category } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (user.syndicateId) conditions.push(eq(ideasTable.syndicateId, user.syndicateId));
    if (status) conditions.push(eq(ideasTable.status, status));
    if (category) conditions.push(eq(ideasTable.category, category));

    const ideas = await db
      .select()
      .from(ideasTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(ideasTable.voteCount), desc(ideasTable.createdAt));

    // Check which ideas the current user has voted on
    const ideaIds = ideas.map((i) => i.id);
    const userVotes = ideaIds.length
      ? await db
          .select({ ideaId: ideaVotesTable.ideaId })
          .from(ideaVotesTable)
          .where(and(eq(ideaVotesTable.userId, user.userId), sql`${ideaVotesTable.ideaId} = ANY(${sql.raw(`ARRAY[${ideaIds.map((id) => `'${id}'`).join(",")}]::text[]`)})`)
          )
      : [];
    const votedSet = new Set(userVotes.map((v) => v.ideaId));

    res.json({
      data: ideas.map((i) => ({ ...i, hasVoted: votedSet.has(i.id) })),
      total: ideas.length,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /ideas — submit a new idea
router.post("/ideas", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { title, description, category, voteDeadline } = req.body;

    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ error: "Le titre et la description sont obligatoires" });
    }

    // Max 1 active (non-rejected) idea per user per calendar year
    const thisYear = new Date().getFullYear().toString();
    const [existing] = await db
      .select({ id: ideasTable.id })
      .from(ideasTable)
      .where(
        and(
          eq(ideasTable.userId, user.userId),
          eq(ideasTable.syndicateId, user.syndicateId ?? ""),
          sql`EXTRACT(YEAR FROM ${ideasTable.createdAt}) = ${thisYear}`,
          sql`${ideasTable.status} != 'rejected'`
        )
      )
      .limit(1);

    if (existing) {
      return res.status(409).json({
        error: "Vous avez déjà soumis une idée cette année. Une seule proposition active par an est autorisée.",
      });
    }

    const [idea] = await db
      .insert(ideasTable)
      .values({
        syndicateId: user.syndicateId ?? null,
        userId: user.userId,
        userName: user.name,
        title: title.trim(),
        description: description.trim(),
        category: category ?? "general",
        voteDeadline: voteDeadline ?? null,
        status: "submitted",
        voteCount: 0,
      })
      .returning();

    res.status(201).json({ data: idea, message: "Idée soumise avec succès" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /ideas/:id/vote — toggle vote on an idea
router.post("/ideas/:id/vote", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const ideaId = req.params.id as string;

    const [idea] = await db.select().from(ideasTable).where(eq(ideasTable.id, ideaId));
    if (!idea) return res.status(404).json({ error: "Idée introuvable" });

    if (idea.status === "rejected" || idea.status === "implemented") {
      return res.status(400).json({ error: "Le vote est fermé pour cette idée" });
    }
    if (idea.voteDeadline && new Date(idea.voteDeadline) < new Date()) {
      return res.status(400).json({ error: "La période de vote est terminée" });
    }

    // Check existing vote
    const [existingVote] = await db
      .select()
      .from(ideaVotesTable)
      .where(and(eq(ideaVotesTable.ideaId, ideaId), eq(ideaVotesTable.userId, user.userId)));

    if (existingVote) {
      // Remove vote
      await db.delete(ideaVotesTable).where(eq(ideaVotesTable.id, existingVote.id));
      await db.update(ideasTable)
        .set({ voteCount: Math.max(0, (idea.voteCount ?? 1) - 1) })
        .where(eq(ideasTable.id, ideaId));
      return res.json({ hasVoted: false, message: "Vote retiré" });
    }

    await db.insert(ideaVotesTable).values({ ideaId, userId: user.userId });
    const [updated] = await db
      .update(ideasTable)
      .set({ voteCount: (idea.voteCount ?? 0) + 1 })
      .where(eq(ideasTable.id, ideaId))
      .returning();

    res.json({ hasVoted: true, voteCount: updated.voteCount, message: "Vote enregistré" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /ideas/:id — admin review (approve/reject/implement)
router.put("/ideas/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const allowed: Record<string, any> = {};
    const { status, adminNote, voteDeadline } = req.body;

    if (status) allowed.status = status;
    if (adminNote !== undefined) allowed.adminNote = adminNote;
    if (voteDeadline !== undefined) allowed.voteDeadline = voteDeadline;
    if (status === "implemented") allowed.implementedAt = new Date();

    const [updated] = await db
      .update(ideasTable)
      .set(allowed)
      .where(eq(ideasTable.id, req.params.id as string))
      .returning();

    if (!updated) return res.status(404).json({ error: "Idée introuvable" });
    res.json({ data: updated, message: "Idée mise à jour" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /ideas/:id — owner or admin can delete
router.delete("/ideas/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const [idea] = await db.select().from(ideasTable).where(eq(ideasTable.id, req.params.id as string));
    if (!idea) return res.status(404).json({ error: "Idée introuvable" });

    const isAdmin = user.role === "super_admin" || user.role === "syndicate_admin";
    if (!isAdmin && idea.userId !== user.userId) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    await db.delete(ideasTable).where(eq(ideasTable.id, idea.id));
    res.json({ message: "Idée supprimée" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
