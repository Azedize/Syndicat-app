import { z } from "zod";
import { db } from "@workspace/db";
import {
  claimAttachmentsTable,
  claimEventsTable,
  claimsTable,
  lotsTable,
  prestatairesTable,
  storageObjectsTable,
  usersTable,
} from "@workspace/db/schema";
import {
  and,
  eq,
  inArray,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm";
import { type JwtPayload } from "../../middleware/auth.js";
import { FinanceError, type Tx } from "../../lib/treasury.js";
import {
  CLAIM_STATUSES,
  CLAIM_TEAM,
  allowedTransitions,
  isOverdue,
  type Claim,
  OPEN_STATUSES,
} from "../../lib/claims.js";
import { listSchema } from "./claims.validation.js";

/** Loads a claim of the condominium the person may see (404 otherwise, no hint). */
export async function loadVisible(id: string, user: JwtPayload, sid: string, executor: Tx | typeof db = db, lock = false): Promise<Claim> {
  const q = executor.select().from(claimsTable).where(and(eq(claimsTable.id, id), eq(claimsTable.syndicateId, sid)));
  const [c] = lock ? await q.for("update") : await q;
  if (!c) throw new FinanceError(404, "CLAIM_NOT_FOUND", "Réclamation introuvable");
  if (!CLAIM_TEAM.has(user.role) && c.reporterUserId !== user.userId) throw new FinanceError(404, "CLAIM_NOT_FOUND", "Réclamation introuvable");
  return c;
}

/** Version check: a stale write answers 409 with the current claim. */
export function assertFresh(c: Claim, expected: number | undefined) {
  if (expected !== undefined && expected !== c.version) {
    const err = new FinanceError(409, "CLAIM_STALE", "La réclamation a été modifiée entre-temps : la carte a été rafraîchie");
    (err as any).current = c;
    throw err;
  }
}

export async function addEvent(
  tx: Tx,
  c: Claim,
  user: JwtPayload,
  e: { type: string; fromStatus?: string | null; toStatus?: string | null; body?: string | null; internal?: boolean; data?: unknown; requestKey?: string | null },
) {
  const [row] = await tx
    .insert(claimEventsTable)
    .values({
      claimId: c.id,
      syndicateId: c.syndicateId,
      type: e.type,
      fromStatus: e.fromStatus ?? null,
      toStatus: e.toStatus ?? null,
      body: e.body ?? null,
      internal: e.internal ?? false,
      data: (e.data as any) ?? null,
      authorId: user.userId,
      authorName: user.name,
      requestKey: e.requestKey ?? null,
    })
    .returning();
  return row;
}

/** Card / record as a given person may see it. */
export async function view(c: Claim, user: JwtPayload) {
  const isTeam = CLAIM_TEAM.has(user.role);
  const [assignee] = c.assigneeUserId ? await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, c.assigneeUserId)) : [];
  const [provider] = c.prestataireId ? await db.select({ name: prestatairesTable.name }).from(prestatairesTable).where(eq(prestatairesTable.id, c.prestataireId)) : [];
  const [lot] = c.lotId ? await db.select({ number: lotsTable.number }).from(lotsTable).where(eq(lotsTable.id, c.lotId)) : [];
  const base = {
    id: c.id,
    reference: c.reference,
    title: c.title,
    description: c.description,
    category: c.category,
    scope: c.scope,
    location: c.location,
    lotId: c.lotId,
    lotNumber: lot?.number ?? null,
    buildingId: c.buildingId,
    status: c.status,
    priority: c.priority,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    dueAt: c.dueAt,
    overdue: isOverdue(c),
    reporterName: c.reporterName,
    assigneeName: assignee?.name ?? null,
    providerName: provider?.name ?? null,
    scheduledFor: c.scheduledFor,
    resolution: c.resolution,
    resolvedAt: c.resolvedAt,
    closedAt: c.closedAt,
    rejectionReason: c.rejectionReason,
    reopenCount: c.reopenCount,
    version: c.version,
    mine: c.reporterUserId === user.userId,
    allowedTransitions: allowedTransitions(user, c),
  };
  if (!isTeam) return base;
  return { ...base, assigneeUserId: c.assigneeUserId, prestataireId: c.prestataireId, travauxId: c.travauxId, reporterUserId: c.reporterUserId, assignedAt: c.assignedAt };
}

/** Attachments must be files this person uploaded in this condominium (photos / PDF). */
export async function checkUploads(paths: string[], user: JwtPayload, sid: string) {
  if (paths.length === 0) return [];
  const rows = await db.select().from(storageObjectsTable).where(inArray(storageObjectsTable.objectPath, paths));
  for (const p of paths) {
    const o = rows.find((r) => r.objectPath === p);
    if (!o || o.ownerId !== user.userId || o.syndicateId !== sid) {
      throw new FinanceError(400, "ATTACHMENT_NOT_OWNED", "Une pièce jointe doit être un fichier que vous avez envoyé dans cette copropriété");
    }
    if (!/^(image\/|application\/pdf$)/.test(o.contentType)) throw new FinanceError(415, "ATTACHMENT_TYPE", "Photos ou PDF uniquement");
  }
  const used = await db.select({ p: claimAttachmentsTable.objectPath }).from(claimAttachmentsTable).where(inArray(claimAttachmentsTable.objectPath, paths));
  if (used.length) throw new FinanceError(409, "ATTACHMENT_ALREADY_USED", "Ce fichier est déjà joint à une réclamation");
  return rows;
}

export function filters(user: JwtPayload, sid: string, q: z.infer<typeof listSchema>): SQL[] {
  const c: SQL[] = [eq(claimsTable.syndicateId, sid)];
  if (!CLAIM_TEAM.has(user.role) || q.mine === "true") c.push(eq(claimsTable.reporterUserId, user.userId));
  if (q.status) {
    const st = q.status.split(",").filter((s) => (CLAIM_STATUSES as readonly string[]).includes(s));
    if (st.length) c.push(inArray(claimsTable.status, st));
  }
  if (q.category) c.push(eq(claimsTable.category, q.category));
  if (q.priority) c.push(eq(claimsTable.priority, q.priority));
  if (q.assignee === "me") c.push(eq(claimsTable.assigneeUserId, user.userId));
  else if (q.assignee === "none") c.push(and(isNull(claimsTable.assigneeUserId), isNull(claimsTable.prestataireId))!);
  else if (q.assignee) c.push(eq(claimsTable.assigneeUserId, q.assignee));
  if (q.overdue === "true") c.push(sql`${claimsTable.status} IN (${OPEN_SQL}) AND ${claimsTable.dueAt} < now()`);
  if (q.q) {
    const like = `%${q.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    c.push(sql`(${claimsTable.reference} ILIKE ${like} OR ${claimsTable.title} ILIKE ${like} OR ${claimsTable.location} ILIKE ${like} OR ${claimsTable.description} ILIKE ${like})`);
  }
  return c;
}

export const OPEN_SQL = sql.join(OPEN_STATUSES.map((s) => sql`${s}`), sql`, `);
