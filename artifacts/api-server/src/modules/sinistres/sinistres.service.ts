import { db } from "@workspace/db";
import { sinistresTable, buildingsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

export async function getScopedClaim(id: string, syndicateId: string) {
  const [row] = await db
    .select({ sinistre: sinistresTable })
    .from(sinistresTable)
    .innerJoin(buildingsTable, eq(sinistresTable.buildingId, buildingsTable.id))
    .where(
      and(
        eq(sinistresTable.id, id),
        eq(buildingsTable.syndicateId, syndicateId),
      ),
    )
    .limit(1);
  return row?.sinistre;
}
