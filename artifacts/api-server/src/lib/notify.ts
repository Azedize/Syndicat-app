import { db } from "@workspace/db";
import { alertsTable, usersTable } from "@workspace/db/schema";
import { isNotNull, inArray, eq } from "drizzle-orm";
import { logger } from "./logger.js";

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
  const rows = await db
    .select({ pushToken: usersTable.pushToken })
    .from(usersTable)
    .where(isNotNull(usersTable.pushToken));

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
    .where(isNotNull(usersTable.pushToken));

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
      "Accept": "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify(messages),
  });

  if (!res.ok) {
    throw new Error(`Expo push responded ${res.status}: ${await res.text()}`);
  }
}
