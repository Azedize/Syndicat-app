import { Router } from "express";
import { db } from "@workspace/db";
import {
  budgetsTable,
  budgetLinesTable,
  appelsDeFondsTable,
  lotsTable,
  buildingsTable,
  membersTable,
  transactionsTable,
  debtEscalationsTable,
  syndicatesTable,
  alertsTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, sum, or, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin, requireOperationalAccess } from "../middleware/auth.js";
import { serverAuditLog } from "../lib/audit.js";

const router = Router();

// GET /budgets — admin only (members see their charges via /appels-de-fonds)
router.get("/budgets", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = req.user!;

    // Mandatory syndicate scoping: syndicate_admin must have syndicateId in JWT
    if (user.role === "syndicate_admin" && !user.syndicateId) {
      return res.status(403).json({ error: "Syndicat non défini dans le token" });
    }

    const { buildingId, year, status } = req.query as Record<string, string>;

    // Scope by syndicate: budgetsTable has no syndicateId — derive via building FK
    // Get allowed building IDs for this syndicate, then filter budgets by buildingId
    let allowedBuildingIds: string[] | null = null;
    if (user.role === "syndicate_admin") {
      const scopedBuildings = await db
        .select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.syndicateId, user.syndicateId!));
      allowedBuildingIds = scopedBuildings.map((b) => b.id);
      if (allowedBuildingIds.length === 0) return res.json({ data: [], total: 0 });
    } else if (user.role === "super_admin" && req.query.syndicateId) {
      const scopedBuildings = await db
        .select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.syndicateId, req.query.syndicateId as string));
      allowedBuildingIds = scopedBuildings.map((b) => b.id);
      if (allowedBuildingIds.length === 0) return res.json({ data: [], total: 0 });
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

