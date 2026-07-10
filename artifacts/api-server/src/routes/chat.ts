import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  conversationsTable,
  messagesTable,
  messageReadsTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, or, and, desc, count, inArray, gt, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { getPagination, buildPagedResponse } from "../lib/paginate.js";
import { sendPushToUsers } from "../lib/notify.js";

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function canAccessConversation(
  userId: string,
  syndicateId: string,
  conversationId: string,
): Promise<boolean> {
  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId));
  if (!conv) return false;
  if (conv.convType === "announcement") return conv.syndicateId === syndicateId;
  if (conv.convType === "building") return conv.syndicateId === syndicateId;
  if (conv.isGroup) {
    if (conv.participantIds) {
      try {
        const ids: string[] = JSON.parse(conv.participantIds);
        return ids.includes(userId);
      } catch { /* fall through */ }
    }
    return conv.syndicateId === syndicateId;
  }
  return conv.participant1Id === userId || conv.participant2Id === userId;
}

function formatTime(d: Date | null | undefined): string {
  if (!d) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const daysDiff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (daysDiff === 1) return "Hier";
  if (daysDiff < 7) return d.toLocaleDateString("fr-FR", { weekday: "short" });
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

// ─── GET /conversations ───────────────────────────────────────────────────────

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
          and(
            eq(conversationsTable.convType, "announcement"),
            eq(conversationsTable.syndicateId, syndicateId),
          ),
          and(
            eq(conversationsTable.convType, "building"),
            eq(conversationsTable.syndicateId, syndicateId),
          ),
        ),
      )
      .orderBy(desc(conversationsTable.lastMessageAt));

    if (conversations.length === 0) {
      res.json({ data: [], total: 0 });
      return;
    }

    // Batch-load participant user data
    const participantIds = Array.from(
      new Set(
        conversations.flatMap((c) =>
          [c.participant1Id, c.participant2Id].filter(Boolean) as string[],
        ),
      ),
    );

    const users =
      participantIds.length > 0
        ? await db
            .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
            .from(usersTable)
            .where(inArray(usersTable.id, participantIds))
        : [];

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    // Batch-load read timestamps for this user
    const readRows = await db
      .select()
      .from(messageReadsTable)
      .where(
        and(
          eq(messageReadsTable.userId, userId),
          inArray(
            messageReadsTable.conversationId,
            conversations.map((c) => c.id),
          ),
        ),
      );
    const readMap = Object.fromEntries(
      readRows.map((r) => [r.conversationId, r.lastReadAt]),
    );

    // Count unread messages in a single batch query — avoids N+1 per conversation.
    // Strategy: fetch all messages in these conversations sent by others,
    // then group-count by conversation, applying per-conversation read cutoffs in JS.
    const convIds = conversations.map((c) => c.id);
    const unreadMessages = await db
      .select({
        conversationId: messagesTable.conversationId,
        createdAt: messagesTable.createdAt,
      })
      .from(messagesTable)
      .where(
        and(
          inArray(messagesTable.conversationId, convIds),
          sql`${messagesTable.senderId} != ${userId}`,
        ),
      );

    const unreadMap: Record<string, number> = Object.fromEntries(convIds.map((id) => [id, 0]));
    for (const msg of unreadMessages) {
      const lastRead = readMap[msg.conversationId];
      if (!lastRead || (msg.createdAt && msg.createdAt > lastRead)) {
        unreadMap[msg.conversationId] = (unreadMap[msg.conversationId] ?? 0) + 1;
      }
    }

    const enriched = conversations.map((c) => {
      const otherId =
        c.participant1Id === userId ? c.participant2Id : c.participant1Id;
      const other = otherId ? userMap[otherId] : null;
      return {
        id: c.id,
        convType: c.convType,
        isGroup: c.isGroup,
        participant: c.isGroup
          ? (c.name ?? "Groupe")
          : c.convType === "announcement"
            ? (c.name ?? "Annonce")
            : c.convType === "building"
              ? (c.name ?? "Immeuble")
              : (other?.name ?? "Contact"),
        participantId: otherId,
        role: c.isGroup
          ? "Groupe"
          : c.convType === "announcement"
            ? "Annonce"
            : c.convType === "building"
              ? "Immeuble"
              : (other?.role ?? "member"),
        lastMessage: c.lastMessage ?? "",
        time: formatTime(c.lastMessageAt),
        unread: unreadMap[c.id] ?? 0,
        syndicateId: c.syndicateId,
        buildingId: c.buildingId,
        participantIds: c.participantIds ? JSON.parse(c.participantIds) : [],
      };
    });

    res.json({ data: enriched, total: enriched.length });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /conversations/unread-count ─────────────────────────────────────────

