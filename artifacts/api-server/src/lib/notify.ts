import { db } from "@workspace/db";
import { alertsTable, usersTable } from "@workspace/db/schema";
import { and, isNotNull, inArray, eq, isNull, or, type SQL } from "drizzle-orm";
import { logger } from "./logger.js";
import { sendTransactionalEmail } from "./email/emailService.js";
import { SYNDICATE_TEAM_ROLES, type UserRole } from "../middleware/auth.js";

/** Audience "admin" = the syndicate management team (+ platform owner). */
const ADMIN_ROLES: string[] = ["super_admin", ...SYNDICATE_TEAM_ROLES];

/**
 * Which alert rows a user may see in the notification center:
 * their personal notifications, plus broadcasts addressed to their role.
 * (Syndicate scoping is applied separately by the caller.)
 */
export function alertAudienceWhere(userId: string, role: UserRole): SQL | undefined {
  if (role === "super_admin") return undefined;
  const targets = ["all"];
  if (ADMIN_ROLES.includes(role)) targets.push("admin");
  if (role === "member") targets.push("member");
  return or(
    eq(alertsTable.recipientUserId, userId),
    and(isNull(alertsTable.recipientUserId), inArray(alertsTable.target, targets)),
  );
}

/**
 * Sends a transactional email via the centralized EmailService (real Gmail SMTP
 * delivery, retry-on-failure, and full email_logs/audit trail — see lib/email/emailService.ts).
 * Never throws — email delivery failures must not block the calling workflow (vote, election
 * lifecycle transition, etc.); callers should not depend on this succeeding.
 * `template` defaults to "generic" for call sites that haven't been migrated to a named template yet.
 */
export async function sendEmail(to: string, subject: string, html: string, template = "generic", syndicateId?: string | null): Promise<void> {
  await sendTransactionalEmail({ to, subject, html, template, syndicateId }).catch((err) => {
    logger.warn({ err }, "sendEmail failed");
  });
}

/** Emails every address in `to` individually (skips falsy/empty addresses). Never throws. */
export async function sendEmailToMany(
  to: (string | null | undefined)[],
  subject: string,
  html: string,
  template = "generic",
  syndicateId?: string | null,
): Promise<void> {
  const recipients = to.filter((e): e is string => !!e);
  await Promise.all(recipients.map((email) => sendEmail(email, subject, html, template, syndicateId)));
}

export interface AlertPayload {
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "error";
  syndicateId?: string | null;
  target?: "all" | "admin" | "member";
}

/**
 * Inserts an alert row and fire-and-forgets Expo push notifications
 * to every user who has a registered push token.
 */
export async function createAlert(payload: AlertPayload): Promise<void> {
  const date = new Date().toISOString().split("T")[0];
  await db.insert(alertsTable).values({
    title: payload.title,
    message: payload.message,
    type: payload.type,
    date,
    syndicateId: payload.syndicateId ?? null,
    target: payload.target ?? "admin",
  });

  sendExpoPush(payload).catch((err: Error) => {
    logger.warn({ err: err.message }, "Expo push delivery failed");
  });
}

async function sendExpoPush(payload: AlertPayload): Promise<void> {
  const target = payload.target ?? "admin";

  // Scope recipients: syndicateId (when provided) restricts to that syndicate only;
  // target further restricts by role. This prevents financial/sensitive alert
  // content from being broadcast to unrelated syndicates or non-admin roles.
  const conditions = [isNotNull(usersTable.pushToken)];
  if (payload.syndicateId) {
    conditions.push(eq(usersTable.syndicateId, payload.syndicateId));
  }
  if (target === "admin") {
    conditions.push(inArray(usersTable.role, ADMIN_ROLES));
  } else if (target === "member") {
    conditions.push(eq(usersTable.role, "member"));
  }
  // target === "all" imposes no role filter, but still respects syndicateId scoping above.

  const rows = await db
    .select({ pushToken: usersTable.pushToken })
    .from(usersTable)
    .where(and(...conditions));

  const tokens = rows
    .map((r) => r.pushToken)
    .filter((t): t is string => typeof t === "string" && t.startsWith("ExponentPushToken["));

  if (tokens.length === 0) return;

  await deliverExpoPush(
    tokens.map((token) => ({
      to: token,
      sound: "default" as const,
      title: payload.title,
      body: payload.message,
      data: { alertType: payload.type, syndicateId: payload.syndicateId ?? null },
    })),
  );
}

/**
 * Personal notification for one user: an in-app alert only that user can see
 * (notification center) plus a push notification when a token is registered.
 * Never throws — a notification failure must not break the business action.
 */
export async function notifyUser(
  userId: string | null | undefined,
  payload: Omit<AlertPayload, "target">,
): Promise<void> {
  if (!userId) return;
  try {
    await db.insert(alertsTable).values({
      title: payload.title,
      message: payload.message,
      type: payload.type,
      date: new Date().toISOString().split("T")[0],
      syndicateId: payload.syndicateId ?? null,
      target: "all",
      recipientUserId: userId,
    });
    await sendPushToUsers([userId], payload.title, payload.message, {
      alertType: payload.type,
    });
  } catch (err: any) {
    logger.warn({ err: err?.message, userId }, "Personal notification failed");
  }
}

/**
 * Send a targeted push notification to specific user IDs.
 * Silently skips users who have not registered a push token.
 */
export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  if (userIds.length === 0) return;

  const rows = await db
    .select({ pushToken: usersTable.pushToken })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));

  const tokens = rows
    .map((r) => r.pushToken)
    .filter((t): t is string => typeof t === "string" && t.startsWith("ExponentPushToken["));

  if (tokens.length === 0) return;

  await deliverExpoPush(
    tokens.map((token) => ({ to: token, sound: "default" as const, title, body, data })),
  ).catch((err: Error) => {
    logger.warn({ err: err.message }, "Targeted Expo push delivery failed");
  });
}

/**
 * Send a push notification to all users in a syndicate.
 */
export async function sendPushToSyndicate(
  syndicateId: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const rows = await db
    .select({ pushToken: usersTable.pushToken })
    .from(usersTable)
    .where(and(isNotNull(usersTable.pushToken), eq(usersTable.syndicateId, syndicateId)));

  const tokens = rows
    .map((r) => r.pushToken)
    .filter((t): t is string => typeof t === "string" && t.startsWith("ExponentPushToken["));

  if (tokens.length === 0) return;

  await deliverExpoPush(
    tokens.map((token) => ({ to: token, sound: "default" as const, title, body, data })),
  ).catch((err: Error) => {
    logger.warn({ err: err.message }, "Syndicate Expo push delivery failed");
  });
}

async function deliverExpoPush(
  messages: Array<{ to: string; sound: "default"; title: string; body: string; data?: Record<string, unknown> }>,
): Promise<void> {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify(messages),
  });

  if (!res.ok) {
    throw new Error(`Expo push responded ${res.status}: ${await res.text()}`);
  }
}
