import { z } from "zod";
import { db } from "@workspace/db";
import {
  lotsTable,
  buildingsTable,
  membersTable,
  appelsDeFondsTable,
  lotOwnershipsTable,
} from "@workspace/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { FinanceError, fromCents, toCents, uniqueViolation } from "../../lib/treasury.js";
import { syncMainOwner, todayIso } from "../../lib/units.js";
import { createLotSchema } from "./lots.validation.js";

/** Loads a lot of the scoped syndicate (404 for anything else — no existence leak). */
export async function loadScopedLot(lotId: string, syndicateId: string, forUpdate?: Pick<typeof db, "select">) {
  const executor = forUpdate ?? db;
  const query = executor
    .select({ lot: lotsTable, syndicateId: buildingsTable.syndicateId, buildingName: buildingsTable.name })
    .from(lotsTable)
    .innerJoin(buildingsTable, eq(buildingsTable.id, lotsTable.buildingId))
    .where(and(eq(lotsTable.id, lotId), eq(buildingsTable.syndicateId, syndicateId)));
  const [row] = forUpdate ? await (query as any).for("update", { of: lotsTable }) : await query;
  if (!row) throw new FinanceError(404, "LOT_NOT_FOUND", "Lot introuvable");
  return row as { lot: typeof lotsTable.$inferSelect; syndicateId: string; buildingName: string };
}

export async function assertBuildingOfSyndicate(buildingId: string, syndicateId: string) {
  const [b] = await db
    .select({ id: buildingsTable.id })
    .from(buildingsTable)
    .where(and(eq(buildingsTable.id, buildingId), eq(buildingsTable.syndicateId, syndicateId)));
  if (!b) throw new FinanceError(404, "BUILDING_NOT_FOUND", "Immeuble introuvable dans ce syndicat");
}

/** Outstanding amount of a lot's calls, by debtor (owner at issue time). */
export async function outstandingOf(lotId: string) {
  const rows = await db
    .select({
      ownerId: appelsDeFondsTable.ownerId,
      ownerName: membersTable.name,
      due: sql<string>`SUM(${appelsDeFondsTable.amount} - ${appelsDeFondsTable.amountPaid})`,
      underReview: sql<number>`COUNT(*) FILTER (WHERE ${appelsDeFondsTable.status} = 'pending_validation')::int`,
    })
    .from(appelsDeFondsTable)
    .leftJoin(membersTable, eq(membersTable.id, appelsDeFondsTable.ownerId))
    .where(
      and(
        eq(appelsDeFondsTable.lotId, lotId),
        sql`${appelsDeFondsTable.status} NOT IN ('paid', 'cancelled')`,
      ),
    )
    .groupBy(appelsDeFondsTable.ownerId, membersTable.name);
  const byDebtor = rows
    .map((r) => ({ memberId: r.ownerId, name: r.ownerName, due: fromCents(toCents(r.due)) }))
    .filter((r) => toCents(r.due) > 0);
  return {
    total: fromCents(byDebtor.reduce((s, r) => s + toCents(r.due), 0)),
    underReview: rows.reduce((s, r) => s + (r.underReview ?? 0), 0),
    byDebtor,
  };
}

export function firstIssue(err: z.ZodError) {
  const i = err.issues[0];
  return { error: i?.message ?? "Données invalides", field: i?.path?.join("."), code: "INVALID_LOT" };
}

export async function assertMembersOfSyndicate(memberIds: string[], syndicateId: string) {
  if (memberIds.length === 0) return;
  const rows = await db
    .select({ id: membersTable.id })
    .from(membersTable)
    .where(and(inArray(membersTable.id, memberIds), eq(membersTable.syndicateId, syndicateId)));
  if (rows.length !== new Set(memberIds).size) {
    throw new FinanceError(400, "FOREIGN_REFERENCE", "Propriétaire introuvable dans ce syndicat");
  }
}

export function referenceConflict(err: unknown): never {
  if (uniqueViolation(err)?.includes("lots_building_number")) {
    throw new FinanceError(409, "LOT_REFERENCE_EXISTS", "Un lot actif porte déjà cette référence dans cet immeuble");
  }
  throw err;
}

export async function insertLot(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: z.infer<typeof createLotSchema>,
  syndicateId: string,
  userId: string,
) {
  const owners = input.owners ?? (input.ownerId ? [{ memberId: input.ownerId, sharePercent: 10000 }] : []);
  // Serialize creations in a building: the reference check and the insert
  // cannot interleave (the unique index is the final guard).
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"lots:" + input.buildingId}))`);
  let lot;
  try {
    [lot] = await tx
      .insert(lotsTable)
      .values({
        number: input.number,
        type: input.type,
        floor: input.floor ?? null,
        surfaceM2: input.surfaceM2 != null ? input.surfaceM2.toFixed(2) : null,
        surfaceCadastrale: input.surfaceCadastrale != null ? input.surfaceCadastrale.toFixed(2) : null,
        titreFoncier: input.titreFoncier ?? null,
        tantiemes: input.tantiemes,
        buildingId: input.buildingId,
        status: input.status ?? (owners.length ? "occupied" : "vacant"),
        description: input.description ?? null,
        updatedAt: new Date(),
      })
      .returning();
  } catch (err) {
    referenceConflict(err);
  }
  if (owners.length) {
    await tx.insert(lotOwnershipsTable).values(
      owners.map((o) => ({
        syndicateId,
        lotId: lot.id,
        memberId: o.memberId,
        sharePercent: fromCents(o.sharePercent),
        startDate: input.ownershipStartDate ?? todayIso(),
        createdBy: userId,
      })),
    );
    await syncMainOwner(tx, lot.id);
  }
  await tx
    .update(buildingsTable)
    .set({ totalLots: sql`${buildingsTable.totalLots} + 1` })
    .where(eq(buildingsTable.id, input.buildingId));
  const [fresh] = await tx.select().from(lotsTable).where(eq(lotsTable.id, lot.id));
  return fresh;
}
