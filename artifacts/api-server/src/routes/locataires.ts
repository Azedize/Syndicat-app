import { Router } from "express";
import { db } from "@workspace/db";
import { tenantsTable, lotsTable, buildingsTable } from "@workspace/db/schema";
import { eq, and, desc, or, ilike } from "drizzle-orm";
import { requireAuth, requireAdmin, requireRole, requireOperationalAccess } from "../middleware/auth.js";
import { z } from "zod";

const router = Router();

// GET /locataires — admin only (tenants see their own lease via /locataires/my-lease)
router.get("/locataires", requireAuth, requireRole("super_admin", "syndicate_admin"), async (req, res) => {
  try {
    const user = (req as any).user;
    const { status, buildingId, lotId, search } = req.query as Record<string, string>;

    const conditions: any[] = [];

    if (status) conditions.push(eq(tenantsTable.status, status));
    if (buildingId) conditions.push(eq(tenantsTable.buildingId, buildingId));
    if (lotId) conditions.push(eq(tenantsTable.lotId, lotId));

    if (user.role === "syndicate_admin" && user.syndicateId) {
      conditions.push(eq(tenantsTable.syndicateId, user.syndicateId));
    }

    const rows = await db
      .select({
        id: tenantsTable.id,
        name: tenantsTable.name,
        email: tenantsTable.email,
        phone: tenantsTable.phone,
        lotId: tenantsTable.lotId,
        buildingId: tenantsTable.buildingId,
        leaseStart: tenantsTable.leaseStart,
        leaseEnd: tenantsTable.leaseEnd,
        monthlyRent: tenantsTable.monthlyRent,
        depositAmount: tenantsTable.depositAmount,
        status: tenantsTable.status,
        emergencyContact: tenantsTable.emergencyContact,
        emergencyPhone: tenantsTable.emergencyPhone,
        notes: tenantsTable.notes,
        createdAt: tenantsTable.createdAt,
        lotNumber: lotsTable.number,
        buildingName: buildingsTable.name,
      })
      .from(tenantsTable)
      .leftJoin(lotsTable, eq(tenantsTable.lotId, lotsTable.id))
      .leftJoin(buildingsTable, eq(tenantsTable.buildingId, buildingsTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(tenantsTable.createdAt));

    const filtered = search
      ? rows.filter((r) =>
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          (r.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (r.lotNumber ?? "").toLowerCase().includes(search.toLowerCase())
        )
      : rows;

    res.json({ data: filtered, total: filtered.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /locataires/my-lease — tenant viewing their own lease record.
// Tenants aren't FK-linked to a tenantsTable row; matched by verified JWT email,
// since that's the only identifier both tables share.
router.get("/locataires/my-lease", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (!user.email) return void res.status(404).json({ error: "Aucun bail associé à ce compte" });

    const [row] = await db
      .select({
        id: tenantsTable.id,
        name: tenantsTable.name,
        email: tenantsTable.email,
        phone: tenantsTable.phone,
        lotId: tenantsTable.lotId,
        buildingId: tenantsTable.buildingId,
        leaseStart: tenantsTable.leaseStart,
        leaseEnd: tenantsTable.leaseEnd,
        monthlyRent: tenantsTable.monthlyRent,
        depositAmount: tenantsTable.depositAmount,
        status: tenantsTable.status,
        emergencyContact: tenantsTable.emergencyContact,
        emergencyPhone: tenantsTable.emergencyPhone,
        notes: tenantsTable.notes,
        createdAt: tenantsTable.createdAt,
        lotNumber: lotsTable.number,
        floor: lotsTable.floor,
        buildingName: buildingsTable.name,
        buildingAddress: buildingsTable.address,
      })
      .from(tenantsTable)
      .leftJoin(lotsTable, eq(tenantsTable.lotId, lotsTable.id))
      .leftJoin(buildingsTable, eq(tenantsTable.buildingId, buildingsTable.id))
      .where(eq(tenantsTable.email, user.email))
      .limit(1);

    if (!row) return void res.status(404).json({ error: "Aucun bail associé à ce compte" });
    res.json({ data: row });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /locataires/:id — admin only or the tenant viewing their own record
router.get("/locataires/:id", requireAuth, requireRole("super_admin", "syndicate_admin"), async (req, res) => {
  try {
    const [row] = await db
      .select({
        id: tenantsTable.id,
        name: tenantsTable.name,
        email: tenantsTable.email,
        phone: tenantsTable.phone,
        lotId: tenantsTable.lotId,
        buildingId: tenantsTable.buildingId,
        leaseStart: tenantsTable.leaseStart,
        leaseEnd: tenantsTable.leaseEnd,
        monthlyRent: tenantsTable.monthlyRent,
        depositAmount: tenantsTable.depositAmount,
        status: tenantsTable.status,
        emergencyContact: tenantsTable.emergencyContact,
        emergencyPhone: tenantsTable.emergencyPhone,
        notes: tenantsTable.notes,
        createdAt: tenantsTable.createdAt,
        lotNumber: lotsTable.number,
        buildingName: buildingsTable.name,
        buildingAddress: buildingsTable.address,
      })
      .from(tenantsTable)
      .leftJoin(lotsTable, eq(tenantsTable.lotId, lotsTable.id))
      .leftJoin(buildingsTable, eq(tenantsTable.buildingId, buildingsTable.id))
      .where(eq(tenantsTable.id, String(req.params.id)))
      .limit(1);

    if (!row) return void res.status(404).json({ error: "Locataire introuvable" });

    // Syndicate isolation: syndicate_admin can only view tenants in their own syndicate
    const user = req.user!;
    if (user.role === "syndicate_admin" && row.buildingId) {
      const [building] = await db
        .select({ syndicateId: buildingsTable.syndicateId })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, row.buildingId))
        .limit(1);
      if (building && building.syndicateId !== user.syndicateId) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
    }

    res.json({ data: row });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /locataires (syndicate_admin; super_admin requires ?supervision=true)
router.post("/locataires", requireAuth, requireOperationalAccess, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional(),
    lotId: z.string().optional(),
    buildingId: z.string().optional(),
    syndicateId: z.string().optional(),
    leaseStart: z.string().optional(),
    leaseEnd: z.string().optional(),
    monthlyRent: z.number().nonnegative().optional(),
    depositAmount: z.number().nonnegative().optional(),
    emergencyContact: z.string().optional(),
    emergencyPhone: z.string().optional(),
    notes: z.string().optional(),
    status: z.enum(["active", "pending", "expired"]).default("active"),
  });

  const result = schema.safeParse(req.body);
  if (!result.success) return void res.status(400).json({ error: "Données invalides", details: result.error.issues });

  try {
    const user = (req as any).user;
    const data = result.data;

    let buildingId = data.buildingId;
    if (!buildingId && data.lotId) {
      const [lot] = await db.select().from(lotsTable).where(eq(lotsTable.id, data.lotId)).limit(1);
      if (lot) buildingId = lot.buildingId;
    }

    const syndicateId = data.syndicateId ?? user.syndicateId ?? null;

    const [row] = await db
      .insert(tenantsTable)
      .values({
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        lotId: data.lotId || null,
        buildingId: buildingId || null,
        syndicateId,
        leaseStart: data.leaseStart || null,
        leaseEnd: data.leaseEnd || null,
        monthlyRent: data.monthlyRent ?? null,
        depositAmount: data.depositAmount ?? null,
        emergencyContact: data.emergencyContact || null,
        emergencyPhone: data.emergencyPhone || null,
        notes: data.notes || null,
        status: data.status,
      } as any)
      .returning();

    res.status(201).json({ data: row, message: "Locataire enregistré avec succès" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /locataires/:id (syndicate_admin; super_admin requires ?supervision=true)
router.put("/locataires/:id", requireAuth, requireOperationalAccess, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional(),
    lotId: z.string().optional(),
    buildingId: z.string().optional(),
    leaseStart: z.string().optional(),
    leaseEnd: z.string().optional(),
    monthlyRent: z.number().nonnegative().optional(),
    depositAmount: z.number().nonnegative().optional(),
    emergencyContact: z.string().optional(),
    emergencyPhone: z.string().optional(),
    notes: z.string().optional(),
    status: z.enum(["active", "pending", "expired"]).optional(),
  });

  const result = schema.safeParse(req.body);
  if (!result.success) return void res.status(400).json({ error: "Données invalides" });

  try {
    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(result.data)) {
      if (v !== undefined) updates[k] = v === "" ? null : v;
    }

    const [updated] = await db
      .update(tenantsTable)
      .set(updates)
      .where(eq(tenantsTable.id, String(req.params.id)))
      .returning();

    if (!updated) return void res.status(404).json({ error: "Locataire introuvable" });
    res.json({ data: updated, message: "Locataire mis à jour" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /locataires/:id (syndicate_admin; super_admin requires ?supervision=true)
router.delete("/locataires/:id", requireAuth, requireOperationalAccess, async (req, res) => {
  try {
    // Syndicate isolation before deletion
    const user = req.user!;
    if (user.role !== "super_admin") {
      if (!user.syndicateId) return void res.status(403).json({ error: "Syndicat non défini dans le token" });
      const [existing] = await db.select({ syndicateId: tenantsTable.syndicateId })
        .from(tenantsTable).where(eq(tenantsTable.id, String(req.params.id))).limit(1);
      if (existing && existing.syndicateId !== user.syndicateId) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
    }
    const [deleted] = await db
      .delete(tenantsTable)
      .where(eq(tenantsTable.id, String(req.params.id)))
      .returning();

    if (!deleted) return void res.status(404).json({ error: "Locataire introuvable" });
    res.json({ message: "Locataire supprimé" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
