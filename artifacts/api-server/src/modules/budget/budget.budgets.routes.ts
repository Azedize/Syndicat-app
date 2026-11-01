// budget: budgets endpoints (mounted by budget.routes.ts, in order).
import { sendRouteError } from "../../lib/route-error.js";
import { Router } from "express";
import { db } from "@workspace/db";
import {
  budgetsTable,
  budgetLinesTable,
  appelsDeFondsTable,
  buildingsTable,
  syndicatesTable,
  prestatairesTable,
  meetingsTable,
  expensesTable,
} from "@workspace/db/schema";
import {
  eq,
  and,
  desc,
  sql,
  inArray,
} from "drizzle-orm";
import { requireAuth, requireFinanceAccess } from "../../middleware/auth.js";
import { computeAllocation, loadSources } from "../../lib/allocation.js";
import { finalizeAllocation } from "../../lib/allocation-store.js";
import { notifyUser } from "../../lib/notify.js";
import { FinanceError, fromCents, sendFinanceError, toCents } from "../../lib/treasury.js";
import { serverAuditLog } from "../../lib/audit.js";
import { reconcileBudgetAmounts, resolveOwnerUserId, PRE_APPROVAL_BUDGET_STATUSES, APPROVED_BUDGET_STATUSES } from "./budget.service.js";
import { generateAppelsSchema, updateBudgetSchema, createBudgetSchema } from "./budget.validation.js";
import { isSyndicateScoped } from "./budget.access.js";

const router = Router();

// ─── Budgets ───────────────────────────────────────────────────────────────────

// GET /budgets — finance team (syndicate_admin + treasurer)
router.get("/budgets", requireAuth, requireFinanceAccess, async (req, res) => {
  try {
    const user = req.user!;

    // Mandatory syndicate scoping: syndicate_admin must have syndicateId in JWT
    if (isSyndicateScoped(user.role) && !user.syndicateId) {
      return void res
        .status(403)
        .json({ error: "Syndicat non défini dans le token" });
    }

    const { buildingId, year, status } = req.query as Record<string, string>;

    // Scope by syndicate: budgetsTable has no syndicateId — derive via building FK
    let allowedBuildingIds: string[] | null = null;
    if (isSyndicateScoped(user.role)) {
      const scopedBuildings = await db
        .select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.syndicateId, user.syndicateId!));
      allowedBuildingIds = scopedBuildings.map((b) => b.id);
      if (allowedBuildingIds.length === 0)
        return void res.json({ data: [], total: 0 });
    } else if (user.role === "super_admin" && req.query.syndicateId) {
      const scopedBuildings = await db
        .select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.syndicateId, req.query.syndicateId as string));
      allowedBuildingIds = scopedBuildings.map((b) => b.id);
      if (allowedBuildingIds.length === 0)
        return void res.json({ data: [], total: 0 });
    }

    // If a specific buildingId is requested by syndicate_admin, verify it's in scope
    if (buildingId && isSyndicateScoped(user.role)) {
      if (!allowedBuildingIds || !allowedBuildingIds.includes(buildingId)) {
        return void res
          .status(403)
          .json({ error: "Accès refusé à cet immeuble" });
      }
    }

    const conditions: any[] = [];
    if (allowedBuildingIds !== null) {
      conditions.push(inArray(budgetsTable.buildingId, allowedBuildingIds));
    }
    if (buildingId) conditions.push(eq(budgetsTable.buildingId, buildingId));
    if (year) conditions.push(eq(budgetsTable.year, parseInt(year)));
    if (status) conditions.push(eq(budgetsTable.status, status));

    const rows = await db
      .select()
      .from(budgetsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(budgetsTable.year));

    if (rows.length === 0) return void res.json({ data: [], total: 0 });

    // Batch-load lines and charge stats — avoids N+1 (was 2N queries, now 2)
    const budgetIds = rows.map((b) => b.id);
    const [allLines, allChargeStats] = await Promise.all([
      db
        .select()
        .from(budgetLinesTable)
        .where(inArray(budgetLinesTable.budgetId, budgetIds)),
      db
        .select({
          budgetId: appelsDeFondsTable.budgetId,
          collected: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amountPaid}), 0)`,
          pending: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount} - ${appelsDeFondsTable.amountPaid}) FILTER (WHERE ${appelsDeFondsTable.status} NOT IN ('paid', 'cancelled')), 0)`,
        })
        .from(appelsDeFondsTable)
        .where(inArray(appelsDeFondsTable.budgetId, budgetIds))
        .groupBy(appelsDeFondsTable.budgetId),
    ]);

    const linesByBudget = new Map<string, typeof allLines>();
    for (const line of allLines) {
      const arr = linesByBudget.get(line.budgetId) ?? [];
      arr.push(line);
      linesByBudget.set(line.budgetId, arr);
    }
    const chargeStatsByBudget = new Map(
      allChargeStats.map((s) => [s.budgetId, s]),
    );

    const enriched = rows.map((b) => ({
      ...b,
      lines: linesByBudget.get(b.id) ?? [],
      chargeStats: chargeStatsByBudget.get(b.id) ?? {
        collected: 0,
        pending: 0,
      },
    }));

    res.json({ data: enriched, total: enriched.length });
  } catch (e) {
    sendRouteError(req, res, e);
  }
});