router.get("/conversations/unread-count", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const syndicateId = req.user!.syndicateId || "";

    const conversations = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(
        or(
          eq(conversationsTable.participant1Id, userId),
          eq(conversationsTable.participant2Id, userId),
          and(eq(conversationsTable.isGroup, true), eq(conversationsTable.syndicateId, syndicateId)),
          and(eq(conversationsTable.convType, "announcement"), eq(conversationsTable.syndicateId, syndicateId)),
        ),
      );

    if (conversations.length === 0) {
      res.json({ total: 0 });
      return;
    }

    const readRows = await db
      .select()
      .from(messageReadsTable)
      .where(eq(messageReadsTable.userId, userId));
    const readMap = Object.fromEntries(readRows.map((r) => [r.conversationId, r.lastReadAt]));

    // Single batch query — avoids N+1 per conversation
    const unreadMsgs = await db
      .select({
        conversationId: messagesTable.conversationId,
        createdAt: messagesTable.createdAt,
      })
      .from(messagesTable)
      .where(
        and(
          inArray(
            messagesTable.conversationId,
            conversations.map((c) => c.id),
          ),
          sql`${messagesTable.senderId} != ${userId}`,
        ),
      );

    let total = 0;
    for (const msg of unreadMsgs) {
      const lastRead = readMap[msg.conversationId];
      if (!lastRead || (msg.createdAt && msg.createdAt > lastRead)) {
        total++;
      }
    }

    res.json({ total });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /conversations ──────────────────────────────────────────────────────

router.post("/conversations", requireAuth, async (req, res) => {
  const schema = z.object({
    participantId: z.string().optional(),
    isGroup: z.boolean().default(false),
    name: z.string().max(100).optional(),
    convType: z.enum(["direct", "group", "announcement", "support", "building"]).default("direct"),
    buildingId: z.string().optional(),
    participantIds: z.array(z.string()).optional(), // for group conversations
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides" });
    return;
  }

  try {
    const { participantId, isGroup, name, convType, buildingId, participantIds } = result.data;

    // Prevent duplicate direct conversations
    if (!isGroup && convType === "direct" && participantId) {
      const existing = await db
        .select()
        .from(conversationsTable)
        .where(
          or(
            and(
              eq(conversationsTable.participant1Id, req.user!.userId),
              eq(conversationsTable.participant2Id, participantId),
            ),
            and(
              eq(conversationsTable.participant1Id, participantId),
              eq(conversationsTable.participant2Id, req.user!.userId),
            ),
          ),
        );
      if (existing.length > 0) {
        const conv = existing[0];
        res.json({ data: { ...conv, id: conv.id }, existing: true });
        return;
      }
    }

    const allParticipantIds = participantIds
      ? [...new Set([req.user!.userId, ...participantIds])]
      : undefined;

    const [conv] = await db
      .insert(conversationsTable)
      .values({
        syndicateId: req.user!.syndicateId || "",
        buildingId: buildingId,
        convType,
        participant1Id: req.user!.userId,
        participant2Id: participantId,
        participantIds: allParticipantIds ? JSON.stringify(allParticipantIds) : undefined,
        isGroup: isGroup || convType === "group",
        name,
        lastMessage: "",
      })
      .returning();

    res.status(201).json({ data: conv });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── DELETE /conversations/:id ────────────────────────────────────────────────

router.delete("/conversations/:id", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  try {
    const canAccess = await canAccessConversation(
      req.user!.userId,
      req.user!.syndicateId || "",
      id,
    );
    if (!canAccess) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    // Only creator (participant1) or admin can delete
    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id));

    const isCreator = conv?.participant1Id === req.user!.userId;
    const isAdmin =
      req.user!.role === "super_admin" || req.user!.role === "syndicate_admin";

    if (!isCreator && !isAdmin) {
      res.status(403).json({ error: "Seul le créateur peut supprimer cette conversation" });
      return;
    }

    await db.delete(conversationsTable).where(eq(conversationsTable.id, id));
    res.json({ message: "Conversation supprimée" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── PATCH /conversations/:id/read ────────────────────────────────────────────

router.patch("/conversations/:id/read", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  try {
    const canAccess = await canAccessConversation(
      req.user!.userId,
      req.user!.syndicateId || "",
      id,
    );
    if (!canAccess) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    // Upsert read record
    const existing = await db
      .select()
      .from(messageReadsTable)
      .where(
        and(
          eq(messageReadsTable.conversationId, id),
          eq(messageReadsTable.userId, req.user!.userId),
        ),
      );

    if (existing.length > 0) {
      await db
        .update(messageReadsTable)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(messageReadsTable.conversationId, id),
            eq(messageReadsTable.userId, req.user!.userId),
          ),
        );
    } else {
      await db.insert(messageReadsTable).values({
        conversationId: id,
        userId: req.user!.userId,
        lastReadAt: new Date(),
      });
    }

    res.json({ message: "Marqué comme lu" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /conversations/:id/messages ─────────────────────────────────────────

router.get("/conversations/:id/messages", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const pagination = getPagination(req, 100);
  try {
    const canAccess = await canAccessConversation(
      req.user!.userId,
      req.user!.syndicateId || "",
      id,
    );
    if (!canAccess) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    const [messages, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, id))
        .orderBy(messagesTable.createdAt)
        .limit(pagination.limit)
        .offset(pagination.offset),
      db
        .select({ value: count() })
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, id)),
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

// ─── GET /conversations/:id/since ─────────────────────────────────────────────
// Polling endpoint — returns messages newer than ?since=<ISO timestamp>

router.get("/conversations/:id/since", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const since = req.query.since as string | undefined;
  try {
    const canAccess = await canAccessConversation(
      req.user!.userId,
      req.user!.syndicateId || "",
      id,
    );
    if (!canAccess) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    const sinceDate = since ? new Date(since) : new Date(0);
    const messages = await db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.conversationId, id),
          gt(messagesTable.createdAt, sinceDate),
        ),
      )
      .orderBy(messagesTable.createdAt)
      .limit(50);

    const enriched = messages.map((m) => ({
      ...m,
      isMe: m.senderId === req.user!.userId,
      senderName: m.senderName ?? "Inconnu",
    }));

    res.json({ data: enriched });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /conversations/:id/messages ─────────────────────────────────────────

router.post("/conversations/:id/messages", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const schema = z.object({
    text: z.string().max(10000).default(""),
    messageType: z.enum(["text", "image", "document", "announcement"]).default("text"),
    attachmentUrl: z.string().url().optional(),
    attachmentType: z.string().max(100).optional(),
    attachmentName: z.string().max(255).optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Message invalide" });
    return;
  }

  // Must have either text or an attachment
  if (!result.data.text.trim() && !result.data.attachmentUrl) {
    res.status(400).json({ error: "Le message ne peut pas être vide" });
    return;
  }

  try {
    const canAccess = await canAccessConversation(
      req.user!.userId,
      req.user!.syndicateId || "",
      id,
    );
    if (!canAccess) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    const [message] = await db
      .insert(messagesTable)
      .values({
        conversationId: id,
        senderId: req.user!.userId,
        senderName: req.user!.name,
        text: result.data.text || "",
        messageType: result.data.messageType,
        attachmentUrl: result.data.attachmentUrl,
        attachmentType: result.data.attachmentType,
        attachmentName: result.data.attachmentName,
      })
      .returning();

    const preview = result.data.attachmentName
      ? `📎 ${result.data.attachmentName}`
      : result.data.text.slice(0, 100);

    await db
      .update(conversationsTable)
      .set({ lastMessage: preview, lastMessageAt: new Date() })
      .where(eq(conversationsTable.id, id));

    // Auto-mark sender's read position
    const existing = await db
      .select()
      .from(messageReadsTable)
      .where(
        and(
          eq(messageReadsTable.conversationId, id),
          eq(messageReadsTable.userId, req.user!.userId),
        ),
      );
    if (existing.length > 0) {
      await db
        .update(messageReadsTable)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(messageReadsTable.conversationId, id),
            eq(messageReadsTable.userId, req.user!.userId),
          ),
        );
    } else {
      await db.insert(messageReadsTable).values({
        conversationId: id,
        userId: req.user!.userId,
        lastReadAt: new Date(),
      });
    }

    res.status(201).json({ data: { ...message, isMe: true } });

    // ── Fire-and-forget push notifications to other participants ──────────────
    // Runs after response is sent so it never delays the reply to the sender.
    db.select().from(conversationsTable).where(eq(conversationsTable.id, id))
      .then(([conv]) => {
        if (!conv) return;
        const senderId = req.user!.userId;
        const recipientIds: string[] = [];

        if (conv.isGroup) {
          try {
            const ids: string[] = JSON.parse(conv.participantIds ?? "[]");
            recipientIds.push(...ids.filter((uid) => uid !== senderId));
          } catch { /* ignore malformed JSON */ }
        } else if (conv.participant1Id && conv.participant2Id) {
          const other = conv.participant1Id === senderId ? conv.participant2Id : conv.participant1Id;
          recipientIds.push(other);
        }

        if (recipientIds.length === 0) return;

        const senderName = req.user!.name ?? "Message";
        const pushTitle = conv.isGroup ? (conv.name ?? "Groupe") : senderName;
        const pushBody = result.data.attachmentName
          ? `📎 ${result.data.attachmentName}`
          : result.data.text.trim().slice(0, 100) || "Nouveau message";

        return sendPushToUsers(recipientIds, pushTitle, pushBody, {
          conversationId: id,
          type: "chat_message",
        });
      })
      .catch(() => { /* never let push errors affect the route */ });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
