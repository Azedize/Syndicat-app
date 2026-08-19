import { db } from "@workspace/db";
import { lotsTable, membersTable, tenantsTable, buildingsTable } from "@workspace/db/schema";
import { eq, and, or, inArray } from "drizzle-orm";
import { isSyndicateTeamRole, type JwtPayload } from "../middleware/auth.js";

/**
 * Returns the list of building IDs a "member" or "tenant" user is linked to,
 * so provider/intervention data can be scoped to only what's relevant to them.
 * ownerId on lots can store either usersTable.id or membersTable.id depending
 * on how the row was created, so both are checked (see lots.ts /my-lot).
 */
export async function getUserBuildingIds(user: JwtPayload): Promise<string[]> {
  if (user.role === "tenant") {
    const rows = await db
      .select({ buildingId: tenantsTable.buildingId })
      .from(tenantsTable)
      .where(
        and(
          or(eq(tenantsTable.id, user.userId), eq(tenantsTable.email, user.email)),
          user.syndicateId
            ? eq(tenantsTable.syndicateId, user.syndicateId)
            : undefined,
        ),
      );
    return [...new Set(rows.map((r) => r.buildingId).filter((v): v is string => !!v))];
  }

  if (user.role === "member") {
    const [member] = await db
      .select({ id: membersTable.id })
      .from(membersTable)
      .where(
        and(
          eq(membersTable.email, user.email),
          user.syndicateId
            ? eq(membersTable.syndicateId, user.syndicateId)
            : undefined,
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
          user.syndicateId
            ? eq(buildingsTable.syndicateId, user.syndicateId)
            : undefined,
        ),
      );
    return [...new Set(rows.map((r) => r.buildingId).filter((v): v is string => !!v))];
  }

  return [];
}

/** Returns the exact lots owned/occupied by a member or tenant. */
export async function getUserLotIds(user: JwtPayload): Promise<string[]> {
  if (user.role === "tenant") {
    const rows = await db
      .select({ lotId: tenantsTable.lotId })
      .from(tenantsTable)
      .where(
        and(
          or(eq(tenantsTable.id, user.userId), eq(tenantsTable.email, user.email)),
          user.syndicateId
            ? eq(tenantsTable.syndicateId, user.syndicateId)
            : undefined,
        ),
      );
    return [...new Set(rows.map((r) => r.lotId).filter((v): v is string => !!v))];
  }

  if (user.role === "member") {
    const [member] = await db
      .select({ id: membersTable.id })
      .from(membersTable)
      .where(
        and(
          eq(membersTable.email, user.email),
          user.syndicateId
            ? eq(membersTable.syndicateId, user.syndicateId)
            : undefined,
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
          user.syndicateId
            ? eq(buildingsTable.syndicateId, user.syndicateId)
            : undefined,
        ),
      );
    return rows.map((r) => r.id);
  }

  return [];
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
