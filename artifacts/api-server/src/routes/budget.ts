import { Router } from "express";
import { db } from "@workspace/db";
import {
  budgetsTable,
  budgetLinesTable,
  appelsDeFondsTable,
  lotsTable,
  buildingsTable,
  membersTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, sum, or } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

// GET /budgets
router.get("/budgets", requireAuth, async (req, res) => {
  try {
    const { buildingId, year, status } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (buildingId) conditions.push(eq(budgetsTable.buildingId, buildingId));
    if (year) conditions.push(eq(budgetsTable.year, parseInt(year)));
    if (status) conditions.push(eq(budgetsTable.status, status));

    const rows = await db
      .select()
      .from(budgetsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(budgetsTable.year));

    const enriched = await Promise.all(
      rows.map(async (b) => {
        const lines = await db
          .select()
          .from(budgetLinesTable)
          .where(eq(budgetLinesTable.budgetId, b.id));

        const [chargeStats] = await db
          .select({
            collected: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount}) FILTER (WHERE ${appelsDeFondsTable.status} = 'paid'), 0)`,
            pending: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount}) FILTER (WHERE ${appelsDeFondsTable.status} IN ('pending','overdue')), 0)`,
          })
          .from(appelsDeFondsTable)
          .where(eq(appelsDeFondsTable.budgetId, b.id));

        return { ...b, lines, chargeStats };
      })
    );

    res.json({ data: enriched, total: enriched.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /budgets/:id
router.get("/budgets/:id", requireAuth, async (req, res) => {
  try {
    const [budget] = await db
      .select()
      .from(budgetsTable)
      .where(eq(budgetsTable.id, req.params.id));

    if (!budget) return res.status(404).json({ error: "Budget not found" });

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
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /budgets
router.post("/budgets", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = (req as any).user;
    const { year, buildingId, totalAmount, chargesAmount, fondsReserve, status, notes, lines } = req.body;

    if (!year || !buildingId) {
      return res.status(400).json({ error: "year and buildingId are required" });
    }

    const [budget] = await db
      .insert(budgetsTable)
      .values({
        year,
        buildingId,
        totalAmount: totalAmount ?? 0,
        chargesAmount: chargesAmount ?? 0,
        fondsReserve: fondsReserve ?? 0,
        status: status ?? "draft",
        notes,
        createdBy: user.id,
      })
      .returning();

    // Insert budget lines if provided
    if (lines && Array.isArray(lines) && lines.length > 0) {
      await db.insert(budgetLinesTable).values(
        lines.map((l: any) => ({
          budgetId: budget.id,
          category: l.category,
          label: l.label,
          amountAnnual: l.amountAnnual ?? 0,
          amountQ1: l.amountQ1,
          amountQ2: l.amountQ2,
          amountQ3: l.amountQ3,
          amountQ4: l.amountQ4,
          prestataireId: l.prestataireId,
        }))
      );
    }

    res.status(201).json(budget);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /budgets/:id
router.put("/budgets/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const allowed = ["totalAmount", "chargesAmount", "fondsReserve", "status", "votedAt", "meetingId", "notes"];
    const updates: Record<string, any> = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    const [updated] = await db
      .update(budgetsTable)
      .set(updates)
      .where(eq(budgetsTable.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Budget not found" });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /budgets/:id/generate-appels — Auto-generate appels de fonds for all lots
router.post("/budgets/:id/generate-appels", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { period, type } = req.body;
    if (!period) return res.status(400).json({ error: "period is required (e.g. '2026-Q1')" });

    const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, req.params.id));
    if (!budget) return res.status(404).json({ error: "Budget not found" });

    const lots = await db
      .select()
      .from(lotsTable)
      .where(eq(lotsTable.buildingId, budget.buildingId));

    if (lots.length === 0) return res.status(400).json({ error: "No lots found for this building" });

    const totalTantiemes = lots.reduce((s, l) => s + l.tantiemes, 0);
    if (totalTantiemes === 0) return res.status(400).json({ error: "Lots have no tantiemes assigned" });

    const chargeType = type ?? "charges_courantes";
    const baseAmount = chargeType === "fonds_reserve"
      ? budget.fondsReserve
      : budget.chargesAmount;

    // Quarterly: divide annual amount by 4
    const periodAmount = baseAmount / 4;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const appels = lots.map((lot) => ({
      buildingId: budget.buildingId,
      budgetId: budget.id,
      lotId: lot.id,
      ownerId: lot.ownerId ?? undefined,
      period,
      type: chargeType,
      amount: Math.round((periodAmount * lot.tantiemes) / totalTantiemes),
      dueDate: dueDate.toISOString().split("T")[0],
      status: "pending" as const,
    }));

    await db.insert(appelsDeFondsTable).values(appels);

    res.status(201).json({
      message: `Generated ${appels.length} appels de fonds for period ${period}`,
      total: appels.reduce((s, a) => s + a.amount, 0),
      count: appels.length,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Appels de Fonds ──────────────────────────────────────────────────────

// GET /appels-de-fonds
router.get("/appels-de-fonds", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { buildingId, lotId, status, period, ownerId } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (buildingId) conditions.push(eq(appelsDeFondsTable.buildingId, buildingId));
    if (lotId) conditions.push(eq(appelsDeFondsTable.lotId, lotId));
    if (status) conditions.push(eq(appelsDeFondsTable.status, status));
    if (period) conditions.push(eq(appelsDeFondsTable.period, period));
    if (ownerId) conditions.push(eq(appelsDeFondsTable.ownerId, ownerId));

    // Members see only their own charges.
    // ownerId may store membersTable.id (seeded) or usersTable.id — try both.
    if (user.role === "member") {
      const [member] = await db
        .select({ id: membersTable.id })
        .from(membersTable)
        .where(eq(membersTable.email, user.email))
        .limit(1);
      if (member) {
        conditions.push(or(
          eq(appelsDeFondsTable.ownerId, member.id),
          eq(appelsDeFondsTable.ownerId, user.userId),
        ));
      } else {
        conditions.push(eq(appelsDeFondsTable.ownerId, user.userId));
      }
    }

    const rows = await db
      .select()
      .from(appelsDeFondsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(appelsDeFondsTable.createdAt));

    const [stats] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount}), 0)`,
        collected: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount}) FILTER (WHERE ${appelsDeFondsTable.status} = 'paid'), 0)`,
        pending: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount}) FILTER (WHERE ${appelsDeFondsTable.status} = 'pending'), 0)`,
        overdue: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount}) FILTER (WHERE ${appelsDeFondsTable.status} = 'overdue'), 0)`,
      })
      .from(appelsDeFondsTable)
      .where(conditions.length ? and(...conditions) : undefined);

    res.json({ data: rows, total: rows.length, stats });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /appels-de-fonds/:id/pay — Submit payment
router.put("/appels-de-fonds/:id/pay", requireAuth, async (req, res) => {
  try {
    const { paymentMethod, proofUrl, notes } = req.body;

    const [updated] = await db
      .update(appelsDeFondsTable)
      .set({
        status: "pending",
        paymentMethod,
        proofUrl,
        notes,
      })
      .where(eq(appelsDeFondsTable.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /appels-de-fonds/:id/validate — Admin validates payment
router.put("/appels-de-fonds/:id/validate", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { approve, receiptNumber } = req.body;

    const [updated] = await db
      .update(appelsDeFondsTable)
      .set({
        status: approve ? "paid" : "pending",
        paidDate: approve ? new Date().toISOString().split("T")[0] : undefined,
        receiptNumber: approve ? (receiptNumber ?? `REC-${Date.now()}`) : undefined,
      })
      .where(eq(appelsDeFondsTable.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /appels-de-fonds/mark-overdue — Cron-style: mark past due as overdue
router.put("/appels-de-fonds/mark-overdue", requireAuth, requireAdmin, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const result = await db
      .update(appelsDeFondsTable)
      .set({ status: "overdue" })
      .where(
        and(
          eq(appelsDeFondsTable.status, "pending"),
          sql`${appelsDeFondsTable.dueDate} < ${today}`
        )
      )
      .returning();

    res.json({ updated: result.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
