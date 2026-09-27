import { db } from "@workspace/db";
import {
  lotsTable,
  membersTable,
  tenantsTable,
  buildingsTable,
  usersTable,
  meetingsTable,
  appelsDeFondsTable,
  budgetsTable,
  invoicesTable,
  documentsTable,
  storageObjectsTable,
} from "@workspace/db/schema";
import { eq, and, or, inArray, isNull } from "drizzle-orm";
import { isSyndicateTeamRole, type JwtPayload } from "../middleware/auth.js";

/**
 * Returns the list of building IDs a "member" or "tenant" user is linked to,
 * so provider/intervention data can be scoped to only what's relevant to them.
 * ownerId on lots can store either usersTable.id or membersTable.id depending
 * on how the row was created, so both are checked (see lots.ts /my-lot).
 */
export async function getUserBuildingIds(user: JwtPayload): Promise<string[]> {
  if (user.role === "tenant") {
    if (!user.syndicateId) return [];
    const rows = await db
      .select({ buildingId: tenantsTable.buildingId })
      .from(tenantsTable)
      .where(
        and(
          or(
            eq(tenantsTable.id, user.userId),
            eq(tenantsTable.email, user.email),
          ),
          eq(tenantsTable.syndicateId, user.syndicateId),
        ),
      );
    return [
      ...new Set(rows.map((r) => r.buildingId).filter((v): v is string => !!v)),
    ];
  }

  if (user.role === "member") {
    if (!user.syndicateId) return [];
    const [member] = await db
      .select({ id: membersTable.id })
      .from(membersTable)
      .where(
        and(
          eq(membersTable.email, user.email),
          eq(membersTable.syndicateId, user.syndicateId),
        ),
      )
      .limit(1);

    const ownerIds = member ? [user.userId, member.id] : [user.userId];
    const rows = await db
      .select({ buildingId: lotsTable.buildingId })
      .from(lotsTable)
      .innerJoin(buildingsTable, eq(buildingsTable.id, lotsTable.buildingId))
      .where(
        and(
          inArray(lotsTable.ownerId, ownerIds),
          eq(buildingsTable.syndicateId, user.syndicateId),
        ),
      );
    return [
      ...new Set(rows.map((r) => r.buildingId).filter((v): v is string => !!v)),
    ];
  }

  return [];
}

/** Returns the exact lots owned/occupied by a member or tenant. */
export async function getUserLotIds(user: JwtPayload): Promise<string[]> {
  if (user.role === "tenant") {
    if (!user.syndicateId) return [];
    const rows = await db
      .select({ lotId: tenantsTable.lotId })
      .from(tenantsTable)
      .where(
        and(
          or(
            eq(tenantsTable.id, user.userId),
            eq(tenantsTable.email, user.email),
          ),
          eq(tenantsTable.syndicateId, user.syndicateId),
        ),
      );
    return [
      ...new Set(rows.map((r) => r.lotId).filter((v): v is string => !!v)),
    ];
  }

  if (user.role === "member") {
    if (!user.syndicateId) return [];
    const [member] = await db
      .select({ id: membersTable.id })
      .from(membersTable)
      .where(
        and(
          eq(membersTable.email, user.email),
          eq(membersTable.syndicateId, user.syndicateId),
        ),
      )
      .limit(1);
    const ownerIds = member ? [user.userId, member.id] : [user.userId];
    const rows = await db
      .select({ id: lotsTable.id })
      .from(lotsTable)
      .innerJoin(buildingsTable, eq(buildingsTable.id, lotsTable.buildingId))
      .where(
        and(
          inArray(lotsTable.ownerId, ownerIds),
          eq(buildingsTable.syndicateId, user.syndicateId),
        ),
      );
    return rows.map((r) => r.id);
  }

  return [];
}

