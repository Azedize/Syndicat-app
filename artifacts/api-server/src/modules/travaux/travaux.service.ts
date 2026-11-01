import { db } from "@workspace/db";
import { travauxTable, prestatairesTable, buildingsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

export async function getScopedTravail(id: string, syndicateId: string) {
  const [row] = await db
    .select({ travail: travauxTable })
    .from(travauxTable)
    .innerJoin(buildingsTable, eq(travauxTable.buildingId, buildingsTable.id))
    .where(
      and(
        eq(travauxTable.id, id),
        eq(buildingsTable.syndicateId, syndicateId),
      ),
    )
    .limit(1);
  return row?.travail;
}

export async function assertPrestataireMatchesBuilding(
  prestataireId: string,
  buildingId: string,
): Promise<void> {
  const [[prestataire], [building]] = await Promise.all([
    db
      .select({
        buildingId: prestatairesTable.buildingId,
        syndicateId: prestatairesTable.syndicateId,
      })
      .from(prestatairesTable)
      .where(eq(prestatairesTable.id, prestataireId))
      .limit(1),
    db
      .select({ syndicateId: buildingsTable.syndicateId })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, buildingId))
      .limit(1),
  ]);

  if (!building) {
    throw Object.assign(new Error("Immeuble introuvable"), { status: 400 });
  }
  if (!prestataire) {
    throw Object.assign(new Error("Prestataire introuvable"), { status: 400 });
  }
  if (prestataire.buildingId && prestataire.buildingId !== buildingId) {
    throw Object.assign(
      new Error("Le prestataire ne correspond pas à l'immeuble sélectionné"),
      { status: 400 },
    );
  }
  if (prestataire.syndicateId && prestataire.syndicateId !== building.syndicateId) {
    throw Object.assign(
      new Error("Le prestataire n'appartient pas au syndicat de l'immeuble"),
      { status: 400 },
    );
  }
}
