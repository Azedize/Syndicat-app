import { db } from "@workspace/db";
import { alertsTable, claimEventsTable, claimNotificationsTable, claimsTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { JwtPayload } from "../middleware/auth.js";
import { sendPushToUsers } from "./notify.js";
import { logger } from "./logger.js";

/**
 * Claims & incidents — business rules shared by the routes, the board and the
 * metrics, so that every screen uses the same status definitions.
 */
export const CLAIM_STATUSES = ["received", "qualified", "assigned", "in_progress", "awaiting_info", "resolved", "closed", "rejected"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
/** A claim still needs work in these states (open claims, overdue claims). */
export const OPEN_STATUSES: readonly ClaimStatus[] = ["received", "qualified", "assigned", "in_progress", "awaiting_info"];
export const CLAIM_CATEGORIES = ["fuite_eau", "ascenseur", "eclairage", "electricite", "bruit", "proprete", "securite", "parties_communes", "stationnement", "autre"] as const;
export const CLAIM_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type ClaimPriority = (typeof CLAIM_PRIORITIES)[number];

/** Time allowed to resolve, by priority (from the creation of the claim). */
export const SLA_HOURS: Record<ClaimPriority, number> = { urgent: 24, high: 72, normal: 7 * 24, low: 14 * 24 };
export const dueAtFor = (createdAt: Date, priority: ClaimPriority) => new Date(createdAt.getTime() + SLA_HOURS[priority] * 3_600_000);

/**
 * Allowed moves of the board. "assigned" needs a responsible party (set with
 * the assignment action); "in_progress" needs one too; "awaiting_info" needs a
 * question to the resident; "resolved" needs the resolution; "rejected" a
 * reason; "closed" only follows "resolved". Reopening is a separate action.
 */
export const TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  received: ["qualified", "awaiting_info", "rejected"],
  qualified: ["assigned", "awaiting_info", "rejected"],
  assigned: ["in_progress", "awaiting_info"],
  in_progress: ["awaiting_info", "resolved"],
  awaiting_info: ["qualified", "assigned", "in_progress"],
  resolved: ["closed"],
  closed: [],
  rejected: [],
};

/** Run the condominium's claims: qualify, assign, every transition. */
export const CLAIM_MANAGERS = new Set(["syndicate_admin", "president", "secretary"]);
/** Read the board and comment internally. */
export const CLAIM_TEAM = new Set(["syndicate_admin", "president", "secretary", "treasurer", "committee_member"]);
/** What an assigned team member may do on their own claim. */
export const ASSIGNEE_TRANSITIONS = new Set<ClaimStatus>(["in_progress", "awaiting_info", "resolved"]);

export const REOPEN_WINDOW_DAYS = 30;
export const RESIDENT_REOPEN_LIMIT = 3;

export type Claim = typeof claimsTable.$inferSelect;

export function isOverdue(c: Pick<Claim, "status" | "dueAt">, now = new Date()): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(c.status) && c.dueAt.getTime() < now.getTime();
}

/** Transitions this person may make from the claim's current state. */
export function allowedTransitions(user: JwtPayload, c: Claim): ClaimStatus[] {
  const next = TRANSITIONS[c.status as ClaimStatus] ?? [];
  if (CLAIM_MANAGERS.has(user.role)) return next;
  if (c.assigneeUserId === user.userId && CLAIM_TEAM.has(user.role)) return next.filter((s) => ASSIGNEE_TRANSITIONS.has(s));
  return [];
}

/** People who run claims in a condominium (account, assignment or company). */
export async function claimManagers(syndicateId: string): Promise<string[]> {
  const rows = (await db.execute(sql`
    SELECT u.id FROM users u
      WHERE u.syndicate_id = ${syndicateId} AND u.role IN ('syndicate_admin', 'president', 'secretary') AND u.status = 'active'
    UNION
    SELECT m.user_id FROM syndicate_memberships m JOIN users u ON u.id = m.user_id
      WHERE m.syndicate_id = ${syndicateId} AND m.status = 'active' AND m.role IN ('syndicate_admin', 'president', 'secretary') AND u.status = 'active'
    UNION
    SELECT om.user_id FROM organization_members om
      JOIN syndicates s ON s.organization_id = om.organization_id
      JOIN users u ON u.id = om.user_id
      WHERE s.id = ${syndicateId} AND om.status = 'active' AND om.role = 'org_admin' AND u.status = 'active'
  `)) as unknown as { id: string }[];
  return rows.map((r) => r.id);
}

