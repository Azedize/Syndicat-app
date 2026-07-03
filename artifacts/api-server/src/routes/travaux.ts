import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  travauxTable,
  prestatairesTable,
  buildingsTable,
  lotsTable,
} from "@workspace/db/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { createAlert } from "../lib/notify.js";

const router = Router();

// GET /travaux — List work orders (no N+1: batch joins)
router.get("/travaux", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { buildingId, status, priority, type, prestataireId } = req.query as Record<string, string>;

    const conditions: any[] = [];

    if (buildingId) {
      conditions.push(eq(travauxTable.buildingId, buildingId));
    } else if (user.role === "syndicate_admin" && user.syndicateId) {
      // Scope to buildings belonging to this syndicate
      const buildingsInSyndicate = await db
        .select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.syndicateId, user.syndicateId));
      const ids = buildingsInSyndicate.map((b) => b.id);
      if (ids.length === 0) return res.json({ data: [], total: 0 });
      conditions.push(inArray(travauxTable.buildingId, ids));
    }
    // super_admin sees all; member sees all (filtered later if needed)

    if (status) conditions.push(eq(travauxTable.status, status));
    if (priority) conditions.push(eq(travauxTable.priority, priority));
    if (type) conditions.push(eq(travauxTable.type, type));
    if (prestataireId) conditions.push(eq(travauxTable.prestataireId, prestataireId));

    const rows = await db
      .select()
      .from(travauxTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(
        sql`CASE ${travauxTable.priority} WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END`,
        desc(travauxTable.createdAt),
      );

    if (rows.length === 0) return res.json({ data: [], total: 0 });

    // Batch-load prestataires and lots to avoid N+1
    const prestataireIds = [...new Set(rows.map((r) => r.prestataireId).filter(Boolean))] as string[];
    const lotIds = [...new Set(rows.map((r) => r.lotId).filter(Boolean))] as string[];

    const [prestataires, lots] = await Promise.all([
      prestataireIds.length
        ? db
            .select({ id: prestatairesTable.id, name: prestatairesTable.name, phone: prestatairesTable.phone, type: prestatairesTable.type })
            .from(prestatairesTable)
            .where(inArray(prestatairesTable.id, prestataireIds))
        : [],
      lotIds.length
        ? db
            .select({ id: lotsTable.id, number: lotsTable.number, floor: lotsTable.floor, type: lotsTable.type })
            .from(lotsTable)
            .where(inArray(lotsTable.id, lotIds))
        : [],
    ]);

    const prestataireMap = new Map(prestataires.map((p) => [p.id, p]));
    const lotMap = new Map(lots.map((l) => [l.id, l]));

    const enriched = rows.map((t) => ({
      ...t,
      prestataire: t.prestataireId ? (prestataireMap.get(t.prestataireId) ?? null) : null,
      lot: t.lotId ? (lotMap.get(t.lotId) ?? null) : null,
    }));

    res.json({ data: enriched, total: enriched.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /travaux/:id
router.get("/travaux/:id", requireAuth, async (req, res) => {
  try {
    const [travail] = await db
      .select()
      .from(travauxTable)
      .where(eq(travauxTable.id, req.params.id));

    if (!travail) return res.status(404).json({ error: "Not found" });

    const [prestataire, lot, building] = await Promise.all([
      travail.prestataireId
        ? db.select().from(prestatairesTable).where(eq(prestatairesTable.id, travail.prestataireId)).then(([p]) => p ?? null)
        : Promise.resolve(null),
      travail.lotId
        ? db.select().from(lotsTable).where(eq(lotsTable.id, travail.lotId)).then(([l]) => l ?? null)
        : Promise.resolve(null),
      db.select().from(buildingsTable).where(eq(buildingsTable.id, travail.buildingId)).then(([b]) => b ?? null),
    ]);

    res.json({ data: { ...travail, prestataire, lot, building } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

const createTravauxSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z.enum(["entretien", "reparation", "amelioration", "gros_travaux", "urgence"]).optional(),
  priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
  buildingId: z.string().min(1),
  lotId: z.string().optional(),
  prestataireId: z.string().optional(),
  estimatedAmount: z.number().positive().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

// POST /travaux — Create work order
router.post("/travaux", requireAuth, async (req, res) => {
  const parsed = createTravauxSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
  }
  try {
    const user = (req as any).user;
    const { title, description, type, priority, buildingId, lotId, prestataireId, estimatedAmount, startDate, endDate, notes } = parsed.data;

    const [travail] = await db
      .insert(travauxTable)
      .values({
        title,
        description,
        type: type ?? "entretien",
        priority: priority ?? "normal",
        status: "reported",
        buildingId,
        lotId,
        prestataireId,
        reportedById: user.userId,
        reportedByName: user.name,
        estimatedAmount,
        startDate,
        endDate,
        notes,
      })
      .returning();

    // Find syndicate for this building to scope the alert
    const [building] = await db
      .select({ syndicateId: buildingsTable.syndicateId })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, buildingId));

    if (priority === "urgent" || priority === "high") {
      createAlert({
        title: `🔧 Travaux ${priority === "urgent" ? "URGENT" : "prioritaires"}: ${title}`,
        message: description ?? "Intervention requise",
        type: priority === "urgent" ? "error" : "warning",
        syndicateId: building?.syndicateId ?? null,
        target: "admin",
      }).catch(() => {});
    }

    res.status(201).json({ data: travail, message: "Bon de travaux créé" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /travaux/:id — Update work order (status, assignment, amounts)
router.put("/travaux/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const allowed = [
      "title", "description", "type", "status", "priority",
      "prestataireId", "estimatedAmount", "actualAmount",
      "startDate", "endDate", "notes", "assignedById",
    ];
    const updates: Record<string, any> = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    if (req.body.status === "completed") {
      updates.completedAt = new Date();
    }

    const [updated] = await db
      .update(travauxTable)
      .set(updates)
      .where(eq(travauxTable.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ data: updated, message: "Bon de travaux mis à jour" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /travaux/:id
router.delete("/travaux/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const [deleted] = await db
      .delete(travauxTable)
      .where(eq(travauxTable.id, req.params.id))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
