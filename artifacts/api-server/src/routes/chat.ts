import { Request, Response, Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  conversationsTable,
  messagesTable,
  messageReadsTable,
  messageReactionsTable,
  blockedUsersTable,
  conversationArchivesTable,
  chatReportsTable,
  usersTable,
  productsTable,
  reclamationsTable,
  buildingsTable,
} from "@workspace/db/schema";
import { eq, or, and, desc, count, inArray, gt, sql } from "drizzle-orm";
import { requireAuth, type JwtPayload } from "../middleware/auth.js";
import { getPagination, buildPagedResponse } from "../lib/paginate.js";
import { sendPushToUsers } from "../lib/notify.js";

const router = Router();

// ─── Role Communication Matrix ────────────────────────────────────────────────
// Encodes "who can chat with whom" so it is enforced in one place instead of
// scattered ad-hoc checks. See AUDIT_REPORT.md for the full rationale.

type Role = JwtPayload["role"];

/**
 * Whether `actor` may open/keep a direct conversation with `target`.
 * Cross-syndicate isolation is enforced except for super_admin, who supervises
 * every syndicate. Marketplace and incident conversations bypass this matrix
 * on purpose — they use their own dedicated creation flows below.
 */
function canDirectMessage(
  actor: { role: Role; syndicateId?: string },
  target: { role: Role; syndicateId?: string | null },
): boolean {
  const sameSyndicate =
    !!actor.syndicateId &&
    !!target.syndicateId &&
    actor.syndicateId === target.syndicateId;

  // Super Admin ↔ Syndicate Admin (any syndicate — supervision)
  if (actor.role === "super_admin" && target.role === "syndicate_admin")
    return true;
  if (target.role === "super_admin" && actor.role === "syndicate_admin")
    return true;

  // Syndicate Admin ↔ Member / Tenant (same syndicate only)
  if (
    actor.role === "syndicate_admin" &&
    (target.role === "member" || target.role === "tenant")
  ) {
    return sameSyndicate;
  }
  if (
    target.role === "syndicate_admin" &&
    (actor.role === "member" || actor.role === "tenant")
  ) {
    return sameSyndicate;
  }

  // Member ↔ Member (same syndicate only)
  if (actor.role === "member" && target.role === "member") return sameSyndicate;

  // Everything else (tenant↔tenant, tenant↔member, super_admin↔member/tenant,
  // cross-syndicate pairs) is not part of the approved matrix — block it.
  return false;
}

async function isBlockedEitherWay(
  userAId: string,
  userBId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: blockedUsersTable.id })
    .from(blockedUsersTable)
    .where(
      or(
        and(
          eq(blockedUsersTable.blockerId, userAId),
          eq(blockedUsersTable.blockedId, userBId),
        ),
        and(
          eq(blockedUsersTable.blockerId, userBId),
          eq(blockedUsersTable.blockedId, userAId),
        ),
      ),
    );
  return rows.length > 0;
}

// ─── In-memory typing indicator state ────────────────────────────────────────
// No websockets exist in this API yet (see AUDIT_REPORT.md); typing state is
// ephemeral and polled by the client alongside /since, same pattern used for
// messages. A short TTL means a crashed client never leaves a stale "typing…".
const TYPING_TTL_MS = 6000;
const typingState = new Map<string, Map<string, number>>(); // conversationId -> userId -> expiresAt

function setTyping(conversationId: string, userId: string) {
  let m = typingState.get(conversationId);
  if (!m) {
    m = new Map();
    typingState.set(conversationId, m);
  }
  m.set(userId, Date.now() + TYPING_TTL_MS);
}

function getTypingUsers(
  conversationId: string,
  excludeUserId: string,
): string[] {
  const m = typingState.get(conversationId);
  if (!m) return [];
  const now = Date.now();
  const active: string[] = [];
  for (const [uid, expiresAt] of m.entries()) {
    if (expiresAt < now) {
      m.delete(uid);
      continue;
    }
    if (uid !== excludeUserId) active.push(uid);
  }
  return active;
}

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
    if (conv.syndicateId !== syndicateId || !conv.participantIds) return false;
    try {
      const ids: unknown = JSON.parse(conv.participantIds);
      return (
        Array.isArray(ids) &&
        ids.every((id): id is string => typeof id === "string") &&
        ids.includes(userId)
      );
    } catch {
      return false;
    }
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
  if (sameDay)
    return d.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  const daysDiff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (daysDiff === 1) return "Hier";
  if (daysDiff < 7) return d.toLocaleDateString("fr-FR", { weekday: "short" });
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