/** Team role this user holds in the condominium (null when none). */
export async function teamRoleIn(userId: string, syndicateId: string): Promise<string | null> {
  const [row] = (await db.execute(sql`
    SELECT r.role FROM (
      SELECT 'syndicate_admin' AS role, 1 AS rank FROM organization_members om JOIN syndicates s ON s.organization_id = om.organization_id
        WHERE s.id = ${syndicateId} AND om.user_id = ${userId} AND om.status = 'active' AND om.role = 'org_admin'
      UNION ALL
      SELECT m.role, 2 FROM syndicate_memberships m WHERE m.syndicate_id = ${syndicateId} AND m.user_id = ${userId} AND m.status = 'active'
      UNION ALL
      SELECT u.role, 3 FROM users u WHERE u.id = ${userId} AND u.syndicate_id = ${syndicateId}
    ) r JOIN users au ON au.id = ${userId} AND au.status = 'active'
    WHERE r.role IN ('syndicate_admin', 'president', 'secretary', 'treasurer', 'committee_member')
    ORDER BY r.rank LIMIT 1
  `)) as unknown as { role: string }[];
  return row?.role ?? null;
}

/**
 * Delivers the notifications of one event. One row per (event, recipient) is
 * inserted first (unique), so a retried request or a second delivery attempt
 * never notifies twice; a failure is recorded on the row (and can be retried)
 * and never undoes the claim operation, which is already committed.
 */
export async function notifyClaimEvent(
  event: { id: string; claimId: string; syndicateId: string; authorId: string | null },
  recipients: (string | null | undefined)[],
  message: { title: string; body: string; type?: "info" | "success" | "warning" | "error" },
): Promise<{ sent: number; failed: number; skipped: number }> {
  const unique = [...new Set(recipients.filter((r): r is string => !!r && r !== event.authorId))];
  if (unique.length === 0) return { sent: 0, failed: 0, skipped: 0 };
  const created = await db
    .insert(claimNotificationsTable)
    .values(unique.map((userId) => ({ eventId: event.id, claimId: event.claimId, syndicateId: event.syndicateId, userId })))
    .onConflictDoNothing({ target: [claimNotificationsTable.eventId, claimNotificationsTable.userId] })
    .returning();
  let sent = 0;
  let failed = 0;
  for (const n of created) {
    (await deliver(n, message)) ? sent++ : failed++;
  }
  return { sent, failed, skipped: unique.length - created.length };
}

async function deliver(
  n: typeof claimNotificationsTable.$inferSelect,
  message: { title: string; body: string; type?: string },
): Promise<boolean> {
  try {
    const [alert] = await db
      .insert(alertsTable)
      .values({
        title: message.title,
        message: message.body,
        type: message.type ?? "info",
        date: new Date().toISOString().slice(0, 10),
        syndicateId: n.syndicateId,
        target: "all",
        recipientUserId: n.userId,
      })
      .returning({ id: alertsTable.id });
    await db
      .update(claimNotificationsTable)
      .set({ status: "sent", attempts: sql`${claimNotificationsTable.attempts} + 1`, sentAt: new Date(), alertId: alert.id, error: null })
      .where(eq(claimNotificationsTable.id, n.id));
    // Push is best effort on top of the in-app notification.
    sendPushToUsers([n.userId], message.title, message.body, { claimId: n.claimId }).catch(() => {});
    return true;
  } catch (err: any) {
    logger.warn({ err: err?.message, notificationId: n.id }, "claim notification failed");
    await db
      .update(claimNotificationsTable)
      .set({ status: "failed", attempts: sql`${claimNotificationsTable.attempts} + 1`, error: String(err?.message ?? err).slice(0, 300) })
      .where(eq(claimNotificationsTable.id, n.id))
      .catch(() => {});
    return false;
  }
}

/** Re-delivers the failed notifications of a condominium (never the sent ones). */
export async function retryFailedClaimNotifications(syndicateId: string): Promise<{ retried: number; sent: number }> {
  const failed = await db
    .select({ n: claimNotificationsTable, title: claimEventsTable.type, body: claimEventsTable.body, ref: claimsTable.reference })
    .from(claimNotificationsTable)
    .innerJoin(claimEventsTable, eq(claimEventsTable.id, claimNotificationsTable.eventId))
    .innerJoin(claimsTable, eq(claimsTable.id, claimNotificationsTable.claimId))
    .where(and(eq(claimNotificationsTable.syndicateId, syndicateId), eq(claimNotificationsTable.status, "failed")))
    .limit(200);
  let sent = 0;
  for (const f of failed) {
    if (await deliver(f.n, { title: `Réclamation ${f.ref}`, body: EVENT_LABEL[f.title] ?? "Mise à jour de votre réclamation" })) sent++;
  }
  return { retried: failed.length, sent };
}

export const EVENT_LABEL: Record<string, string> = {
  created: "Nouvelle réclamation",
  assigned: "Réclamation prise en charge",
  info_requested: "Information demandée",
  info_provided: "Le résident a répondu",
  scheduled: "Intervention programmée",
  resolved: "Réclamation résolue",
  reopened: "Réclamation rouverte",
  rejected: "Réclamation non retenue",
  closed: "Réclamation clôturée",
  comment: "Nouveau message",
};
