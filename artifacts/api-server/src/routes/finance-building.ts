import { Router } from "express";
import { db } from "@workspace/db";
import {
  buildingsTable,
  appelsDeFondsTable,
  travauxTable,
  budgetsTable,
  budgetLinesTable,
  prestatairesTable,
  contratsPrestatairesTable,
  lotsTable,
} from "@workspace/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  isSyndicateTeamRole,
  requireAuth,
  requireRole,
} from "../middleware/auth.js";

const router = Router();

// GET /finance/buildings — list buildings with quick stats (admin only)
// Treasurer needs building-level finance stats to prepare the budget.
router.get(
  "/finance/buildings",
  requireAuth,
  requireRole("super_admin", "syndicate_admin", "treasurer"),
  async (req, res) => {
    try {
      const user = (req as any).user;

      // Every non-super-admin finance user must have a syndicate scope in JWT.
      if (isSyndicateTeamRole(user.role) && !user.syndicateId) {
        return void res
          .status(403)
          .json({ error: "Syndicat non défini dans le token" });
      }

      const buildings =
        user.role === "super_admin"
          ? await db.select().from(buildingsTable)
          : await db
              .select()
              .from(buildingsTable)
              .where(eq(buildingsTable.syndicateId, user.syndicateId!));

      if (buildings.length === 0) return void res.json({ data: [] });

      // Batch-load all appels for all buildings (no N+1)
      const bldIds = buildings.map((b) => b.id);
      const allAppels = await db
        .select({
          buildingId: appelsDeFondsTable.buildingId,
          amount: appelsDeFondsTable.amount,
          status: appelsDeFondsTable.status,
        })
        .from(appelsDeFondsTable)
        .where(inArray(appelsDeFondsTable.buildingId, bldIds));

      // Group by buildingId
      const appelsByBuilding = new Map<string, typeof allAppels>();
      for (const a of allAppels) {
        const list = appelsByBuilding.get(a.buildingId) ?? [];
        list.push(a);
        appelsByBuilding.set(a.buildingId, list);
      }

      const enriched = buildings.map((b) => {
        const appels = appelsByBuilding.get(b.id) ?? [];
        const totalDu = appels.reduce((s, a) => s + Number(a.amount ?? 0), 0);
        const totalEncaisse = appels
          .filter((a) => a.status === "paid")
          .reduce((s, a) => s + Number(a.amount ?? 0), 0);
        const tauxRecouvrement =
          totalDu > 0 ? Math.round((totalEncaisse / totalDu) * 100) : 0;
        return {
          id: b.id,
          name: b.name,
          city: b.city,
          totalLots: b.totalLots,
          tauxRecouvrement,
          totalEncaisse: Math.round(totalEncaisse),
          totalDu: Math.round(totalDu),
        };
      });

      res.json({ data: enriched });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// GET /finance/building/:id — full financial dashboard data (admin only)
router.get(
  "/finance/building/:id",
  requireAuth,
  requireRole("super_admin", "syndicate_admin", "treasurer"),
  async (req, res) => {
    try {
      const user = (req as any).user;
      const buildingId = String(req.params.id);

      // A Super Admin may inspect a syndicate's financial dashboard only in
      // explicit supervision mode. Check this before resolving the building
      // so the endpoint does not disclose whether an ID exists.
      if (user.role === "super_admin" && req.query.supervision !== "true") {
        return void res.status(403).json({
          error:
            "Les Super Admins doivent activer le mode supervision pour accéder aux finances d'un syndicat.",
          code: "SUPERVISION_REQUIRED",
        });
      }

      const [building] = await db
        .select()
        .from(buildingsTable)
        .where(eq(buildingsTable.id, buildingId));

      if (!building)
        return void res.status(404).json({ error: "Immeuble introuvable" });

      // Syndicate isolation: non-super_admin can only access their own syndicate's buildings.
      if (user.role !== "super_admin") {
        if (!user.syndicateId) {
          return void res
            .status(403)
            .json({ error: "Syndicat non défini dans le token" });
        }
        if (building.syndicateId !== user.syndicateId) {
          return void res.status(403).json({ error: "Accès refusé" });
        }
      }

      // Fetch everything in parallel
      const [appels, travaux, budgets, lots, prestataires, contrats] =
        await Promise.all([
          db
            .select()
            .from(appelsDeFondsTable)
            .where(eq(appelsDeFondsTable.buildingId, buildingId)),
          db
            .select()
            .from(travauxTable)
            .where(eq(travauxTable.buildingId, buildingId)),
          db
            .select()
            .from(budgetsTable)
            .where(eq(budgetsTable.buildingId, buildingId)),
          db
            .select()
            .from(lotsTable)
            .where(eq(lotsTable.buildingId, buildingId)),
          db
            .select()
            .from(prestatairesTable)
            .where(eq(prestatairesTable.buildingId, buildingId)),
          db
            .select()
            .from(contratsPrestatairesTable)
            .where(
              and(
                eq(contratsPrestatairesTable.buildingId, buildingId),
                eq(contratsPrestatairesTable.status, "active"),
              ),
            ),
        ]);

      // Approved budget (most recent)
      const approvedBudget =
        budgets.find((b) => b.status === "approved") ?? budgets[0] ?? null;

      // Budget lines for approved budget
      const budgetLines = approvedBudget
        ? await db
            .select()
            .from(budgetLinesTable)
            .where(eq(budgetLinesTable.budgetId, approvedBudget.id))
        : [];

      // ── Appels stats ─────────────────────────────────────────────────────
      const paidAppels = appels.filter((a) => a.status === "paid");
      const overdueAppels = appels.filter((a) => a.status === "overdue");
      const pendingAppels = appels.filter((a) => a.status === "pending");

      const totalMontantDu = appels.reduce(
        (s, a) => s + Number(a.amount ?? 0),
        0,
      );
      const totalEncaisse = paidAppels.reduce(
        (s, a) => s + Number(a.amount ?? 0),
        0,
      );
      const totalImpaye = overdueAppels.reduce(
        (s, a) => s + Number(a.amount ?? 0),
        0,
      );
      const totalEnAttente = pendingAppels.reduce(
        (s, a) => s + Number(a.amount ?? 0),
        0,
      );
      const tauxRecouvrement =
        totalMontantDu > 0
          ? Math.round((totalEncaisse / totalMontantDu) * 100)
          : 0;

      const fondsReserveCollecte = appels
        .filter((a) => a.type === "fonds_reserve" && a.status === "paid")
        .reduce((s, a) => s + Number(a.amount ?? 0), 0);

      // ── Monthly history (last 6 months) ──────────────────────────────────
      const now = new Date();
      const monthlyHistory = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        const label = d.toLocaleDateString("fr-MA", {
          month: "short",
          year: "2-digit",
        });
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const prefix = `${y}-${m}`;

        const paid = paidAppels
          .filter((a) => a.paidDate?.startsWith(prefix))
          .reduce((s, a) => s + Number(a.amount ?? 0), 0);

        const due = appels
          .filter((a) => a.dueDate?.startsWith(prefix))
          .reduce((s, a) => s + Number(a.amount ?? 0), 0);

        return { label, paid: Math.round(paid), due: Math.round(due) };
      });

      // ── Period stats table ────────────────────────────────────────────────
      const periods = [...new Set(appels.map((a) => a.period))].sort();
      const periodStats = periods.map((period) => {
        const pa = appels.filter((a) => a.period === period);
        const paid = pa
          .filter((a) => a.status === "paid")
          .reduce((s, a) => s + Number(a.amount ?? 0), 0);
        const overdue = pa
          .filter((a) => a.status === "overdue")
          .reduce((s, a) => s + Number(a.amount ?? 0), 0);
        const pending = pa
          .filter((a) => a.status === "pending")
          .reduce((s, a) => s + Number(a.amount ?? 0), 0);
        const total = pa.reduce((s, a) => s + Number(a.amount ?? 0), 0);
        return {
          period,
          paid: Math.round(paid),
          overdue: Math.round(overdue),
          pending: Math.round(pending),
          total: Math.round(total),
          rate: total > 0 ? Math.round((paid / total) * 100) : 0,
        };
      });

      // ── Budget lines by category ──────────────────────────────────────────
      const budgetByCategory = budgetLines.reduce<Record<string, number>>(
        (acc, bl) => {
          acc[bl.category] =
            (acc[bl.category] ?? 0) + Number(bl.amountAnnual ?? 0);
          return acc;
        },
        {},
      );

      // ── Travaux stats ─────────────────────────────────────────────────────
      const activeTravaux = travaux.filter(
        (t) => t.status === "in_progress" || t.status === "scheduled",
      );
      const doneTravaux = travaux.filter((t) => t.status === "completed");

      // ── Lots ──────────────────────────────────────────────────────────────
      const lotsOccupes = lots.filter((l) => l.status === "occupied").length;

      // ── Contrats charges ──────────────────────────────────────────────────
      const chargesContrats = contrats.reduce(
        (s, c) => s + Number(c.annualAmount ?? 0),
        0,
      );

      res.json({
        data: {
          building: {
            id: building.id,
            name: building.name,
            address: building.address,
            city: building.city,
            totalLots: building.totalLots,
            totalFloors: building.totalFloors,
          },
          summary: {
            totalMontantDu: Math.round(totalMontantDu),
            totalEncaisse: Math.round(totalEncaisse),
            totalImpaye: Math.round(totalImpaye),
            totalEnAttente: Math.round(totalEnAttente),
            tauxRecouvrement,
            fondsReserveCollecte: Math.round(fondsReserveCollecte),
            budgetAnnuel: approvedBudget
              ? Math.round(Number(approvedBudget.totalAmount ?? 0))
              : 0,
            chargesAnnuelles: approvedBudget
              ? Math.round(Number(approvedBudget.chargesAmount ?? 0))
              : 0,
            fondsReserveBudget: approvedBudget
              ? Math.round(Number(approvedBudget.fondsReserve ?? 0))
              : 0,
          },
          lots: {
            total: lots.length,
            occupes: lotsOccupes,
            vacants: lots.length - lotsOccupes,
            tauxOccupation:
              lots.length > 0
                ? Math.round((lotsOccupes / lots.length) * 100)
                : 0,
          },
          periodStats,
          monthlyHistory,
          budgetByCategory,
          travaux: {
            total: travaux.length,
            enCours: activeTravaux.length,
            termines: doneTravaux.length,
            budgetEstime: Math.round(
              travaux.reduce((s, t) => s + Number(t.estimatedAmount ?? 0), 0),
            ),
            depenseReelle: Math.round(
              doneTravaux.reduce((s, t) => s + Number(t.actualAmount ?? 0), 0),
            ),
            urgents: travaux.filter(
              (t) => t.priority === "urgent" && t.status !== "completed",
            ).length,
            items: activeTravaux.slice(0, 5).map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              priority: t.priority,
              estimatedAmount: t.estimatedAmount,
              startDate: t.startDate,
            })),
          },
          prestataires: {
            total: prestataires.length,
            actifs: prestataires.filter((p) => p.status === "active").length,
            chargesContrats: Math.round(chargesContrats),
            contrats: contrats.slice(0, 6).map((c) => {
              const p = prestataires.find((pr) => pr.id === c.prestataireId);
              return {
                title: c.title,
                prestataireName: p?.name ?? "—",
                type: p?.type ?? "—",
                monthlyAmount: c.monthlyAmount,
                annualAmount: c.annualAmount,
                endDate: c.endDate,
              };
            }),
          },
          appelsDeFonds: {
            total: appels.length,
            paid: paidAppels.length,
            overdue: overdueAppels.length,
            pending: pendingAppels.length,
          },
        },
      });
    } catch (e) {
      req.log.error(e);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

export default router;
