import {
  allocationLinesTable,
  allocationSourcesTable,
  allocationsTable,
  appelPaymentsTable,
  appelsDeFondsTable,
  lotsTable,
} from "@workspace/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { nextSequenceNumber } from "./sequences.js";
import { currentOwnersOf } from "./units.js";
import { FinanceError, uniqueViolation, type Tx } from "./treasury.js";
import { money, type Computation } from "./allocation.js";

/**
 * Persists a validated calculation and issues its calls for funds through the
 * existing table (one call per lot, period and type; debtors = co-owners at
 * issue time). Everything is one transaction: if any call already exists for
 * a lot, or a source is already allocated, nothing is written.
 */
export async function finalizeAllocation(
  tx: Tx,
  input: {
    syndicateId: string;
    buildingId: string;
    period: string;
    chargeType: string;
    computation: Computation;
    userId: string;
    idempotencyKey?: string | null;
    correctionOf?: string | null;
    correctionReason?: string | null;
    dueDate?: string | null;
  },
) {
  const c = input.computation;
  if (!c.valid) throw new FinanceError(422, "ALLOCATION_INVALID", "Calcul invalide : corrigez les erreurs avant de confirmer");
  const reference = await nextSequenceNumber(tx, input.syndicateId, "ALC", 6);
  let allocation: typeof allocationsTable.$inferSelect;
  try {
    [allocation] = await tx
      .insert(allocationsTable)
      .values({
        syndicateId: input.syndicateId,
        buildingId: input.buildingId,
        reference,
        period: input.period,
        chargeType: input.chargeType,
        totalAmount: money(c.totals.allocated),
        inputs: c.inputs as any,
        inputsHash: c.inputsHash,
        idempotencyKey: input.idempotencyKey ?? null,
        correctionOf: input.correctionOf ?? null,
        correctionReason: input.correctionReason ?? null,
        createdBy: input.userId,
      })
      .returning();
  } catch (err) {
    if (uniqueViolation(err)?.includes("idempotency")) throw new FinanceError(409, "IDEMPOTENCY_CONFLICT", "Confirmation déjà en cours");
    throw err;
  }
  const lineRows: (typeof allocationLinesTable.$inferInsert)[] = [];
  for (const r of c.results) {
    let source: typeof allocationSourcesTable.$inferSelect;
    try {
      [source] = await tx
        .insert(allocationSourcesTable)
        .values({
          allocationId: allocation.id,
          sourceType: r.source.type,
          sourceId: r.source.id,
          // An expense is allocated once whatever the period; a budget part once per period.
          period: r.source.type === "expense" ? "-" : input.period,
          chargeType: input.chargeType,
          label: r.source.label,
          category: r.source.category,
          amount: money(r.source.amountCents),
          keyVersionId: r.source.key?.versionId ?? null,
        })
        .returning();
    } catch (err) {
      if (uniqueViolation(err) !== null) throw new FinanceError(409, "SOURCE_ALREADY_ALLOCATED", `« ${r.source.label} » est déjà réparti${r.source.type === "expense" ? "" : ` pour ${input.period}`} : corrigez la répartition existante`);
      throw err;
    }
    for (const l of r.lines) {
      lineRows.push({
        allocationId: allocation.id,
        sourceId: source.id,
        lotId: l.lotId,
        coefficient: l.coefficient,
        denominator: l.denominator,
        amount: money(l.amountCents),
        roundingAdjustment: money(l.adjustmentCents),
        explanation: l.explanation,
      });
    }
  }
  if (lineRows.length) await tx.insert(allocationLinesTable).values(lineRows);

  const budgetIds = [...new Set(c.results.map((r) => r.source.budgetId).filter(Boolean))];
  const lotsToCall = c.perLot.filter((l) => l.amountCents > 0n);
  const owners = await currentOwnersOf(lotsToCall.map((l) => l.lotId));
  const due = input.dueDate ?? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const lotRows = lotsToCall.length ? await tx.select({ id: lotsTable.id, ownerId: lotsTable.ownerId }).from(lotsTable).where(inArray(lotsTable.id, lotsToCall.map((l) => l.lotId))) : [];
  let appels: (typeof appelsDeFondsTable.$inferSelect)[] = [];
  if (lotsToCall.length) {
    try {
      appels = await tx
        .insert(appelsDeFondsTable)
        .values(
          lotsToCall.map((l) => ({
            buildingId: input.buildingId,
            budgetId: budgetIds.length === 1 ? (budgetIds[0] as string) : null,
            lotId: l.lotId,
            ownerId: lotRows.find((r) => r.id === l.lotId)?.ownerId ?? null,
            debtorMemberIds: (owners.get(l.lotId) ?? []).map((o) => o.memberId),
            period: input.period,
            type: input.chargeType,
            amount: money(l.amountCents),
            dueDate: due,
            status: "pending",
            allocationId: allocation.id,
          })),
        )
        .returning();
    } catch (err) {
      if (uniqueViolation(err)?.includes("appels_lot_period_type")) {
        throw new FinanceError(409, "APPELS_ALREADY_GENERATED", `Des appels de fonds ${input.chargeType} existent déjà pour ${input.period} sur un ou plusieurs lots : corrigez la répartition existante`);
      }
      throw err;
    }
  }
  return { allocation, appels };
}

