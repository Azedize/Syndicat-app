// chat: messages endpoints (mounted by chat.routes.ts, in order).
import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  conversationsTable,
  messagesTable,
  messageReadsTable,
  messageReactionsTable,
  usersTable,
} from "@workspace/db/schema";
import {
  eq,
  or,
  and,
  count,
  inArray,
  gt,
  sql,
} from "drizzle-orm";
import { requireAuth } from "../../middleware/auth.js";
import { getPagination, buildPagedResponse } from "../../lib/paginate.js";
import { sendPushToUsers } from "../../lib/notify.js";
import {
  isBlockedEitherWay,
  getTypingUsers,
  canAccessConversation,
  enrichMessagesForUser,
  loadReactionsByMessage,
} from "./chat.service.js";
import { hasChatSyndicateScope } from "./chat.access.js";

const router = Router();

// ─── GET /conversations/:id/messages ─────────────────────────────────────────

router.get("/conversations/:id/messages", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
  const pagination = getPagination(req, 100);
  try {
    if (!hasChatSyndicateScope(req, res)) return;
    const canAccess = await canAccessConversation(
      req.user!.userId,
      req.user!.syndicateId ?? "",
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

    const reactionMap = await loadReactionsByMessage(
      messages.map((m) => m.id),
      req.user!.userId,
    );
    const enriched = enrichMessagesForUser(
      messages.map((m) => ({
        ...m,
        isMe: m.senderId === req.user!.userId,
        senderName: m.senderName ?? "Inconnu",
        reactions: reactionMap.get(m.id) ?? [],
      })),
      req.user!.userId,
    );

    res.json(buildPagedResponse(enriched, Number(total), pagination));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /conversations/:id/since ─────────────────────────────────────────────
// Polling endpoint — returns messages newer than ?since=<ISO timestamp>

router.get("/conversations/:id/since", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
  const since = req.query.since as string | undefined;
  try {
    if (!hasChatSyndicateScope(req, res)) return;
    const canAccess = await canAccessConversation(
      req.user!.userId,
      req.user!.syndicateId ?? "",
      id,
    );
    if (!canAccess) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    const sinceDate = since ? new Date(since) : new Date(0);
    // Use an ISO string for raw SQL comparisons — postgres.js does not
    // accept Date objects inside sql`` template literals.
    const sinceDateISO = sinceDate.toISOString();
    const messages = await db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.conversationId, id),
          // Include NEW messages AND recently edited/deleted ones so all
          // clients see updates without a full refetch.
          or(
            gt(messagesTable.createdAt, sinceDate),
            sql`${messagesTable.editedAt} > ${sinceDateISO}::timestamptz`,
            sql`${messagesTable.deletedAt} > ${sinceDateISO}::timestamptz`,
          ),
        ),
      )
      .orderBy(messagesTable.createdAt)
      .limit(50);

    const reactionMap = await loadReactionsByMessage(
      messages.map((m) => m.id),
      req.user!.userId,
    );
    const enriched = enrichMessagesForUser(
      messages.map((m) => ({
        ...m,
        isMe: m.senderId === req.user!.userId,
        senderName: m.senderName ?? "Inconnu",
        reactions: reactionMap.get(m.id) ?? [],
      })),
      req.user!.userId,
    );

    res.json({ data: enriched, typing: getTypingUsers(id, req.user!.userId) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /conversations/:id/messages ─────────────────────────────────────────

router.post("/conversations/:id/messages", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
  const schema = z.object({
    text: z.string().max(10000).default(""),
    messageType: z
      .enum(["text", "image", "document", "announcement", "voice"])
      .default("text"),
    // Accept both full URLs (https://...) and storage object paths (/objects/<uuid>)
    // so the mobile client can store an environment-agnostic path instead of a
    // localhost URL that breaks across devices, refreshes, and deployments.
    attachmentUrl: z.string().max(2000).optional(),
    attachmentType: z.string().max(100).optional(),
    attachmentName: z.string().max(255).optional(),
    attachmentSize: z
      .number()
      .int()
      .nonnegative()
      .max(50 * 1024 * 1024)
      .optional(),
    durationSeconds: z.number().int().positive().max(600).optional(),
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
    if (!hasChatSyndicateScope(req, res)) return;
    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id));
    if (!conv) {
      res.status(404).json({ error: "Conversation introuvable" });
      return;
    }

    const canAccess = await canAccessConversation(
      req.user!.userId,
      req.user!.syndicateId ?? "",
      id,
    );
    if (!canAccess) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    // Block check for direct/marketplace 1:1 threads
    if (!conv.isGroup && conv.participant1Id && conv.participant2Id) {
      const other =
        conv.participant1Id === req.user!.userId
          ? conv.participant2Id
          : conv.participant1Id;
      if (await isBlockedEitherWay(req.user!.userId, other)) {
        res.status(403).json({
          error: "Vous ne pouvez pas envoyer de message à cet utilisateur",
          code: "USER_BLOCKED",
        });
        return;
      }
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
        attachmentSize: result.data.attachmentSize,
        durationSeconds: result.data.durationSeconds,
      })
      .returning();

    const preview =
      result.data.messageType === "voice"
        ? "🎤 Note vocale"
        : result.data.attachmentName
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

    res.status(201).json({ data: { ...message, isMe: true, reactions: [] } });

    // ── Fire-and-forget push notifications to other participants ──────────────
    // Runs after response is sent so it never delays the reply to the sender.
    db.select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id))
      .then(async ([conv]) => {
        if (!conv) return;
        const senderId = req.user!.userId;
        const recipientIds: string[] = [];

        if (conv.isGroup) {
          try {
            const ids: string[] = JSON.parse(conv.participantIds ?? "[]");
            recipientIds.push(...ids.filter((uid) => uid !== senderId));
          } catch {
            /* ignore malformed JSON */
          }
        } else if (conv.participant1Id && conv.participant2Id) {
          const other =
            conv.participant1Id === senderId
              ? conv.participant2Id
              : conv.participant1Id;
          recipientIds.push(other);
        }

        if (recipientIds.length === 0) return;

        const senderName = req.user!.name ?? "Message";
        const pushTitle = conv.isGroup ? (conv.name ?? "Groupe") : senderName;
        const pushBody = result.data.attachmentName
          ? `📎 ${result.data.attachmentName}`
          : result.data.text.trim().slice(0, 100) || "Nouveau message";

        // ── @mention detection (group chats only) ──────────────────────────
        // Matches "@FirstName" or "@First Last" tokens against recipient names
        // so a mentioned resident gets a distinct, higher-attention notification.
        let mentionedIds: string[] = [];
        if (
          conv.isGroup &&
          result.data.text.includes("@") &&
          recipientIds.length > 0
        ) {
          const recipients = await db
            .select({ id: usersTable.id, name: usersTable.name })
            .from(usersTable)
            .where(inArray(usersTable.id, recipientIds));
          const normalize = (s: string) =>
            s
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase();
          const textNorm = normalize(result.data.text);
          mentionedIds = recipients
            .filter(
              (r) =>
                r.name &&
                textNorm.includes(`@${normalize(r.name).split(" ")[0]}`),
            )
            .map((r) => r.id);
        }

        const nonMentioned = recipientIds.filter(
          (rid) => !mentionedIds.includes(rid),
        );
        const pushes: Promise<unknown>[] = [];
        if (mentionedIds.length > 0) {
          pushes.push(
            sendPushToUsers(
              mentionedIds,
              `${senderName} vous a mentionné`,
              pushBody,
              {
                conversationId: id,
                type: "chat_mention",
              },
            ),
          );
        }
        if (nonMentioned.length > 0) {
          pushes.push(
            sendPushToUsers(nonMentioned, pushTitle, pushBody, {
              conversationId: id,
              type: "chat_message",
            }),
          );
        }
        return Promise.all(pushes);
      })
      .catch(() => {
        /* never let push errors affect the route */
      });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── DELETE /messages/:id ─────────────────────────────────────────────────────
// Two modes:
//   "for_me"       — hides message from the requesting user only (any participant)
//   "for_everyone" — tombstone visible to all; sender only; 60-minute window

router.delete("/messages/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const mode = (req.body?.mode ?? "for_everyone") as "for_me" | "for_everyone";
  try {
    const [msg] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, id));
    if (!msg) {
      res.status(404).json({ error: "Message introuvable" });
      return;
    }

    if (!hasChatSyndicateScope(req, res)) return;
    if (mode === "for_me") {
      // Any conversation participant may hide a message for themselves
      const canAccess = await canAccessConversation(
        req.user!.userId,
        req.user!.syndicateId ?? "",
        msg.conversationId,
      );
      if (!canAccess) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }

      let deletedFor: string[] = [];
      try {
        deletedFor = JSON.parse(msg.deletedForUserIds ?? "[]");
      } catch {
        /* ignore */
      }
      if (!deletedFor.includes(req.user!.userId))
        deletedFor.push(req.user!.userId);

      await db
        .update(messagesTable)
        .set({ deletedForUserIds: JSON.stringify(deletedFor) })
        .where(eq(messagesTable.id, id));
      res.json({ message: "Message supprimé pour vous", mode: "for_me" });
      return;
    }

    // "for_everyone" — sender only; within 60 minutes
    if (msg.senderId !== req.user!.userId) {
      res
        .status(403)
        .json({ error: "Vous ne pouvez supprimer que vos propres messages" });
      return;
    }
    const canAccess = await canAccessConversation(
      req.user!.userId,
      req.user!.syndicateId ?? "",
      msg.conversationId,
    );
    if (!canAccess) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }
    const ageMins = (Date.now() - new Date(msg.createdAt!).getTime()) / 60_000;
    if (ageMins > 60) {
      res.status(400).json({
        error: "Délai de suppression dépassé (60 minutes)",
        code: "EXPIRED",
      });
      return;
    }

    await db
      .update(messagesTable)
      .set({
        text: "",
        deletedAt: new Date(),
        isDeletedForEveryone: true,
        attachmentUrl: null,
        attachmentName: null,
        attachmentType: null,
      })
      .where(eq(messagesTable.id, id));
    res.json({ message: "Message supprimé pour tous", mode: "for_everyone" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── PATCH /messages/:id — edit own text message (15-minute window) ──────────

router.patch("/messages/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const schema = z.object({ text: z.string().min(1).max(10_000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Texte invalide" });
    return;
  }
  try {
    const [msg] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, id));
    if (!msg) {
      res.status(404).json({ error: "Message introuvable" });
      return;
    }
    if (!hasChatSyndicateScope(req, res)) return;
    const canAccess = await canAccessConversation(
      req.user!.userId,
      req.user!.syndicateId ?? "",
      msg.conversationId,
    );
    if (!canAccess) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }
    if (msg.senderId !== req.user!.userId) {
      res
        .status(403)
        .json({ error: "Vous ne pouvez modifier que vos propres messages" });
      return;
    }
    if (msg.isDeletedForEveryone) {
      res.status(400).json({ error: "Ce message a été supprimé" });
      return;
    }
    if (msg.messageType !== "text") {
      res
        .status(400)
        .json({ error: "Seuls les messages texte peuvent être modifiés" });
      return;
    }
    const ageMins = (Date.now() - new Date(msg.createdAt!).getTime()) / 60_000;
    if (ageMins > 15) {
      res.status(400).json({
        error: "Délai de modification dépassé (15 minutes)",
        code: "EXPIRED",
      });
      return;
    }
    const [updated] = await db
      .update(messagesTable)
      .set({ text: parsed.data.text, editedAt: new Date() })
      .where(eq(messagesTable.id, id))
      .returning();
    res.json({ data: { ...updated, isMe: true, reactions: [] } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST/DELETE /messages/:id/reactions ─────────────────────────────────────

router.post("/messages/:id/reactions", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const schema = z.object({ emoji: z.string().min(1).max(8) });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides" });
    return;
  }
  try {
    const [msg] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, id));
    if (!msg) {
      res.status(404).json({ error: "Message introuvable" });
      return;
    }
    if (!hasChatSyndicateScope(req, res)) return;
    const canAccess = await canAccessConversation(
      req.user!.userId,
      req.user!.syndicateId ?? "",
      msg.conversationId,
    );
    if (!canAccess) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    await db
      .insert(messageReactionsTable)
      .values({
        messageId: id,
        userId: req.user!.userId,
        emoji: result.data.emoji,
      })
      .onConflictDoNothing();
    res.status(201).json({ message: "Réaction ajoutée" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/messages/:id/reactions", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  const emoji = String(req.query.emoji ?? "");
  try {
    const [msg] = await db
      .select({ conversationId: messagesTable.conversationId })
      .from(messagesTable)
      .where(eq(messagesTable.id, id));
    if (!msg) {
      res.status(404).json({ error: "Message introuvable" });
      return;
    }
    if (!hasChatSyndicateScope(req, res)) return;
    const canAccess = await canAccessConversation(
      req.user!.userId,
      req.user!.syndicateId ?? "",
      msg.conversationId,
    );
    if (!canAccess) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }
    await db
      .delete(messageReactionsTable)
      .where(
        and(
          eq(messageReactionsTable.messageId, id),
          eq(messageReactionsTable.userId, req.user!.userId),
          emoji ? eq(messageReactionsTable.emoji, emoji) : sql`true`,
        ),
      );
    res.json({ message: "Réaction retirée" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
