import { Router } from "express";
import { db } from "@workspace/db";
import {
  membersTable,
  syndicatesTable,
  cotisationsTable,
  transactionsTable,
  caisseEntriesTable,
  unionActionsTable,
  supportTicketsTable,
  usersTable,
  electionsTable,
} from "@workspace/db/schema";
import { eq, and, count, sum, gte, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { syndicateWhere } from "../lib/syndicate-filter.js";

const router = Router();

// Helper: last N months as { label, from, to }
function lastNMonths(n: number) {
  const months: { label: string; key: string; from: Date; to: Date }[] = [];
  const FR_MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    months.push({ label: FR_MONTHS[d.getMonth()], key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, from, to });
  }
  return months;
}

// ─── Platform-wide statistics (super_admin only) ──────────────────────────────
router.get(
  "/statistics/platform",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    try {
      const months = lastNMonths(6);

      const [
        syndicatesRows,
        totalMembersRow,
        activeMembersRow,
        revenueRow,
        expensesRow,
        openTicketsRow,
        activeSubs,
      ] = await Promise.all([
        db.select({ id: syndicatesTable.id, status: syndicatesTable.status }).from(syndicatesTable),
        db.select({ value: count() }).from(membersTable),
        db.select({ value: count() }).from(membersTable).where(eq(membersTable.status, "active")),
        db.select({ value: sql<number>`coalesce(sum(${transactionsTable.amount}),0)` })
          .from(transactionsTable)
          .where(and(
            sql`${transactionsTable.type} IN ('cotisation','recette')`,
            eq(transactionsTable.status, "paid"),
          )),
        db.select({ value: sql<number>`coalesce(sum(abs(${transactionsTable.amount})),0)` })
          .from(transactionsTable)
          .where(and(
            sql`${transactionsTable.type} IN ('depense','salaire')`,
            eq(transactionsTable.status, "paid"),
          )),
        db.select({ value: count() }).from(supportTicketsTable).where(eq(supportTicketsTable.status, "open")),
        db.select({ value: count() }).from(syndicatesTable).where(eq(syndicatesTable.status, "active")),
      ]);

      // Monthly revenue chart (last 6 months from transactions)
      const allTransactions = await db
        .select({ amount: transactionsTable.amount, type: transactionsTable.type, status: transactionsTable.status, createdAt: transactionsTable.createdAt })
        .from(transactionsTable)
        .where(gte(transactionsTable.createdAt, months[0].from));

      const allMembers = await db
        .select({ createdAt: membersTable.createdAt })
        .from(membersTable)
        .where(gte(membersTable.createdAt, months[0].from));

      const revenueChart = months.map((m) => {
        const val = allTransactions
          .filter((t) =>
            t.createdAt && t.createdAt >= m.from && t.createdAt <= m.to
            && (t.type === "cotisation" || t.type === "recette")
            && t.status === "paid"
          )
          .reduce((s, t) => s + (t.amount ?? 0), 0);
        return { label: m.label, value: Math.round(val) };
      });

      const membersChart = months.map((m) => {
        const val = allMembers
          .filter((mem) => mem.createdAt && mem.createdAt >= m.from && mem.createdAt <= m.to)
          .length;
        return { label: m.label, value: val };
      });

      const expensesChart = months.map((m) => {
        const val = allTransactions
          .filter((t) =>
            t.createdAt && t.createdAt >= m.from && t.createdAt <= m.to
            && (t.type === "depense" || t.type === "salaire")
            && t.status === "paid"
          )
          .reduce((s, t) => s + Math.abs(t.amount ?? 0), 0);
        return { label: m.label, value: Math.round(val) };
      });

      res.json({
        data: {
          totalSyndicates: syndicatesRows.length,
          activeSyndicates: Number(activeSubs[0].value),
          totalMembers: Number(totalMembersRow[0].value),
          activeMembers: Number(activeMembersRow[0].value),
          totalRevenue: Math.round(Number(revenueRow[0].value)),
          totalExpenses: Math.round(Number(expensesRow[0].value)),
          openTickets: Number(openTicketsRow[0].value),
          charts: { revenue: revenueChart, members: membersChart, expenses: expensesChart },
        },
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── HR indicators (scoped to syndicate) ─────────────────────────────────────
router.get(
  "/statistics/hr",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    try {
      const where = syndicateWhere(req, membersTable.syndicateId);
      const cotWhere = syndicateWhere(req, cotisationsTable.syndicateId);
      const actionWhere = syndicateWhere(req, unionActionsTable.syndicateId);
      const months = lastNMonths(6);

      const [
        totalMembersRow,
        activeMembersRow,
        cotisationsRows,
        actionsRows,
        allMembersRows,
      ] = await Promise.all([
        db.select({ value: count() }).from(membersTable).where(where),
        db.select({ value: count() }).from(membersTable).where(
          where ? and(where, eq(membersTable.status, "active")) : eq(membersTable.status, "active")
        ),
        db.select({ status: cotisationsTable.status, amount: cotisationsTable.amount, paidDate: cotisationsTable.paidDate, createdAt: cotisationsTable.createdAt })
          .from(cotisationsTable)
          .where(cotWhere)
          .orderBy(desc(cotisationsTable.createdAt))
          .limit(2000),
        db.select({ date: unionActionsTable.date, createdAt: unionActionsTable.createdAt })
          .from(unionActionsTable)
          .where(actionWhere ? and(actionWhere, gte(unionActionsTable.createdAt!, months[0].from)) : gte(unionActionsTable.createdAt!, months[0].from))
          .limit(500),
        db.select({ createdAt: membersTable.createdAt })
          .from(membersTable)
          .where(where ? and(where, gte(membersTable.createdAt!, months[0].from)) : gte(membersTable.createdAt!, months[0].from))
          .limit(500),
      ]);

      const totalMembers = Number(totalMembersRow[0].value);
      const activeMembers = Number(activeMembersRow[0].value);
      const paidCotisations = cotisationsRows.filter((c) => c.status === "paid").length;
      const totalCotisations = cotisationsRows.length;
      const cotisationRate = totalCotisations > 0 ? Math.round((paidCotisations / totalCotisations) * 100) : 0;
      const overdueMembers = cotisationsRows.filter((c) => c.status === "overdue").length;

      const adhesionsChart = months.map((m) => ({
        label: m.label,
        valeur: allMembersRows.filter((mem) => mem.createdAt && mem.createdAt >= m.from && mem.createdAt <= m.to).length,
      }));

      const cotisationsChart = months.map((m) => ({
        label: m.label,
        valeur: Math.round(
          cotisationsRows
            .filter((c) => c.status === "paid" && c.createdAt && c.createdAt >= m.from && c.createdAt <= m.to)
            .reduce((s, c) => s + (c.amount ?? 0), 0)
        ),
      }));

      const actionsChart = months.map((m) => ({
        label: m.label,
        valeur: actionsRows.filter((a) => a.createdAt && a.createdAt >= m.from && a.createdAt <= m.to).length,
      }));

      res.json({
        data: {
          totalMembers,
          activeMembers,
          cotisationRate,
          overdueMembers,
          paidCotisations,
          totalCotisations,
          charts: { adhesions: adhesionsChart, cotisations: cotisationsChart, actions: actionsChart },
        },
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Finance summary for syndicat dashboard ───────────────────────────────────
router.get(
  "/statistics/finance/summary",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    try {
      const caisseWhere = syndicateWhere(req, caisseEntriesTable.syndicateId);
      const txWhere = syndicateWhere(req, transactionsTable.syndicateId);

      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [latestCaisse, thisMonthRevenue, thisMonthExpenses, totalRevenue, totalExpenses] = await Promise.all([
        db.select({ balance: caisseEntriesTable.balance, amount: caisseEntriesTable.amount })
          .from(caisseEntriesTable)
          .where(caisseWhere)
          .orderBy(desc(caisseEntriesTable.createdAt))
          .limit(10),
        db.select({ value: sql<number>`coalesce(sum(${transactionsTable.amount}),0)` })
          .from(transactionsTable)
          .where(
            txWhere
              ? and(txWhere, sql`${transactionsTable.type} IN ('cotisation','recette')`, eq(transactionsTable.status, "paid"), gte(transactionsTable.createdAt, thisMonthStart))
              : and(sql`${transactionsTable.type} IN ('cotisation','recette')`, eq(transactionsTable.status, "paid"), gte(transactionsTable.createdAt, thisMonthStart))
          ),
        db.select({ value: sql<number>`coalesce(sum(abs(${transactionsTable.amount})),0)` })
          .from(transactionsTable)
          .where(
            txWhere
              ? and(txWhere, sql`${transactionsTable.type} IN ('depense','salaire')`, eq(transactionsTable.status, "paid"), gte(transactionsTable.createdAt, thisMonthStart))
              : and(sql`${transactionsTable.type} IN ('depense','salaire')`, eq(transactionsTable.status, "paid"), gte(transactionsTable.createdAt, thisMonthStart))
          ),
        db.select({ value: sql<number>`coalesce(sum(${transactionsTable.amount}),0)` })
          .from(transactionsTable)
          .where(
            txWhere
              ? and(txWhere, sql`${transactionsTable.type} IN ('cotisation','recette')`, eq(transactionsTable.status, "paid"))
              : and(sql`${transactionsTable.type} IN ('cotisation','recette')`, eq(transactionsTable.status, "paid"))
          ),
        db.select({ value: sql<number>`coalesce(sum(abs(${transactionsTable.amount})),0)` })
          .from(transactionsTable)
          .where(
            txWhere
              ? and(txWhere, sql`${transactionsTable.type} IN ('depense','salaire')`, eq(transactionsTable.status, "paid"))
              : and(sql`${transactionsTable.type} IN ('depense','salaire')`, eq(transactionsTable.status, "paid"))
          ),
      ]);

      // Compute caisse balance: use the stored balance from the latest entry, or sum all amounts
      let caisseBalance = 0;
      if (latestCaisse.length > 0 && latestCaisse[0].balance != null) {
        caisseBalance = latestCaisse[0].balance;
      } else {
        caisseBalance = latestCaisse.reduce((s, e) => {
          if (e.amount != null) {
            return s + e.amount;
          }
          return s;
        }, 0);
      }

      res.json({
        data: {
          caisseBalance: Math.round(caisseBalance),
          monthlyRevenue: Math.round(Number(thisMonthRevenue[0].value)),
          monthlyExpenses: Math.round(Number(thisMonthExpenses[0].value)),
          totalRevenue: Math.round(Number(totalRevenue[0].value)),
          totalExpenses: Math.round(Number(totalExpenses[0].value)),
        },
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Enriched syndicates list (super_admin only) ──────────────────────────────
router.get(
  "/statistics/syndicates",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    try {
      const [syndicates, allMembers, allCotisations, allTickets, allCaisse, allElections, admins] = await Promise.all([
        db.select().from(syndicatesTable).orderBy(desc(syndicatesTable.membersCount)),
        db.select({ syndicateId: membersTable.syndicateId, status: membersTable.status }).from(membersTable),
        db.select({ syndicateId: cotisationsTable.syndicateId, status: cotisationsTable.status }).from(cotisationsTable),
        db.select({ syndicateId: supportTicketsTable.syndicateId, status: supportTicketsTable.status }).from(supportTicketsTable),
        db.select({ syndicateId: caisseEntriesTable.syndicateId, balance: caisseEntriesTable.balance, amount: caisseEntriesTable.amount, createdAt: caisseEntriesTable.createdAt }).from(caisseEntriesTable).orderBy(desc(caisseEntriesTable.createdAt)),
        db.select({ syndicateId: electionsTable.syndicateId, status: electionsTable.status }).from(electionsTable),
        db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable),
      ]);

      const enriched = syndicates.map((sy) => {
        const syMembers = allMembers.filter((m) => m.syndicateId === sy.id);
        const activeMembers = syMembers.filter((m) => m.status === "active").length;

        const syCotisations = allCotisations.filter((c) => c.syndicateId === sy.id);
        const paidCot = syCotisations.filter((c) => c.status === "paid").length;
        const cotisationRate = syCotisations.length > 0 ? Math.round((paidCot / syCotisations.length) * 100) : 0;

        const openTickets = allTickets.filter((t) => t.syndicateId === sy.id && t.status === "open").length;

        // Latest caisse balance for this syndicate
        const syCaisse = allCaisse.filter((c) => c.syndicateId === sy.id);
        let balance = 0;
        if (syCaisse.length > 0 && syCaisse[0].balance != null) {
          balance = syCaisse[0].balance;
        }

        const pendingElections = allElections.filter((e) => e.syndicateId === sy.id && e.status === "upcoming").length;

        const adminUser = sy.adminId ? admins.find((a) => a.id === sy.adminId) : null;

        let status: "healthy" | "warning" | "critical" = "healthy";
        if (cotisationRate < 70 || openTickets > 15) status = "critical";
        else if (cotisationRate < 80 || openTickets > 7) status = "warning";

        return {
          id: sy.id,
          name: sy.name,
          region: sy.region ?? "National",
          sector: sy.sector ?? "",
          members: sy.membersCount ?? syMembers.length,
          activeMembers,
          cotisationRate,
          balance,
          pendingElections,
          openTickets,
          status,
          adminName: adminUser?.name ?? "N/A",
          syStatus: sy.status,
        };
      });

      res.json({ data: enriched });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

export default router;