/**
 * Ends an allocation (correction or reversal). Its rows stay as they are; its
 * calls for funds are cancelled — only possible while nothing was paid or
 * declared on them (a paid call must be handled by a reversal of the payment
 * first). The sources become free for the replacing allocation.
 */
export async function endAllocation(tx: Tx, input: { syndicateId: string; allocationId: string; status: "corrected" | "reversed"; reason: string; userId: string }) {
  const [a] = await tx
    .select()
    .from(allocationsTable)
    .where(and(eq(allocationsTable.id, input.allocationId), eq(allocationsTable.syndicateId, input.syndicateId)))
    .for("update");
  if (!a) throw new FinanceError(404, "ALLOCATION_NOT_FOUND", "Répartition introuvable");
  if (a.status !== "finalized") throw new FinanceError(409, "ALLOCATION_ENDED", `Cette répartition est déjà ${a.status === "corrected" ? "corrigée" : "annulée"}`);
  const appels = await tx.select().from(appelsDeFondsTable).where(eq(appelsDeFondsTable.allocationId, a.id)).for("update");
  const ids = appels.map((x) => x.id);
  const declared = ids.length ? await tx.select({ id: appelPaymentsTable.id }).from(appelPaymentsTable).where(and(inArray(appelPaymentsTable.appelId, ids), inArray(appelPaymentsTable.status, ["pending", "validated"]))).limit(1) : [];
  if (declared.length || appels.some((x) => Number(x.amountPaid) > 0 || x.status === "pending_validation")) {
    throw new FinanceError(409, "ALLOCATION_HAS_PAYMENTS", "Des paiements sont déclarés ou validés sur ces appels : traitez-les (extourne) avant de corriger la répartition");
  }
  if (ids.length) {
    await tx
      .update(appelsDeFondsTable)
      .set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: input.userId, cancellationReason: `${input.status === "corrected" ? "Correction" : "Annulation"} de la répartition ${a.reference} : ${input.reason}` })
      .where(inArray(appelsDeFondsTable.id, ids));
  }
  await tx.update(allocationSourcesTable).set({ active: false }).where(eq(allocationSourcesTable.allocationId, a.id));
  const [row] = await tx
    .update(allocationsTable)
    .set({ status: input.status, endedAt: new Date(), endedBy: input.userId, endReason: input.reason })
    .where(eq(allocationsTable.id, a.id))
    .returning();
  return { allocation: row, cancelledCalls: ids.length };
}