// GET /budgets/:id — admin only
router.get("/budgets/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = req.user!;

    const [budget] = await db
      .select()
      .from(budgetsTable)
      .where(eq(budgetsTable.id, req.params.id));

    if (!budget) return res.status(404).json({ error: "Budget not found" });

    // Syndicate isolation: budgetsTable has no syndicateId — derive via building FK
    if (user.role === "syndicate_admin") {
      if (!user.syndicateId) return res.status(403).json({ error: "Syndicat non défini dans le token" });
      const [bld] = await db
        .select({ syndicateId: buildingsTable.syndicateId })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, budget.buildingId))
        .limit(1);
      if (!bld || bld.syndicateId !== user.syndicateId) {
        return res.status(403).json({ error: "Accès refusé" });
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
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /budgets
router.post("/budgets", requireAuth, requireOperationalAccess, async (req, res) => {
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
router.put("/budgets/:id", requireAuth, requireOperationalAccess, async (req, res) => {
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
router.post("/budgets/:id/generate-appels", requireAuth, requireOperationalAccess, async (req, res) => {
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

    const totalTantiemes = lots.reduce((s, l) => s + (l.tantiemes ?? 0), 0);
    if (totalTantiemes === 0) return res.status(400).json({ error: "Lots have no tantiemes assigned" });

    const chargeType = type ?? "charges_courantes";
    const baseAmount = Number(
      chargeType === "fonds_reserve" ? (budget.fondsReserve ?? 0) : (budget.chargesAmount ?? 0),
    );

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

    // Members and tenants see only their own charges.
    // ownerId may store membersTable.id (seeded) or usersTable.id — try both.
    if (user.role === "member" || user.role === "tenant") {
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

// PUT /appels-de-fonds/:id/pay — Submit payment (owner or admin only)
router.put("/appels-de-fonds/:id/pay", requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    // Fetch the call-for-funds first to verify ownership
    const [appel] = await db
      .select()
      .from(appelsDeFondsTable)
      .where(eq(appelsDeFondsTable.id, req.params.id));

    if (!appel) return res.status(404).json({ error: "Not found" });

    // Admins can submit payment for any call-for-funds in their syndicate.
    // Members and tenants may only pay calls assigned to them.
    const isAdmin = user.role === "super_admin" || user.role === "syndicate_admin";
    if (!isAdmin) {
      // Resolve member record by email (seeded rows use membersTable.id as ownerId)
      const [member] = await db
        .select({ id: membersTable.id })
        .from(membersTable)
        .where(eq(membersTable.email, user.email))
        .limit(1);
      const memberId = member?.id;
      const isOwner =
        appel.ownerId === user.userId ||
        (memberId && appel.ownerId === memberId);
      if (!isOwner) {
        return res.status(403).json({ error: "Vous ne pouvez soumettre un paiement que pour vos propres appels de fonds" });
      }
    }

    const { paymentMethod, proofUrl, notes } = req.body;
    if (!paymentMethod) {
      return res.status(400).json({ error: "Le mode de paiement est obligatoire" });
    }
    const [updated] = await db
      .update(appelsDeFondsTable)
      .set({
        // pending_validation = payment submitted, awaiting admin review
        status: "pending_validation",
        paymentMethod,
        proofUrl: proofUrl ?? null,
        notes: notes ?? null,
        // Clear any previous rejection
        rejectionReason: null,
      })
      .where(eq(appelsDeFondsTable.id, req.params.id))
      .returning();

    res.json({ data: updated, message: "Paiement soumis, en attente de validation" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /appels-de-fonds/:id/validate — Admin approves or rejects a payment submission
router.put("/appels-de-fonds/:id/validate", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = req.user!;
    const { approve, rejectionReason } = req.body;

    const [appel] = await db
      .select()
      .from(appelsDeFondsTable)
      .where(eq(appelsDeFondsTable.id, req.params.id));
    if (!appel) return res.status(404).json({ error: "Not found" });

    // appels_de_fonds has no syndicateId of its own — derive it via the building,
    // so a super_admin's validation is correctly traced to the syndicate it affected,
    // and a syndicate_admin can be blocked from validating another syndicate's calls.
    const [building] = await db
      .select({ syndicateId: buildingsTable.syndicateId })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, appel.buildingId));

    if (user.role === "syndicate_admin" && building?.syndicateId !== user.syndicateId) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    if (appel.status !== "pending_validation") {
      return res.status(400).json({ error: "Cet appel n'est pas en attente de validation" });
    }

    if (!approve && !rejectionReason) {
      return res.status(400).json({ error: "Un motif de rejet est obligatoire" });
    }

    const now = new Date();
    const receiptNum = approve
      ? `REC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`
      : undefined;

    const [updated] = await db
      .update(appelsDeFondsTable)
      .set({
        status: approve ? "paid" : "rejected",
        paidDate: approve ? now.toISOString().split("T")[0] : undefined,
        receiptNumber: receiptNum,
        rejectionReason: approve ? null : (rejectionReason ?? "Paiement non conforme"),
        validatedBy: user.userId,
        validatedAt: now,
      })
      .where(eq(appelsDeFondsTable.id, req.params.id))
      .returning();

    // Write audit log (routed through serverAuditLog for consistent actor/supervision tracking)
    await serverAuditLog(req, {
      action: approve ? "payment_approved" : "payment_rejected",
      entity: "appel_de_fonds",
      entityId: appel.id,
      syndicateId: building?.syndicateId ?? undefined,
      details: JSON.stringify({
        amount: appel.amount,
        period: appel.period,
        paymentMethod: appel.paymentMethod,
        receiptNumber: receiptNum,
        rejectionReason: approve ? null : rejectionReason,
      }),
    });

    // On approval: create a transaction record for accounting
    if (approve) {
      db.insert(transactionsTable).values({
        type: "cotisation",
        amount: appel.amount,
        label: `Cotisation ${appel.period} — Reçu ${receiptNum}`,
        date: now.toISOString().split("T")[0],
        status: "paid",
        memberId: appel.ownerId ?? null,
        syndicateId: null,
      }).catch(() => {});
    }

    res.json({
      data: updated,
      message: approve
        ? `Paiement validé. Reçu: ${receiptNum}`
        : "Paiement rejeté. Le propriétaire sera informé.",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /appels-de-fonds/escalate-debts — P7: Scan overdue charges and create escalation records
router.post("/appels-de-fonds/escalate-debts", requireAuth, requireAdmin, async (req, res) => {
  try {
    const now = new Date();

    const overdueCharges = await db
      .select({
        ownerId: appelsDeFondsTable.ownerId,
        amount: appelsDeFondsTable.amount,
        buildingId: appelsDeFondsTable.buildingId,
      })
      .from(appelsDeFondsTable)
      .where(eq(appelsDeFondsTable.status, "overdue"));

    if (overdueCharges.length === 0) {
      res.json({ escalations: 0, message: "Aucune charge en retard" }); return;
    }

    // Group by ownerId
    const byMember = new Map<string, { ownerId: string; buildingId: string; totalOverdue: number; months: number }>();
    for (const charge of overdueCharges) {
      if (!charge.ownerId) continue;
      if (!byMember.has(charge.ownerId)) {
        byMember.set(charge.ownerId, { ownerId: charge.ownerId, buildingId: charge.buildingId, totalOverdue: 0, months: 0 });
      }
      const entry = byMember.get(charge.ownerId)!;
      entry.totalOverdue += parseFloat(String(charge.amount ?? 0));
      entry.months += 1;
    }

    const created: any[] = [];
    for (const [ownerId, data] of byMember) {
      let level: string | null = null;
      let overdueMonths = data.months;
      if (data.months >= 12) { level = "critical"; overdueMonths = 12; }
      else if (data.months >= 6) { level = "serious"; overdueMonths = 6; }
      else if (data.months >= 3) { level = "warning"; overdueMonths = 3; }
      if (!level) continue;

      const [member] = await db.select().from(membersTable).where(eq(membersTable.id, ownerId));
      const [building] = await db.select({ syndicateId: buildingsTable.syndicateId }).from(buildingsTable).where(eq(buildingsTable.id, data.buildingId));

      if (req.user!.role !== "super_admin" && building?.syndicateId !== req.user!.syndicateId) continue;

      const existing = await db.select().from(debtEscalationsTable)
        .where(and(eq(debtEscalationsTable.memberId, ownerId), eq(debtEscalationsTable.status, "open")));

      if (existing.length > 0) {
        const [updated] = await db.update(debtEscalationsTable)
          .set({ level, overdueMonths, totalOverdue: String(data.totalOverdue.toFixed(2)), alertSentAt: now })
          .where(eq(debtEscalationsTable.id, existing[0].id))
          .returning();
        created.push(updated);
      } else {
        const [row] = await db.insert(debtEscalationsTable).values({
          syndicateId: building?.syndicateId,
          memberId: ownerId,
          memberName: member?.name ?? "Membre inconnu",
          totalOverdue: String(data.totalOverdue.toFixed(2)),
          overdueMonths,
          level,
          status: "open",
          alertSentAt: now,
        }).returning();
        created.push(row);
      }
    }
    res.json({ escalations: created.length, data: created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /debt-escalations — list open debt escalations for this syndicate
router.get("/debt-escalations", requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await db.select().from(debtEscalationsTable)
      .where(
        req.user!.role === "super_admin"
          ? eq(debtEscalationsTable.status, "open")
          : and(eq(debtEscalationsTable.status, "open"), eq(debtEscalationsTable.syndicateId, req.user!.syndicateId!))
      )
      .orderBy(desc(debtEscalationsTable.createdAt));
    res.json({ data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /budgets/check-reserve-fund — P8: Check reserve fund, fire alerts if below threshold
router.post("/budgets/check-reserve-fund", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { thresholdMonths = 3 } = req.body as { thresholdMonths?: number };

    const base = db
      .select({
        fondsReserve: budgetsTable.fondsReserve,
        chargesAmount: budgetsTable.chargesAmount,
        syndicateId: buildingsTable.syndicateId,
        syndicateName: syndicatesTable.name,
      })
      .from(budgetsTable)
      .innerJoin(buildingsTable, eq(budgetsTable.buildingId, buildingsTable.id))
      .leftJoin(syndicatesTable, eq(buildingsTable.syndicateId, syndicatesTable.id));

    const budgetData = req.user!.role === "super_admin"
      ? await base
      : await base.where(eq(buildingsTable.syndicateId, req.user!.syndicateId!));

    const alertsCreated: any[] = [];
    for (const budget of budgetData) {
      const reserve = parseFloat(String(budget.fondsReserve ?? 0));
      const monthly = parseFloat(String(budget.chargesAmount ?? 0)) / 12;
      const threshold = monthly * thresholdMonths;
      if (monthly > 0 && reserve < threshold) {
        const [alert] = await db.insert(alertsTable).values({
          title: "⚠️ Fonds de réserve insuffisant",
          message: `Le fonds de réserve de ${budget.syndicateName ?? "votre syndicat"} (${reserve.toFixed(2)} MAD) est inférieur au seuil de ${thresholdMonths} mois de charges (${threshold.toFixed(2)} MAD). Une réunion extraordinaire est recommandée.`,
          type: "warning",
          date: new Date().toISOString().split("T")[0],
          target: "admin",
          syndicateId: budget.syndicateId,
        }).returning();
        alertsCreated.push(alert);
      }
    }
    res.json({ alerts: alertsCreated.length, data: alertsCreated });
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
