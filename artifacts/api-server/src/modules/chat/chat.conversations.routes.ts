// chat: conversations endpoints (mounted by chat.routes.ts, in order).
import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  conversationsTable,
  messagesTable,
  messageReadsTable,
  blockedUsersTable,
  conversationArchivesTable,
  usersTable,
  productsTable,
  buildingsTable,
} from "@workspace/db/schema";
import {
  eq,
  or,
  and,
  desc,
  inArray,
  sql,
} from "drizzle-orm";
import { requireAuth } from "../../middleware/auth.js";
import { sendPushToUsers } from "../../lib/notify.js";
import {
  canDirectMessage,
  isBlockedEitherWay,
  setTyping,
  getTypingUsers,
  canAccessConversation,
  formatTime,
  isVisibleToChatUser,
} from "./chat.service.js";
import { hasChatSyndicateScope } from "./chat.access.js";

const router = Router();

// ─── GET /conversations/contactable-users ────────────────────────────────────
// Returns the list of users the current actor is allowed to DM, based on the
// role communication matrix defined in canDirectMessage(). This drives the
// "new conversation" contact picker in the mobile app so the UI only shows
// users who are actually reachable — matching the server-side enforcement.

router.get(
  "/conversations/contactable-users",
  requireAuth,
  async (req, res) => {
    try {
      if (!hasChatSyndicateScope(req, res)) return;
      const actor = req.user!;
      const syndicateId = actor.syndicateId ?? "";
      let conditions: any;

      if (actor.role === "super_admin") {
        // Super admins can DM all syndicate admins across the platform
        conditions = eq(usersTable.role, "syndicate_admin");
      } else if (actor.role === "syndicate_admin") {
        // Syndicate admins can DM: members and tenants in their syndicate, + all super_admins
        conditions = or(
          eq(usersTable.role, "super_admin"),
          and(
            eq(usersTable.syndicateId, syndicateId),
            or(eq(usersTable.role, "member"), eq(usersTable.role, "tenant")),
          ),
        );
      } else if (actor.role === "member") {
        // Members can DM: their syndicate admin + other members in same syndicate
        conditions = and(
          eq(usersTable.syndicateId, syndicateId),
          or(
            eq(usersTable.role, "syndicate_admin"),
            eq(usersTable.role, "member"),
          ),
        );
      } else {
        // Tenants can only DM their syndicate admin
        conditions = and(
          eq(usersTable.syndicateId, syndicateId),
          eq(usersTable.role, "syndicate_admin"),
        );
      }

      const rows = await db
        .select({
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          role: usersTable.role,
          syndicateId: usersTable.syndicateId,
        })
        .from(usersTable)
        .where(and(conditions, sql`${usersTable.id} != ${actor.userId}`));

      res.json({ data: rows });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /conversations ───────────────────────────────────────────────────────

router.get("/conversations", requireAuth, async (req, res) => {
  try {
    if (!hasChatSyndicateScope(req, res)) return;
    const userId = req.user!.userId;
    const syndicateId = req.user!.syndicateId ?? "";
    const includeArchived = req.query.archived === "true";

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

    // A same-syndicate private group is visible only to its participants.
    const visible = conversations.filter((c) =>
      isVisibleToChatUser(c, userId, syndicateId),
    );

    if (visible.length === 0) {
      res.json({ data: [], total: 0 });
      return;
    }

    const archiveRows = await db
      .select({ conversationId: conversationArchivesTable.conversationId })
      .from(conversationArchivesTable)
      .where(eq(conversationArchivesTable.userId, userId));
    const archivedSet = new Set(archiveRows.map((r) => r.conversationId));

    const filtered = visible.filter((c) =>
      includeArchived ? archivedSet.has(c.id) : !archivedSet.has(c.id),
    );

    if (filtered.length === 0) {
      res.json({ data: [], total: 0 });
      return;
    }

    // Batch-load participant user data
    const participantIds = Array.from(
      new Set(
        filtered.flatMap(
          (c) =>
            [c.participant1Id, c.participant2Id].filter(Boolean) as string[],
        ),
      ),
    );

    const users =
      participantIds.length > 0
        ? await db
            .select({
              id: usersTable.id,
              name: usersTable.name,
              role: usersTable.role,
            })
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
            filtered.map((c) => c.id),
          ),
        ),
      );
    const readMap = Object.fromEntries(
      readRows.map((r) => [r.conversationId, r.lastReadAt]),
    );

    // Count unread messages in a single batch query — avoids N+1 per conversation.
    const convIds = filtered.map((c) => c.id);
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

    const unreadMap: Record<string, number> = Object.fromEntries(
      convIds.map((id) => [id, 0]),
    );
    for (const msg of unreadMessages) {
      const lastRead = readMap[msg.conversationId];
      if (!lastRead || (msg.createdAt && msg.createdAt > lastRead)) {
        unreadMap[msg.conversationId] =
          (unreadMap[msg.conversationId] ?? 0) + 1;
      }
    }

    // Blocked-user set, so blocked direct conversations show clearly in the UI
    const blockRows = await db
      .select()
      .from(blockedUsersTable)
      .where(
        or(
          eq(blockedUsersTable.blockerId, userId),
          eq(blockedUsersTable.blockedId, userId),
        ),
      );
    const blockedWith = new Set(
      blockRows.map((b) =>
        b.blockerId === userId ? b.blockedId : b.blockerId,
      ),
    );

    const enriched = filtered.map((c) => {
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
        productId: c.productId,
        incidentId: c.incidentId,
        participantIds: c.participantIds ? JSON.parse(c.participantIds) : [],
        isArchived: archivedSet.has(c.id),
        isBlocked: otherId ? blockedWith.has(otherId) : false,
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
    if (!hasChatSyndicateScope(req, res)) return;
    const userId = req.user!.userId;
    const syndicateId = req.user!.syndicateId ?? "";

    const conversations = await db
      .select({
        id: conversationsTable.id,
        isGroup: conversationsTable.isGroup,
        convType: conversationsTable.convType,
        syndicateId: conversationsTable.syndicateId,
        participantIds: conversationsTable.participantIds,
      })
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
      );

    const visibleConversations = conversations.filter((c) =>
      isVisibleToChatUser(c, userId, syndicateId),
    );
    if (visibleConversations.length === 0) {
      res.json({ total: 0 });
      return;
    }

    const readRows = await db
      .select()
      .from(messageReadsTable)
      .where(eq(messageReadsTable.userId, userId));
    const readMap = Object.fromEntries(
      readRows.map((r) => [r.conversationId, r.lastReadAt]),
    );

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
              visibleConversations.map((c) => c.id),
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

// ─── GET /conversations/search ────────────────────────────────────────────────
// Searches the current user's conversations by participant/group name and by message text.

router.get("/conversations/search", requireAuth, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.json({ data: [] });
    return;
  }
  try {
    if (!hasChatSyndicateScope(req, res)) return;
    const userId = req.user!.userId;
    const syndicateId = req.user!.syndicateId ?? "";

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
      );
    const visibleConversations = conversations.filter((c) =>
      isVisibleToChatUser(c, userId, syndicateId),
    );
    if (visibleConversations.length === 0) {
      res.json({ data: [] });
      return;
    }

    const convIds = visibleConversations.map((c) => c.id);
    const matchingMessages = await db
      .select({ conversationId: messagesTable.conversationId })
      .from(messagesTable)
      .where(
        and(
          inArray(messagesTable.conversationId, convIds),
          sql`${messagesTable.text} ILIKE ${"%" + q + "%"}`,
        ),
      );
    const convWithMatchingMessages = new Set(
      matchingMessages.map((m) => m.conversationId),
    );

    const participantIds = Array.from(
      new Set(
        visibleConversations.flatMap(
          (c) =>
            [c.participant1Id, c.participant2Id].filter(Boolean) as string[],
        ),
      ),
    );
    const users = participantIds.length
      ? await db
          .select({ id: usersTable.id, name: usersTable.name })
          .from(usersTable)
          .where(inArray(usersTable.id, participantIds))
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]));

    const lowerQ = q.toLowerCase();
    const matches = visibleConversations.filter((c) => {
      const otherId =
        c.participant1Id === userId ? c.participant2Id : c.participant1Id;
      const name = c.isGroup
        ? (c.name ?? "")
        : otherId
          ? (userMap[otherId] ?? "")
          : "";
      return (
        name.toLowerCase().includes(lowerQ) ||
        convWithMatchingMessages.has(c.id)
      );
    });

    res.json({
      data: matches.map((c) => ({
        id: c.id,
        name: c.isGroup
          ? (c.name ?? "Groupe")
          : (userMap[
              c.participant1Id === userId
                ? (c.participant2Id ?? "")
                : (c.participant1Id ?? "")
            ] ?? "Contact"),
        matchedInMessages: convWithMatchingMessages.has(c.id),
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /conversations ──────────────────────────────────────────────────────

router.post("/conversations", requireAuth, async (req, res) => {
  const schema = z.object({
    participantId: z.string().optional(),
    syndicateAdminLookup: z.string().optional(), // syndicateId — super_admin shortcut: find the admin of this syndicate
    isGroup: z.boolean().default(false),
    name: z.string().max(100).optional(),
    convType: z
      .enum([
        "direct",
        "group",
        "announcement",
        "support",
        "building",
        "emergency",
      ])
      .default("direct"),
    buildingId: z.string().optional(),
    participantIds: z.array(z.string()).optional(), // for group conversations
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides" });
    return;
  }

  try {
    if (!hasChatSyndicateScope(req, res)) return;
    let { participantId, isGroup, name, convType, buildingId, participantIds } =
      result.data;
    const { syndicateAdminLookup } = result.data;
    const actor = req.user!;

    // ── Super-admin shortcut: resolve syndicate admin by syndicateId ──────────
    if (
      syndicateAdminLookup &&
      !participantId &&
      actor.role === "super_admin"
    ) {
      const [adminUser] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.syndicateId, syndicateAdminLookup),
            eq(usersTable.role, "syndicate_admin"),
          ),
        )
        .limit(1);
      if (!adminUser) {
        res
          .status(404)
          .json({ error: "Aucun administrateur trouvé pour ce syndicat" });
        return;
      }
      participantId = adminUser.id;
    }

    // ── RBAC communication matrix: enforced for direct + emergency 1:1 chats ──
    if (
      (convType === "direct" || convType === "emergency") &&
      !isGroup &&
      participantId
    ) {
      if (participantId === actor.userId) {
        res.status(400).json({
          error: "Impossible de démarrer une conversation avec soi-même",
        });
        return;
      }
      const [target] = await db
        .select({
          id: usersTable.id,
          role: usersTable.role,
          syndicateId: usersTable.syndicateId,
        })
        .from(usersTable)
        .where(eq(usersTable.id, participantId));
      if (!target) {
        res.status(404).json({ error: "Utilisateur introuvable" });
        return;
      }

      // Keep the communication matrix fail-closed even if a future role is
      // added to canDirectMessage without an explicit scope rule.
      if (
        actor.role !== "super_admin" &&
        (!actor.syndicateId || target.syndicateId !== actor.syndicateId)
      ) {
        res.status(403).json({
          error: "Les conversations inter-syndicats ne sont pas autorisées",
          code: "SYNDICATE_SCOPE_REQUIRED",
        });
        return;
      }

      // Emergency chats always target the syndicate's admin and are allowed
      // for any member/tenant of that syndicate, bypassing the normal matrix.
      const isEmergencyToOwnAdmin =
        convType === "emergency" &&
        target.role === "syndicate_admin" &&
        target.syndicateId === actor.syndicateId;

      if (
        !isEmergencyToOwnAdmin &&
        !canDirectMessage(actor as any, target as any)
      ) {
        res.status(403).json({
          error: "Cette communication n'est pas autorisée entre ces deux rôles",
          code: "COMMUNICATION_NOT_ALLOWED",
        });
        return;
      }

      if (await isBlockedEitherWay(actor.userId, participantId)) {
        res.status(403).json({
          error: "Conversation bloquée entre ces utilisateurs",
          code: "USER_BLOCKED",
        });
        return;
      }
    }

    // Prevent duplicate direct conversations
    if (
      !isGroup &&
      (convType === "direct" || convType === "emergency") &&
      participantId
    ) {
      const existing = await db
        .select()
        .from(conversationsTable)
        .where(
          or(
            and(
              eq(conversationsTable.participant1Id, actor.userId),
              eq(conversationsTable.participant2Id, participantId),
            ),
            and(
              eq(conversationsTable.participant1Id, participantId),
              eq(conversationsTable.participant2Id, actor.userId),
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
      ? [...new Set([actor.userId, ...participantIds])]
      : undefined;

    // Group conversations accept a list of arbitrary user IDs and an
    // optional building ID. Validate both resources against the actor's
    // syndicate before persisting the conversation.
    if ((isGroup || convType === "group") && actor.role !== "super_admin") {
      if (!actor.syndicateId) {
        res.status(403).json({
          error: "Syndicat non défini dans le token",
          code: "SYNDICATE_SCOPE_REQUIRED",
        });
        return;
      }

      const requestedParticipantIds = Array.from(
        new Set((participantIds ?? []).filter((id) => id !== actor.userId)),
      );
      if (requestedParticipantIds.length > 0) {
        const participants = await db
          .select({ id: usersTable.id, syndicateId: usersTable.syndicateId })
          .from(usersTable)
          .where(inArray(usersTable.id, requestedParticipantIds));

        if (
          participants.length !== requestedParticipantIds.length ||
          participants.some(
            (participant) => participant.syndicateId !== actor.syndicateId,
          )
        ) {
          res.status(403).json({
            error: "Tous les participants doivent appartenir à votre syndicat",
            code: "SYNDICATE_SCOPE_REQUIRED",
          });
          return;
        }
      }

      if (buildingId) {
        const [building] = await db
          .select({ syndicateId: buildingsTable.syndicateId })
          .from(buildingsTable)
          .where(eq(buildingsTable.id, buildingId));
        if (!building || building.syndicateId !== actor.syndicateId) {
          res.status(403).json({
            error: "Ce bâtiment n'appartient pas à votre syndicat",
            code: "SYNDICATE_SCOPE_REQUIRED",
          });
          return;
        }
      }
    }

    const [conv] = await db
      .insert(conversationsTable)
      .values({
        syndicateId: actor.syndicateId ?? null,
        buildingId: buildingId,
        convType,
        participant1Id: actor.userId,
        participant2Id: participantId,
        participantIds: allParticipantIds
          ? JSON.stringify(allParticipantIds)
          : undefined,
        isGroup: isGroup || convType === "group",
        name,
        createdBy: actor.userId,
        lastMessage: "",
      })
      .returning();

    res.status(201).json({ data: conv });

    if (convType === "emergency" && conv.participant2Id) {
      sendPushToUsers(
        [conv.participant2Id],
        "🚨 Urgence",
        `${actor.name} a signalé une urgence`,
        {
          conversationId: conv.id,
          type: "chat_emergency",
        },
      ).catch(() => {
        /* never let push errors affect the route */
      });
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /conversations/product — "Contact Seller" from the marketplace ────

router.post("/conversations/product", requireAuth, async (req, res) => {
  const schema = z.object({ productId: z.string() });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides" });
    return;
  }

  try {
    if (!hasChatSyndicateScope(req, res)) return;
    const actor = req.user!;
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, result.data.productId));
    if (!product) {
      res.status(404).json({ error: "Produit introuvable" });
      return;
    }
    if (!product.sellerId) {
      res.status(422).json({ error: "Ce produit n'a pas de vendeur associé" });
      return;
    }
    if (product.sellerId === actor.userId) {
      res
        .status(400)
        .json({ error: "Vous ne pouvez pas contacter votre propre annonce" });
      return;
    }

    if (await isBlockedEitherWay(actor.userId, product.sellerId)) {
      res.status(403).json({
        error: "Conversation bloquée entre ces utilisateurs",
        code: "USER_BLOCKED",
      });
      return;
    }

    // Reuse an existing product thread with this seller if one already exists
    const existing = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.productId, product.id),
          or(
            and(
              eq(conversationsTable.participant1Id, actor.userId),
              eq(conversationsTable.participant2Id, product.sellerId),
            ),
            and(
              eq(conversationsTable.participant1Id, product.sellerId),
              eq(conversationsTable.participant2Id, actor.userId),
            ),
          ),
        ),
      );
    if (existing.length > 0) {
      res.json({ data: existing[0], existing: true });
      return;
    }

    const [conv] = await db
      .insert(conversationsTable)
      .values({
        syndicateId:
          actor.role === "super_admin"
            ? (actor.syndicateId ?? product.syndicateId ?? null)
            : actor.syndicateId,
        convType: "marketplace",
        participant1Id: actor.userId,
        participant2Id: product.sellerId,
        isGroup: false,
        name: product.name,
        productId: product.id,
        createdBy: actor.userId,
        lastMessage: `Discussion à propos de « ${product.name} »`,
        lastMessageAt: new Date(),
      })
      .returning();

    res.status(201).json({ data: conv });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /conversations/incident — manual trigger (auto-created by reclamations too)

router.post("/conversations/incident", requireAuth, (_req, res) => {
  // The legacy grievances it was built for are retired (not scoped to a
  // condominium); claims are followed up in their own thread (/claims/:id).
  res.status(410).json({ error: "Le suivi d'une réclamation se fait dans la réclamation", code: "USE_CLAIMS" });
});

// ─── DELETE /conversations/:id ────────────────────────────────────────────────

router.delete("/conversations/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
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

    // Only creator (participant1) or admin can delete
    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id));

    const isCreator = conv?.participant1Id === req.user!.userId;
    const isAdmin =
      req.user!.role === "super_admin" || req.user!.role === "syndicate_admin";

    if (!isCreator && !isAdmin) {
      res
        .status(403)
        .json({ error: "Seul le créateur peut supprimer cette conversation" });
      return;
    }

    await db.delete(conversationsTable).where(eq(conversationsTable.id, id));
    res.json({ message: "Conversation supprimée" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── PATCH /conversations/:id/archive & /unarchive ───────────────────────────

router.patch("/conversations/:id/archive", requireAuth, async (req, res) => {
  const id = String(req.params.id);
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
    await db
      .insert(conversationArchivesTable)
      .values({ conversationId: id, userId: req.user!.userId })
      .onConflictDoNothing();
    res.json({ message: "Conversation archivée" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch("/conversations/:id/unarchive", requireAuth, async (req, res) => {
  const id = String(req.params.id);
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
    await db
      .delete(conversationArchivesTable)
      .where(
        and(
          eq(conversationArchivesTable.conversationId, id),
          eq(conversationArchivesTable.userId, req.user!.userId),
        ),
      );
    res.json({ message: "Conversation désarchivée" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── PATCH /conversations/:id/read ────────────────────────────────────────────

router.patch("/conversations/:id/read", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
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

    // Atomic upsert — INSERT and update on conflict so there is never a race
    // condition between a SELECT and a subsequent INSERT from two simultaneous
    // mark-read calls (e.g. polling + explicit tap). The unique index on
    // (conversationId, userId) is enforced by the DB; Drizzle surfaces it as
    // onConflictDoUpdate targeting that composite key.
    await db
      .insert(messageReadsTable)
      .values({
        conversationId: id,
        userId: req.user!.userId,
        lastReadAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [messageReadsTable.conversationId, messageReadsTable.userId],
        set: { lastReadAt: new Date() },
      });

    res.json({ message: "Marqué comme lu" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── PATCH /conversations/:id/typing — polled typing indicator ──────────────

router.patch("/conversations/:id/typing", requireAuth, async (req, res) => {
  const id = String(req.params.id);
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
  setTyping(id, req.user!.userId);
  res.json({ message: "ok" });
});

router.get("/conversations/:id/typing", requireAuth, async (req, res) => {
  const id = String(req.params.id);
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
  res.json({ data: getTypingUsers(id, req.user!.userId) });
});

export default router;
