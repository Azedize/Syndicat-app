import { db } from "@workspace/db";
import { actionSupportsTable, actionParticipantsTable } from "@workspace/db/schema";
import { eq, and, count, inArray } from "drizzle-orm";

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function parseJson<T>(val: string, fallback: T): T {
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

/** Annotate action rows with support/participant counts + user state */
export async function annotateActions(actions: any[], userId: string) {
  if (actions.length === 0) return [];

  const ids = actions.map((a) => a.id);

  const [supportCounts, participantCounts, userSupports, userParticipates] = await Promise.all([
    db
      .select({ actionId: actionSupportsTable.actionId, count: count() })
      .from(actionSupportsTable)
      .where(inArray(actionSupportsTable.actionId, ids))
      .groupBy(actionSupportsTable.actionId),

    db
      .select({ actionId: actionParticipantsTable.actionId, count: count() })
      .from(actionParticipantsTable)
      .where(inArray(actionParticipantsTable.actionId, ids))
      .groupBy(actionParticipantsTable.actionId),

    db
      .select({ actionId: actionSupportsTable.actionId })
      .from(actionSupportsTable)
      .where(and(inArray(actionSupportsTable.actionId, ids), eq(actionSupportsTable.userId, userId))),

    db
      .select({ actionId: actionParticipantsTable.actionId })
      .from(actionParticipantsTable)
      .where(and(inArray(actionParticipantsTable.actionId, ids), eq(actionParticipantsTable.userId, userId))),
  ]);

  const supportMap = new Map(supportCounts.map((r) => [r.actionId, Number(r.count)]));
  const participantMap = new Map(participantCounts.map((r) => [r.actionId, Number(r.count)]));
  const userSupportsSet = new Set(userSupports.map((r) => r.actionId));
  const userParticipatesSet = new Set(userParticipates.map((r) => r.actionId));

  return actions.map((a) => ({
    ...a,
    demands: parseJson<string[]>(a.demands, []),
    updates: parseJson<Array<{ date: string; text: string }>>(a.updates, []),
    tags: parseJson<string[]>(a.tags, []),
    supportCount: supportMap.get(a.id) ?? 0,
    participantsConfirmed: participantMap.get(a.id) ?? 0,
    userSupports: userSupportsSet.has(a.id),
    userParticipates: userParticipatesSet.has(a.id),
  }));
}
