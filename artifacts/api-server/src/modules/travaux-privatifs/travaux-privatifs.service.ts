import { db } from "@workspace/db";
import { travauxPrivatifsTable, buildingsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { assertUserCanAccessBuilding } from "../../lib/scope.js";

// Helper: load a row through its authoritative building syndicate scope.
export async function loadAndScope(id: string, user: any, syndicateId?: string) {
  if (syndicateId) {
    const [scoped] = await db
      .select({ row: travauxPrivatifsTable })
      .from(travauxPrivatifsTable)
      .innerJoin(
        buildingsTable,
        eq(travauxPrivatifsTable.buildingId, buildingsTable.id),
      )
      .where(
        and(
          eq(travauxPrivatifsTable.id, id),
          eq(buildingsTable.syndicateId, syndicateId),
        ),
      )
      .limit(1);
    return scoped?.row ?? null;
  }

  const [row] = await db
    .select()
    .from(travauxPrivatifsTable)
    .where(eq(travauxPrivatifsTable.id, id));
  if (!row) return null;
  // Re-validate via building — works for super_admin, syndicate_admin, member, tenant.
  await assertUserCanAccessBuilding(user, row.buildingId);
  return row;
}
