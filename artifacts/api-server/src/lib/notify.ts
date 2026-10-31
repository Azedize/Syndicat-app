import { outboundDeliveryDisabled } from "./outbound.js";
import { db } from "@workspace/db";
import { alertsTable, usersTable } from "@workspace/db/schema";
import { and, isNotNull, inArray, eq, isNull, or, type SQL } from "drizzle-orm";
import { logger } from "./logger.js";
import { sendTransactionalEmail } from "./email/emailService.js";
import { SYNDICATE_TEAM_ROLES, type UserRole } from "../middleware/auth.js";
import { localToday } from "./charge-time.js";
import { asLang, frenchCopy, notificationLink, renderNotification, type NotificationKey, type NotificationParams } from "./notification-texts.js";

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

/**
 * A notification. Prefer `key` + `params` (lib/notification-texts.ts): it is
 * then shown in each reader's language and links to the screen it concerns.
 * `title`/`message` alone remain for texts without a template (French only).
 */
export type AlertPayload = {
  type: "info" | "warning" | "success" | "error";
  syndicateId?: string | null;
  target?: "all" | "admin" | "member";
  /** Overrides the template's link (e.g. a precise record). */
  link?: string;
} & (
  | { key: NotificationKey; params?: NotificationParams; title?: undefined; message?: undefined }
  | { key?: undefined; params?: undefined; title: string; message: string }
);

/** French copy stored with the row (old clients, logs) + template columns. */
function storedFields(payload: AlertPayload) {
  if (payload.key) {
    const params = Object.fromEntries(Object.entries(payload.params ?? {}).map(([k, v]) => [k, v === null || v === undefined ? "" : v])) as Record<string, string | number>;
    const fr = frenchCopy(payload.key, params);
    return { title: fr.title, message: fr.message, key: payload.key as string, params, link: payload.link ?? null };
  }
  return { title: payload.title!, message: payload.message!, key: null, params: null, link: payload.link ?? null };
}

/** Text of a push for a recipient's language (the template's, else the stored text). */
function pushText(payload: AlertPayload, language: string | null | undefined) {
  const stored = storedFields(payload);
  const r = payload.key ? renderNotification(payload.key, stored.params, asLang(language)) : null;
  return { title: r?.title ?? stored.title, body: r?.message ?? stored.message };
}

/**
 * Inserts an alert row and fire-and-forgets Expo push notifications
 * to every user who has a registered push token.
 */
export async function createAlert(payload: AlertPayload): Promise<void> {
  const date = localToday();
  await db.insert(alertsTable).values({
    ...storedFields(payload),
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
    .select({ pushToken: usersTable.pushToken, language: usersTable.language, role: usersTable.role })
    .from(usersTable)
    .where(and(...conditions));

  const valid = rows.filter((r): r is { pushToken: string; language: string | null; role: string } => typeof r.pushToken === "string" && r.pushToken.startsWith("ExponentPushToken["));
  if (valid.length === 0) return;
  const stored = storedFields(payload);

  // Each recipient receives the push in their own language.
  await deliverExpoPush(
    valid.map((r) => ({
      to: r.pushToken,
      sound: "default" as const,
      ...pushText(payload, r.language),
      // The link only for a role allowed on that screen.
      data: { alertType: payload.type, syndicateId: payload.syndicateId ?? null, key: payload.key ?? null, link: notificationLink(stored.key, stored.link, r.role) },
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
      ...storedFields(payload as AlertPayload),
      type: payload.type,
      date: localToday(),
      syndicateId: payload.syndicateId ?? null,
      target: "all",
      recipientUserId: userId,
    });
    const [recipient] = await db.select({ pushToken: usersTable.pushToken, language: usersTable.language, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId));
    if (recipient?.pushToken?.startsWith("ExponentPushToken[")) {
      const text = pushText(payload as AlertPayload, recipient.language);
      await deliverExpoPush([{ to: recipient.pushToken, sound: "default", ...text, data: { alertType: payload.type, key: payload.key ?? null, link: notificationLink(storedFields(payload as AlertPayload).key, storedFields(payload as AlertPayload).link, recipient.role) } }]).catch((err: Error) => {
        logger.warn({ err: err.message }, "Personal push delivery failed");
      });
    }
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
  if (outboundDeliveryDisabled()) {
    logger.info({ count: messages.length }, "Push skipped — outbound delivery disabled");
    return;
  }
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