/**
 * Chat data is syndicate-scoped for every non-platform session. A malformed
 * or partially migrated JWT must not be allowed to continue with an empty
 * scope, even when the requested resource is addressed by a direct ID.
 */
function hasChatSyndicateScope(req: Request, res: Response): boolean {
  if (req.user?.role !== "super_admin" && !req.user?.syndicateId) {
    res.status(403).json({
      error: "Syndicat non défini dans le token",
      code: "SYNDICATE_SCOPE_REQUIRED",
    });
    return false;
  }
  return true;
}

/**
 * Shared incident-conversation creation, called both from a manual endpoint
 * and automatically by the reclamations route when a grievance is filed.
 * Exported so other route modules can trigger it without importing the router.
 */
export async function createIncidentConversation(params: {
  incidentId: string;
  syndicateId: string | null;
  memberId: string | null;
  memberName: string;
  title: string;
}): Promise<void> {
  const { incidentId, syndicateId, memberId, memberName, title } = params;

  // Anonymous grievances have no memberId — nothing to link a personal thread to,
  // but syndicate admins should still see a moderation thread scoped to the syndicate.
  const admins = syndicateId
    ? await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.syndicateId, syndicateId),
            eq(usersTable.role, "syndicate_admin"),
          ),
        )
    : [];

  const participantIds = new Set<string>(admins.map((a) => a.id));
  if (memberId) participantIds.add(memberId);
  if (participantIds.size === 0) return;

  await db.insert(conversationsTable).values({
    syndicateId: syndicateId ?? undefined,
    convType: "incident",
    isGroup: true,
    name: `Incident · ${title}`.slice(0, 100),
    participantIds: JSON.stringify([...participantIds]),
    incidentId,
    createdBy: memberId ?? undefined,
    lastMessage: "Conversation d'incident créée",
    lastMessageAt: new Date(),
  } as any);
}

/**
 * When an admin/employee is assigned as responsible for an incident
 * (reclamation's `traitePar`), add them to the incident's chat thread so
 * they see the history and can respond directly — implements spec Phase 6
 * ("assign responsible employee/provider").
 */
