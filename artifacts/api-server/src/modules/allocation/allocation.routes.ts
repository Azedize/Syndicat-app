import { Router, type Request } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  allocationKeySharesTable,
  allocationKeyVersionsTable,
  allocationKeysTable,
  allocationLinesTable,
  allocationSourcesTable,
  allocationsTable,
  appelsDeFondsTable,
  buildingsTable,
  lotsTable,
  allocationsTable as callsTable,
  appelAdjustmentsTable,
  appelPaymentsTable,
  appelRemindersTable,
  treasuryAccountsTable,
} from "@workspace/db/schema";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  sql,
} from "drizzle-orm";
import { requireAuth, type JwtPayload } from "../../middleware/auth.js";
import { serverAuditLog } from "../../lib/audit.js";
import { isDebtorOfCharge } from "../../lib/units.js";
import { FinanceError, sendFinanceError, uniqueViolation, moneyDiff } from "../../lib/treasury.js";
import { buildingLots, computationView, periodRange, validateKey } from "../../lib/allocation.js";
import { endAllocation, finalizeAllocation } from "../../lib/allocation-store.js";
import { isPastDue, APP_TIMEZONE } from "../../lib/charge-time.js";
import { adjustObligation, reconcileCall, reminderBlocker, sendManualReminder } from "../../lib/funds-calls.js";
import {
  assertBuilding,
  checkVersion,
  categoryConflict,
  compute,
  notifyDebtors,
  requestsOf,
  loadDraft,
} from "./allocation.service.js";
import {
  isoDate,
  CHARGE_TYPES,
  versionSchema,
  createKeySchema,
  sourceSchema,
  runSchema,
} from "./allocation.validation.js";

/**
 * Charge allocation: keys (syndic), preview and confirmation (finance team),
 * corrections and reversals (syndic), and the explanation of each call for
 * funds (its debtors and the team).
 */
const router = Router();

const READERS = new Set(["syndicate_admin", "treasurer", "president", "secretary", "committee_member"]);
const FINANCE = new Set(["syndicate_admin", "treasurer"]);
const KEY_ADMINS = new Set(["syndicate_admin"]);

function ctx(req: Request, roles: Set<string>, what: string): { user: JwtPayload; sid: string } {
  const user = req.user!;
  if (!user.syndicateId || user.role === "super_admin") throw new FinanceError(403, "FORBIDDEN", "Ouvrez une copropriété");
  if (!roles.has(user.role)) throw new FinanceError(403, "FORBIDDEN", what);
  return { user, sid: user.syndicateId };
}

function idemKey(req: Request): string | null {
  const raw = req.header("Idempotency-Key")?.trim();
  if (!raw) return null;
  if (!/^[A-Za-z0-9_\-:.]{8,100}$/.test(raw)) throw new FinanceError(400, "INVALID_IDEMPOTENCY_KEY", "En-tête Idempotency-Key invalide");
  return raw;
}

const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

// ─── Keys ─────────────────────────────────────────────────────────────────────

