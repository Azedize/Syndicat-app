import { db } from "@workspace/db";
import { lotsTable, membersTable, tenantsTable } from "@workspace/db/schema";
import { eq, or, inArray } from "drizzle-orm";
import type { JwtPayload } from "../middleware/auth.js";

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
        or(eq(tenantsTable.id, user.userId), eq(tenantsTable.email, user.email)),
      );
    return [...new Set(rows.map((r) => r.buildingId).filter((v): v is string => !!v))];
  }

  if (user.role === "member") {
    const [member] = await db
      .select({ id: membersTable.id })
      .from(membersTable)
      .where(eq(membersTable.email, user.email))
      .limit(1);

    const ownerIds = member ? [user.userId, member.id] : [user.userId];
    const rows = await db
      .select({ buildingId: lotsTable.buildingId })
      .from(lotsTable)
      .where(inArray(lotsTable.ownerId, ownerIds));
    return [...new Set(rows.map((r) => r.buildingId).filter((v): v is string => !!v))];
  }

  return [];
}
