import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { conversationsTable, messagesTable, usersTable } from "@workspace/db/schema";
import { eq, or, and, desc, count, inArray } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { getPagination, buildPagedResponse } from "../lib/paginate.js";

const router = Router();

async function canAccessConversation(userId: string, syndicateId: string, conversationId: string): Promise<boolean> {
  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId));
  if (!conv) return false;
  if (conv.isGroup) return conv.syndicateId === syndicateId;
  return conv.participant1Id === userId || conv.participant2Id === userId;
}

router.get("/conversations", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const syndicateId = req.user!.syndicateId || "";

    const conversations = await db
      .select()
      .from(conversationsTable)
      .where(
        or(
          eq(conversationsTable.participant1Id, userId),
          eq(conversationsTable.participant2Id, userId),
          and(
            eq(conversationsTable.isGroup, true),
            eq(conversationsTable.syndicateId, syndicateId),
          ),
        ),
      )
      .orderBy(desc(conversationsTable.lastMessageAt));

    if (conversations.length === 0) {
      res.json({ data: [], total: 0 });
      return;
    }

    // Batch-load all participant users
    const participantIds = Array.from(new Set(
      conversations.flatMap((c) => [c.participant1Id, c.participant2Id].filter(Boolean) as string[])
    ));

    const users = participantIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
          .from(usersTable).where(inArray(usersTable.id, participantIds))
      : [];

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const enriched = conversations.map((c) => {
      const otherId = c.participant1Id === userId ? c.participant2Id : c.participant1Id;
      const other = otherId ? userMap[otherId] : null;
      return {
        id: c.id,
        isGroup: c.isGroup,
        participant: c.isGroup ? (c.name ?? "Groupe") : (other?.name ?? "Contact"),
        participantId: otherId,
        role: c.isGroup ? "Groupe" : (other?.role ?? "member"),
        lastMessage: c.lastMessage ?? "",
        time: c.lastMessageAt
          ? new Date(c.lastMessageAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
          : "",
        unread: 0,
        syndicateId: c.syndicateId,
      };
    });

    res.json({ data: enriched, total: enriched.length });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/conversations", requireAuth, async (req, res) => {
  const schema = z.object({
    participantId: z.string().optional(),
    isGroup: z.boolean().default(false),
    name: z.string().max(100).optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
  try {
    // Prevent duplicate direct conversations
    if (!result.data.isGroup && result.data.participantId) {
      const existing = await db.select().from(conversationsTable).where(
        or(
          and(
            eq(conversationsTable.participant1Id, req.user!.userId),
            eq(conversationsTable.participant2Id, result.data.participantId),
          ),
          and(
            eq(conversationsTable.participant1Id, result.data.participantId),
            eq(conversationsTable.participant2Id, req.user!.userId),
          ),
        )
      );
      if (existing.length > 0) {
        res.json({ data: existing[0], existing: true });
        return;
      }
    }

    const [conv] = await db
      .insert(conversationsTable)
      .values({
        syndicateId: req.user!.syndicateId || "",
        participant1Id: req.user!.userId,
        participant2Id: result.data.participantId,
        isGroup: result.data.isGroup,
        name: result.data.name,
        lastMessage: "",
      })
      .returning();
    res.status(201).json({ data: conv });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/conversations/:id/messages", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const pagination = getPagination(req, 100);
  try {
    const canAccess = await canAccessConversation(
      req.user!.userId,
      req.user!.syndicateId || "",
      id,
    );
    if (!canAccess) { res.status(403).json({ error: "Accès refusé" }); return; }

    const [messages, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, id))
        .orderBy(messagesTable.createdAt)
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.select({ value: count() }).from(messagesTable).where(eq(messagesTable.conversationId, id)),
    ]);

    const enriched = messages.map((m) => ({
      ...m,
      isMe: m.senderId === req.user!.userId,
      senderName: m.senderName ?? "Inconnu",
    }));

    res.json(buildPagedResponse(enriched, Number(total), pagination));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/conversations/:id/messages", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const schema = z.object({ text: z.string().min(1).max(10000) });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Message invalide" }); return; }
  try {
    const canAccess = await canAccessConversation(
      req.user!.userId,
      req.user!.syndicateId || "",
      id,
    );
    if (!canAccess) { res.status(403).json({ error: "Accès refusé" }); return; }

    const [message] = await db
      .insert(messagesTable)
      .values({
        conversationId: id,
        senderId: req.user!.userId,
        senderName: req.user!.name,
        text: result.data.text,
      })
      .returning();

    await db
      .update(conversationsTable)
      .set({
        lastMessage: result.data.text.slice(0, 100),
        lastMessageAt: new Date(),
      })
      .where(eq(conversationsTable.id, id));

    res.status(201).json({ data: { ...message, isMe: true } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
