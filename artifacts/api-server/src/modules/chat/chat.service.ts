import { db } from "@workspace/db";
import {
  conversationsTable,
  messagesTable,
  messageReactionsTable,
  blockedUsersTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, or, and, inArray } from "drizzle-orm";
import { type JwtPayload } from "../../middleware/auth.js";

// ─── Role Communication Matrix ────────────────────────────────────────────────
// Encodes "who can chat with whom" so it is enforced in one place instead of
// scattered ad-hoc checks. See AUDIT_REPORT.md for the full rationale.
export type Role = JwtPayload["role"];

// ─── In-memory typing indicator state ────────────────────────────────────────
// No websockets exist in this API yet (see AUDIT_REPORT.md); typing state is
// ephemeral and polled by the client alongside /since, same pattern used for
// messages. A short TTL means a crashed client never leaves a stale "typing…".
export const TYPING_TTL_MS = 6000;

export const typingState = new Map<string, Map<string, number>>(); // conversationId -> userId -> expiresAt

/**
 * Whether `actor` may open/keep a direct conversation with `target`.
 * Cross-syndicate isolation is enforced except for super_admin, who supervises
 * every syndicate. Marketplace and incident conversations bypass this matrix
 * on purpose — they use their own dedicated creation flows below.
 */
export function canDirectMessage(
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

export async function isBlockedEitherWay(
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

export function setTyping(conversationId: string, userId: string) {
  let m = typingState.get(conversationId);
  if (!m) {
    m = new Map();
    typingState.set(conversationId, m);
  }
  m.set(userId, Date.now() + TYPING_TTL_MS);
}

export function getTypingUsers(
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
export async function canAccessConversation(
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

export function formatTime(d: Date | null | undefined): string {
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

export function isVisibleToChatUser(
  conversation: {
    isGroup: boolean | null;
    convType: string;
    syndicateId: string | null;
    participantIds: string | null;
  },
  userId: string,
  syndicateId: string,
): boolean {
  if (!conversation.isGroup) return true;
  if (conversation.convType === "announcement" || conversation.convType === "building") {
    return conversation.syndicateId === syndicateId;
  }
  if (conversation.syndicateId !== syndicateId || !conversation.participantIds) return false;
  try {
    const ids: unknown = JSON.parse(conversation.participantIds);
    return (
      Array.isArray(ids) &&
      ids.every((id): id is string => typeof id === "string") &&
      ids.includes(userId)
    );
  } catch {
    return false;
  }
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

// ─── Message enrichment helpers ──────────────────────────────────────────────
/**
 * Filter and mask messages for a specific user:
 * - Removes messages the user deleted "for themselves" (deletedForUserIds).
 * - Masks content of "deleted for everyone" messages (keeps tombstone flag).
 */
export function enrichMessagesForUser(messages: any[], userId: string): any[] {
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
export async function loadReactionsByMessage(messageIds: string[], userId: string) {
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
