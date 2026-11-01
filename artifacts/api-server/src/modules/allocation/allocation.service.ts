import { z } from "zod";
import { db } from "@workspace/db";
import {
  allocationKeyVersionsTable,
  allocationKeysTable,
  allocationSourcesTable,
  allocationsTable,
  buildingsTable,
  allocationsTable as callsTable,
} from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { notifyUser } from "../../lib/notify.js";
import { FinanceError } from "../../lib/treasury.js";
import {
  buildingLots,
  computeAllocation,
  loadSources,
  validateKey,
  type KeyVersionData,
  type SourceRequest,
} from "../../lib/allocation.js";
import { addDays, isPastDue, localToday, APP_TIMEZONE } from "../../lib/charge-time.js";
import { resolveOwnerUserId } from "../../modules/budget/budget.service.js";
import { versionSchema, runSchema } from "./allocation.validation.js";

export async function assertBuilding(buildingId: string, sid: string) {
  const [b] = await db.select({ id: buildingsTable.id }).from(buildingsTable).where(and(eq(buildingsTable.id, buildingId), eq(buildingsTable.syndicateId, sid)));
  if (!b) throw new FinanceError(404, "BUILDING_NOT_FOUND", "Immeuble introuvable dans cette copropriété");
}

/** Validates a version body against the building, returns its rows and the issues. */
export async function checkVersion(buildingId: string, body: z.infer<typeof versionSchema>, code: string, version: number) {
  const shares = body.shares.map((s) => ({
    lotId: s.lotId,
    coefficient: s.excluded ? null : body.method === "equal" ? (s.coefficient ?? "1") : (s.coefficient ?? null),
    excluded: s.excluded,
    exclusionReason: s.excluded ? (s.exclusionReason ?? null) : null,
  }));
  const key: KeyVersionData = { keyId: null, code, name: code, versionId: null, version, method: body.method, categories: body.categories, effectiveFrom: body.effectiveFrom, effectiveTo: null, sourceReference: body.sourceReference, shares };
  const v = validateKey(key, await buildingLots(buildingId));
  return { shares, ...v };
}

/** Another active key of the building covering one of these categories from that date. */
export async function categoryConflict(buildingId: string, categories: string[], from: string, exceptKeyId?: string) {
  const rows = await db
    .select({ code: allocationKeysTable.code, keyId: allocationKeysTable.id, categories: allocationKeyVersionsTable.categories, to: allocationKeyVersionsTable.effectiveTo })
    .from(allocationKeyVersionsTable)
    .innerJoin(allocationKeysTable, eq(allocationKeysTable.id, allocationKeyVersionsTable.keyId))
    .where(and(eq(allocationKeysTable.buildingId, buildingId), eq(allocationKeysTable.status, "active")));
  return rows.find((r) => r.keyId !== exceptKeyId && (!r.to || r.to >= from) && r.categories.some((c) => categories.includes(c)));
}

/** Sources already allocated (by another standing allocation) are errors in the preview. */
export async function alreadyAllocated(c: Awaited<ReturnType<typeof computeAllocation>>, period: string, chargeType: string, ignoreAllocationId?: string) {
  const issues = [];
  for (const r of c.results) {
    const [s] = await db
      .select({ ref: allocationsTable.reference, allocationId: allocationsTable.id })
      .from(allocationSourcesTable)
      .innerJoin(allocationsTable, eq(allocationsTable.id, allocationSourcesTable.allocationId))
      .where(and(eq(allocationSourcesTable.sourceType, r.source.type), eq(allocationSourcesTable.sourceId, r.source.id), eq(allocationSourcesTable.period, r.source.type === "expense" ? "-" : period), eq(allocationSourcesTable.chargeType, chargeType), eq(allocationSourcesTable.active, true)));
    if (s && s.allocationId !== ignoreAllocationId) issues.push({ code: "SOURCE_ALREADY_ALLOCATED", sourceId: r.source.id, message: `« ${r.source.label} » est déjà réparti (${s.ref})` });
  }
  return issues;
}

export async function compute(sid: string, d: z.infer<typeof runSchema>, ignoreAllocationId?: string) {
  await assertBuilding(d.buildingId, sid);
  const { sources, errors } = await loadSources(sid, d.buildingId, d.period, d.sources as SourceRequest[]);
  const c = await computeAllocation(d.buildingId, d.period, sources, errors);
  const dup = await alreadyAllocated(c, d.period, d.chargeType, ignoreAllocationId);
  // Dates of the obligations (condominium time zone): due date not passed.
  const issueDate = d.issueDate ?? localToday();
  const dueDate = d.dueDate ?? addDays(issueDate, 30);
  const dateErrors = [];
  if (dueDate < issueDate) dateErrors.push({ code: "INVALID_DATES", message: `L'échéance (${dueDate}) précède la date d'émission (${issueDate})` });
  if (isPastDue(dueDate)) dateErrors.push({ code: "DUE_DATE_PASSED", message: `L'échéance du ${dueDate} est déjà passée (${APP_TIMEZONE}) : les obligations seraient en retard dès leur émission` });
  const archived = (await buildingLots(d.buildingId)).filter((l) => l.archivedAt);
  for (const l of archived) c.warnings.push({ code: "INACTIVE_UNIT", lotId: l.id, lotNumber: l.number, message: `Lot ${l.number} archivé : il ne reçoit pas d'obligation` });
  if (dup.length || dateErrors.length) {
    c.errors.push(...dup, ...dateErrors);
    c.valid = false;
  }
  return Object.assign(c, { issueDate, dueDate });
}

export async function notifyDebtors(appels: { ownerId: string | null; amount: string; dueDate: string | null; period: string }[], syndicateId: string) {
  for (const a of appels) {
    const uid = await resolveOwnerUserId(db, a.ownerId, syndicateId);
    await notifyUser(uid, { key: "fundsCall.new", params: { period: a.period, amount: a.amount, dueDate: a.dueDate }, type: "info", syndicateId });
  }
}

/** Sources of a finalized allocation, as they were requested (for its correction). */
export function requestsOf(inputs: any): SourceRequest[] {
  return (inputs?.sources ?? []).map((s: any) => {
    const keyId = s.key?.keyId ?? undefined;
    if (s.type === "budget_total") {
      const [budgetId, part] = String(s.id).split(":");
      return { type: "budget_total", budgetId, part, keyId };
    }
    return { type: s.type, id: s.id, keyId };
  });
}

export async function loadDraft(id: string, sid: string) {
  const [a] = await db.select().from(callsTable).where(and(eq(callsTable.id, id), eq(callsTable.syndicateId, sid)));
  if (!a) throw new FinanceError(404, "ALLOCATION_NOT_FOUND", "Appel de fonds introuvable");
  if (a.status !== "draft") throw new FinanceError(409, "NOT_A_DRAFT", "Cet appel de fonds est déjà publié : utilisez la correction ou l'annulation");
  return a;
}