// GET /budgets/:id — admin only
router.get(
  "/budgets/:id",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    try {
      const user = req.user!;

      const [budget] = await db
        .select()
        .from(budgetsTable)
        .where(eq(budgetsTable.id, String(req.params.id)));

      if (!budget)
        return void res.status(404).json({ error: "Budget not found" });

      // Syndicate isolation: budgetsTable has no syndicateId — derive via building FK
      if (isSyndicateScoped(user.role)) {
        if (!user.syndicateId)
          return void res
            .status(403)
            .json({ error: "Syndicat non défini dans le token" });
        const [bld] = await db
          .select({ syndicateId: buildingsTable.syndicateId })
          .from(buildingsTable)
          .where(eq(buildingsTable.id, budget.buildingId))
          .limit(1);
        if (!bld || bld.syndicateId !== user.syndicateId) {
          return void res.status(403).json({ error: "Accès refusé" });
        }
      }

      const lines = await db
        .select()
        .from(budgetLinesTable)
        .where(eq(budgetLinesTable.budgetId, budget.id));

      const appels = await db
        .select()
        .from(appelsDeFondsTable)
        .where(eq(appelsDeFondsTable.budgetId, budget.id))
        .orderBy(desc(appelsDeFondsTable.createdAt));

      res.json({ budget, lines, appels });
    } catch (e) {
      sendRouteError(req, res, e);
    }
  },
);