router.get("/allocation-keys", requireAuth, async (req, res) => {
  try {
    const { sid } = ctx(req, READERS, "Réservé à l'équipe");
    const buildingId = String(req.query.buildingId ?? "");
    if (buildingId) await assertBuilding(buildingId, sid);
    const keys = await db
      .select()
      .from(allocationKeysTable)
      .where(and(eq(allocationKeysTable.syndicateId, sid), ...(buildingId ? [eq(allocationKeysTable.buildingId, buildingId)] : [])))
      .orderBy(asc(allocationKeysTable.code));
    const versions = keys.length ? await db.select().from(allocationKeyVersionsTable).where(inArray(allocationKeyVersionsTable.keyId, keys.map((k) => k.id))).orderBy(asc(allocationKeyVersionsTable.version)) : [];
    res.json({ data: keys.map((k) => ({ ...k, versions: versions.filter((v) => v.keyId === k.id) })) });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

router.get("/allocation-keys/:id", requireAuth, async (req, res) => {
  try {
    const { sid } = ctx(req, READERS, "Réservé à l'équipe");
    const [k] = await db.select().from(allocationKeysTable).where(and(eq(allocationKeysTable.id, String(req.params.id)), eq(allocationKeysTable.syndicateId, sid)));
    if (!k) throw new FinanceError(404, "KEY_NOT_FOUND", "Clé introuvable");
    const versions = await db.select().from(allocationKeyVersionsTable).where(eq(allocationKeyVersionsTable.keyId, k.id)).orderBy(desc(allocationKeyVersionsTable.version));
    const shares = versions.length
      ? await db
          .select({ s: allocationKeySharesTable, number: lotsTable.number })
          .from(allocationKeySharesTable)
          .innerJoin(lotsTable, eq(lotsTable.id, allocationKeySharesTable.lotId))
          .where(inArray(allocationKeySharesTable.versionId, versions.map((v) => v.id)))
      : [];
    const lots = await buildingLots(k.buildingId);
    const current = versions[0];
    const check = current
      ? validateKey(
          { keyId: k.id, code: k.code, name: k.name, versionId: current.id, version: current.version, method: current.method as "shares", categories: current.categories, effectiveFrom: current.effectiveFrom, effectiveTo: current.effectiveTo, sourceReference: current.sourceReference, shares: shares.filter((s) => s.s.versionId === current.id).map((s) => s.s) },
          lots,
        )
      : null;
    res.json({
      data: {
        ...k,
        versions: versions.map((v) => ({ ...v, shares: shares.filter((s) => s.s.versionId === v.id).map((s) => ({ ...s.s, lotNumber: s.number })) })),
        // Current version checked against today's lots (new lot, archived lot…)
        validation: check,
      },
    });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

router.post("/allocation-keys", requireAuth, async (req, res) => {
  try {
    const { user, sid } = ctx(req, KEY_ADMINS, "Les clés de répartition sont définies par le syndic");
    const parsed = createKeySchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message, field: parsed.error.issues[0]?.path.join("."), code: "INVALID_KEY" });
    const d = parsed.data;
    await assertBuilding(d.buildingId, sid);
    const check = await checkVersion(d.buildingId, d, d.code, 1);
    if (check.errors.length) return void res.status(422).json({ error: check.errors[0].message, code: "KEY_INVALID", errors: check.errors, warnings: check.warnings });
    const conflict = await categoryConflict(d.buildingId, d.categories, d.effectiveFrom);
    if (conflict) throw new FinanceError(409, "KEY_CATEGORY_CONFLICT", `La clé ${conflict.code} couvre déjà une de ces catégories sur cette période`);
    const out = await db.transaction(async (tx) => {
      let key: typeof allocationKeysTable.$inferSelect;
      try {
        [key] = await tx.insert(allocationKeysTable).values({ syndicateId: sid, buildingId: d.buildingId, code: d.code.toUpperCase(), name: d.name, purpose: d.purpose ?? null, createdBy: user.userId }).returning();
      } catch (err) {
        if (uniqueViolation(err) !== null) throw new FinanceError(409, "KEY_CODE_EXISTS", `Le code ${d.code} existe déjà dans cet immeuble`);
        throw err;
      }
      const [version] = await tx
        .insert(allocationKeyVersionsTable)
        .values({ keyId: key.id, version: 1, method: d.method, categories: d.categories, effectiveFrom: d.effectiveFrom, sourceReference: d.sourceReference, createdBy: user.userId })
        .returning();
      await tx.insert(allocationKeySharesTable).values(check.shares.map((s) => ({ ...s, versionId: version.id })));
      return { key, version };
    });
    await serverAuditLog(req, { action: "ALLOCATION_KEY_CREATED", entity: "allocation_key", entityId: out.key.id, syndicateId: sid, details: `${out.key.code} v1 — ${d.method} — ${d.categories.join(",")} — dès ${d.effectiveFrom} — ${d.sourceReference}` });
    res.status(201).json({ data: out, warnings: check.warnings });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

/**
 * New version of a key from a date. Versions are never edited. If allocations
 * already finalized with the previous version cover periods from that date,
 * the change needs `acknowledgeFinalized` and those allocations are NOT
 * recalculated: they are listed for an explicit correction.
 */
router.post("/allocation-keys/:id/versions", requireAuth, async (req, res) => {
  try {
    const { user, sid } = ctx(req, KEY_ADMINS, "Les clés de répartition sont définies par le syndic");
    const parsed = versionSchema.extend({ changeReason: z.string().trim().min(5, "Indiquez la raison du changement").max(500), acknowledgeFinalized: z.boolean().default(false) }).strict().safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message, field: parsed.error.issues[0]?.path.join("."), code: "INVALID_KEY" });
    const d = parsed.data;
    const [k] = await db.select().from(allocationKeysTable).where(and(eq(allocationKeysTable.id, String(req.params.id)), eq(allocationKeysTable.syndicateId, sid)));
    if (!k) throw new FinanceError(404, "KEY_NOT_FOUND", "Clé introuvable");
    const [prev] = await db.select().from(allocationKeyVersionsTable).where(eq(allocationKeyVersionsTable.keyId, k.id)).orderBy(desc(allocationKeyVersionsTable.version)).limit(1);
    if (prev && d.effectiveFrom <= prev.effectiveFrom) {
      throw new FinanceError(400, "INVALID_EFFECTIVE_DATES", `La nouvelle version doit commencer après le ${prev.effectiveFrom} (début de la version ${prev.version})`);
    }
    const check = await checkVersion(k.buildingId, d, k.code, (prev?.version ?? 0) + 1);
    if (check.errors.length) return void res.status(422).json({ error: check.errors[0].message, code: "KEY_INVALID", errors: check.errors, warnings: check.warnings });
    const conflict = await categoryConflict(k.buildingId, d.categories, d.effectiveFrom, k.id);
    if (conflict) throw new FinanceError(409, "KEY_CATEGORY_CONFLICT", `La clé ${conflict.code} couvre déjà une de ces catégories sur cette période`);
    // Finalized allocations of the previous version whose period ends on or after the new start.
    const affected = prev
      ? ((await db.execute(sql`
          SELECT DISTINCT a.id, a.reference, a.period FROM allocations a JOIN allocation_sources s ON s.allocation_id = a.id
          WHERE s.key_version_id = ${prev.id} AND a.status = 'finalized'
        `)) as unknown as { id: string; reference: string; period: string }[]).filter((a) => (periodRange(a.period)?.end ?? "") >= d.effectiveFrom)
      : [];
    if (affected.length && !d.acknowledgeFinalized) {
      return void res.status(409).json({
        error: `${affected.length} répartition(s) finalisée(s) utilisent la version actuelle sur ces dates : elles ne seront pas recalculées. Confirmez, puis corrigez-les explicitement si nécessaire.`,
        code: "KEY_VERSION_IN_USE",
        affected,
      });
    }
    const version = await db.transaction(async (tx) => {
      if (prev) await tx.update(allocationKeyVersionsTable).set({ effectiveTo: dayBefore(d.effectiveFrom) }).where(eq(allocationKeyVersionsTable.id, prev.id));
      const [v] = await tx
        .insert(allocationKeyVersionsTable)
        .values({ keyId: k.id, version: (prev?.version ?? 0) + 1, method: d.method, categories: d.categories, effectiveFrom: d.effectiveFrom, sourceReference: d.sourceReference, changeReason: d.changeReason, createdBy: user.userId })
        .returning();
      await tx.insert(allocationKeySharesTable).values(check.shares.map((s) => ({ ...s, versionId: v.id })));
      return v;
    });
    await serverAuditLog(req, { action: "ALLOCATION_KEY_VERSIONED", entity: "allocation_key", entityId: k.id, syndicateId: sid, details: `${k.code} v${version.version} dès ${d.effectiveFrom} — ${d.changeReason}${affected.length ? ` — à corriger : ${affected.map((a) => a.reference).join(", ")}` : ""}` });
    res.status(201).json({ data: version, warnings: check.warnings, toCorrect: affected });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

router.post("/allocation-keys/:id/archive", requireAuth, async (req, res) => {
  try {
    const { sid } = ctx(req, KEY_ADMINS, "Réservé au syndic");
    const [row] = await db.update(allocationKeysTable).set({ status: "archived" }).where(and(eq(allocationKeysTable.id, String(req.params.id)), eq(allocationKeysTable.syndicateId, sid))).returning();
    if (!row) throw new FinanceError(404, "KEY_NOT_FOUND", "Clé introuvable");
    await serverAuditLog(req, { action: "ALLOCATION_KEY_ARCHIVED", entity: "allocation_key", entityId: row.id, syndicateId: sid, details: row.code });
    res.json({ data: row });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

// ─── Preview & confirmation ──────────────────────────────────────────────────

router.post("/allocations/preview", requireAuth, async (req, res) => {
  try {
    const { sid } = ctx(req, FINANCE, "Réservé au syndic et au trésorier");
    const parsed = runSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message, code: "INVALID_ALLOCATION" });
    const c = await compute(sid, parsed.data, typeof req.query.correctionOf === "string" ? req.query.correctionOf : undefined);
    res.json({ data: { ...computationView(c), issueDate: c.issueDate, dueDate: c.dueDate, timezone: APP_TIMEZONE } });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

router.post("/allocations", requireAuth, async (req, res) => {
  try {
    const { user, sid } = ctx(req, FINANCE, "Réservé au syndic et au trésorier");
    const parsed = runSchema.extend({ previewHash: z.string().length(64, "Prévisualisez avant de confirmer"), draft: z.boolean().default(false) }).strict().safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message, code: "INVALID_ALLOCATION" });
    const d = parsed.data;
    const key = idemKey(req);
    if (key) {
      const [done] = await db.select().from(allocationsTable).where(and(eq(allocationsTable.syndicateId, sid), eq(allocationsTable.idempotencyKey, key)));
      if (done) return void res.json({ data: done, replayed: true });
    }
    const c = await compute(sid, d);
    if (!c.valid) return void res.status(422).json({ error: c.errors[0]?.message ?? "Calcul invalide", code: "ALLOCATION_INVALID", errors: c.errors, preview: computationView(c) });
    // The confirmation must be exactly the calculation the user reviewed.
    if (c.inputsHash !== d.previewHash) {
      return void res.status(409).json({ error: "Les données ont changé depuis la prévisualisation : vérifiez le nouveau calcul", code: "PREVIEW_STALE", preview: computationView(c) });
    }
    let out;
    try {
      out = await db.transaction((tx) =>
        finalizeAllocation(tx, {
          syndicateId: sid,
          buildingId: d.buildingId,
          period: d.period,
          chargeType: d.chargeType,
          computation: c,
          userId: user.userId,
          idempotencyKey: key,
          issueDate: c.issueDate,
          dueDate: c.dueDate,
          mode: d.draft ? "draft" : "publish",
        }),
      );
    } catch (err) {
      if (key && err instanceof FinanceError && err.code === "IDEMPOTENCY_CONFLICT") {
        const [done] = await db.select().from(allocationsTable).where(and(eq(allocationsTable.syndicateId, sid), eq(allocationsTable.idempotencyKey, key)));
        if (done) return void res.json({ data: done, replayed: true });
      }
      throw err;
    }
    await serverAuditLog(req, { action: d.draft ? "FUNDS_CALL_DRAFTED" : "ALLOCATION_FINALIZED", entity: "allocation", entityId: out.allocation.id, syndicateId: sid, details: `${out.allocation.reference} — ${d.period} — ${d.chargeType} — ${out.allocation.totalAmount} — émis ${c.issueDate}, échéance ${c.dueDate} — ${out.appels.length} obligation(s)` });
    void notifyDebtors(out.appels, sid).catch(() => {});
    res.status(201).json({ data: out.allocation, calls: out.appels.length });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

router.get("/allocations", requireAuth, async (req, res) => {
  try {
    const { sid } = ctx(req, READERS, "Réservé à l'équipe");
    const rows = await db
      .select()
      .from(allocationsTable)
      .where(and(eq(allocationsTable.syndicateId, sid), ...(typeof req.query.buildingId === "string" ? [eq(allocationsTable.buildingId, req.query.buildingId)] : [])))
      .orderBy(desc(allocationsTable.createdAt))
      .limit(200);
    res.json({ data: rows.map((r) => ({ ...r, inputs: undefined })) });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

router.get("/allocations/:id", requireAuth, async (req, res) => {
  try {
    const { sid } = ctx(req, READERS, "Réservé à l'équipe");
    const [a] = await db.select().from(allocationsTable).where(and(eq(allocationsTable.id, String(req.params.id)), eq(allocationsTable.syndicateId, sid)));
    if (!a) throw new FinanceError(404, "ALLOCATION_NOT_FOUND", "Répartition introuvable");
    const [sources, lines, appels] = await Promise.all([
      db.select().from(allocationSourcesTable).where(eq(allocationSourcesTable.allocationId, a.id)),
      db.select({ l: allocationLinesTable, number: lotsTable.number }).from(allocationLinesTable).innerJoin(lotsTable, eq(lotsTable.id, allocationLinesTable.lotId)).where(eq(allocationLinesTable.allocationId, a.id)),
      db.select({ id: appelsDeFondsTable.id, lotId: appelsDeFondsTable.lotId, amount: appelsDeFondsTable.amount, amountPaid: appelsDeFondsTable.amountPaid, status: appelsDeFondsTable.status }).from(appelsDeFondsTable).where(eq(appelsDeFondsTable.allocationId, a.id)),
    ]);
    res.json({ data: { ...a, sources, lines: lines.map((x) => ({ ...x.l, lotNumber: x.number })), appels } });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

/**
 * Correction: the original stays (status corrected, reason kept, its calls
 * cancelled); a new allocation is computed with the rules in force now for
 * that period and replaces it. Same preview → confirm contract.
 */
router.post("/allocations/:id/correct", requireAuth, async (req, res) => {
  try {
    const { user, sid } = ctx(req, KEY_ADMINS, "Une correction est décidée par le syndic");
    const parsed = z
      .object({ reason: z.string().trim().min(5, "Indiquez la raison de la correction").max(500), previewHash: z.string().length(64).optional(), sources: z.array(sourceSchema).min(1).optional(), dueDate: isoDate.optional() })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message, code: "INVALID_CORRECTION" });
    const [orig] = await db.select().from(allocationsTable).where(and(eq(allocationsTable.id, String(req.params.id)), eq(allocationsTable.syndicateId, sid)));
    if (!orig) throw new FinanceError(404, "ALLOCATION_NOT_FOUND", "Répartition introuvable");
    if (orig.status !== "finalized") throw new FinanceError(409, "ALLOCATION_ENDED", "Cette répartition n'est plus en vigueur");
    const run = { buildingId: orig.buildingId, period: orig.period, chargeType: orig.chargeType as (typeof CHARGE_TYPES)[number], sources: (parsed.data.sources ?? requestsOf(orig.inputs)) as any, dueDate: parsed.data.dueDate ?? orig.dueDate ?? undefined };
    const c = await compute(sid, run, orig.id);
    const view = computationView(c);
    if (!parsed.data.previewHash) return void res.json({ data: { preview: view, original: { ...orig, inputs: undefined } } });
    if (!c.valid) return void res.status(422).json({ error: c.errors[0]?.message, code: "ALLOCATION_INVALID", errors: c.errors, preview: view });
    if (c.inputsHash !== parsed.data.previewHash) return void res.status(409).json({ error: "Les données ont changé depuis la prévisualisation", code: "PREVIEW_STALE", preview: view });
    if (c.inputsHash === orig.inputsHash) throw new FinanceError(409, "NOTHING_TO_CORRECT", "Le nouveau calcul est identique à la répartition existante");
    const out = await db.transaction(async (tx) => {
      const ended = await endAllocation(tx, { syndicateId: sid, allocationId: orig.id, status: "corrected", reason: parsed.data.reason, userId: user.userId });
      const next = await finalizeAllocation(tx, { syndicateId: sid, buildingId: orig.buildingId, period: orig.period, chargeType: orig.chargeType, computation: c, userId: user.userId, correctionOf: orig.id, correctionReason: parsed.data.reason, issueDate: c.issueDate, dueDate: c.dueDate });
      return { ended, next };
    });
    await serverAuditLog(req, { action: "ALLOCATION_CORRECTED", entity: "allocation", entityId: orig.id, syndicateId: sid, details: `${orig.reference} → ${out.next.allocation.reference} — ${parsed.data.reason} — ${out.ended.cancelledCalls} appel(s) annulé(s), ${out.next.appels.length} émis` });
    void notifyDebtors(out.next.appels, sid).catch(() => {});
    res.status(201).json({ data: { original: out.ended.allocation, correction: out.next.allocation, cancelledCalls: out.ended.cancelledCalls, calls: out.next.appels.length } });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

router.post("/allocations/:id/reverse", requireAuth, async (req, res) => {
  try {
    const { user, sid } = ctx(req, KEY_ADMINS, "Une annulation est décidée par le syndic");
    const parsed = z.object({ reason: z.string().trim().min(5, "Indiquez la raison").max(500) }).strict().safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message, code: "REASON_REQUIRED" });
    const out = await db.transaction((tx) => endAllocation(tx, { syndicateId: sid, allocationId: String(req.params.id), status: "reversed", reason: parsed.data.reason, userId: user.userId }));
    await serverAuditLog(req, { action: "ALLOCATION_REVERSED", entity: "allocation", entityId: out.allocation.id, syndicateId: sid, details: `${out.allocation.reference} — ${parsed.data.reason} — ${out.cancelledCalls} appel(s) annulé(s)` });
    res.json({ data: out.allocation, cancelledCalls: out.cancelledCalls });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

// ─── Explanation of a call for funds ──────────────────────────────────────────

/** How this call's amount was computed (its debtors and the team). */
router.get("/appels-de-fonds/:id/allocation", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const [appel] = await db
      .select({ a: appelsDeFondsTable, syndicateId: buildingsTable.syndicateId })
      .from(appelsDeFondsTable)
      .innerJoin(buildingsTable, eq(buildingsTable.id, appelsDeFondsTable.buildingId))
      .where(eq(appelsDeFondsTable.id, String(req.params.id)));
    if (!appel || !user.syndicateId || appel.syndicateId !== user.syndicateId) throw new FinanceError(404, "APPEL_NOT_FOUND", "Appel de fonds introuvable");
    if (!READERS.has(user.role) && !(await isDebtorOfCharge(user, appel.a.id))) throw new FinanceError(404, "APPEL_NOT_FOUND", "Appel de fonds introuvable");
    if (!appel.a.allocationId) return void res.json({ data: null, message: "Appel émis avant l'enregistrement des répartitions : pas de détail de calcul" });
    const [alloc] = await db.select().from(allocationsTable).where(eq(allocationsTable.id, appel.a.allocationId));
    const lines = await db
      .select({ l: allocationLinesTable, label: allocationSourcesTable.label, category: allocationSourcesTable.category, sourceAmount: allocationSourcesTable.amount })
      .from(allocationLinesTable)
      .innerJoin(allocationSourcesTable, eq(allocationSourcesTable.id, allocationLinesTable.sourceId))
      .where(and(eq(allocationLinesTable.allocationId, alloc.id), eq(allocationLinesTable.lotId, appel.a.lotId)));
    const keys = Object.fromEntries(((alloc.inputs as any)?.sources ?? []).map((s: any) => [s.id, s.key ? { code: s.key.code, name: s.key.name, version: s.key.version, method: s.key.method, sourceReference: s.key.sourceReference } : null]));
    const sourcesById = Object.fromEntries(((alloc.inputs as any)?.sources ?? []).map((s: any) => [s.label, s]));
    res.json({
      data: {
        reference: alloc.reference,
        status: alloc.status,
        period: alloc.period,
        callAmount: appel.a.amount,
        roundingRule: (alloc.inputs as any)?.roundingRule,
        lines: lines.map((x) => ({
          source: x.label,
          category: x.category,
          sourceAmount: x.sourceAmount,
          key: keys[sourcesById[x.label]?.id] ?? null,
          coefficient: x.l.coefficient,
          denominator: x.l.denominator,
          amount: x.l.amount,
          roundingAdjustment: x.l.roundingAdjustment,
          explanation: x.l.explanation,
        })),
      },
    });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

// ─── Drafts: edit, publish, delete ────────────────────────────────────────────

/** Rewrites a draft (new sources, dates or keys). */
router.put("/allocations/:id", requireAuth, async (req, res) => {
  try {
    const { user, sid } = ctx(req, FINANCE, "Réservé au syndic et au trésorier");
    const draft = await loadDraft(String(req.params.id), sid);
    const parsed = runSchema.extend({ previewHash: z.string().length(64) }).strict().safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message, code: "INVALID_ALLOCATION" });
    if (parsed.data.buildingId !== draft.buildingId) throw new FinanceError(400, "BUILDING_FIXED", "L'immeuble d'un brouillon ne change pas");
    const c = await compute(sid, parsed.data, draft.id);
    if (!c.valid) return void res.status(422).json({ error: c.errors[0]?.message, code: "ALLOCATION_INVALID", errors: c.errors, preview: computationView(c) });
    if (c.inputsHash !== parsed.data.previewHash) return void res.status(409).json({ error: "Les données ont changé depuis la prévisualisation", code: "PREVIEW_STALE", preview: computationView(c) });
    const out = await db.transaction((tx) =>
      finalizeAllocation(tx, { syndicateId: sid, buildingId: draft.buildingId, period: parsed.data.period, chargeType: parsed.data.chargeType, computation: c, userId: user.userId, issueDate: c.issueDate, dueDate: c.dueDate, mode: "draft", draftId: draft.id }),
    );
    if (out.allocation.period !== parsed.data.period || out.allocation.chargeType !== parsed.data.chargeType) {
      await db.update(callsTable).set({ period: parsed.data.period, chargeType: parsed.data.chargeType }).where(eq(callsTable.id, draft.id));
    }
    await serverAuditLog(req, { action: "FUNDS_CALL_DRAFT_UPDATED", entity: "allocation", entityId: draft.id, syndicateId: sid, details: `${draft.reference} — ${out.allocation.totalAmount}` });
    res.json({ data: { ...out.allocation, inputs: undefined } });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

/**
 * Publication of a draft. Without previewHash: the draft is recalculated on
 * today's data and returned for review (changed = data moved since the
 * draft). With the hash of that review: revalidated and published in one
 * transaction (obligations created).
 */
router.post("/allocations/:id/publish", requireAuth, async (req, res) => {
  try {
    const { user, sid } = ctx(req, FINANCE, "Réservé au syndic et au trésorier");
    const parsed = z.object({ previewHash: z.string().length(64).optional() }).strict().safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json({ error: "Requête invalide", code: "INVALID_PUBLICATION" });
    const draft = await loadDraft(String(req.params.id), sid);
    const run = { buildingId: draft.buildingId, period: draft.period, chargeType: draft.chargeType as (typeof CHARGE_TYPES)[number], sources: requestsOf(draft.inputs) as any, issueDate: draft.issueDate ?? undefined, dueDate: draft.dueDate ?? undefined };
    const c = await compute(sid, run, draft.id);
    const view = { ...computationView(c), issueDate: c.issueDate, dueDate: c.dueDate, changed: c.inputsHash !== draft.inputsHash };
    if (!parsed.data.previewHash) return void res.json({ data: { preview: view, draft: { ...draft, inputs: undefined } } });
    if (!c.valid) return void res.status(422).json({ error: c.errors[0]?.message, code: "ALLOCATION_INVALID", errors: c.errors, preview: view });
    if (c.inputsHash !== parsed.data.previewHash) return void res.status(409).json({ error: "Les données ont changé depuis la vérification : revoyez l'appel", code: "PREVIEW_STALE", preview: view });
    let out;
    try {
      out = await db.transaction((tx) =>
        finalizeAllocation(tx, { syndicateId: sid, buildingId: draft.buildingId, period: draft.period, chargeType: draft.chargeType, computation: c, userId: user.userId, issueDate: c.issueDate, dueDate: c.dueDate, mode: "publish", draftId: draft.id }),
      );
    } catch (err) {
      // A concurrent publication of the same draft: the first one won.
      if (err instanceof FinanceError && err.code === "NOT_A_DRAFT") {
        const [done] = await db.select().from(callsTable).where(eq(callsTable.id, draft.id));
        if (done?.status === "finalized") return void res.json({ data: { ...done, inputs: undefined }, replayed: true });
      }
      throw err;
    }
    await serverAuditLog(req, { action: "ALLOCATION_FINALIZED", entity: "allocation", entityId: draft.id, syndicateId: sid, details: `${draft.reference} publié — ${out.allocation.totalAmount} — ${out.appels.length} obligation(s), échéance ${c.dueDate}` });
    void notifyDebtors(out.appels, sid).catch(() => {});
    res.status(201).json({ data: { ...out.allocation, inputs: undefined }, calls: out.appels.length });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

/** A draft has no financial effect: it can be deleted (audited). */
router.delete("/allocations/:id", requireAuth, async (req, res) => {
  try {
    const { sid } = ctx(req, FINANCE, "Réservé au syndic et au trésorier");
    const draft = await loadDraft(String(req.params.id), sid);
    await db.transaction(async (tx) => {
      const [locked] = await tx.select({ status: callsTable.status }).from(callsTable).where(eq(callsTable.id, draft.id)).for("update");
      if (locked?.status !== "draft") throw new FinanceError(409, "NOT_A_DRAFT", "Cet appel de fonds vient d'être publié");
      await tx.delete(allocationLinesTable).where(eq(allocationLinesTable.allocationId, draft.id));
      await tx.delete(allocationSourcesTable).where(eq(allocationSourcesTable.allocationId, draft.id));
      await tx.delete(callsTable).where(eq(callsTable.id, draft.id));
    });
    await serverAuditLog(req, { action: "FUNDS_CALL_DRAFT_DELETED", entity: "allocation", entityId: draft.id, syndicateId: sid, details: `${draft.reference} — ${draft.totalAmount}` });
    res.json({ message: "Brouillon supprimé" });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

router.get("/allocations/:id/reconciliation", requireAuth, async (req, res) => {
  try {
    const { sid } = ctx(req, READERS, "Réservé à l'équipe");
    const [a] = await db.select({ id: callsTable.id, reference: callsTable.reference, status: callsTable.status }).from(callsTable).where(and(eq(callsTable.id, String(req.params.id)), eq(callsTable.syndicateId, sid)));
    if (!a) throw new FinanceError(404, "ALLOCATION_NOT_FOUND", "Appel de fonds introuvable");
    res.json({ data: { ...a, ...(await reconcileCall(a.id)) } });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

// ─── Obligations: account, adjustment, reminder ──────────────────────────────

async function scopedObligation(req: Request) {
  const user = req.user!;
  const [row] = await db
    .select({ a: appelsDeFondsTable, syndicateId: buildingsTable.syndicateId, lotNumber: lotsTable.number })
    .from(appelsDeFondsTable)
    .innerJoin(buildingsTable, eq(buildingsTable.id, appelsDeFondsTable.buildingId))
    .innerJoin(lotsTable, eq(lotsTable.id, appelsDeFondsTable.lotId))
    .where(eq(appelsDeFondsTable.id, String(req.params.id)));
  if (!row || !user.syndicateId || row.syndicateId !== user.syndicateId) throw new FinanceError(404, "APPEL_NOT_FOUND", "Appel de fonds introuvable");
  const team = READERS.has(user.role);
  if (!team && !(await isDebtorOfCharge(user, row.a.id))) throw new FinanceError(404, "APPEL_NOT_FOUND", "Appel de fonds introuvable");
  return { ...row, team };
}

/**
 * Everything a debtor needs about one obligation: amounts, dates, status
 * (with the overdue rule), payments of every status, adjustments, reminders
 * and how to pay. A declared payment is listed as pending, never as paid.
 */
router.get("/appels-de-fonds/:id/account", requireAuth, async (req, res) => {
  try {
    const { a, syndicateId, lotNumber, team } = await scopedObligation(req);
    const [payments, adjustments, reminders, [call], bank] = await Promise.all([
      db.select().from(appelPaymentsTable).where(eq(appelPaymentsTable.appelId, a.id)).orderBy(asc(appelPaymentsTable.createdAt)),
      db.select().from(appelAdjustmentsTable).where(eq(appelAdjustmentsTable.appelId, a.id)).orderBy(asc(appelAdjustmentsTable.createdAt)),
      db.select().from(appelRemindersTable).where(eq(appelRemindersTable.appelId, a.id)).orderBy(asc(appelRemindersTable.createdAt)),
      a.allocationId ? db.select({ reference: callsTable.reference, status: callsTable.status }).from(callsTable).where(eq(callsTable.id, a.allocationId)) : Promise.resolve([undefined]),
      db.select({ label: treasuryAccountsTable.label, bankName: treasuryAccountsTable.bankName, rib: treasuryAccountsTable.rib }).from(treasuryAccountsTable).where(and(eq(treasuryAccountsTable.syndicateId, syndicateId!), eq(treasuryAccountsTable.kind, "bank"), eq(treasuryAccountsTable.status, "active"), eq(treasuryAccountsTable.isDefault, true))),
    ]);
    const remaining = Math.max(0, moneyDiff(a.amount, a.amountPaid));
    const open = !["paid", "cancelled"].includes(a.status ?? "");
    res.json({
      data: {
        id: a.id,
        callReference: call?.reference ?? null,
        callStatus: call?.status ?? null,
        lotNumber,
        period: a.period,
        type: a.type,
        originalAmount: a.originalAmount ?? a.amount,
        amount: a.amount,
        amountPaid: a.amountPaid,
        remaining: remaining.toFixed(2),
        issueDate: a.issueDate,
        dueDate: a.dueDate,
        status: a.status,
        overdue: open && remaining > 0 && isPastDue(a.dueDate),
        dueRule: `Payable jusqu'au ${a.dueDate} inclus (${APP_TIMEZONE}) ; en retard à partir du lendemain. Aucune pénalité n'est appliquée automatiquement.`,
        cancellationReason: a.cancellationReason,
        payments: payments.map((p) => ({
          id: p.id,
          amount: p.amount,
          method: p.method,
          reference: p.reference,
          status: p.status,
          declaredAt: p.createdAt,
          reviewedAt: p.reviewedAt,
          receiptNumber: p.status === "validated" ? p.receiptNumber : null,
          rejectionReason: p.rejectionReason,
        })),
        pendingAmount: payments.filter((p) => p.status === "pending").reduce((t, p) => t + Number(p.amount), 0).toFixed(2),
        adjustments: adjustments.map((j) => ({ previousAmount: j.previousAmount, newAmount: j.newAmount, reason: j.reason, at: j.createdAt })),
        reminders: reminders.map((r) => ({ kind: r.kind, remaining: r.remaining, at: r.createdAt })),
        paymentOptions: open && remaining > 0
          ? {
              methods: ["virement", "cheque", "especes"],
              online: false,
              note: "Payez par virement sur le compte du syndicat en indiquant la référence en motif, puis déclarez votre paiement avec son justificatif ; il compte une fois validé par le trésorier.",
              bankAccount: bank[0] ? { label: bank[0].label, bankName: bank[0].bankName, rib: bank[0].rib } : null,
              // Motive to write in the transfer: lets the treasurer match the bank line to this call.
              reference: a.paymentReference ?? null,
            }
          : null,
      },
    });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

/** Controlled change of one obligation's amount (syndic, reason required). */
router.post("/appels-de-fonds/:id/adjust", requireAuth, async (req, res) => {
  try {
    const { user, sid } = ctx(req, KEY_ADMINS, "Un ajustement est décidé par le syndic");
    const parsed = z
      .object({ newAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant invalide (2 décimales)"), reason: z.string().trim().min(5, "Indiquez la raison de l'ajustement").max(500) })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message, code: "INVALID_ADJUSTMENT" });
    if (Number(parsed.data.newAmount) <= 0) throw new FinanceError(400, "USE_CANCELLATION", "Pour ramener une obligation à zéro, annulez-la (motif) au lieu de l'ajuster");
    const out = await db.transaction((tx) => adjustObligation(tx, { syndicateId: sid, appelId: String(req.params.id), newAmount: parsed.data.newAmount, reason: parsed.data.reason, userId: user.userId }));
    await serverAuditLog(req, { action: "APPEL_ADJUSTED", entity: "appel_de_fonds", entityId: out.after.id, syndicateId: sid, details: `${out.before.amount} → ${out.after.amount} — ${parsed.data.reason}` });
    res.json({ data: out.after });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

router.post("/appels-de-fonds/:id/remind", requireAuth, async (req, res) => {
  try {
    const { user } = ctx(req, FINANCE, "Réservé au syndic et au trésorier");
    const { a } = await scopedObligation(req);
    const r = await sendManualReminder(a.id, user.userId);
    res.status(201).json({ data: r });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

/** Eligibility of an obligation for a reminder (without sending it). */
router.get("/appels-de-fonds/:id/reminder-eligibility", requireAuth, async (req, res) => {
  try {
    ctx(req, FINANCE, "Réservé au syndic et au trésorier");
    const { a } = await scopedObligation(req);
    const blocker = await reminderBlocker(a.id);
    res.json({ data: { eligible: !blocker, reason: blocker } });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

export default router;
