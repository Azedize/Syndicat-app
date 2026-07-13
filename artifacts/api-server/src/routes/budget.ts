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
      return void res.status(403).json({ error: "Syndicat non défini dans le token" });
    }

    const { buildingId, year, status } = req.query as Record<string, string>;

    // Scope by syndicate: budgetsTable has no syndicateId — derive via building FK
    let allowedBuildingIds: string[] | null = null;
    if (user.role === "syndicate_admin") {
      const scopedBuildings = await db
        .select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.syndicateId, user.syndicateId!));
      allowedBuildingIds = scopedBuildings.map((b) => b.id);
      if (allowedBuildingIds.length === 0) return void res.json({ data: [], total: 0 });
    } else if (user.role === "super_admin" && req.query.syndicateId) {
      const scopedBuildings = await db
        .select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.syndicateId, req.query.syndicateId as string));
      allowedBuildingIds = scopedBuildings.map((b) => b.id);
      if (allowedBuildingIds.length === 0) return void res.json({ data: [], total: 0 });
    }

    // If a specific buildingId is requested by syndicate_admin, verify it's in scope
    if (buildingId && user.role === "syndicate_admin") {
      if (!allowedBuildingIds || !allowedBuildingIds.includes(buildingId)) {
        return void res.status(403).json({ error: "Accès refusé à cet immeuble" });
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
      db.select().from(budgetLinesTable).where(inArray(budgetLinesTable.budgetId, budgetIds)),
      db
        .select({
          budgetId: appelsDeFondsTable.budgetId,
          collected: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount}) FILTER (WHERE ${appelsDeFondsTable.status} = 'paid'), 0)`,
          pending: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount}) FILTER (WHERE ${appelsDeFondsTable.status} IN ('pending','overdue')), 0)`,
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
    const chargeStatsByBudget = new Map(allChargeStats.map((s) => [s.budgetId, s]));

    const enriched = rows.map((b) => ({
      ...b,
      lines: linesByBudget.get(b.id) ?? [],
      chargeStats: chargeStatsByBudget.get(b.id) ?? { collected: 0, pending: 0 },
    }));

    res.json({ data: enriched, total: enriched.length });
  } catch (e) {
    req.log.error(e);
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
      .where(eq(budgetsTable.id, String(req.params.id)));

    if (!budget) return void res.status(404).json({ error: "Budget not found" });

    // Syndicate isolation: budgetsTable has no syndicateId — derive via building FK
    if (user.role === "syndicate_admin") {
      if (!user.syndicateId) return void res.status(403).json({ error: "Syndicat non défini dans le token" });
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
    req.log.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /budgets
// SECURITY: Verify buildingId belongs to caller's syndicate before INSERT
router.post("/budgets", requireAuth, requireOperationalAccess, async (req, res) => {
  try {
    const user = req.user!;
    const { year, buildingId, totalAmount, chargesAmount, fondsReserve, status, notes, lines } = req.body;

    if (!year || !buildingId) {
      return void res.status(400).json({ error: "year and buildingId are required" });
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
    if (user.role === "syndicate_admin" && building.syndicateId !== user.syndicateId) {
      return void res.status(403).json({ error: "Accès refusé : cet immeuble n'appartient pas à votre syndicat" });
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
        createdBy: user.userId,
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

    await serverAuditLog(req, {
      action: "CREATE",
      entity: "budget",
      entityId: budget.id,
      syndicateId: building.syndicateId ?? undefined,
      details: `Budget ${year} créé pour immeuble ${buildingId}`,
    });

    res.status(201).json(budget);
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /budgets/:id
// SECURITY: Fetch budget first, verify building ownership before UPDATE
router.put("/budgets/:id", requireAuth, requireOperationalAccess, async (req, res) => {
  try {
    const user = req.user!;

    // Fetch existing budget for ownership check
    const [existing] = await db
      .select()
      .from(budgetsTable)
      .where(eq(budgetsTable.id, String(req.params.id)));

    if (!existing) return void res.status(404).json({ error: "Budget not found" });

    // Syndicate ownership check via building FK
    const [building] = await db
      .select({ syndicateId: buildingsTable.syndicateId })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, existing.buildingId))
      .limit(1);

    if (user.role === "syndicate_admin") {
      if (!building || building.syndicateId !== user.syndicateId) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
    }

    const allowed = ["totalAmount", "chargesAmount", "fondsReserve", "status", "votedAt", "meetingId", "notes"];
    const updates: Record<string, any> = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    const [updated] = await db
      .update(budgetsTable)
      .set(updates)
      .where(eq(budgetsTable.id, String(req.params.id)))
      .returning();

    if (!updated) return void res.status(404).json({ error: "Budget not found" });

    await serverAuditLog(req, {
      action: "UPDATE",
      entity: "budget",
      entityId: String(req.params.id),
      syndicateId: building?.syndicateId ?? undefined,
      details: `Budget mis à jour: ${JSON.stringify(updates)}`,
    });

    res.json(updated);
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /budgets/:id/generate-appels — Auto-generate appels de fonds for all lots
// SECURITY: Verify building ownership before generating charges
router.post("/budgets/:id/generate-appels", requireAuth, requireOperationalAccess, async (req, res) => {
  try {
    const user = req.user!;
    const { period, type } = req.body;
    if (!period) return void res.status(400).json({ error: "period is required (e.g. '2026-Q1')" });

    const [budget] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, String(req.params.id)));
    if (!budget) return void res.status(404).json({ error: "Budget not found" });

    // Syndicate ownership check via building FK
    const [building] = await db
      .select({ syndicateId: buildingsTable.syndicateId })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, budget.buildingId))
      .limit(1);

    if (user.role === "syndicate_admin") {
      if (!building || building.syndicateId !== user.syndicateId) {
        return void res.status(403).json({ error: "Accès refusé : cet immeuble n'appartient pas à votre syndicat" });
      }
    }

    const lots = await db
      .select()
      .from(lotsTable)
      .where(eq(lotsTable.buildingId, budget.buildingId));

    if (lots.length === 0) return void res.status(400).json({ error: "No lots found for this building" });

    const totalTantiemes = lots.reduce((s, l) => s + (l.tantiemes ?? 0), 0);
    if (totalTantiemes === 0) return void res.status(400).json({ error: "Lots have no tantiemes assigned" });

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
      amount: Math.round((periodAmount * Number(lot.tantiemes ?? 0)) / totalTantiemes),
      dueDate: dueDate.toISOString().split("T")[0],
      status: "pending" as const,
    }));

    await db.insert(appelsDeFondsTable).values(appels as any);

    await serverAuditLog(req, {
      action: "GENERATE_APPELS",
      entity: "budget",
      entityId: budget.id,
      syndicateId: building?.syndicateId ?? undefined,
      details: `${appels.length} appels générés pour période ${period}`,
    });

    res.status(201).json({
      message: `Generated ${appels.length} appels de fonds for period ${period}`,
      total: appels.reduce((s, a) => s + a.amount, 0),
      count: appels.length,
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Appels de Fonds ──────────────────────────────────────────────────────

// GET /appels-de-fonds
// SECURITY: Admin path scoped to syndicate; buildingId param verified before use
router.get("/appels-de-fonds", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { buildingId, lotId, status, period, ownerId } = req.query as Record<string, string>;

    const conditions: any[] = [];

    // Syndicate admin MUST have syndicateId in JWT — never fall through to global scope
    if (user.role === "syndicate_admin" && !user.syndicateId) {
      return void res.status(403).json({ error: "Syndicat non défini dans le token" });
    }

    if (buildingId) {
      // For syndicate_admin, verify the buildingId belongs to their syndicate
      if (user.role === "syndicate_admin") {
        const [bld] = await db
          .select({ syndicateId: buildingsTable.syndicateId })
          .from(buildingsTable)
          .where(eq(buildingsTable.id, buildingId))
          .limit(1);
        if (!bld || bld.syndicateId !== user.syndicateId) {
          return void res.status(403).json({ error: "Accès refusé à cet immeuble" });
        }
      }
      conditions.push(eq(appelsDeFondsTable.buildingId, buildingId));
    } else if (user.role === "syndicate_admin") {
      // No explicit buildingId — scope to all buildings in this syndicate
      const syndicateBuildings = await db
        .select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.syndicateId, user.syndicateId!));
      const buildingIds = syndicateBuildings.map((b) => b.id);
      if (buildingIds.length === 0) {
        return void res.json({ data: [], total: 0, stats: { total: 0, collected: 0, pending: 0, overdue: 0 } });
      }
      conditions.push(inArray(appelsDeFondsTable.buildingId, buildingIds));
    }

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

    // Tenants do NOT have access to appels de fonds at all
    if (user.role === "tenant") {
      return void res.status(403).json({ error: "Les locataires n'ont pas accès aux charges de copropriété" });
    }

    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [stats]] = await Promise.all([
      db
        .select()
        .from(appelsDeFondsTable)
        .where(where)
        .orderBy(desc(appelsDeFondsTable.createdAt)),
      db
        .select({
          total: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount}), 0)`,
          collected: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount}) FILTER (WHERE ${appelsDeFondsTable.status} = 'paid'), 0)`,
          pending: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount}) FILTER (WHERE ${appelsDeFondsTable.status} = 'pending'), 0)`,
          overdue: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount}) FILTER (WHERE ${appelsDeFondsTable.status} = 'overdue'), 0)`,
        })
        .from(appelsDeFondsTable)
        .where(where),
    ]);

    res.json({ data: rows, total: rows.length, stats });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /appels-de-fonds/:id/pay — Submit payment (owner or admin only)