// GET /budgets/:id/execution — planned vs actual, computed from the journal
// flows of the budget's building and year:
//  • expenses: per budget line, paid expenses (actual) and approved ones not
//    yet paid (committed). Expenses not linked to a line are attributed by
//    category, the rest is reported as "outside the budget".
//  • revenue: calls for funds issued on this budget vs amounts received.
router.get(
  "/budgets/:id/execution",
  requireAuth,
  async (req, res) => {
    try {
      const user = req.user!;
      // Co-owners read the execution of the budgets adopted in general meeting
      // (approved / closed), never a draft — see GET /transparency/finances.
      if (!["syndicate_admin", "treasurer", "president", "committee_member", "secretary", "member"].includes(user.role) || !user.syndicateId) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
      const [budget] = await db
        .select({ budget: budgetsTable, syndicateId: buildingsTable.syndicateId })
        .from(budgetsTable)
        .innerJoin(buildingsTable, eq(buildingsTable.id, budgetsTable.buildingId))
        .where(eq(budgetsTable.id, String(req.params.id)));
      if (!budget || budget.syndicateId !== user.syndicateId) {
        return void res.status(404).json({ error: "Budget introuvable" });
      }
      if ((user.role === "member" || user.role === "secretary") && !["approved", "closed"].includes(budget.budget.status ?? "")) {
        return void res.status(404).json({ error: "Budget introuvable" });
      }
      const b = budget.budget;
      const [lines, expenses, [calls]] = await Promise.all([
        db.select().from(budgetLinesTable).where(eq(budgetLinesTable.budgetId, b.id)),
        db
          .select({
            amount: expensesTable.amount,
            status: expensesTable.status,
            category: expensesTable.category,
            budgetLineId: expensesTable.budgetLineId,
          })
          .from(expensesTable)
          .where(
            and(
              eq(expensesTable.syndicateId, user.syndicateId),
              eq(expensesTable.buildingId, b.buildingId),
              inArray(expensesTable.status, ["approved", "paid"]),
              sql`EXTRACT(YEAR FROM COALESCE(${expensesTable.invoiceDate}, ${expensesTable.createdAt}::date)) = ${b.year}`,
            ),
          ),
        db
          .select({
            called: sql<string>`COALESCE(SUM(${appelsDeFondsTable.amount}) FILTER (WHERE ${appelsDeFondsTable.status} <> 'cancelled'), 0)`,
            collected: sql<string>`COALESCE(SUM(${appelsDeFondsTable.amountPaid}), 0)`,
          })
          .from(appelsDeFondsTable)
          .where(eq(appelsDeFondsTable.budgetId, b.id)),
      ]);

      const lineById = new Map(lines.map((l) => [l.id, l]));
      const lineByCategory = new Map<string, string>();
      for (const l of lines) if (!lineByCategory.has(l.category)) lineByCategory.set(l.category, l.id);
      const actual = new Map<string, number>();
      const committed = new Map<string, number>();
      let outsideActual = 0;
      let outsideCommitted = 0;
      for (const e of expenses) {
        const lineId =
          (e.budgetLineId && lineById.has(e.budgetLineId) ? e.budgetLineId : null) ?? lineByCategory.get(e.category) ?? null;
        const cents = toCents(e.amount);
        if (!lineId) {
          if (e.status === "paid") outsideActual += cents;
          else outsideCommitted += cents;
          continue;
        }
        const bucket = e.status === "paid" ? actual : committed;
        bucket.set(lineId, (bucket.get(lineId) ?? 0) + cents);
      }

      const data = lines.map((l) => {
        const planned = toCents(l.amountAnnual);
        const spent = actual.get(l.id) ?? 0;
        const engaged = committed.get(l.id) ?? 0;
        return {
          id: l.id,
          category: l.category,
          label: l.label,
          planned: fromCents(planned),
          actual: fromCents(spent),
          committed: fromCents(engaged),
          remaining: fromCents(planned - spent - engaged),
          usedPercent: planned > 0 ? Math.round(((spent + engaged) / planned) * 100) : null,
        };
      });
      const plannedTotal = lines.reduce((s, l) => s + toCents(l.amountAnnual), 0);
      const actualTotal = [...actual.values()].reduce((s, v) => s + v, 0) + outsideActual;
      const committedTotal = [...committed.values()].reduce((s, v) => s + v, 0) + outsideCommitted;

      res.json({
        data: {
          budget: { id: b.id, year: b.year, status: b.status, buildingId: b.buildingId },
          lines: data,
          outsideBudget: { actual: fromCents(outsideActual), committed: fromCents(outsideCommitted) },
          expenses: {
            planned: fromCents(plannedTotal),
            actual: fromCents(actualTotal),
            committed: fromCents(committedTotal),
          },
          revenue: {
            planned: fromCents(toCents(b.chargesAmount) + toCents(b.fondsReserve)),
            called: fromCents(toCents(calls?.called)),
            collected: fromCents(toCents(calls?.collected)),
          },
        },
      });
    } catch (e) {
      sendFinanceError(res, req, e, "Server error");
    }
  },
);

