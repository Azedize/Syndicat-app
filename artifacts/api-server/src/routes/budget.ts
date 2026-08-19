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
  caisseEntriesTable,
  usersTable,
  prestatairesTable,
  meetingsTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, sum, or, inArray } from "drizzle-orm";
import {
  requireAuth,
  requireAdmin,
  requireOperationalAccess,
  requireFinanceAccess,
  isSyndicateTeamRole,
} from "../middleware/auth.js";
import { assertUserCanAccessBuilding } from "../lib/scope.js";

/** True when the user is syndicate-scoped (not super_admin). Used for row-level scoping in finance queries. */
function isSyndicateScoped(role: string): boolean {
  return isSyndicateTeamRole(role as any);
}
import { serverAuditLog } from "../lib/audit.js";

const router = Router();

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
    req.log.error(e);
    res.status(500).json({ error: "Server error" });
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
      req.log.error(e);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// POST /budgets — Treasurer is responsible for budgets (spec: "Mohamed suit les budgets").
// requireFinanceAccess allows syndicate_admin and treasurer (not super_admin direct access).
router.post("/budgets", requireAuth, requireFinanceAccess, async (req, res) => {
  try {
    const user = req.user!;
    const {
      year,
      buildingId,
      totalAmount,
      chargesAmount,
      fondsReserve,
      status,
      notes,
      lines,
    } = req.body;

    if (!year || !buildingId) {
      return void res
        .status(400)
        .json({ error: "year and buildingId are required" });
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
        })),
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

      const allowed = [
        "totalAmount",
        "chargesAmount",
        "fondsReserve",
        "status",
        "votedAt",
        "meetingId",
        "notes",
      ];
      const updates: Record<string, any> = {};
      for (const k of allowed) {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
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
      req.log.error(e);
      res.status(500).json({ error: "Server error" });
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
      const { period, type } = req.body;
      if (!period)
        return void res
          .status(400)
          .json({ error: "period is required (e.g. '2026-Q1')" });

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

      const lots = await db
        .select()
        .from(lotsTable)
        .where(eq(lotsTable.buildingId, budget.buildingId));

      if (lots.length === 0)
        return void res
          .status(400)
          .json({ error: "No lots found for this building" });

      const totalTantiemes = lots.reduce((s, l) => s + (l.tantiemes ?? 0), 0);
      if (totalTantiemes === 0)
        return void res
          .status(400)
          .json({ error: "Lots have no tantiemes assigned" });

      const chargeType = type ?? "charges_courantes";
      const baseAmount = Number(
        chargeType === "fonds_reserve"
          ? (budget.fondsReserve ?? 0)
          : (budget.chargesAmount ?? 0),
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
        amount: Math.round(
          (periodAmount * Number(lot.tantiemes ?? 0)) / totalTantiemes,
        ),
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
  },
);

// ─── Appels de Fonds ──────────────────────────────────────────────────────

// GET /appels-de-fonds
// SECURITY: Admin path scoped to syndicate; buildingId param verified before use
router.get("/appels-de-fonds", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { buildingId, lotId, status, period, ownerId } = req.query as Record<
      string,
      string
    >;

    const conditions: any[] = [];

    if (user.role === "super_admin" && req.query.supervision !== "true") {
      return void res.status(403).json({
        error: "La supervision est requise pour accéder aux appels de fonds.",
        code: "SUPERVISION_REQUIRED",
      });
    }

    // Syndicate admin MUST have syndicateId in JWT — never fall through to global scope
    if (isSyndicateScoped(user.role) && !user.syndicateId) {
      return void res
        .status(403)
        .json({ error: "Syndicat non défini dans le token" });
    }

    if (buildingId) {
      await assertUserCanAccessBuilding(user, buildingId);
      // For syndicate_admin, verify the buildingId belongs to their syndicate
      if (isSyndicateScoped(user.role)) {
        const [bld] = await db
          .select({ syndicateId: buildingsTable.syndicateId })
          .from(buildingsTable)
          .where(eq(buildingsTable.id, buildingId))
          .limit(1);
        if (!bld || bld.syndicateId !== user.syndicateId) {
          return void res
            .status(403)
            .json({ error: "Accès refusé à cet immeuble" });
        }
      }
      conditions.push(eq(appelsDeFondsTable.buildingId, buildingId));
    } else if (isSyndicateScoped(user.role)) {
      // No explicit buildingId — scope to all buildings in this syndicate
      const syndicateBuildings = await db
        .select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.syndicateId, user.syndicateId!));
      const buildingIds = syndicateBuildings.map((b) => b.id);
      if (buildingIds.length === 0) {
        return void res.json({
          data: [],
          total: 0,
          stats: { total: 0, collected: 0, pending: 0, overdue: 0 },
        });
      }
      conditions.push(inArray(appelsDeFondsTable.buildingId, buildingIds));
    }

    if (lotId) {
      const [lot] = await db
        .select({ buildingId: lotsTable.buildingId })
        .from(lotsTable)
        .where(eq(lotsTable.id, lotId))
        .limit(1);
      if (!lot) return void res.status(404).json({ error: "Lot introuvable" });
      if (buildingId && lot.buildingId !== buildingId) {
        return void res
          .status(400)
          .json({ error: "Le lot n'appartient pas à cet immeuble" });
      }
      if (isSyndicateScoped(user.role)) {
        await assertUserCanAccessBuilding(user, lot.buildingId);
      }
      conditions.push(eq(appelsDeFondsTable.lotId, lotId));
    }
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
        conditions.push(
          or(
            eq(appelsDeFondsTable.ownerId, member.id),
            eq(appelsDeFondsTable.ownerId, user.userId),
          ),
        );
      } else {
        conditions.push(eq(appelsDeFondsTable.ownerId, user.userId));
      }
    }

    // Tenants do NOT have access to appels de fonds at all
    if (user.role === "tenant") {
      return void res.status(403).json({
        error: "Les locataires n'ont pas accès aux charges de copropriété",
      });
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
  } catch (e: any) {
    if (e?.status) return void res.status(e.status).json({ error: e.message });
    req.log.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /appels-de-fonds/:id/pay — Submit payment (owner or admin only)
router.put("/appels-de-fonds/:id/pay", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.role === "super_admin" && req.query.supervision !== "true") {
      return void res.status(403).json({
        error: "La supervision est requise pour soumettre un paiement.",
        code: "SUPERVISION_REQUIRED",
      });
    }
    if (isSyndicateScoped(user.role) && !user.syndicateId) {
      return void res
        .status(403)
        .json({ error: "Syndicat non défini dans le token" });
    }

    // Tenants cannot pay appels de fonds (not owners)
    if (user.role === "tenant") {
      return void res.status(403).json({
        error: "Les locataires n'ont pas accès aux charges de copropriété",
      });
    }

    // Fetch the call-for-funds first to verify ownership
    const [appel] = await db
      .select()
      .from(appelsDeFondsTable)
      .where(eq(appelsDeFondsTable.id, String(req.params.id)));

    if (!appel) return void res.status(404).json({ error: "Not found" });

    // Admins can submit payment for any call-for-funds in their syndicate.
    const isAdmin = user.role === "super_admin" || isSyndicateScoped(user.role);

    if (isAdmin && isSyndicateScoped(user.role)) {
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
        return void res.status(403).json({
          error:
            "Vous ne pouvez soumettre un paiement que pour vos propres appels de fonds",
        });
      }
    }

    const { paymentMethod, proofUrl, notes } = req.body;
    if (!paymentMethod) {
      return void res
        .status(400)
        .json({ error: "Le mode de paiement est obligatoire" });
    }

    // Reject local device URIs — they are not accessible from the server
    if (
      proofUrl &&
      (String(proofUrl).startsWith("file://") ||
        String(proofUrl).startsWith("content://"))
    ) {
      return void res.status(400).json({
        error:
          "Le justificatif doit être téléchargé sur le serveur avant la soumission. URI local non accepté.",
        code: "LOCAL_URI_REJECTED",
      });
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

    res.json({
      data: updated,
      message: "Paiement soumis, en attente de validation",
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /appels-de-fonds/:id/validate — Admin approves or rejects a payment submission
router.put(
  "/appels-de-fonds/:id/validate",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
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

      if (
        isSyndicateScoped(user.role) &&
        building?.syndicateId !== user.syndicateId
      ) {
        return void res.status(403).json({ error: "Accès refusé" });
      }

      if (appel.status !== "pending_validation") {
        return void res
          .status(400)
          .json({ error: "Cet appel n'est pas en attente de validation" });
      }

      if (!approve && !rejectionReason) {
        return void res
          .status(400)
          .json({ error: "Un motif de rejet est obligatoire" });
      }

      // Enforce: admin cannot approve a charge without proof of payment
      if (approve && !appel.proofUrl) {
        return void res.status(400).json({
          error:
            "Validation refusée : une pièce justificative (proofUrl) est obligatoire avant d'approuver un paiement.",
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
          rejectionReason: approve
            ? null
            : (rejectionReason ?? "Paiement non conforme"),
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

      // On approval: create a transaction record for accounting + sync caisse
      if (approve) {
        const syndicateId = building?.syndicateId ?? null;
        const dateStr = now.toISOString().split("T")[0];
        const amountNum = Number(appel.amount ?? 0);

        // Fire-and-forget: insert transaction for the member's payment record
        db.insert(transactionsTable)
          .values({
            type: "cotisation",
            amount: appel.amount,
            label: `Cotisation ${appel.period} — Reçu ${receiptNum}`,
            date: dateStr,
            status: "paid",
            memberId: appel.ownerId ?? null,
            syndicateId,
          } as any)
          .catch(() => {});

        // Sync caisse: add an "encaissement" entry so the running balance is updated
        if (syndicateId) {
          db.transaction(async (tx) => {
            await tx.execute(
              sql`SELECT pg_advisory_xact_lock(hashtext(${syndicateId}))`,
            );
            const [last] = await tx
              .select({ balance: caisseEntriesTable.balance })
              .from(caisseEntriesTable)
              .where(eq(caisseEntriesTable.syndicateId, syndicateId))
              .orderBy(desc(caisseEntriesTable.createdAt))
              .limit(1);
            const prevBalance = Number(last?.balance ?? 0);
            await tx.insert(caisseEntriesTable).values({
              label: `Appel de fonds ${appel.period} — ${receiptNum}`,
              amount: String(amountNum),
              type: "encaissement",
              date: dateStr,
              category: "charges_copropriete",
              syndicateId,
              balance: String(prevBalance + amountNum),
            } as any);
          }).catch(() => {});
        }
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
  },
);

// GET /appels-de-fonds/:id/receipt — Generate and stream a PDF payment receipt
// Access: admin (any) or the owner of the appel. Also accepts a ?token= query param
// so mobile apps can open the URL directly in Linking.openURL without CORS issues.
router.get("/appels-de-fonds/:id/receipt", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.role === "super_admin" && req.query.supervision !== "true") {
      return void res.status(403).json({
        error: "La supervision est requise pour accéder à ce reçu.",
        code: "SUPERVISION_REQUIRED",
      });
    }

    const [appel] = await db
      .select()
      .from(appelsDeFondsTable)
      .where(eq(appelsDeFondsTable.id, String(req.params.id)));
    if (!appel) return void res.status(404).json({ error: "Not found" });

    if (isSyndicateScoped(user.role)) {
      if (!user.syndicateId) {
        return void res
          .status(403)
          .json({ error: "Syndicat non défini dans le token" });
      }
      const [buildingScope] = await db
        .select({ syndicateId: buildingsTable.syndicateId })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, appel.buildingId))
        .limit(1);
      if (!buildingScope || buildingScope.syndicateId !== user.syndicateId) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
    }

    // Access check: admin in same syndicate, or the owner
    const isAdmin = user.role === "super_admin" || isSyndicateScoped(user.role);
    if (!isAdmin) {
      const [member] = await db
        .select({ id: membersTable.id })
        .from(membersTable)
        .where(eq(membersTable.email, user.email))
        .limit(1);
      const isOwner =
        appel.ownerId === user.userId ||
        (member && appel.ownerId === member.id);
      if (!isOwner) return void res.status(403).json({ error: "Accès refusé" });
    }

    if (appel.status !== "paid" || !appel.receiptNumber) {
      return void res.status(400).json({
        error: "Reçu disponible uniquement pour les paiements validés",
      });
    }

    // Fetch enrichment data
    const [[building], [lot]] = await Promise.all([
      db
        .select({
          address: buildingsTable.address,
          name: buildingsTable.name,
          syndicateId: buildingsTable.syndicateId,
        })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, appel.buildingId))
        .limit(1),
      db
        .select({ number: lotsTable.number })
        .from(lotsTable)
        .where(eq(lotsTable.id, appel.lotId))
        .limit(1),
    ]);

    const [syndicate] = building?.syndicateId
      ? await db
          .select({ name: syndicatesTable.name })
          .from(syndicatesTable)
          .where(eq(syndicatesTable.id, building.syndicateId))
          .limit(1)
      : [undefined];

    // Dynamic pdfmake import (same pattern as documentPdf.ts)
    const PdfPrinter = (await import("pdfmake")).default as any;
    const DEJAVU_DIR = "/usr/share/fonts/truetype/dejavu";
    const { existsSync } = await import("fs");
    const fonts: Record<string, unknown> = {
      Helvetica: {
        normal: "Helvetica",
        bold: "Helvetica-Bold",
        italics: "Helvetica-Oblique",
        bolditalics: "Helvetica-BoldOblique",
      },
    };
    if (existsSync(`${DEJAVU_DIR}/DejaVuSans.ttf`)) {
      fonts.DejaVu = {
        normal: `${DEJAVU_DIR}/DejaVuSans.ttf`,
        bold: existsSync(`${DEJAVU_DIR}/DejaVuSans-Bold.ttf`)
          ? `${DEJAVU_DIR}/DejaVuSans-Bold.ttf`
          : `${DEJAVU_DIR}/DejaVuSans.ttf`,
        italics: `${DEJAVU_DIR}/DejaVuSans.ttf`,
        bolditalics: existsSync(`${DEJAVU_DIR}/DejaVuSans-Bold.ttf`)
          ? `${DEJAVU_DIR}/DejaVuSans-Bold.ttf`
          : `${DEJAVU_DIR}/DejaVuSans.ttf`,
      };
    }
    const FONT = fonts.DejaVu ? "DejaVu" : "Helvetica";
    const printer = new PdfPrinter(fonts);

    const amountFmt = Number(appel.amount ?? 0).toLocaleString("fr-MA", {
      minimumFractionDigits: 2,
    });
    const payMethodLabels: Record<string, string> = {
      virement: "Virement bancaire",
      cheque: "Chèque",
      especes: "Espèces",
      online: "Paiement en ligne",
    };
    const typeLabels: Record<string, string> = {
      charges_courantes: "Charges courantes",
      fonds_reserve: "Fonds de réserve",
      appel_special: "Appel spécial",
    };

    const docDef = {
      pageSize: "A4",
      pageMargins: [40, 60, 40, 60],
      defaultStyle: { font: FONT, fontSize: 10 },
      content: [
        // Header band
        {
          canvas: [
            { type: "rect", x: -40, y: -60, w: 595, h: 80, color: "#1e40af" },
          ],
          absolutePosition: { x: 0, y: 0 },
        },
        {
          text: syndicate?.name ?? "Syndicat de Copropriété",
          style: { font: FONT, fontSize: 16, bold: true, color: "#ffffff" },
          margin: [0, 0, 0, 4],
        },
        {
          text: "REÇU DE PAIEMENT",
          style: { font: FONT, fontSize: 12, color: "#bfdbfe" },
          margin: [0, 0, 0, 30],
        },
        // Receipt number + date
        {
          columns: [
            {
              stack: [
                {
                  text: "Référence du reçu",
                  style: { font: FONT, fontSize: 8, color: "#64748b" },
                },
                {
                  text: appel.receiptNumber!,
                  style: {
                    font: FONT,
                    fontSize: 14,
                    bold: true,
                    color: "#1e40af",
                  },
                },
              ],
            },
            {
              stack: [
                {
                  text: "Date de paiement",
                  style: { font: FONT, fontSize: 8, color: "#64748b" },
                  alignment: "right",
                },
                {
                  text:
                    appel.paidDate ?? new Date().toISOString().split("T")[0],
                  style: { font: FONT, fontSize: 12, bold: true },
                  alignment: "right",
                },
              ],
            },
          ],
          margin: [0, 0, 0, 20],
        },
        // Amount box
        {
          table: {
            widths: ["*"],
            body: [
              [
                {
                  stack: [
                    {
                      text: "Montant payé",
                      style: {
                        font: FONT,
                        fontSize: 9,
                        color: "#64748b",
                        alignment: "center",
                      },
                    },
                    {
                      text: `${amountFmt} MAD`,
                      style: {
                        font: FONT,
                        fontSize: 26,
                        bold: true,
                        color: "#1e40af",
                        alignment: "center",
                      },
                    },
                  ],
                  fillColor: "#eff6ff",
                  margin: [0, 16, 0, 16],
                  border: [false, false, false, false],
                },
              ],
            ],
          },
          margin: [0, 0, 0, 20],
        },
        // Details table
        {
          table: {
            widths: [160, "*"],
            body: [
              [
                {
                  text: "Période",
                  style: {
                    font: FONT,
                    fontSize: 9,
                    bold: true,
                    color: "#475569",
                  },
                  border: [false, false, false, true],
                  borderColor: ["", "", "", "#e2e8f0"],
                },
                {
                  text: appel.period,
                  border: [false, false, false, true],
                  borderColor: ["", "", "", "#e2e8f0"],
                },
              ],
              [
                {
                  text: "Type de charge",
                  style: {
                    font: FONT,
                    fontSize: 9,
                    bold: true,
                    color: "#475569",
                  },
                  border: [false, false, false, true],
                  borderColor: ["", "", "", "#e2e8f0"],
                },
                {
                  text:
                    typeLabels[String(appel.type ?? "")] ?? appel.type ?? "—",
                  border: [false, false, false, true],
                  borderColor: ["", "", "", "#e2e8f0"],
                },
              ],
              [
                {
                  text: "Mode de paiement",
                  style: {
                    font: FONT,
                    fontSize: 9,
                    bold: true,
                    color: "#475569",
                  },
                  border: [false, false, false, true],
                  borderColor: ["", "", "", "#e2e8f0"],
                },
                {
                  text:
                    payMethodLabels[String(appel.paymentMethod ?? "")] ??
                    appel.paymentMethod ??
                    "—",
                  border: [false, false, false, true],
                  borderColor: ["", "", "", "#e2e8f0"],
                },
              ],
              [
                {
                  text: "Lot",
                  style: {
                    font: FONT,
                    fontSize: 9,
                    bold: true,
                    color: "#475569",
                  },
                  border: [false, false, false, true],
                  borderColor: ["", "", "", "#e2e8f0"],
                },
                {
                  text: lot?.number ? `Lot ${lot.number}` : appel.lotId,
                  border: [false, false, false, true],
                  borderColor: ["", "", "", "#e2e8f0"],
                },
              ],
              [
                {
                  text: "Immeuble",
                  style: {
                    font: FONT,
                    fontSize: 9,
                    bold: true,
                    color: "#475569",
                  },
                  border: [false, false, false, false],
                },
                {
                  text: building?.name
                    ? `${building.name}${building.address ? ` — ${building.address}` : ""}`
                    : "—",
                  border: [false, false, false, false],
                },
              ],
            ],
          },
          layout: {
            paddingTop: () => 8,
            paddingBottom: () => 8,
            paddingLeft: () => 4,
            paddingRight: () => 4,
          },
          margin: [0, 0, 0, 24],
        },
        // Footer
        {
          text: "Ce reçu constitue la preuve du paiement de votre appel de fonds. Conservez-le pour vos archives.",
          style: { font: FONT, fontSize: 8, color: "#94a3b8", italics: true },
          alignment: "center",
        },
        {
          text: `Généré le ${new Date().toLocaleDateString("fr-MA")} — MIZAN`,
          style: { font: FONT, fontSize: 7, color: "#cbd5e1" },
          alignment: "center",
          margin: [0, 4, 0, 0],
        },
      ],
    };

    const pdfDoc = printer.createPdfKitDocument(docDef);
    const chunks: Buffer[] = [];
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="recu-${appel.receiptNumber}.pdf"`,
      );
      res.send(pdfBuffer);
    });
    pdfDoc.on("error", (err: Error) => {
      req.log.error(err);
      if (!res.headersSent)
        res.status(500).json({ error: "Erreur génération PDF" });
    });
    pdfDoc.end();
  } catch (e) {
    req.log.error(e);
    if (!res.headersSent) res.status(500).json({ error: "Server error" });
  }
});

// POST /appels-de-fonds/escalate-debts — Scan overdue charges and create escalation records
router.post(
  "/appels-de-fonds/escalate-debts",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    try {
      const user = req.user!;
      const now = new Date();

      const scopedBuildings = await db
        .select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.syndicateId, user.syndicateId!));
      const buildingIds = scopedBuildings.map((building) => building.id);
      if (buildingIds.length === 0) {
        return void res.json({ escalations: 0, data: [] });
      }

      const overdueCharges = await db
        .select({
          ownerId: appelsDeFondsTable.ownerId,
          amount: appelsDeFondsTable.amount,
          buildingId: appelsDeFondsTable.buildingId,
        })
        .from(appelsDeFondsTable)
        .where(
          and(
            eq(appelsDeFondsTable.status, "overdue"),
            inArray(appelsDeFondsTable.buildingId, buildingIds),
          ),
        );

      if (overdueCharges.length === 0) {
        res.json({ escalations: 0, message: "Aucune charge en retard" });
        return;
      }

      // Group by ownerId
      const byMember = new Map<
        string,
        {
          ownerId: string;
          buildingId: string;
          totalOverdue: number;
          months: number;
        }
      >();
      for (const charge of overdueCharges) {
        if (!charge.ownerId) continue;
        if (!byMember.has(charge.ownerId)) {
          byMember.set(charge.ownerId, {
            ownerId: charge.ownerId,
            buildingId: charge.buildingId,
            totalOverdue: 0,
            months: 0,
          });
        }
        const entry = byMember.get(charge.ownerId)!;
        entry.totalOverdue += parseFloat(String(charge.amount ?? 0));
        entry.months += 1;
      }

      const created: any[] = [];
      for (const [ownerId, data] of byMember) {
        let level: string | null = null;
        let overdueMonths = data.months;
        if (data.months >= 12) {
          level = "critical";
          overdueMonths = 12;
        } else if (data.months >= 6) {
          level = "serious";
          overdueMonths = 6;
        } else if (data.months >= 3) {
          level = "warning";
          overdueMonths = 3;
        }
        if (!level) continue;

        const [member] = await db
          .select()
          .from(membersTable)
          .where(eq(membersTable.id, ownerId));
        const [building] = await db
          .select({ syndicateId: buildingsTable.syndicateId })
          .from(buildingsTable)
          .where(eq(buildingsTable.id, data.buildingId));

        if (
          req.user!.role !== "super_admin" &&
          building?.syndicateId !== req.user!.syndicateId
        )
          continue;

        const existing = await db
          .select()
          .from(debtEscalationsTable)
          .where(
            and(
              eq(debtEscalationsTable.memberId, ownerId),
              eq(debtEscalationsTable.status, "open"),
            ),
          );

        if (existing.length > 0) {
          const [updated] = await db
            .update(debtEscalationsTable)
            .set({
              level,
              overdueMonths,
              totalOverdue: String(data.totalOverdue.toFixed(2)),
              alertSentAt: now,
            })
            .where(eq(debtEscalationsTable.id, existing[0].id))
            .returning();
          created.push(updated);
        } else {
          const [row] = await db
            .insert(debtEscalationsTable)
            .values({
              syndicateId: building?.syndicateId,
              memberId: ownerId,
              memberName: member?.name ?? "Membre inconnu",
              totalOverdue: String(data.totalOverdue.toFixed(2)),
              overdueMonths,
              level,
              status: "open",
              alertSentAt: now,
            } as any)
            .returning();
          created.push(row);
        }
      }
      res.json({ escalations: created.length, data: created });
    } catch (e) {
      req.log.error(e);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// GET /debt-escalations — list open debt escalations for this syndicate
router.get(
  "/debt-escalations",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(debtEscalationsTable)
        .where(
          req.user!.role === "super_admin"
            ? eq(debtEscalationsTable.status, "open")
            : and(
                eq(debtEscalationsTable.status, "open"),
                eq(debtEscalationsTable.syndicateId, req.user!.syndicateId!),
              ),
        )
        .orderBy(desc(debtEscalationsTable.createdAt));
      res.json({ data: rows });
    } catch (e) {
      req.log.error(e);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// POST /budgets/check-reserve-fund — Check reserve fund, fire alerts if below threshold
router.post(
  "/budgets/check-reserve-fund",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
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
        .innerJoin(
          buildingsTable,
          eq(budgetsTable.buildingId, buildingsTable.id),
        )
        .leftJoin(
          syndicatesTable,
          eq(buildingsTable.syndicateId, syndicatesTable.id),
        );

      const budgetData =
        req.user!.role === "super_admin"
          ? await base
          : await base.where(
              eq(buildingsTable.syndicateId, req.user!.syndicateId!),
            );

      const alertsCreated: any[] = [];
      for (const budget of budgetData) {
        const reserve = parseFloat(String(budget.fondsReserve ?? 0));
        const monthly = parseFloat(String(budget.chargesAmount ?? 0)) / 12;
        const threshold = monthly * thresholdMonths;
        if (monthly > 0 && reserve < threshold) {
          const [alert] = await db
            .insert(alertsTable)
            .values({
              title: "⚠️ Fonds de réserve insuffisant",
              message: `Le fonds de réserve de ${budget.syndicateName ?? "votre syndicat"} (${reserve.toFixed(2)} MAD) est inférieur au seuil de ${thresholdMonths} mois de charges (${threshold.toFixed(2)} MAD). Une réunion extraordinaire est recommandée.`,
              type: "warning",
              date: new Date().toISOString().split("T")[0],
              target: "admin",
              syndicateId: budget.syndicateId,
            })
            .returning();
          alertsCreated.push(alert);
        }
      }
      res.json({ alerts: alertsCreated.length, data: alertsCreated });
    } catch (e) {
      req.log.error(e);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// PUT /appels-de-fonds/mark-overdue — Cron-style: mark past due as overdue
router.put(
  "/appels-de-fonds/mark-overdue",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    try {
      const user = req.user!;
      const today = new Date().toISOString().split("T")[0];

      const scopedBuildings = await db
        .select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.syndicateId, user.syndicateId!));
      const buildingIds = scopedBuildings.map((building) => building.id);
      if (buildingIds.length === 0) {
        return void res.json({ updated: 0 });
      }

      const result = await db
        .update(appelsDeFondsTable)
        .set({ status: "overdue" })
        .where(
          and(
            eq(appelsDeFondsTable.status, "pending"),
            sql`${appelsDeFondsTable.dueDate} < ${today}`,
            inArray(appelsDeFondsTable.buildingId, buildingIds),
          ),
        )
        .returning();

      res.json({ updated: result.length });
    } catch (e) {
      req.log.error(e);
      res.status(500).json({ error: "Server error" });
    }
  },
);

export default router;
