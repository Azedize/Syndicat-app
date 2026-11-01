// budget: debts endpoints (mounted by budget.routes.ts, in order).
import { sendRouteError } from "../../lib/route-error.js";
import { Router } from "express";
import { db } from "@workspace/db";
import {
  budgetsTable,
  appelsDeFondsTable,
  buildingsTable,
  membersTable,
  debtEscalationsTable,
  syndicatesTable,
  alertsTable,
} from "@workspace/db/schema";
import {
  eq,
  and,
  desc,
  sql,
  inArray,
} from "drizzle-orm";
import { requireAuth, requireFinanceAccess } from "../../middleware/auth.js";
import { localToday } from "../../lib/charge-time.js";

const router = Router();

// ─── Debt escalation, reserve fund, overdue calls ──────────────────────────────

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
          // Outstanding part only: partial payments reduce the debt.
          amount: sql<string>`${appelsDeFondsTable.amount} - ${appelsDeFondsTable.amountPaid}`,
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
      sendRouteError(req, res, e);
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
      sendRouteError(req, res, e);
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
              date: localToday(),
              target: "admin",
              syndicateId: budget.syndicateId,
            })
            .returning();
          alertsCreated.push(alert);
        }
      }
      res.json({ alerts: alertsCreated.length, data: alertsCreated });
    } catch (e) {
      sendRouteError(req, res, e);
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
      const today = localToday();

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
            // Nothing paid yet: a partially paid call keeps that status (settlementStatus).
            eq(appelsDeFondsTable.status, "pending"),
            sql`${appelsDeFondsTable.amountPaid} = 0`,
            sql`${appelsDeFondsTable.dueDate} < ${today}`,
            inArray(appelsDeFondsTable.buildingId, buildingIds),
          ),
        )
        .returning();

      res.json({ updated: result.length });
    } catch (e) {
      sendRouteError(req, res, e);
    }
  },
);

export default router;