// POST /budgets — Treasurer is responsible for budgets (spec: "Mohamed suit les budgets").
// requireFinanceAccess allows syndicate_admin and treasurer (not super_admin direct access).
router.post("/budgets", requireAuth, requireFinanceAccess, async (req, res) => {
  try {
    const user = req.user!;
    if (!req.body?.year || !req.body?.buildingId) {
      return void res
        .status(400)
        .json({ error: "year and buildingId are required" });
    }
    const parsedBody = createBudgetSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return void res.status(400).json({
        error: parsedBody.error.issues[0]?.message ?? "Données invalides",
        code: "BUDGET_INVALID",
      });
    }
    const { year, buildingId, status, notes, lines } = parsedBody.data;
    const amounts = reconcileBudgetAmounts({
      ...parsedBody.data,
      linesTotal: lines?.length ? fromCents(lines.reduce((s, l) => s + toCents(l.amountAnnual), 0)) : undefined,
    });
    if (!amounts.ok) {
      return void res.status(400).json({ error: amounts.error, code: "BUDGET_TOTALS_MISMATCH" });
    }
    const { totalAmount, chargesAmount, fondsReserve } = amounts;
    // A budget is approved only by the general assembly (PUT with meetingId),
    // never at creation.
    if (status !== undefined && !PRE_APPROVAL_BUDGET_STATUSES.includes(status)) {
      return void res.status(400).json({
        error: "Un budget est créé en brouillon ; son approbation se fait en AG.",
        code: "BUDGET_STATUS_INVALID",
      });
    }

    // Syndicate ownership check via building FK
    const [building] = await db
      .select({ syndicateId: buildingsTable.syndicateId })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, buildingId))
      .limit(1);

    if (!building) {
      return void res.status(404).json({ error: "Immeuble introuvable" });
    }
    if (
      isSyndicateScoped(user.role) &&
      building.syndicateId !== user.syndicateId
    ) {
      return void res.status(403).json({
        error: "Accès refusé : cet immeuble n'appartient pas à votre syndicat",
      });
    }

    const providerIds = [
      ...new Set(
        (Array.isArray(lines) ? lines : [])
          .map((line: any) => line?.prestataireId)
          .filter(
            (id: unknown): id is string =>
              typeof id === "string" && id.length > 0,
          ),
      ),
    ];
    if (providerIds.length > 0) {
      const providers = await db
        .select({ id: prestatairesTable.id })
        .from(prestatairesTable)
        .where(
          and(
            inArray(prestatairesTable.id, providerIds),
            eq(prestatairesTable.buildingId, buildingId),
          ),
        );
      if (providers.length !== providerIds.length) {
        return void res
          .status(400)
          .json({ error: "Un prestataire n'appartient pas à cet immeuble" });
      }
    }

    // Budget and its lines are created atomically (no budget without lines
    // if a line fails validation in the database).
    const budget = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(budgetsTable)
        .values({
          year,
          buildingId,
          totalAmount: totalAmount ?? 0,
          chargesAmount: chargesAmount ?? 0,
          fondsReserve: fondsReserve ?? 0,
          status: status ?? "draft",
          notes,
          createdBy: user.userId,
        })
        .returning();

      if (lines && Array.isArray(lines) && lines.length > 0) {
        await tx.insert(budgetLinesTable).values(
          lines.map((l: any) => ({
            budgetId: created.id,
            category: l.category,
            label: l.label,
            amountAnnual: l.amountAnnual ?? 0,
            amountQ1: l.amountQ1,
            amountQ2: l.amountQ2,
            amountQ3: l.amountQ3,
            amountQ4: l.amountQ4,
            prestataireId: l.prestataireId,
          })),
        );
      }
      return created;
    });

    await serverAuditLog(req, {
      action: "CREATE",
      entity: "budget",
      entityId: budget.id,
      syndicateId: building.syndicateId ?? undefined,
      details: `Budget ${year} créé pour immeuble ${buildingId}`,
    });

    res.status(201).json(budget);
  } catch (e) {
    sendRouteError(req, res, e);
  }
});