/** Entity references a request may carry in its body or query string. */
export interface SyndicateEntityRefs {
  buildingId?: string | null;
  lotId?: string | null;
  /** members.id, or users.id for legacy rows — either must be in the syndicate */
  memberId?: string | null;
  userId?: string | null;
  meetingId?: string | null;
  appelDeFondsId?: string | null;
  budgetId?: string | null;
  invoiceId?: string | null;
  documentId?: string | null;
  /** private upload path (/objects/…) — must be owned by the syndicate */
  objectPath?: string | null;
}

/**
 * Returns the name of the first supplied reference that does NOT belong to
 * `syndicateId` (unknown IDs count as foreign), or null when all belong.
 * Use it before loading or linking entities by client-supplied IDs, so a
 * syndicate can never read or attach another syndicate's records (BOLA).
 */
export async function findForeignReference(
  syndicateId: string,
  refs: SyndicateEntityRefs,
): Promise<keyof SyndicateEntityRefs | null> {
  const checks: Array<[keyof SyndicateEntityRefs, () => Promise<unknown[]>]> = [];
  const { buildingId, lotId, memberId, userId, meetingId, appelDeFondsId, budgetId, invoiceId, documentId, objectPath } = refs;

  if (buildingId)
    checks.push(["buildingId", () => db.select({ id: buildingsTable.id }).from(buildingsTable)
      .where(and(eq(buildingsTable.id, buildingId), eq(buildingsTable.syndicateId, syndicateId))).limit(1)]);
  if (lotId)
    checks.push(["lotId", () => db.select({ id: lotsTable.id }).from(lotsTable)
      .innerJoin(buildingsTable, eq(buildingsTable.id, lotsTable.buildingId))
      .where(and(eq(lotsTable.id, lotId), eq(buildingsTable.syndicateId, syndicateId))).limit(1)]);
  if (memberId)
    checks.push(["memberId", async () => {
      const members = await db.select({ id: membersTable.id }).from(membersTable)
        .where(and(eq(membersTable.id, memberId), eq(membersTable.syndicateId, syndicateId))).limit(1);
      if (members.length) return members;
      return db.select({ id: usersTable.id }).from(usersTable)
        .where(and(eq(usersTable.id, memberId), eq(usersTable.syndicateId, syndicateId))).limit(1);
    }]);
  if (userId)
    checks.push(["userId", () => db.select({ id: usersTable.id }).from(usersTable)
      .where(and(eq(usersTable.id, userId), eq(usersTable.syndicateId, syndicateId))).limit(1)]);
  if (meetingId)
    checks.push(["meetingId", () => db.select({ id: meetingsTable.id }).from(meetingsTable)
      .where(and(eq(meetingsTable.id, meetingId), eq(meetingsTable.syndicateId, syndicateId))).limit(1)]);
  if (appelDeFondsId)
    checks.push(["appelDeFondsId", () => db.select({ id: appelsDeFondsTable.id }).from(appelsDeFondsTable)
      .innerJoin(buildingsTable, eq(buildingsTable.id, appelsDeFondsTable.buildingId))
      .where(and(eq(appelsDeFondsTable.id, appelDeFondsId), eq(buildingsTable.syndicateId, syndicateId))).limit(1)]);
  if (budgetId)
    checks.push(["budgetId", () => db.select({ id: budgetsTable.id }).from(budgetsTable)
      .innerJoin(buildingsTable, eq(buildingsTable.id, budgetsTable.buildingId))
      .where(and(eq(budgetsTable.id, budgetId), eq(buildingsTable.syndicateId, syndicateId))).limit(1)]);
  if (invoiceId)
    checks.push(["invoiceId", () => db.select({ id: invoicesTable.id }).from(invoicesTable)
      .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.syndicateId, syndicateId))).limit(1)]);
  if (documentId)
    checks.push(["documentId", () => db.select({ id: documentsTable.id }).from(documentsTable)
      .where(and(eq(documentsTable.id, documentId), eq(documentsTable.syndicateId, syndicateId))).limit(1)]);

  if (objectPath)
    checks.push(["objectPath", () => db.select({ id: storageObjectsTable.id }).from(storageObjectsTable)
      .where(and(eq(storageObjectsTable.objectPath, objectPath), eq(storageObjectsTable.syndicateId, syndicateId))).limit(1)]);

  const results = await Promise.all(checks.map(([, run]) => run()));
  const index = results.findIndex((rows) => rows.length === 0);
  return index === -1 ? null : checks[index][0];
}

