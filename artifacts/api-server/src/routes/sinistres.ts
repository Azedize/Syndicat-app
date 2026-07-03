import { Router } from "express";
import { db } from "@workspace/db";
import { sinistresTable, lotsTable, buildingsTable } from "@workspace/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { createAlert } from "../lib/notify.js";

const router = Router();

// GET /sinistres — (no N+1: batch lot lookup)
router.get("/sinistres", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { buildingId, status, type } = req.query as Record<string, string>;

    const conditions: any[] = [];

    if (buildingId) {
      conditions.push(eq(sinistresTable.buildingId, buildingId));
    } else if (user.role === "syndicate_admin" && user.syndicateId) {
      const buildingsInSyndicate = await db
        .select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.syndicateId, user.syndicateId));
      const ids = buildingsInSyndicate.map((b) => b.id);
      if (ids.length === 0) return res.json({ data: [], total: 0 });
      conditions.push(inArray(sinistresTable.buildingId, ids));
    }

    if (status) conditions.push(eq(sinistresTable.status, status));
    if (type) conditions.push(eq(sinistresTable.type, type));

    const rows = await db
      .select()
      .from(sinistresTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(sinistresTable.createdAt));

    if (rows.length === 0) return res.json({ data: [], total: 0 });

    // Batch-load lots to avoid N+1
    const lotIds = [...new Set(rows.map((r) => r.lotId).filter(Boolean))] as string[];
    const lots = lotIds.length
      ? await db
          .select({ id: lotsTable.id, number: lotsTable.number, floor: lotsTable.floor })
          .from(lotsTable)
          .where(inArray(lotsTable.id, lotIds))
      : [];
    const lotMap = new Map(lots.map((l) => [l.id, l]));

    const enriched = rows.map((s) => ({
      ...s,
      lot: s.lotId ? (lotMap.get(s.lotId) ?? null) : null,
    }));

    res.json({ data: enriched, total: enriched.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /sinistres — Declare a claim/incident
router.post("/sinistres", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { buildingId, lotId, type, description, date, estimatedAmount, notes } = req.body;

    if (!buildingId || !type || !description || !date) {
      return res.status(400).json({ error: "buildingId, type, description et date sont obligatoires" });
    }

    const [sinistre] = await db
      .insert(sinistresTable)
      .values({
        buildingId,
        lotId,
        type,
        description,
        date,
        estimatedAmount: estimatedAmount ? Number(estimatedAmount) : undefined,
        reportedById: user.userId,
        reportedByName: user.name,
        notes,
      })
      .returning();

    // Find syndicate for scoped alert
    const [building] = await db
      .select({ syndicateId: buildingsTable.syndicateId })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, buildingId));

    createAlert({
      title: `🚨 Sinistre déclaré: ${type}`,
      message: description,
      type: "error",
      syndicateId: building?.syndicateId ?? null,
      target: "admin",
    }).catch(() => {});

    res.status(201).json({ data: sinistre, message: "Sinistre déclaré avec succès" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /sinistres/:id — Update claim status/amounts
router.put("/sinistres/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const allowed = ["status", "estimatedAmount", "indemnisedAmount", "claimNumber", "notes"];
    const updates: Record<string, any> = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    const [updated] = await db
      .update(sinistresTable)
      .set(updates)
      .where(eq(sinistresTable.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Sinistre introuvable" });
    res.json({ data: updated, message: "Sinistre mis à jour" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
