import { db } from "@workspace/db";
import { buildingsTable, lotsTable, usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { isSyndicateTeamRole } from "../../middleware/auth.js";
import type { JwtPayload } from "../../middleware/auth.js";
import { getUserBuildingIds } from "../../lib/scope.js";

// ─── Access-control helpers ──────────────────────────────────────────────────
/** Returns the set of building IDs the authenticated user is allowed to act on. */
export async function getScopedBuildingIds(user: JwtPayload): Promise<string[]> {
  if (user.role === "super_admin") return []; // empty = "all"
  if (isSyndicateTeamRole(user.role)) {
    if (!user.syndicateId) {
      throw Object.assign(new Error("Syndicat non défini dans le token"), {
        status: 403,
      });
    }
    const bldgs = await db
      .select({ id: buildingsTable.id })
      .from(buildingsTable)
      .where(eq(buildingsTable.syndicateId, user.syndicateId));
    return bldgs.map((b) => b.id);
  }
  return getUserBuildingIds(user);
}

/**
 * Asserts that the requesting user is allowed to act on the given buildingId.
 * Returns the permitted building IDs for query scoping (empty = super_admin / unconstrained).
 * Throws with `{ status, error }` when access is denied.
 */
export async function assertBuildingAccess(
  user: JwtPayload,
  buildingId: string,
): Promise<void> {
  if (user.role === "super_admin") return; // super_admin can see everything
  const allowed = await getScopedBuildingIds(user);
  if (!allowed.includes(buildingId)) {
    const err: any = new Error("Accès refusé à cet immeuble");
    err.status = 403;
    throw err;
  }
}

export async function assertLotMatchesBuilding(
  lotId: string,
  buildingId: string,
): Promise<void> {
  const [lot] = await db
    .select({ buildingId: lotsTable.buildingId })
    .from(lotsTable)
    .where(eq(lotsTable.id, lotId))
    .limit(1);
  if (!lot) {
    throw Object.assign(new Error("Lot introuvable"), { status: 400 });
  }
  if (lot.buildingId !== buildingId) {
    throw Object.assign(new Error("Le lot n'appartient pas à cet immeuble"), {
      status: 400,
    });
  }
}

export async function getSyndicateAdminIds(syndicateId: string): Promise<string[]> {
  const admins = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.syndicateId, syndicateId),
        eq(usersTable.role, "syndicate_admin"),
      ),
    );
  return admins.map((a) => a.id);
}