/**
 * Resolves the platform account (users.id) of the person a document concerns,
 * from a member reference (members.id or users.id) or a lot (its owner).
 * Returns null when there is no such account in the syndicate.
 */
export async function resolveDocumentSubject(
  syndicateId: string | null,
  ref: { memberId?: string | null; lotId?: string | null },
): Promise<string | null> {
  if (!syndicateId) return null;
  let memberId = ref.memberId ?? null;
  if (!memberId && ref.lotId) {
    const [lot] = await db
      .select({ ownerId: lotsTable.ownerId })
      .from(lotsTable)
      .innerJoin(buildingsTable, eq(buildingsTable.id, lotsTable.buildingId))
      .where(and(eq(lotsTable.id, ref.lotId), eq(buildingsTable.syndicateId, syndicateId)))
      .limit(1);
    memberId = lot?.ownerId ?? null;
  }
  if (!memberId) return null;
  const [direct] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, memberId), eq(usersTable.syndicateId, syndicateId)))
    .limit(1);
  if (direct) return direct.id;
  const [viaMember] = await db
    .select({ id: usersTable.id })
    .from(membersTable)
    .innerJoin(usersTable, eq(usersTable.email, membersTable.email))
    .where(
      and(
        eq(membersTable.id, memberId),
        eq(membersTable.syndicateId, syndicateId),
        eq(usersTable.syndicateId, syndicateId),
      ),
    )
    .limit(1);
  return viaMember?.id ?? null;
}

/**
 * Document visibility for residents (member / tenant): published only,
 * general documents or personal documents about themselves, and — for
 * tenants — lease-related categories only. Management roles are unaffected.
 */
export function canResidentSeeDocument(
  user: JwtPayload,
  doc: { status: string | null; subjectUserId: string | null; category: string },
): boolean {
  if (user.role !== "member" && user.role !== "tenant") return true;
  if (doc.status !== "published") return false;
  if (doc.subjectUserId && doc.subjectUserId !== user.userId) return false;
  if (user.role === "tenant" && !["bail", "reglement", "reglement_interieur"].includes(doc.category)) {
    return false;
  }
  return true;
}

/** SQL form of canResidentSeeDocument's subject rule, for list queries. */
export function residentDocumentSubjectWhere(user: JwtPayload) {
  return or(isNull(documentsTable.subjectUserId), eq(documentsTable.subjectUserId, user.userId));
}

/**
 * Throws a 403-friendly error when the user has no access to the given buildingId.
 * Call this after loading a resource and before returning or mutating it.
 *
 * Returns the building row (already fetched inside) so callers can use syndicateId etc.
 */
export async function assertUserCanAccessBuilding(
  user: JwtPayload,
  buildingId: string,
): Promise<void> {
  if (user.role === "super_admin") return; // unrestricted

  if (isSyndicateTeamRole(user.role)) {
    if (!user.syndicateId) {
      const err: any = new Error("Syndicat non défini dans le token");
      err.status = 403;
      throw err;
    }
    const [building] = await db
      .select({ syndicateId: buildingsTable.syndicateId })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, buildingId));
    if (!building || building.syndicateId !== user.syndicateId) {
      const err: any = new Error("Accès refusé");
      err.status = 403;
      throw err;
    }
    return;
  }

  // member / tenant: verify via linked lots / tenancy
  const allowedIds = await getUserBuildingIds(user);
  if (!allowedIds.includes(buildingId)) {
    const err: any = new Error("Accès refusé");
    err.status = 403;
    throw err;
  }
}
