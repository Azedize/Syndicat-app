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
import { addDays, localToday } from "./charge-time.js";

/**
 * Persists a validated calculation (a funds call).
 *
 *   draft    the call and its lines are saved, NO obligation is created and
 *            its sources stay free; it can be edited, deleted or published.
 *   publish  the call is finalized and its obligations (appels_de_fonds, one
 *            per lot: amount, issue date, due date, debtors at issue time)
 *            are created in the same transaction. If any obligation already
 *            exists for a lot (same period and type) or a source is already
 *            allocated, nothing is written.
 *
 * `draftId` publishes (or rewrites) an existing draft instead of a new call.
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
    issueDate?: string | null;
    dueDate?: string | null;
    mode?: "publish" | "draft";
    draftId?: string | null;
  },
) {
  const c = input.computation;
  const mode = input.mode ?? "publish";
  if (!c.valid) throw new FinanceError(422, "ALLOCATION_INVALID", "Calcul invalide : corrigez les erreurs avant de confirmer");
  const issueDate = input.issueDate ?? localToday();
  const dueDate = input.dueDate ?? addDays(issueDate, 30);
  if (dueDate < issueDate) throw new FinanceError(400, "INVALID_DATES", "L'échéance précède la date d'émission");
  const header = {
    totalAmount: money(c.totals.allocated),
    inputs: c.inputs as any,
    inputsHash: c.inputsHash,
    issueDate,
    dueDate,
    status: mode === "draft" ? "draft" : "finalized",
    publishedAt: mode === "publish" ? new Date() : null,
    publishedBy: mode === "publish" ? input.userId : null,
  };
  let allocation: typeof allocationsTable.$inferSelect;
  if (input.draftId) {
    const [d] = await tx.select().from(allocationsTable).where(and(eq(allocationsTable.id, input.draftId), eq(allocationsTable.syndicateId, input.syndicateId))).for("update");
    if (!d) throw new FinanceError(404, "ALLOCATION_NOT_FOUND", "Appel de fonds introuvable");
    if (d.status !== "draft") throw new FinanceError(409, "NOT_A_DRAFT", "Cet appel de fonds est déjà publié");
    await tx.delete(allocationLinesTable).where(eq(allocationLinesTable.allocationId, d.id));
    await tx.delete(allocationSourcesTable).where(eq(allocationSourcesTable.allocationId, d.id));
    [allocation] = await tx.update(allocationsTable).set(header).where(eq(allocationsTable.id, d.id)).returning();
  } else {
    const reference = await nextSequenceNumber(tx, input.syndicateId, "ALC", 6);
    try {
      [allocation] = await tx
        .insert(allocationsTable)
        .values({
          ...header,
          syndicateId: input.syndicateId,
          buildingId: input.buildingId,
          reference,
          period: input.period,
          chargeType: input.chargeType,
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
          // A draft does not reserve its sources.
          active: mode === "publish",
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
  if (mode === "draft") return { allocation, appels: [] as (typeof appelsDeFondsTable.$inferSelect)[] };

  const budgetIds = [...new Set(c.results.map((r) => r.source.budgetId).filter(Boolean))];
  const lotsToCall = c.perLot.filter((l) => l.amountCents > 0n);
  const owners = await currentOwnersOf(lotsToCall.map((l) => l.lotId));
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
            originalAmount: money(l.amountCents),
            issueDate,
            dueDate,
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
  if (a.status === "draft") throw new FinanceError(409, "ALLOCATION_IS_DRAFT", "Un brouillon se modifie ou se supprime ; il n'a rien à annuler");
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