// PUT /budgets/:id — Treasurer can update budget entries.
router.put(
  "/budgets/:id",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    try {
      const user = req.user!;

      // Fetch existing budget for ownership check
      const [existing] = await db
        .select()
        .from(budgetsTable)
        .where(eq(budgetsTable.id, String(req.params.id)));

      if (!existing)
        return void res.status(404).json({ error: "Budget not found" });

      // Syndicate ownership check via building FK
      const [building] = await db
        .select({ syndicateId: buildingsTable.syndicateId })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, existing.buildingId))
        .limit(1);

      if (isSyndicateScoped(user.role)) {
        if (!building || building.syndicateId !== user.syndicateId) {
          return void res.status(403).json({ error: "Accès refusé" });
        }
      }

      const parsed = updateBudgetSchema.safeParse(req.body);
      if (!parsed.success) {
        return void res.status(400).json({
          error: parsed.error.issues[0]?.message ?? "Données invalides",
        });
      }
      const updates: Record<string, unknown> = Object.fromEntries(
        Object.entries(parsed.data).filter(([, v]) => v !== undefined),
      );

      const isApproved = APPROVED_BUDGET_STATUSES.includes(existing.status ?? "");
      const changesAmounts = ["totalAmount", "chargesAmount", "fondsReserve"].some(
        (k) => k in updates,
      );
      if (isApproved && changesAmounts) {
        return void res.status(409).json({
          error:
            "Budget approuvé en AG : ses montants ne peuvent plus être modifiés sans nouvelle délibération.",
          code: "BUDGET_LOCKED",
        });
      }
      if (changesAmounts) {
        // The amounts after the change must still agree with each other and
        // with the lines already recorded.
        const existingLines = await db
          .select({ amount: budgetLinesTable.amountAnnual })
          .from(budgetLinesTable)
          .where(eq(budgetLinesTable.budgetId, existing.id));
        const touched = (k: "totalAmount" | "chargesAmount" | "fondsReserve") =>
          k in updates ? String(updates[k]) : undefined;
        const charges = touched("chargesAmount") ?? (existingLines.length ? undefined : String(existing.chargesAmount ?? "0"));
        const reserve = touched("fondsReserve") ?? String(existing.fondsReserve ?? "0");
        const amounts = reconcileBudgetAmounts({
          chargesAmount: charges,
          fondsReserve: reserve,
          // The total follows charges and reserve unless it is set explicitly.
          totalAmount: touched("totalAmount"),
          linesTotal: existingLines.length ? fromCents(existingLines.reduce((s, l) => s + toCents(l.amount), 0)) : undefined,
        });
        if (!amounts.ok) {
          return void res.status(400).json({ error: amounts.error, code: "BUDGET_TOTALS_MISMATCH" });
        }
        updates.totalAmount = amounts.totalAmount;
        updates.chargesAmount = amounts.chargesAmount;
        updates.fondsReserve = amounts.fondsReserve;
      }
      // Loi 18-00: the provisional budget is adopted by the general assembly.
      // Approval must reference the assembly (meeting) of this syndicate.
      if (updates.status === "approved" && existing.status !== "approved") {
        const meetingId = (updates.meetingId as string | null | undefined) ?? existing.meetingId;
        if (!meetingId) {
          return void res.status(400).json({
            error: "L'approbation d'un budget doit référencer l'assemblée générale qui l'a voté.",
            code: "BUDGET_APPROVAL_REQUIRES_AG",
          });
        }
        updates.meetingId = meetingId;
        updates.votedAt = new Date();
      }

      if (updates.meetingId !== undefined && updates.meetingId !== null) {
        const [meeting] = await db
          .select({ syndicateId: meetingsTable.syndicateId })
          .from(meetingsTable)
          .where(eq(meetingsTable.id, String(updates.meetingId)))
          .limit(1);
        if (!meeting || meeting.syndicateId !== building?.syndicateId) {
          return void res.status(400).json({
            error:
              "La réunion sélectionnée n'appartient pas au syndicat du budget",
          });
        }
      }

      const [updated] = await db
        .update(budgetsTable)
        .set(updates)
        .where(eq(budgetsTable.id, String(req.params.id)))
        .returning();

      if (!updated)
        return void res.status(404).json({ error: "Budget not found" });

      await serverAuditLog(req, {
        action: "UPDATE",
        entity: "budget",
        entityId: String(req.params.id),
        syndicateId: building?.syndicateId ?? undefined,
        details: `Budget mis à jour: ${JSON.stringify(updates)}`,
      });

      res.json(updated);
    } catch (e) {
      sendRouteError(req, res, e);
    }
  },
);

