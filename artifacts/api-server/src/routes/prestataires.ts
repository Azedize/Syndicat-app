import { Router } from "express";
import { db } from "@workspace/db";
import {
  prestatairesTable,
  contratsPrestatairesTable,
  travauxTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

// GET /prestataires
router.get("/prestataires", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { buildingId, type, status } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (buildingId) conditions.push(eq(prestatairesTable.buildingId, buildingId));
    if (type) conditions.push(eq(prestatairesTable.type, type));
    if (status) conditions.push(eq(prestatairesTable.status, status));

    const rows = await db
      .select()
      .from(prestatairesTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(prestatairesTable.name);

    // Enrich with contract and work order counts
    const enriched = await Promise.all(
      rows.map(async (p) => {
        const contracts = await db
          .select()
          .from(contratsPrestatairesTable)
          .where(
            and(
              eq(contratsPrestatairesTable.prestataireId, p.id),
              eq(contratsPrestatairesTable.status, "active")
            )
          );

        const [workCount] = await db
          .select({ count: count() })
          .from(travauxTable)
          .where(
            and(
              eq(travauxTable.prestataireId, p.id),
              sql`${travauxTable.status} NOT IN ('completed','cancelled')`
            )
          );

        // Check for expiring contracts (within 30 days)
        const today = new Date();
        const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        const expiringContracts = contracts.filter(
          (c) => c.endDate && c.endDate <= in30 && c.endDate >= today.toISOString().split("T")[0]
        );

        return {
          ...p,
          activeContracts: contracts.length,
          openWorkOrders: workCount.count,
          expiringContracts: expiringContracts.length,
          contracts,
        };
      })
    );

    res.json({ data: enriched, total: enriched.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /prestataires/:id
router.get("/prestataires/:id", requireAuth, async (req, res) => {
  try {
    const [p] = await db
      .select()
      .from(prestatairesTable)
      .where(eq(prestatairesTable.id, req.params.id));

    if (!p) return res.status(404).json({ error: "Not found" });

    const contracts = await db
      .select()
      .from(contratsPrestatairesTable)
      .where(eq(contratsPrestatairesTable.prestataireId, p.id))
      .orderBy(desc(contratsPrestatairesTable.createdAt));

    const recentTravaux = await db
      .select()
      .from(travauxTable)
      .where(eq(travauxTable.prestataireId, p.id))
      .orderBy(desc(travauxTable.createdAt))
      .limit(10);

    res.json({ ...p, contracts, recentTravaux });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /prestataires
router.post("/prestataires", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      name, type, contactName, phone, email, address,
      ice, rc, buildingId, notes,
    } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: "name and type are required" });
    }

    const user = (req as any).user;

    const [p] = await db
      .insert(prestatairesTable)
      .values({
        name,
        type,
        contactName,
        phone,
        email,
        address,
        ice,
        rc,
        buildingId,
        syndicateId: user.syndicateId,
        notes,
      })
      .returning();

    res.status(201).json(p);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /prestataires/:id
router.put("/prestataires/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const allowed = [
      "name", "type", "contactName", "phone", "email", "address",
      "ice", "rc", "status", "rating", "notes",
    ];
    const updates: Record<string, any> = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    const [updated] = await db
      .update(prestatairesTable)
      .set(updates)
      .where(eq(prestatairesTable.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /prestataires/:id
router.delete("/prestataires/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const [deleted] = await db
      .delete(prestatairesTable)
      .where(eq(prestatairesTable.id, req.params.id))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Contracts ────────────────────────────────────────────────────────────

// GET /contrats
router.get("/contrats", requireAuth, async (req, res) => {
  try {
    const { buildingId, prestataireId, status } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (buildingId) conditions.push(eq(contratsPrestatairesTable.buildingId, buildingId));
    if (prestataireId) conditions.push(eq(contratsPrestatairesTable.prestataireId, prestataireId));
    if (status) conditions.push(eq(contratsPrestatairesTable.status, status));

    const rows = await db
      .select()
      .from(contratsPrestatairesTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(contratsPrestatairesTable.createdAt));

    // Enrich with prestataire name
    const enriched = await Promise.all(
      rows.map(async (c) => {
        const [p] = await db
          .select({ name: prestatairesTable.name, type: prestatairesTable.type })
          .from(prestatairesTable)
          .where(eq(prestatairesTable.id, c.prestataireId));
        return { ...c, prestataireNom: p?.name ?? "", prestataireType: p?.type ?? "" };
      })
    );

    res.json({ data: enriched, total: enriched.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /contrats
router.post("/contrats", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      prestataireId, buildingId, title, startDate, endDate,
      monthlyAmount, annualAmount, autoRenew, documentUrl, notes,
    } = req.body;

    if (!prestataireId || !buildingId || !title) {
      return res.status(400).json({ error: "prestataireId, buildingId, and title are required" });
    }

    const [contract] = await db
      .insert(contratsPrestatairesTable)
      .values({
        prestataireId,
        buildingId,
        title,
        startDate,
        endDate,
        monthlyAmount,
        annualAmount: annualAmount ?? (monthlyAmount ? monthlyAmount * 12 : undefined),
        autoRenew: autoRenew ?? false,
        documentUrl,
        notes,
      })
      .returning();

    res.status(201).json(contract);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /contrats/:id
router.put("/contrats/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const allowed = [
      "title", "startDate", "endDate", "monthlyAmount", "annualAmount",
      "status", "autoRenew", "documentUrl", "notes",
    ];
    const updates: Record<string, any> = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    const [updated] = await db
      .update(contratsPrestatairesTable)
      .set(updates)
      .where(eq(contratsPrestatairesTable.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
