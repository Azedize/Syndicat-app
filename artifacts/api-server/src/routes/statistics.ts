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
  paymentProofsTable,
  buildingsTable,
  lotsTable,
  tenantsTable,
  sinistresTable,
  documentsTable,
  meetingsTable,
  appelsDeFondsTable,
} from "@workspace/db/schema";
import { eq, and, or, count, sum, gte, lt, desc, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { syndicateWhere } from "../lib/syndicate-filter.js";

const router = Router();

async function resolveScopedSyndicateId(req: any): Promise<string> {
  const user = req.user!;
  if (user.role !== "super_admin") {
    if (!user.syndicateId) {
      throw Object.assign(new Error("Syndicat non défini dans le token"), {
        status: 403,
      });
    }
    return user.syndicateId;
  }

  if (req.query.supervision !== "true") {
    throw Object.assign(
      new Error(
        "Les Super Admins doivent activer le mode supervision pour accéder aux statistiques d'un syndicat.",
      ),
      { status: 403, code: "SUPERVISION_REQUIRED" },
    );
  }

  const syndicateId =
    typeof req.query.syndicateId === "string"
      ? req.query.syndicateId.trim()
      : "";
  if (!syndicateId) {
    throw Object.assign(new Error("Un syndicat cible est requis"), {
      status: 400,
    });
  }

  const [target] = await db
    .select({ id: syndicatesTable.id })
    .from(syndicatesTable)
    .where(eq(syndicatesTable.id, syndicateId))
    .limit(1);
  if (!target) {
    throw Object.assign(new Error("Syndicat cible introuvable"), {
      status: 404,
    });
  }
  return syndicateId;
}

// Helper: last N months as { label, from, to }
function lastNMonths(n: number) {
  const months: { label: string; key: string; from: Date; to: Date }[] = [];
  const FR_MONTHS = [
    "Jan",
    "Fév",
    "Mar",
    "Avr",
    "Mai",
    "Jun",
    "Jul",
    "Aoû",
    "Sep",
    "Oct",
    "Nov",
    "Déc",
  ];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    months.push({
      label: FR_MONTHS[d.getMonth()],
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      from,
      to,
    });
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
        db
          .select({ id: syndicatesTable.id, status: syndicatesTable.status })
          .from(syndicatesTable),
        db.select({ value: count() }).from(membersTable),
        db
          .select({ value: count() })
          .from(membersTable)
          .where(eq(membersTable.status, "active")),
        db
          .select({
            value: sql<number>`coalesce(sum(${transactionsTable.amount}),0)`,
          })
          .from(transactionsTable)
          .where(
            and(
              sql`${transactionsTable.type} IN ('cotisation','recette')`,
              eq(transactionsTable.status, "paid"),
            ),
          ),
        db
          .select({
            value: sql<number>`coalesce(sum(abs(${transactionsTable.amount})),0)`,
          })
          .from(transactionsTable)
          .where(
            and(
              sql`${transactionsTable.type} IN ('depense','salaire')`,
              eq(transactionsTable.status, "paid"),
            ),
          ),
        db
          .select({ value: count() })
          .from(supportTicketsTable)
          .where(eq(supportTicketsTable.status, "open")),
        db
          .select({ value: count() })
          .from(syndicatesTable)
          .where(eq(syndicatesTable.status, "active")),
      ]);

      // Monthly revenue chart (last 6 months from transactions)
      const allTransactions = await db
        .select({
          amount: transactionsTable.amount,
          type: transactionsTable.type,
          status: transactionsTable.status,
          createdAt: transactionsTable.createdAt,
        })
        .from(transactionsTable)
        .where(gte(transactionsTable.createdAt, months[0].from));

      const allMembers = await db
        .select({ createdAt: membersTable.createdAt })
        .from(membersTable)
        .where(gte(membersTable.createdAt, months[0].from));

      const revenueChart = months.map((m) => {
        const val = allTransactions
          .filter(
            (t) =>
              t.createdAt &&
              t.createdAt >= m.from &&
              t.createdAt <= m.to &&
              (t.type === "cotisation" || t.type === "recette") &&
              t.status === "paid",
          )
          .reduce((s, t) => s + Number(t.amount ?? 0), 0);
        return { label: m.label, value: Math.round(val) };
      });

      const membersChart = months.map((m) => {
        const val = allMembers.filter(
          (mem) =>
            mem.createdAt && mem.createdAt >= m.from && mem.createdAt <= m.to,
        ).length;
        return { label: m.label, value: val };
      });

      const expensesChart = months.map((m) => {
        const val = allTransactions
          .filter(
            (t) =>
              t.createdAt &&
              t.createdAt >= m.from &&
              t.createdAt <= m.to &&
              (t.type === "depense" || t.type === "salaire") &&
              t.status === "paid",
          )
          .reduce((s, t) => s + Math.abs(Number(t.amount ?? 0)), 0);
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
          charts: {
            revenue: revenueChart,
            members: membersChart,
            expenses: expensesChart,
          },
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
      const syndicateId = await resolveScopedSyndicateId(req);
      const where = eq(membersTable.syndicateId, syndicateId);
      const cotWhere = eq(cotisationsTable.syndicateId, syndicateId);
      const actionWhere = eq(unionActionsTable.syndicateId, syndicateId);
      const months = lastNMonths(6);

      const [
        totalMembersRow,
        activeMembersRow,
        cotisationsRows,
        actionsRows,
        allMembersRows,
      ] = await Promise.all([
        db.select({ value: count() }).from(membersTable).where(where),
        db
          .select({ value: count() })
          .from(membersTable)
          .where(and(where, eq(membersTable.status, "active"))),
        db
          .select({
            status: cotisationsTable.status,
            amount: cotisationsTable.amount,
            paidDate: cotisationsTable.paidDate,
            createdAt: cotisationsTable.createdAt,
          })
          .from(cotisationsTable)
          .where(cotWhere)
          .orderBy(desc(cotisationsTable.createdAt))
          .limit(2000),
        db
          .select({
            date: unionActionsTable.date,
            createdAt: unionActionsTable.createdAt,
          })
          .from(unionActionsTable)
          .where(
            and(actionWhere, gte(unionActionsTable.createdAt!, months[0].from)),
          )
          .limit(500),
        db
          .select({ createdAt: membersTable.createdAt })
          .from(membersTable)
          .where(and(where, gte(membersTable.createdAt!, months[0].from)))
          .limit(500),
      ]);

      const totalMembers = Number(totalMembersRow[0].value);
      const activeMembers = Number(activeMembersRow[0].value);
      const paidCotisations = cotisationsRows.filter(
        (c) => c.status === "paid",
      ).length;
      const totalCotisations = cotisationsRows.length;
      const cotisationRate =
        totalCotisations > 0
          ? Math.round((paidCotisations / totalCotisations) * 100)
          : 0;
      const overdueMembers = cotisationsRows.filter(
        (c) => c.status === "overdue",
      ).length;

      const adhesionsChart = months.map((m) => ({
        label: m.label,
        valeur: allMembersRows.filter(
          (mem) =>
            mem.createdAt && mem.createdAt >= m.from && mem.createdAt <= m.to,
        ).length,
      }));

      const cotisationsChart = months.map((m) => ({
        label: m.label,
        valeur: Math.round(
          cotisationsRows
            .filter(
              (c) =>
                c.status === "paid" &&
                c.createdAt &&
                c.createdAt >= m.from &&
                c.createdAt <= m.to,
            )
            .reduce((s, c) => s + Number(c.amount ?? 0), 0),
        ),
      }));

      const actionsChart = months.map((m) => ({
        label: m.label,
        valeur: actionsRows.filter(
          (a) => a.createdAt && a.createdAt >= m.from && a.createdAt <= m.to,
        ).length,
      }));

      res.json({
        data: {
          totalMembers,
          activeMembers,
          cotisationRate,
          overdueMembers,
          paidCotisations,
          totalCotisations,
          charts: {
            adhesions: adhesionsChart,
            cotisations: cotisationsChart,
            actions: actionsChart,
          },
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
      const syndicateId = await resolveScopedSyndicateId(req);
      const caisseWhere = eq(caisseEntriesTable.syndicateId, syndicateId);
      const txWhere = eq(transactionsTable.syndicateId, syndicateId);

      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [
        latestCaisse,
        thisMonthRevenue,
        thisMonthExpenses,
        totalRevenue,
        totalExpenses,
      ] = await Promise.all([
        db
          .select({
            balance: caisseEntriesTable.balance,
            amount: caisseEntriesTable.amount,
          })
          .from(caisseEntriesTable)
          .where(caisseWhere)
          .orderBy(desc(caisseEntriesTable.createdAt))
          .limit(10),
        db
          .select({
            value: sql<number>`coalesce(sum(${transactionsTable.amount}),0)`,
          })
          .from(transactionsTable)
          .where(
            and(
              txWhere,
              sql`${transactionsTable.type} IN ('cotisation','recette')`,
              eq(transactionsTable.status, "paid"),
              gte(transactionsTable.createdAt, thisMonthStart),
            ),
          ),
        db
          .select({
            value: sql<number>`coalesce(sum(abs(${transactionsTable.amount})),0)`,
          })
          .from(transactionsTable)
          .where(
            and(
              txWhere,
              sql`${transactionsTable.type} IN ('depense','salaire')`,
              eq(transactionsTable.status, "paid"),
              gte(transactionsTable.createdAt, thisMonthStart),
            ),
          ),
        db
          .select({
            value: sql<number>`coalesce(sum(${transactionsTable.amount}),0)`,
          })
          .from(transactionsTable)
          .where(
            and(
              txWhere,
              sql`${transactionsTable.type} IN ('cotisation','recette')`,
              eq(transactionsTable.status, "paid"),
            ),
          ),
        db
          .select({
            value: sql<number>`coalesce(sum(abs(${transactionsTable.amount})),0)`,
          })
          .from(transactionsTable)
          .where(
            and(
              txWhere,
              sql`${transactionsTable.type} IN ('depense','salaire')`,
              eq(transactionsTable.status, "paid"),
            ),
          ),
      ]);

      // Compute caisse balance: use the stored balance from the latest entry, or sum all amounts
      let caisseBalance = 0;
      if (latestCaisse.length > 0 && latestCaisse[0].balance != null) {
        caisseBalance = Number(latestCaisse[0].balance ?? 0);
      } else {
        caisseBalance = latestCaisse.reduce((s, e) => {
          if (e.amount != null) {
            return s + Number(e.amount);
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

// ─── Finance/cotisations action items (admin dashboard summary) ──────────────
router.get(
  "/statistics/finance/pending",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    try {
      const syndicateId = await resolveScopedSyndicateId(req);
      const cotWhere = eq(cotisationsTable.syndicateId, syndicateId);
      const today = new Date().toISOString().split("T")[0];

      const overdueClause = and(
        eq(cotisationsTable.status, "pending"),
        lt(cotisationsTable.dueDate, today),
      );
      const validationClause = eq(
        cotisationsTable.status,
        "pending_validation",
      );
      const statusFilter = or(overdueClause, validationClause);

      const [flaggedCotisations, overdueCountRow, validationCountRow] =
        await Promise.all([
          db
            .select({
              id: cotisationsTable.id,
              memberId: cotisationsTable.memberId,
              label: cotisationsTable.label,
              period: cotisationsTable.period,
              amount: cotisationsTable.amount,
              dueDate: cotisationsTable.dueDate,
              status: cotisationsTable.status,
              syndicateId: cotisationsTable.syndicateId,
            })
            .from(cotisationsTable)
            .where(and(cotWhere, statusFilter))
            .orderBy(desc(cotisationsTable.createdAt))
            .limit(200),
          db
            .select({ value: count() })
            .from(cotisationsTable)
            .where(and(cotWhere, overdueClause)),
          db
            .select({ value: count() })
            .from(cotisationsTable)
            .where(and(cotWhere, validationClause)),
        ]);

      const memberIds = [...new Set(flaggedCotisations.map((c) => c.memberId))];
      const members = memberIds.length
        ? await db
            .select({ id: usersTable.id, name: usersTable.name })
            .from(usersTable)
            .where(sql`${usersTable.id} IN ${memberIds}`)
        : [];
      const memberNameById = new Map(members.map((m) => [m.id, m.name]));

      const pendingProofsWhere = eq(paymentProofsTable.status, "pending");
      const proofs = await db
        .select({
          id: paymentProofsTable.id,
          cotisationId: paymentProofsTable.cotisationId,
          proofUrl: paymentProofsTable.proofUrl,
          uploadedById: paymentProofsTable.uploadedById,
          createdAt: paymentProofsTable.createdAt,
        })
        .from(paymentProofsTable)
        .where(pendingProofsWhere)
        .orderBy(desc(paymentProofsTable.createdAt))
        .limit(200);

      const relevantCotisationIds = new Set(
        flaggedCotisations.map((c) => c.id),
      );
      const scopedProofs = proofs.filter((p) =>
        relevantCotisationIds.has(p.cotisationId),
      );

      const items = flaggedCotisations.map((c) => ({
        ...c,
        memberName: memberNameById.get(c.memberId) ?? c.memberId,
        proof: scopedProofs.find((p) => p.cotisationId === c.id) ?? null,
      }));

      res.json({
        data: {
          overdueCount: Number(overdueCountRow[0].value),
          pendingValidationCount: Number(validationCountRow[0].value),
          items,
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
      const [
        syndicates,
        allMembers,
        allCotisations,
        allTickets,
        allCaisse,
        allElections,
        admins,
      ] = await Promise.all([
        db
          .select()
          .from(syndicatesTable)
          .orderBy(desc(syndicatesTable.membersCount)),
        db
          .select({
            syndicateId: membersTable.syndicateId,
            status: membersTable.status,
          })
          .from(membersTable),
        db
          .select({
            syndicateId: cotisationsTable.syndicateId,
            status: cotisationsTable.status,
          })
          .from(cotisationsTable),
        db
          .select({
            syndicateId: supportTicketsTable.syndicateId,
            status: supportTicketsTable.status,
          })
          .from(supportTicketsTable),
        db
          .select({
            syndicateId: caisseEntriesTable.syndicateId,
            balance: caisseEntriesTable.balance,
            amount: caisseEntriesTable.amount,
            createdAt: caisseEntriesTable.createdAt,
          })
          .from(caisseEntriesTable)
          .orderBy(desc(caisseEntriesTable.createdAt)),
        db
          .select({
            syndicateId: electionsTable.syndicateId,
            status: electionsTable.status,
          })
          .from(electionsTable),
        db
          .select({ id: usersTable.id, name: usersTable.name })
          .from(usersTable),
      ]);

      const enriched = syndicates.map((sy) => {
        const syMembers = allMembers.filter((m) => m.syndicateId === sy.id);
        const activeMembers = syMembers.filter(
          (m) => m.status === "active",
        ).length;

        const syCotisations = allCotisations.filter(
          (c) => c.syndicateId === sy.id,
        );
        const paidCot = syCotisations.filter((c) => c.status === "paid").length;
        const cotisationRate =
          syCotisations.length > 0
            ? Math.round((paidCot / syCotisations.length) * 100)
            : 0;

        const openTickets = allTickets.filter(
          (t) => t.syndicateId === sy.id && t.status === "open",
        ).length;

        // Latest caisse balance for this syndicate
        const syCaisse = allCaisse.filter((c) => c.syndicateId === sy.id);
        let balance = 0;
        if (syCaisse.length > 0 && syCaisse[0].balance != null) {
          balance = Number(syCaisse[0].balance ?? 0);
        }

        const pendingElections = allElections.filter(
          (e) => e.syndicateId === sy.id && e.status === "upcoming",
        ).length;

        const adminUser = sy.adminId
          ? admins.find((a) => a.id === sy.adminId)
          : null;

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
          adminId: sy.adminId ?? null,
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

// ─── Per-syndicate building stats (super_admin only) ──────────────────────────
// GET /statistics/buildings
// Returns aggregated stats for each syndicate: buildings, lots, occupancy,
// owners, tenants, employees, incidents, documents, meetings, charges, finance.
router.get(
  "/statistics/buildings",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    try {
      // Fetch all syndicates
      const syndicates = await db
        .select({ id: syndicatesTable.id, name: syndicatesTable.name })
        .from(syndicatesTable)
        .orderBy(syndicatesTable.name);

      if (syndicates.length === 0) {
        res.json({ data: [] });
        return;
      }

      // --- Bulk aggregation queries (no N+1) ---

      // Buildings per syndicate
      const buildingCounts = await db
        .select({
          syndicateId: buildingsTable.syndicateId,
          total: count(),
        })
        .from(buildingsTable)
        .groupBy(buildingsTable.syndicateId);

      // Lot stats per syndicate (total, occupied, vacant)
      const lotStats = await db
        .select({
          syndicateId: buildingsTable.syndicateId,
          totalLots: count(),
          occupiedLots: sql<number>`COUNT(*) FILTER (WHERE ${lotsTable.status} = 'occupied')`,
          vacantLots: sql<number>`COUNT(*) FILTER (WHERE ${lotsTable.status} != 'occupied')`,
        })
        .from(lotsTable)
        .innerJoin(buildingsTable, eq(lotsTable.buildingId, buildingsTable.id))
        .groupBy(buildingsTable.syndicateId);

      // Owners (members) per syndicate
      const ownerCounts = await db
        .select({
          syndicateId: membersTable.syndicateId,
          total: count(),
        })
        .from(membersTable)
        .groupBy(membersTable.syndicateId);

      // Tenants per syndicate
      const tenantCounts = await db
        .select({
          syndicateId: tenantsTable.syndicateId,
          total: count(),
        })
        .from(tenantsTable)
        .where(eq(tenantsTable.status, "active"))
        .groupBy(tenantsTable.syndicateId);

      // Employees (users with role employee/staff scoped to syndicate)
      const employeeCounts = await db
        .select({
          syndicateId: usersTable.syndicateId,
          total: count(),
        })
        .from(usersTable)
        .where(
          sql`${usersTable.role} IN ('employee','staff','gardien','gestionnaire')`,
        )
        .groupBy(usersTable.syndicateId);

      // Sinistres (incidents) per syndicate via building join
      const sinistreStats = await db
        .select({
          syndicateId: buildingsTable.syndicateId,
          total: count(),
        })
        .from(sinistresTable)
        .innerJoin(
          buildingsTable,
          eq(sinistresTable.buildingId, buildingsTable.id),
        )
        .groupBy(buildingsTable.syndicateId);

      // Documents per syndicate
      const documentCounts = await db
        .select({
          syndicateId: documentsTable.syndicateId,
          total: count(),
        })
        .from(documentsTable)
        .groupBy(documentsTable.syndicateId);

      // Meetings (AG) per syndicate
      const meetingCounts = await db
        .select({
          syndicateId: meetingsTable.syndicateId,
          total: count(),
        })
        .from(meetingsTable)
        .groupBy(meetingsTable.syndicateId);

      // Appels de fonds (charges) stats per syndicate via building join
      // unpaid = pending + overdue; paid count; collection rate
      const chargeStats = await db
        .select({
          syndicateId: buildingsTable.syndicateId,
          totalCharges: count(),
          unpaidCharges: sql<number>`COUNT(*) FILTER (WHERE ${appelsDeFondsTable.status} IN ('pending','overdue'))`,
          paidCharges: sql<number>`COUNT(*) FILTER (WHERE ${appelsDeFondsTable.status} = 'paid')`,
          totalAmount: sql<number>`COALESCE(SUM(CAST(${appelsDeFondsTable.amount} AS numeric)), 0)`,
          paidAmount: sql<number>`COALESCE(SUM(CAST(${appelsDeFondsTable.amount} AS numeric)) FILTER (WHERE ${appelsDeFondsTable.status} = 'paid'), 0)`,
        })
        .from(appelsDeFondsTable)
        .innerJoin(
          buildingsTable,
          eq(appelsDeFondsTable.buildingId, buildingsTable.id),
        )
        .groupBy(buildingsTable.syndicateId);

      // Financial balance from caisse_entries (latest balance per syndicate)
      const latestCaisse = await db
        .select({
          syndicateId: caisseEntriesTable.syndicateId,
          balance: caisseEntriesTable.balance,
          amount: caisseEntriesTable.amount,
          createdAt: caisseEntriesTable.createdAt,
        })
        .from(caisseEntriesTable)
        .orderBy(desc(caisseEntriesTable.createdAt));

      // Build lookup maps
      const byCounts = (
        rows: { syndicateId: string | null; total: number }[],
      ) => {
        const m = new Map<string, number>();
        for (const r of rows) {
          if (r.syndicateId) m.set(r.syndicateId, Number(r.total));
        }
        return m;
      };

      const buildingMap = byCounts(buildingCounts);
      const ownerMap = byCounts(ownerCounts);
      const tenantMap = byCounts(tenantCounts);
      const employeeMap = byCounts(employeeCounts);
      const sinistreMap = byCounts(sinistreStats);
      const documentMap = byCounts(documentCounts);
      const meetingMap = byCounts(meetingCounts);

      const lotMap = new Map<
        string,
        { totalLots: number; occupiedLots: number; vacantLots: number }
      >();
      for (const r of lotStats) {
        if (r.syndicateId) {
          lotMap.set(r.syndicateId, {
            totalLots: Number(r.totalLots),
            occupiedLots: Number(r.occupiedLots),
            vacantLots: Number(r.vacantLots),
          });
        }
      }

      const chargeMap = new Map<
        string,
        {
          unpaidCharges: number;
          paidCharges: number;
          totalCharges: number;
          collectionRate: number;
          financialBalance: number;
        }
      >();
      for (const r of chargeStats) {
        if (r.syndicateId) {
          const total = Number(r.totalCharges);
          const paid = Number(r.paidCharges);
          const unpaid = Number(r.unpaidCharges);
          const totalAmt = Number(r.totalAmount);
          const paidAmt = Number(r.paidAmount);
          const collectionRate =
            total > 0 ? Math.round((paid / total) * 100) : 0;
          chargeMap.set(r.syndicateId, {
            unpaidCharges: unpaid,
            paidCharges: paid,
            totalCharges: total,
            collectionRate,
            financialBalance: Math.round(paidAmt - totalAmt + paidAmt), // paidAmt - unpaidAmt
          });
        }
      }

      // Latest caisse balance per syndicate
      const caisseBalanceMap = new Map<string, number>();
      for (const entry of latestCaisse) {
        if (entry.syndicateId && !caisseBalanceMap.has(entry.syndicateId)) {
          const bal =
            entry.balance != null
              ? Number(entry.balance)
              : Number(entry.amount ?? 0);
          caisseBalanceMap.set(entry.syndicateId, bal);
        }
      }

      const result = syndicates.map((sy) => {
        const lots = lotMap.get(sy.id) ?? {
          totalLots: 0,
          occupiedLots: 0,
          vacantLots: 0,
        };
        const charges = chargeMap.get(sy.id) ?? {
          unpaidCharges: 0,
          paidCharges: 0,
          totalCharges: 0,
          collectionRate: 0,
          financialBalance: 0,
        };
        return {
          syndicateId: sy.id,
          syndicateName: sy.name,
          // Real estate
          buildings: buildingMap.get(sy.id) ?? 0,
          totalLots: lots.totalLots,
          occupiedLots: lots.occupiedLots,
          vacantLots: lots.vacantLots,
          // People
          owners: ownerMap.get(sy.id) ?? 0,
          tenants: tenantMap.get(sy.id) ?? 0,
          employees: employeeMap.get(sy.id) ?? 0,
          // Operations
          incidents: sinistreMap.get(sy.id) ?? 0,
          documents: documentMap.get(sy.id) ?? 0,
          meetings: meetingMap.get(sy.id) ?? 0,
          // Finance
          unpaidCharges: charges.unpaidCharges,
          paidCharges: charges.paidCharges,
          totalCharges: charges.totalCharges,
          collectionRate: charges.collectionRate,
          financialBalance: caisseBalanceMap.get(sy.id) ?? 0,
        };
      });

      res.json({ data: result });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Reports analytics (platform + syndicate + treasurer, period-scoped) ────
// GET /statistics/reports?period=month|quarter|year
router.get(
  "/statistics/reports",
  requireAuth,
  requireRole("super_admin", "syndicate_admin", "treasurer"),
  async (req, res) => {
    const period = (req.query.period as string) || "month";
    const txWhere = syndicateWhere(req, transactionsTable.syndicateId);
    const memWhere = syndicateWhere(req, membersTable.syndicateId);
    const cotWhere = syndicateWhere(req, cotisationsTable.syndicateId);

    try {
      const now = new Date();

      // ── Period window ──────────────────────────────────────────────────────
      let windowStart: Date;
      let buckets: { label: string; from: Date; to: Date }[];

      if (period === "year") {
        windowStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        buckets = lastNMonths(12).map((m) => ({
          label: m.label,
          from: m.from,
          to: m.to,
        }));
      } else if (period === "quarter") {
        windowStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        buckets = lastNMonths(3).map((m) => ({
          label: m.label,
          from: m.from,
          to: m.to,
        }));
      } else {
        // month → 4 weekly buckets within the current month
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        windowStart = monthStart;
        const FR_WEEK = ["S1", "S2", "S3", "S4"];
        buckets = [0, 1, 2, 3].map((w) => {
          const from = new Date(now.getFullYear(), now.getMonth(), w * 7 + 1);
          const rawTo = new Date(
            now.getFullYear(),
            now.getMonth(),
            w * 7 + 7,
            23,
            59,
            59,
          );
          const monthEnd = new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            0,
            23,
            59,
            59,
          );
          return {
            label: FR_WEEK[w],
            from,
            to: rawTo < monthEnd ? rawTo : monthEnd,
          };
        });
      }

      // ── Transactions for window ────────────────────────────────────────────
      const allTx = await db
        .select({
          amount: transactionsTable.amount,
          type: transactionsTable.type,
          status: transactionsTable.status,
          createdAt: transactionsTable.createdAt,
        })
        .from(transactionsTable)
        .where(
          txWhere
            ? and(txWhere, gte(transactionsTable.createdAt, windowStart))
            : gte(transactionsTable.createdAt, windowStart),
        );

      // ── New members for window ─────────────────────────────────────────────
      const allNewMembers = await db
        .select({ createdAt: membersTable.createdAt })
        .from(membersTable)
        .where(
          memWhere
            ? and(memWhere, gte(membersTable.createdAt, windowStart))
            : gte(membersTable.createdAt, windowStart),
        );

      // ── Cotisation rate (all-time for syndicate) ───────────────────────────
      const [allCot, paidCot] = await Promise.all([
        db
          .select({ value: count() })
          .from(cotisationsTable)
          .where(cotWhere ?? undefined),
        db
          .select({ value: count() })
          .from(cotisationsTable)
          .where(
            cotWhere
              ? and(cotWhere, eq(cotisationsTable.status, "paid"))
              : eq(cotisationsTable.status, "paid"),
          ),
      ]);
      const cotisationRate =
        Number(allCot[0].value) > 0
          ? Math.round(
              (Number(paidCot[0].value) / Number(allCot[0].value)) * 100,
            )
          : 0;

      // ── Chart buckets ──────────────────────────────────────────────────────
      const revenueChart = buckets.map((b) => ({
        label: b.label,
        value: Math.round(
          allTx
            .filter(
              (t) =>
                t.createdAt &&
                t.createdAt >= b.from &&
                t.createdAt <= b.to &&
                (t.type === "cotisation" || t.type === "recette") &&
                t.status === "paid",
            )
            .reduce((s, t) => s + Number(t.amount ?? 0), 0),
        ),
      }));

      const membersChart = buckets.map((b) => ({
        label: b.label,
        value: allNewMembers.filter(
          (m) => m.createdAt && m.createdAt >= b.from && m.createdAt <= b.to,
        ).length,
      }));

      // ── Period KPIs ────────────────────────────────────────────────────────
      const revenues = allTx
        .filter(
          (t) =>
            (t.type === "cotisation" || t.type === "recette") &&
            t.status === "paid",
        )
        .reduce((s, t) => s + Number(t.amount ?? 0), 0);
      const expenses = allTx
        .filter(
          (t) =>
            (t.type === "depense" || t.type === "salaire") &&
            t.status === "paid",
        )
        .reduce((s, t) => s + Math.abs(Number(t.amount ?? 0)), 0);
      const memberGrowth = allNewMembers.length;

      res.json({
        data: {
          revenueChart,
          membersChart,
          kpi: {
            revenues: Math.round(revenues),
            expenses: Math.round(expenses),
            memberGrowth,
            cotisationRate,
          },
        },
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

export default router;
