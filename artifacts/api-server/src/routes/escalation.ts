/**
 * Debt Escalation API
 *
 * GET  /escalation                        — list escalations (filterable, syndicate-scoped)
 * GET  /escalation/overdue                — live overdue-per-lot snapshot (no DB write)
 * POST /escalation/scan                   — trigger manual scan (admin only)
 * GET  /escalation/history/:residentId    — escalation history for a resident
 * GET  /escalation/:id                    — single escalation detail
 * POST /escalation/:id/override           — override with justification (admin only)
 * POST /escalation/:id/resolve            — mark resolved (admin only)
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  debtEscalationsTable,
  appelsDeFondsTable,
  lotsTable,
  membersTable,
  buildingsTable,
  syndicatesTable,
  auditLogsTable,
} from "@workspace/db/schema";
import { eq, and, inArray, ne, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireAdmin, requireRole } from "../middleware/auth.js";
import { runDailyEscalationScan, computeLevel, LEVEL_LABELS, LEVEL_ORDER } from "../lib/debt-escalation.js";
import { serverAuditLog } from "../lib/audit.js";

const router = Router();

// ─── GET /escalation ──────────────────────────────────────────────────────────

router.get("/escalation", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = req.user!;
    const { level, status, page = "1", limit = "50" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const filters: ReturnType<typeof and>[] = [];

    if (user.role !== "super_admin") {
      if (!user.syndicateId) {
        res.json({ data: [], total: 0, page: pageNum, limit: limitNum });
        return;
      }
      filters.push(eq(debtEscalationsTable.syndicateId, user.syndicateId));
    }

    if (level && LEVEL_ORDER.includes(level as any)) {
      filters.push(eq(debtEscalationsTable.escalationLevel, level));
    }

    if (status) {
      filters.push(eq(debtEscalationsTable.status, status));
    } else {
      // Default: exclude resolved
      filters.push(ne(debtEscalationsTable.status, "resolved"));
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const [escalations, [{ count }]] = await Promise.all([
      db
        .select()
        .from(debtEscalationsTable)
        .where(whereClause)
        .orderBy(desc(debtEscalationsTable.createdAt))
        .limit(limitNum)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(debtEscalationsTable)
        .where(whereClause),
    ]);

    // Enrich with lot info
    const lotIds = [...new Set(escalations.map((e) => e.lotId).filter(Boolean))] as string[];
    const lots = lotIds.length > 0
      ? await db.select().from(lotsTable).where(inArray(lotsTable.id, lotIds))
      : [];
    const lotMap = new Map(lots.map((l) => [l.id, l]));

    const buildingIds = [...new Set(lots.map((l) => l.buildingId).filter(Boolean))] as string[];
    const buildings = buildingIds.length > 0
      ? await db.select({ id: buildingsTable.id, name: buildingsTable.name }).from(buildingsTable).where(inArray(buildingsTable.id, buildingIds))
      : [];
    const buildingMap = new Map(buildings.map((b) => [b.id, b]));

    const enriched = escalations.map((e) => {
      const lot = e.lotId ? lotMap.get(e.lotId) : undefined;
      const building = lot?.buildingId ? buildingMap.get(lot.buildingId) : undefined;
      return {
        ...e,
        levelLabel: LEVEL_LABELS[e.escalationLevel as keyof typeof LEVEL_LABELS] ?? e.escalationLevel,
        lot: lot ? { id: lot.id, number: lot.number, floor: lot.floor } : null,
        building: building ? { id: building.id, name: building.name } : null,
      };
    });

    res.json({ data: enriched, total: count, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /escalation/overdue ──────────────────────────────────────────────────

router.get("/escalation/overdue", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = req.user!;

    // Fetch unpaid appels
    const filters: ReturnType<typeof and>[] = [
      inArray(appelsDeFondsTable.status, ["pending", "overdue"]),
    ];
    if (user.role !== "super_admin" && user.syndicateId) {
      // Filter by buildings in this syndicate — join via lots→buildings
      // For simplicity we filter in JS after fetching (lots are small per syndicate)
    }

    const unpaidAppels = await db
      .select()
      .from(appelsDeFondsTable)
      .where(and(...filters));

    // Group by lot
    const byLot = new Map<string, typeof unpaidAppels>();
    for (const a of unpaidAppels) {
      if (!a.lotId) continue;
      const list = byLot.get(a.lotId) ?? [];
      list.push(a);
      byLot.set(a.lotId, list);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result: Array<{
      lotId: string;
      lotNumber: string;
      buildingId: string;
      buildingName: string;
      ownerId: string | null;
      ownerName: string;
      totalUnpaid: number;
      overdueMonths: number;
      requiredLevel: string | null;
      levelLabel: string | null;
      existingEscalationId: string | null;
      existingEscalationLevel: string | null;
    }> = [];

    const lotIds = [...byLot.keys()];
    if (lotIds.length === 0) {
      res.json({ data: [] });
      return;
    }

    const [lots, existingEscalations] = await Promise.all([
      db.select().from(lotsTable).where(inArray(lotsTable.id, lotIds)),
      db
        .select()
        .from(debtEscalationsTable)
        .where(
          and(
            inArray(debtEscalationsTable.lotId, lotIds),
            ne(debtEscalationsTable.status, "resolved"),
          ),
        ),
    ]);

    const lotMap = new Map(lots.map((l) => [l.id, l]));
    const buildingIds = [...new Set(lots.map((l) => l.buildingId))];
    const [buildings, members] = await Promise.all([
      db.select().from(buildingsTable).where(inArray(buildingsTable.id, buildingIds)),
      db
        .select()
        .from(membersTable)
        .where(
          inArray(
            membersTable.id,
            lots.map((l) => l.ownerId).filter(Boolean) as string[],
          ),
        ),
    ]);

    const buildingMap = new Map(buildings.map((b) => [b.id, b]));
    const memberMap = new Map(members.map((m) => [m.id, m]));

    // Get syndicate configs for legal thresholds
    const syndicateIds = [...new Set(buildings.map((b) => b.syndicateId).filter(Boolean))] as string[];
    const syndicates = syndicateIds.length > 0
      ? await db
          .select({ id: syndicatesTable.id, legalThresholdMonths: syndicatesTable.legalThresholdMonths })
          .from(syndicatesTable)
          .where(inArray(syndicatesTable.id, syndicateIds))
      : [];
    const syndicateMap = new Map(syndicates.map((s) => [s.id, s]));

    // Highest existing escalation per lot
    const existingByLot = new Map<string, typeof existingEscalations>();
    for (const e of existingEscalations) {
      if (!e.lotId) continue;
      const list = existingByLot.get(e.lotId) ?? [];
      list.push(e);
      existingByLot.set(e.lotId, list);
    }

    for (const [lotId, appels] of byLot) {
      const lot = lotMap.get(lotId);
      if (!lot) continue;

      const building = buildingMap.get(lot.buildingId);
      if (!building) continue;

      // Apply syndicate filter for non-super_admin
      if (user.role !== "super_admin" && building.syndicateId !== user.syndicateId) continue;

      const member = lot.ownerId ? memberMap.get(lot.ownerId) : undefined;
      const syndicate = building.syndicateId ? syndicateMap.get(building.syndicateId) : undefined;
      const legalThresholdMonths = syndicate?.legalThresholdMonths ?? 18;

      let oldestDate: Date | null = null;
      let totalUnpaid = 0;

      for (const a of appels) {
        totalUnpaid += parseFloat(String(a.amount ?? 0));
        const refDate = a.dueDate ? new Date(a.dueDate) : a.createdAt ?? null;
        if (refDate && (!oldestDate || refDate < oldestDate)) oldestDate = refDate;
      }

      if (!oldestDate) continue;

      const overdueMs = today.getTime() - oldestDate.getTime();
      const overdueMonths = Math.max(0, overdueMs / (1000 * 60 * 60 * 24 * 30.44));
      const requiredLevel = computeLevel(overdueMonths, legalThresholdMonths);

      const existing = existingByLot.get(lotId) ?? [];
      const latest = existing.sort((a, b) => {
        return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
      })[0] ?? null;

      result.push({
        lotId,
        lotNumber: lot.number,
        buildingId: lot.buildingId,
        buildingName: building.name,
        ownerId: lot.ownerId,
        ownerName: member?.name ?? "Propriétaire inconnu",
        totalUnpaid: parseFloat(totalUnpaid.toFixed(2)),
        overdueMonths: parseFloat(overdueMonths.toFixed(1)),
        requiredLevel,
        levelLabel: requiredLevel ? (LEVEL_LABELS[requiredLevel as keyof typeof LEVEL_LABELS] ?? requiredLevel) : null,
        existingEscalationId: latest?.id ?? null,
        existingEscalationLevel: latest?.escalationLevel ?? null,
      });
    }

    // Sort by overdueMonths desc
    result.sort((a, b) => b.overdueMonths - a.overdueMonths);

    res.json({ data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /escalation/scan ────────────────────────────────────────────────────

// Runs across all syndicates, so it's a platform-level operation — restricted to
// super_admin (a syndicate_admin has no legitimate reason to trigger a global scan).
router.post("/escalation/scan", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    const scanResult = await runDailyEscalationScan();

    await serverAuditLog(req, {
      action: "ESCALATION_SCAN",
      entity: "debt_escalations",
      details: `Scan manuel: ${scanResult.created} créées, ${scanResult.skipped} ignorées, ${scanResult.errors} erreurs`,
      platformAction: true,
    });

    res.json({ success: true, result: scanResult });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors du scan" });
  }
});

// ─── GET /escalation/history/:residentId ──────────────────────────────────────

router.get("/escalation/history/:residentId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = req.user!;
    const residentId = req.params.residentId as string;

    const whereClause =
      user.role !== "super_admin" && user.syndicateId
        ? and(
            eq(debtEscalationsTable.memberId, residentId),
            eq(debtEscalationsTable.syndicateId, user.syndicateId),
          )
        : eq(debtEscalationsTable.memberId, residentId);

    const history = await db
      .select()
      .from(debtEscalationsTable)
      .where(whereClause)
      .orderBy(desc(debtEscalationsTable.createdAt));

    const enriched = history.map((e) => ({
      ...e,
      levelLabel: LEVEL_LABELS[e.escalationLevel as keyof typeof LEVEL_LABELS] ?? e.escalationLevel,
    }));

    res.json({ data: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /escalation/:id ──────────────────────────────────────────────────────

router.get("/escalation/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = req.user!;
    const id = req.params.id as string;
    const [escalation] = await db
      .select()
      .from(debtEscalationsTable)
      .where(eq(debtEscalationsTable.id, id));

    if (!escalation) {
      res.status(404).json({ error: "Escalade introuvable" });
      return;
    }

    if (user.role !== "super_admin" && escalation.syndicateId !== user.syndicateId) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    // Load related lot and appels
    const [lot, relatedAppels] = await Promise.all([
      escalation.lotId
        ? db.select().from(lotsTable).where(eq(lotsTable.id, escalation.lotId)).then((r) => r[0] ?? null)
        : Promise.resolve(null),
      escalation.lotId
        ? db
            .select()
            .from(appelsDeFondsTable)
            .where(
              and(
                eq(appelsDeFondsTable.lotId, escalation.lotId),
                inArray(appelsDeFondsTable.status, ["pending", "overdue"]),
              ),
            )
        : Promise.resolve([]),
    ]);

    res.json({
      data: {
        ...escalation,
        levelLabel: LEVEL_LABELS[escalation.escalationLevel as keyof typeof LEVEL_LABELS] ?? escalation.escalationLevel,
        lot,
        unpaidAppels: relatedAppels,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /escalation/:id/override ───────────────────────────────────────────

const overrideSchema = z.object({
  reason: z.string().min(10, "La justification doit comporter au moins 10 caractères"),
});

router.post("/escalation/:id/override", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = req.user!;
    const id = req.params.id as string;
    const parsed = overrideSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Données invalides" });
      return;
    }

    const [escalation] = await db
      .select()
      .from(debtEscalationsTable)
      .where(eq(debtEscalationsTable.id, id));

    if (!escalation) {
      res.status(404).json({ error: "Escalade introuvable" });
      return;
    }

    if (user.role !== "super_admin" && escalation.syndicateId !== user.syndicateId) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    if (escalation.status === "resolved") {
      res.status(409).json({ error: "Cette escalade est déjà résolue" });
      return;
    }

    await db
      .update(debtEscalationsTable)
      .set({
        status: "overridden",
        overriddenBy: user.userId,
        overrideReason: parsed.data.reason,
        overriddenAt: new Date(),
      })
      .where(eq(debtEscalationsTable.id, id));

    await serverAuditLog(req, {
      action: "ESCALATION_OVERRIDE",
      entity: "debt_escalations",
      entityId: id,
      details: `Escalade annulée par ${user.name}. Motif: ${parsed.data.reason}`,
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /escalation/:id/resolve ────────────────────────────────────────────

router.post("/escalation/:id/resolve", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = req.user!;
    const id = req.params.id as string;

    const [escalation] = await db
      .select()
      .from(debtEscalationsTable)
      .where(eq(debtEscalationsTable.id, id));

    if (!escalation) {
      res.status(404).json({ error: "Escalade introuvable" });
      return;
    }

    if (user.role !== "super_admin" && escalation.syndicateId !== user.syndicateId) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }

    await db
      .update(debtEscalationsTable)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(eq(debtEscalationsTable.id, id));

    await serverAuditLog(req, {
      action: "ESCALATION_RESOLVED",
      entity: "debt_escalations",
      entityId: id,
      details: `Escalade marquée résolue par ${user.name}`,
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