export async function addResponsibleToIncidentConversation(
  incidentId: string,
  responsibleUserId: string,
): Promise<void> {
  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.incidentId, incidentId),
        eq(conversationsTable.convType, "incident"),
      ),
    );
  if (!conv) return;

  let ids: string[] = [];
  try {
    ids = JSON.parse(conv.participantIds ?? "[]");
  } catch {
    /* ignore */
  }
  if (ids.includes(responsibleUserId)) return;
  ids.push(responsibleUserId);

  await db
    .update(conversationsTable)
    .set({ participantIds: JSON.stringify(ids) })
    .where(eq(conversationsTable.id, conv.id));

  await db.insert(messagesTable).values({
    conversationId: conv.id,
    senderId: responsibleUserId,
    senderName: "Système",
    text: "Un responsable a été assigné à cet incident.",
    messageType: "text",
  } as any);
}

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

    // Filter out conversations where a group membership check is required
    // (isGroup+syndicate match alone isn't enough — must be an actual participant)
    const visible = conversations.filter((c) => {
      if (!c.isGroup) return true;
      if (c.convType === "announcement" || c.convType === "building")
        return true;
      if (c.syndicateId !== syndicateId || !c.participantIds) return false;
      try {
        const ids: unknown = JSON.parse(c.participantIds);
        return (
          Array.isArray(ids) &&
          ids.every((id): id is string => typeof id === "string") &&
          ids.includes(userId)
        );
      } catch {
        return false;
      }
    });

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
      .select({ id: conversationsTable.id })
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
    if (conversations.length === 0) {
      res.json({ data: [] });
      return;
    }

    const convIds = conversations.map((c) => c.id);
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
        conversations.flatMap(
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
    const matches = conversations.filter((c) => {
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

router.post("/conversations/incident", requireAuth, async (req, res) => {
  const schema = z.object({ incidentId: z.string() });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides" });
    return;
  }
  try {
    if (!hasChatSyndicateScope(req, res)) return;
    const [incident] = await db
      .select()
      .from(reclamationsTable)
      .where(eq(reclamationsTable.id, result.data.incidentId));
    if (!incident) {
      res.status(404).json({ error: "Incident introuvable" });
      return;
    }

    const actor = req.user!;
    const isOwner = incident.memberId === actor.userId;
    const isAdmin =
      actor.role === "super_admin" || actor.role === "syndicate_admin";
    if (!isOwner && !isAdmin) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    const existing = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.incidentId, incident.id));
    if (existing.length > 0) {
      res.json({ data: existing[0], existing: true });
      return;
    }

    await createIncidentConversation({
      incidentId: incident.id,
      syndicateId: actor.syndicateId ?? null,
      memberId: incident.memberId,
      memberName: incident.memberName ?? "Membre",
      title: incident.titre,
    });

    const [created] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.incidentId, incident.id));
    res.status(201).json({ data: created });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
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

// ─── Message enrichment helpers ──────────────────────────────────────────────

/**
 * Filter and mask messages for a specific user:
 * - Removes messages the user deleted "for themselves" (deletedForUserIds).
 * - Masks content of "deleted for everyone" messages (keeps tombstone flag).
 */
function enrichMessagesForUser(messages: any[], userId: string): any[] {
  return messages
    .filter((m) => {
      try {
        const deletedFor: string[] = JSON.parse(m.deletedForUserIds ?? "[]");
        return !deletedFor.includes(userId);
      } catch {
        return true;
      }
    })
    .map((m) => {
      if (!m.isDeletedForEveryone) return m;
      return {
        ...m,
        text: "",
        attachmentUrl: null,
        attachmentName: null,
        attachmentType: null,
      };
    });
}

// ─── Reactions helper ────────────────────────────────────────────────────────

async function loadReactionsByMessage(messageIds: string[], userId: string) {
  if (messageIds.length === 0)
    return new Map<string, { emoji: string; count: number; mine: boolean }[]>();
  const rows = await db
    .select()
    .from(messageReactionsTable)
    .where(inArray(messageReactionsTable.messageId, messageIds));
  const grouped = new Map<
    string,
    Map<string, { count: number; mine: boolean }>
  >();
  for (const r of rows) {
    let byEmoji = grouped.get(r.messageId);
    if (!byEmoji) {
      byEmoji = new Map();
      grouped.set(r.messageId, byEmoji);
    }
    const entry = byEmoji.get(r.emoji) ?? { count: 0, mine: false };
    entry.count += 1;
    if (r.userId === userId) entry.mine = true;
    byEmoji.set(r.emoji, entry);
  }
  const result = new Map<
    string,
    { emoji: string; count: number; mine: boolean }[]
  >();
  for (const [msgId, byEmoji] of grouped.entries()) {
    result.set(
      msgId,
      [...byEmoji.entries()].map(([emoji, v]) => ({ emoji, ...v })),
    );
  }
  return result;
}

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

// ─── Block / Unblock / List blocked users ────────────────────────────────────

router.get("/blocked-users", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select({ id: blockedUsersTable.blockedId, name: usersTable.name })
      .from(blockedUsersTable)
      .leftJoin(usersTable, eq(usersTable.id, blockedUsersTable.blockedId))
      .where(eq(blockedUsersTable.blockerId, req.user!.userId));
    res.json({ data: rows });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/blocked-users/:userId", requireAuth, async (req, res) => {
  const targetId = String(req.params.userId);
  if (targetId === req.user!.userId) {
    res.status(400).json({ error: "Action invalide" });
    return;
  }
  try {
    await db
      .insert(blockedUsersTable)
      .values({ blockerId: req.user!.userId, blockedId: targetId })
      .onConflictDoNothing();
    res.status(201).json({ message: "Utilisateur bloqué" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/blocked-users/:userId", requireAuth, async (req, res) => {
  const targetId = String(req.params.userId);
  try {
    await db
      .delete(blockedUsersTable)
      .where(
        and(
          eq(blockedUsersTable.blockerId, req.user!.userId),
          eq(blockedUsersTable.blockedId, targetId),
        ),
      );
    res.json({ message: "Utilisateur débloqué" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Report abuse ─────────────────────────────────────────────────────────────

router.post("/chat-reports", requireAuth, async (req, res) => {
  const schema = z.object({
    reportedUserId: z.string().optional(),
    conversationId: z.string().optional(),
    messageId: z.string().optional(),
    reason: z.string().min(1).max(1000),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides" });
    return;
  }
  try {
    const [row] = await db
      .insert(chatReportsTable)
      .values({ reporterId: req.user!.userId, ...result.data })
      .returning();
    res.status(201).json({ data: row, message: "Signalement envoyé" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