// POST /budgets/:id/generate-appels — Treasurer generates charge calls from budget.
router.post(
  "/budgets/:id/generate-appels",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    try {
      const user = req.user!;
      const parsed = generateAppelsSchema.safeParse(req.body);
      if (!parsed.success) {
        return void res.status(400).json({
          error:
            parsed.error.issues[0]?.message ??
            "period is required (e.g. '2026-05', '2026-Q1' or '2026')",
        });
      }
      const { period, type: chargeType } = parsed.data;

      const [budget] = await db
        .select()
        .from(budgetsTable)
        .where(eq(budgetsTable.id, String(req.params.id)));
      if (!budget)
        return void res.status(404).json({ error: "Budget not found" });

      // Syndicate ownership check via building FK
      const [building] = await db
        .select({ syndicateId: buildingsTable.syndicateId })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, budget.buildingId))
        .limit(1);

      if (isSyndicateScoped(user.role)) {
        if (!building || building.syndicateId !== user.syndicateId) {
          return void res.status(403).json({
            error:
              "Accès refusé : cet immeuble n'appartient pas à votre syndicat",
          });
        }
      }

      // A condominium still being configured (draft) issues no calls.
      if (building?.syndicateId) {
        const [condo] = await db.select({ status: syndicatesTable.status }).from(syndicatesTable).where(eq(syndicatesTable.id, building.syndicateId));
        if (condo && condo.status !== "active") {
          return void res.status(409).json({
            error: "La copropriété doit être active pour émettre des appels de fonds.",
            code: "CONDOMINIUM_NOT_ACTIVE",
          });
        }
      }

      // Charges are called on the budget voted by the general assembly —
      // never on a draft the syndic can still change alone.
      if (budget.status !== "approved") {
        return void res.status(409).json({
          error: "Le budget doit être approuvé en assemblée générale avant d'émettre des appels de fonds.",
          code: "BUDGET_NOT_APPROVED",
        });
      }

      // Same engine as the allocation module: the budget part is split by
      // the lots' tantièmes (implicit key), the calculation is persisted
      // (allocation + lines) and the calls are issued in one transaction.
      // Lots at 0 tantième are listed as excluded, never silently dropped.
      if (!building?.syndicateId) return void res.status(409).json({ error: "Immeuble sans syndicat" });
      const { sources, errors: loadErrors } = await loadSources(
        building.syndicateId,
        budget.buildingId,
        period,
        [{ type: "budget_total", budgetId: budget.id, part: chargeType === "fonds_reserve" ? "fonds_reserve" : "charges" }],
        { implicitTantiemes: true },
      );
      const computation = await computeAllocation(budget.buildingId, period, sources, loadErrors);
      if (!computation.valid) {
        return void res.status(400).json({
          error: computation.errors[0]?.message ?? "Répartition impossible",
          code: computation.errors[0]?.code ?? "ALLOCATION_INVALID",
          errors: computation.errors,
        });
      }
      let generated;
      try {
        generated = await db.transaction((tx) =>
          finalizeAllocation(tx, {
            syndicateId: building.syndicateId!,
            buildingId: budget.buildingId,
            period,
            chargeType,
            computation,
            userId: user.userId,
          }),
        );
      } catch (err) {
        if (err instanceof FinanceError && (err.code === "APPELS_ALREADY_GENERATED" || err.code === "SOURCE_ALREADY_ALLOCATED")) {
          return void res.status(409).json({
            error: `Les appels de fonds ${chargeType} de la période ${period} existent déjà pour cet immeuble.`,
            code: "APPELS_ALREADY_GENERATED",
          });
        }
        throw err;
      }
      const inserted = generated.appels;
      const appels = inserted;
      const totalCents = inserted.reduce((s, a) => s + toCents(a.amount), 0);

      // Each owner is told about their own call (amount + due date).
      void (async () => {
        const syndicateId = building?.syndicateId;
        if (!syndicateId) return;
        const insertedRows = await db
          .select({ ownerId: appelsDeFondsTable.ownerId, amount: appelsDeFondsTable.amount, dueDate: appelsDeFondsTable.dueDate })
          .from(appelsDeFondsTable)
          .where(
            and(
              eq(appelsDeFondsTable.budgetId, budget.id),
              eq(appelsDeFondsTable.period, period),
              eq(appelsDeFondsTable.type, chargeType),
            ),
          );
        for (const row of insertedRows) {
          const userId = await resolveOwnerUserId(db, row.ownerId, syndicateId);
          await notifyUser(userId, {
            key: "fundsCall.new",
            params: { period, amount: row.amount, dueDate: row.dueDate },
            type: "info",
            syndicateId,
          });
        }
      })().catch(() => {});

      await serverAuditLog(req, {
        action: "GENERATE_APPELS",
        entity: "budget",
        entityId: budget.id,
        syndicateId: building?.syndicateId ?? undefined,
        details: `${inserted.length} appels générés pour période ${period}`,
      });

      res.status(201).json({
        message: `Generated ${inserted.length} appels de fonds for period ${period}`,
        total: totalCents / 100,
        count: inserted.length,
        skipped: appels.length - inserted.length,
        allocationId: generated.allocation.id,
        allocationReference: generated.allocation.reference,
        // Lots without a share (0 tantième), shown instead of silently omitted
        excludedLots: computation.excluded.map((e) => ({ lotId: e.lotId, lotNumber: e.lotNumber, reason: e.reason })),
      });
    } catch (e) {
      sendRouteError(req, res, e);
    }
  },
);

export default router;
