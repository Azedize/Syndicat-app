import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  publicationsTable,
  publicationLikesTable,
  publicationCommentsTable,
} from "@workspace/db/schema";
import { eq, and, desc, count, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { syndicateWhere } from "../lib/syndicate-filter.js";
import { getPagination, buildPagedResponse } from "../lib/paginate.js";

const router = Router();

function getSupervisedPublicationSyndicateId(req: any): string | null {
  if (req.user?.role !== "super_admin") return null;
  const syndicateId =
    typeof req.query.syndicateId === "string"
      ? req.query.syndicateId.trim()
      : "";
  if (req.query.supervision !== "true" || !syndicateId) {
    throw Object.assign(
      new Error("La supervision et un syndicat cible sont requis."),
      { status: 403, code: "SUPERVISION_REQUIRED" },
    );
  }
  return syndicateId;
}

router.get("/publications", requireAuth, async (req, res) => {
  const pagination = getPagination(req);
  if (req.user!.role !== "super_admin" && !req.user!.syndicateId) {
    res.status(403).json({ error: "Syndicat non défini dans le token" });
    return;
  }
  try {
    getSupervisedPublicationSyndicateId(req);
    const where = syndicateWhere(req, publicationsTable.syndicateId);
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(publicationsTable)
        .where(where)
        .orderBy(desc(publicationsTable.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.select({ value: count() }).from(publicationsTable).where(where),
    ]);

    if (rows.length === 0) {
      res.json(buildPagedResponse([], Number(total), pagination));
      return;
    }

    const pubIds = rows.map((p) => p.id);

    // Batch-fetch all likes and comments in exactly 2 queries (no N+1)
    const [allLikes, allComments] = await Promise.all([
      db
        .select()
        .from(publicationLikesTable)
        .where(inArray(publicationLikesTable.publicationId, pubIds)),
      db
        .select()
        .from(publicationCommentsTable)
        .where(inArray(publicationCommentsTable.publicationId, pubIds))
        .orderBy(publicationCommentsTable.createdAt),
    ]);

    const likesByPub = new Map<string, typeof allLikes>();
    for (const l of allLikes) {
      if (!likesByPub.has(l.publicationId)) likesByPub.set(l.publicationId, []);
      likesByPub.get(l.publicationId)!.push(l);
    }

    const commentsByPub = new Map<string, typeof allComments>();
    for (const c of allComments) {
      if (!commentsByPub.has(c.publicationId))
        commentsByPub.set(c.publicationId, []);
      commentsByPub.get(c.publicationId)!.push(c);
    }

    const userId = req.user!.userId;
    const enriched = rows.map((p) => ({
      ...p,
      userLiked: (likesByPub.get(p.id) ?? []).some((l) => l.userId === userId),
      comments: commentsByPub.get(p.id) ?? [],
    }));

    res.json(buildPagedResponse(enriched, Number(total), pagination));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post(
  "/publications",
  requireAuth,
  // Secretary publishes announcements; president makes official communications.
  requireRole("syndicate_admin", "secretary", "president"),
  async (req, res) => {
    const schema = z.object({
      title: z.string().min(1),
      content: z.string().min(1),
      category: z.string().default(""),
      pinned: z.boolean().default(false),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }
    try {
      if (!req.user!.syndicateId) {
        res.status(403).json({ error: "Syndicat non défini dans le token" });
        return;
      }
      const [pub] = await db
        .insert(publicationsTable)
        .values({
          ...result.data,
          syndicateId: req.user!.syndicateId,
          authorId: req.user!.userId,
          authorName: req.user!.name,
        })
        .returning();
      res.status(201).json({ data: pub, message: "Publication créée" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.post("/publications/:id/like", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
  try {
    if (req.user!.role !== "super_admin" && !req.user!.syndicateId) {
      res.status(403).json({ error: "Syndicat non défini dans le token" });
      return;
    }
    const supervisedSyndicateId =
      getSupervisedPublicationSyndicateId(req);
    const scope =
      req.user!.role === "super_admin"
        ? and(
            eq(publicationsTable.id, id),
            eq(publicationsTable.syndicateId, supervisedSyndicateId!),
          )
        : and(
            eq(publicationsTable.id, id),
            eq(publicationsTable.syndicateId, req.user!.syndicateId!),
          );
    const [pub] = await db.select().from(publicationsTable).where(scope);
    if (!pub) {
      res.status(404).json({ error: "Publication introuvable" });
      return;
    }

    const existing = await db
      .select()
      .from(publicationLikesTable)
      .where(
        and(
          eq(publicationLikesTable.publicationId, id),
          eq(publicationLikesTable.userId, req.user!.userId),
        ),
      );

    if (existing.length > 0) {
      await db
        .delete(publicationLikesTable)
        .where(
          and(
            eq(publicationLikesTable.publicationId, id),
            eq(publicationLikesTable.userId, req.user!.userId),
          ),
        );
      await db
        .update(publicationsTable)
        .set({ likes: Math.max(0, (pub.likes ?? 0) - 1) })
        .where(scope);
      res.json({ message: "Like retiré", liked: false });
    } else {
      await db
        .insert(publicationLikesTable)
        .values({ publicationId: id, userId: req.user!.userId });
      await db
        .update(publicationsTable)
        .set({ likes: (pub.likes ?? 0) + 1 })
        .where(scope);
      res.json({ message: "Publication aimée", liked: true });
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/publications/:id/comments", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
  const schema = z.object({ text: z.string().min(1).max(2000) });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Commentaire vide" });
    return;
  }
  try {
    if (req.user!.role !== "super_admin" && !req.user!.syndicateId) {
      res.status(403).json({ error: "Syndicat non défini dans le token" });
      return;
    }
    const supervisedSyndicateId =
      getSupervisedPublicationSyndicateId(req);
    const publicationScope =
      req.user!.role === "super_admin"
        ? and(
            eq(publicationsTable.id, id),
            eq(publicationsTable.syndicateId, supervisedSyndicateId!),
          )
        : and(
            eq(publicationsTable.id, id),
            eq(publicationsTable.syndicateId, req.user!.syndicateId!),
          );
    const [pub] = await db
      .select()
      .from(publicationsTable)
      .where(publicationScope);
    if (!pub) {
      res.status(404).json({ error: "Publication introuvable" });
      return;
    }
    const [comment] = await db
      .insert(publicationCommentsTable)
      .values({
        publicationId: id,
        userId: req.user!.userId,
        userName: req.user!.name,
        text: result.data.text,
      })
      .returning();
    res.status(201).json({ data: comment, message: "Commentaire ajouté" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