router.put("/appels-de-fonds/:id/pay", requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    // Tenants cannot pay appels de fonds (not owners)
    if (user.role === "tenant") {
      return void res.status(403).json({ error: "Les locataires n'ont pas accès aux charges de copropriété" });
    }

    // Fetch the call-for-funds first to verify ownership
    const [appel] = await db
      .select()
      .from(appelsDeFondsTable)
      .where(eq(appelsDeFondsTable.id, String(req.params.id)));

    if (!appel) return void res.status(404).json({ error: "Not found" });

    // Admins can submit payment for any call-for-funds in their syndicate.
    const isAdmin = user.role === "super_admin" || user.role === "syndicate_admin";

    if (isAdmin && user.role === "syndicate_admin") {
      // Verify this charge belongs to the admin's syndicate via building FK
      const [bld] = await db
        .select({ syndicateId: buildingsTable.syndicateId })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, appel.buildingId))
        .limit(1);
      if (!bld || bld.syndicateId !== user.syndicateId) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
    }

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
        return void res.status(403).json({ error: "Vous ne pouvez soumettre un paiement que pour vos propres appels de fonds" });
      }
    }

    const { paymentMethod, proofUrl, notes } = req.body;
    if (!paymentMethod) {
      return void res.status(400).json({ error: "Le mode de paiement est obligatoire" });
    }
    const [updated] = await db
      .update(appelsDeFondsTable)
      .set({
        status: "pending_validation",
        paymentMethod,
        proofUrl: proofUrl ?? null,
        notes: notes ?? null,
        rejectionReason: null,
      })
      .where(eq(appelsDeFondsTable.id, String(req.params.id)))
      .returning();

    res.json({ data: updated, message: "Paiement soumis, en attente de validation" });
  } catch (e) {
    req.log.error(e);
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
      .where(eq(appelsDeFondsTable.id, String(req.params.id)));
    if (!appel) return void res.status(404).json({ error: "Not found" });

    // Derive syndicate via building for isolation and audit
    const [building] = await db
      .select({ syndicateId: buildingsTable.syndicateId })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, appel.buildingId));

    if (user.role === "syndicate_admin" && building?.syndicateId !== user.syndicateId) {
      return void res.status(403).json({ error: "Accès refusé" });
    }

    if (appel.status !== "pending_validation") {
      return void res.status(400).json({ error: "Cet appel n'est pas en attente de validation" });
    }

    if (!approve && !rejectionReason) {
      return void res.status(400).json({ error: "Un motif de rejet est obligatoire" });
    }

    // Enforce: admin cannot approve a charge without proof of payment
    if (approve && !appel.proofUrl) {
      return void res.status(400).json({
        error: "Validation refusée : une pièce justificative (proofUrl) est obligatoire avant d'approuver un paiement.",
        code: "PROOF_REQUIRED",
      });
    }

    const now = new Date();
    // Generate receipt number using crypto-safe method
    const receiptNum = approve
      ? `REC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getTime()).slice(-6)}`
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
      .where(eq(appelsDeFondsTable.id, String(req.params.id)))
      .returning();

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
        syndicateId: building?.syndicateId ?? null,
      }).catch(() => {});
    }

    res.json({
      data: updated,
      message: approve
        ? `Paiement validé. Reçu: ${receiptNum}`
        : "Paiement rejeté. Le propriétaire sera informé.",
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /appels-de-fonds/escalate-debts — Scan overdue charges and create escalation records
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
        } as any).returning();
        created.push(row);
      }
    }
    res.json({ escalations: created.length, data: created });
  } catch (e) {
    req.log.error(e);
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
    req.log.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /budgets/check-reserve-fund — Check reserve fund, fire alerts if below threshold
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
    req.log.error(e);
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
    req.log.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
