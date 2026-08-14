import { Router } from "express";
import { db } from "@workspace/db";
import {
  lotsTable,
  buildingsTable,
  membersTable,
  usersTable,
  tenantsTable,
  appelsDeFondsTable,
  travauxTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, count, or, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin, requireOperationalAccess } from "../middleware/auth.js";

const router = Router();

// GET /lots — List lots scoped to the user's syndicate (via building join)
// super_admin: all lots (or filter by ?syndicateId= for a specific syndicate)
// syndicate_admin / member: only lots belonging to their syndicate's buildings
// tenant: blocked (no lot ownership rights)
router.get("/lots", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.role === "tenant") {
      return void res.status(403).json({ error: "Accès refusé" });
    }

    const { buildingId, type, status, ownerId } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (user.role !== "super_admin" && !user.syndicateId) {
      return void res.status(403).json({ error: "Syndicat non défini dans le token" });
    }
    if (buildingId) {
      // When a specific buildingId is provided, verify it belongs to the caller's syndicate
      // (prevents cross-syndicate enumeration by guessing building IDs)
      if (user.role !== "super_admin") {
        const [building] = await db
          .select({ syndicateId: buildingsTable.syndicateId })
          .from(buildingsTable)
          .where(eq(buildingsTable.id, buildingId))
          .limit(1);
        if (!building || building.syndicateId !== user.syndicateId) {
          return void res.status(403).json({ error: "Accès refusé" });
        }
      }
      conditions.push(eq(lotsTable.buildingId, buildingId));
    } else {
      // Derive allowed building IDs from syndicate scope
      const targetSyndicateId =
        user.role === "super_admin"
          ? (req.query.syndicateId as string | undefined)
          : user.syndicateId;
      if (targetSyndicateId) {
        const scopedBuildings = await db
          .select({ id: buildingsTable.id })
          .from(buildingsTable)
          .where(eq(buildingsTable.syndicateId, targetSyndicateId));
        if (scopedBuildings.length === 0) return void res.json({ data: [], total: 0 });
        conditions.push(inArray(lotsTable.buildingId, scopedBuildings.map((b) => b.id)));
      }
      // super_admin with no syndicateId filter sees all lots (global view)
    }
    if (type) conditions.push(eq(lotsTable.type, type));
    if (status) conditions.push(eq(lotsTable.status, status));
    if (ownerId) conditions.push(eq(lotsTable.ownerId, ownerId));

    const rows = await db
      .select()
      .from(lotsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(lotsTable.floor, lotsTable.number);

    if (rows.length === 0) return void res.json({ data: [], total: 0 });

    // Batch-load owners, tenants, and charge stats (no N+1)
    const ownerIds = [...new Set(rows.map((l) => l.ownerId).filter(Boolean))] as string[];
    const tenantIds = [...new Set(rows.map((l) => l.tenantId).filter(Boolean))] as string[];
    const lotIds = rows.map((l) => l.id);

    const [owners, tenants, allCharges] = await Promise.all([
      ownerIds.length
        ? db
            .select({ id: membersTable.id, name: membersTable.name, email: membersTable.email, phone: membersTable.phone })
            .from(membersTable)
            .where(inArray(membersTable.id, ownerIds))
        : [],
      tenantIds.length
        ? db.select().from(tenantsTable).where(inArray(tenantsTable.id, tenantIds))
        : [],
      db
        .select({
          lotId: appelsDeFondsTable.lotId,
          status: appelsDeFondsTable.status,
          amount: appelsDeFondsTable.amount,
        })
        .from(appelsDeFondsTable)
        .where(inArray(appelsDeFondsTable.lotId, lotIds)),
    ]);

    const ownerMap = new Map(owners.map((o) => [o.id, o]));
    const tenantMap = new Map(tenants.map((t) => [t.id, t]));

    // Group charges by lotId
    const chargesByLot = new Map<string, { pending: number; overdue: number; pendingAmount: number }>();
    for (const c of allCharges) {
      const agg = chargesByLot.get(c.lotId) ?? { pending: 0, overdue: 0, pendingAmount: 0 };
      if (c.status === "pending") { agg.pending++; agg.pendingAmount += Number(c.amount ?? 0); }
      if (c.status === "overdue") { agg.overdue++; agg.pendingAmount += Number(c.amount ?? 0); }
      chargesByLot.set(c.lotId, agg);
    }

    const enriched = rows.map((lot) => ({
      ...lot,
      owner: lot.ownerId ? (ownerMap.get(lot.ownerId) ?? null) : null,
      tenant: lot.tenantId ? (tenantMap.get(lot.tenantId) ?? null) : null,
      chargeStats: chargesByLot.get(lot.id) ?? { pending: 0, overdue: 0, pendingAmount: 0 },
    }));

    res.json({ data: enriched, total: enriched.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /lots/my-lot — Member's own lot
// IMPORTANT: must be declared BEFORE /lots/:id to prevent "my-lot" being matched as :id
// ownerId can reference either usersTable.id or membersTable.id depending on
// how data was seeded, so we try both: email→member.id AND userId directly.
router.get("/lots/my-lot", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.role !== "super_admin" && !user.syndicateId) {
      return void res.status(403).json({ error: "Syndicat non défini dans le token" });
    }

    // Find member record by email (membersTable has no userId FK, only email)
    const memberRows = await db
      .select({ id: membersTable.id })
      .from(membersTable)
      .where(
        user.role === "super_admin"
          ? eq(membersTable.email, user.email)
          : and(
              eq(membersTable.email, user.email),
              eq(membersTable.syndicateId, user.syndicateId!),
            ),
      );

    // Build OR conditions: ownerId could store membersTable.id or usersTable.id
    const ownerConditions: any[] = [eq(lotsTable.ownerId, user.userId)];
    for (const member of memberRows) {
      ownerConditions.push(eq(lotsTable.ownerId, member.id));
    }

    const [lotRow] = await db
      .select({ lot: lotsTable, buildingSyndicateId: buildingsTable.syndicateId })
      .from(lotsTable)
      .innerJoin(buildingsTable, eq(buildingsTable.id, lotsTable.buildingId))
      .where(
        and(
          ownerConditions.length > 1 ? or(...ownerConditions) : ownerConditions[0],
          user.role === "super_admin"
            ? undefined
            : eq(buildingsTable.syndicateId, user.syndicateId!),
        ),
      )
      .limit(1);

    if (!lotRow) return void res.status(404).json({ error: "Aucun lot associé à votre compte" });
    const lot = lotRow.lot;

    const [building] = await db
      .select()
      .from(buildingsTable)
      .where(eq(buildingsTable.id, lot.buildingId));

    return void res.json({
      data: {
        ...lot,
        buildingName: building?.name ?? null,
        buildingAddress: building?.address ?? null,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /lots/:id — Lot detail
router.get("/lots/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.role === "tenant") return void res.status(403).json({ error: "Accès refusé" });

    const [lot] = await db
      .select()
      .from(lotsTable)
      .where(eq(lotsTable.id, String(req.params.id)));

    if (!lot) return void res.status(404).json({ error: "Lot not found" });

    // Syndicate isolation for non-super_admin
    if (user.role !== "super_admin") {
      if (!user.syndicateId) return void res.status(403).json({ error: "Syndicat non défini dans le token" });
      const [building] = await db
        .select({ syndicateId: buildingsTable.syndicateId })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, lot.buildingId))
        .limit(1);
      if (!building || building.syndicateId !== user.syndicateId) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
    }

    let owner = null;
    let tenant = null;

    if (lot.ownerId) {
      const [m] = await db.select().from(membersTable).where(eq(membersTable.id, lot.ownerId));
      owner = m ?? null;
    }

    if (lot.tenantId) {
      const [t] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, lot.tenantId));
      tenant = t ?? null;
    }

    const charges = await db
      .select()
      .from(appelsDeFondsTable)
      .where(eq(appelsDeFondsTable.lotId, lot.id))
      .orderBy(desc(appelsDeFondsTable.createdAt))
      .limit(20);

    const travaux = await db
      .select()
      .from(travauxTable)
      .where(eq(travauxTable.lotId, lot.id))
      .orderBy(desc(travauxTable.createdAt))
      .limit(10);

    const [building] = await db
      .select()
      .from(buildingsTable)
      .where(eq(buildingsTable.id, lot.buildingId));

    res.json({ lot, owner, tenant, charges, travaux, building: building ?? null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /lots — Create lot (syndicate_admin; super_admin requires ?supervision=true)
router.post("/lots", requireAuth, requireOperationalAccess, async (req, res) => {
  try {
    const user = req.user!;
    const {
      number, type, floor, surfaceM2, tantiemes,
      buildingId, ownerId, tenantId, status, description,
    } = req.body;

    if (!number || !buildingId) {
      return void res.status(400).json({ error: "number and buildingId are required" });
    }

    // Syndicate ownership: verify the target building belongs to the caller's syndicate
    if (user.role !== "super_admin") {
      if (!user.syndicateId) return void res.status(403).json({ error: "Syndicat non défini dans le token" });
      const [bld] = await db.select({ syndicateId: buildingsTable.syndicateId })
        .from(buildingsTable).where(eq(buildingsTable.id, buildingId)).limit(1);
      if (!bld || bld.syndicateId !== user.syndicateId) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
    }

    const [lot] = await db
      .insert(lotsTable)
      .values({
        number,
        type: type ?? "appartement",
        floor: floor ?? 0,
        surfaceM2,
        tantiemes: tantiemes ?? 0,
        buildingId,
        ownerId,
        tenantId,
        status: status ?? "occupied",
        description,
      })
      .returning();

    // Update building lot count
    await db
      .update(buildingsTable)
      .set({ totalLots: sql`${buildingsTable.totalLots} + 1` })
      .where(eq(buildingsTable.id, buildingId));

    res.status(201).json(lot);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /lots/:id — Update lot (syndicate_admin; super_admin requires ?supervision=true)
router.put("/lots/:id", requireAuth, requireOperationalAccess, async (req, res) => {
  try {
    const user = req.user!;
    // Row-level syndicate check before mutation
    if (user.role !== "super_admin") {
      if (!user.syndicateId) return void res.status(403).json({ error: "Syndicat non défini dans le token" });
      const [existing] = await db.select({ buildingId: lotsTable.buildingId }).from(lotsTable).where(eq(lotsTable.id, String(req.params.id))).limit(1);
      if (!existing) return void res.status(404).json({ error: "Lot not found" });
      const [bld] = await db.select({ syndicateId: buildingsTable.syndicateId }).from(buildingsTable).where(eq(buildingsTable.id, existing.buildingId)).limit(1);
      if (!bld || bld.syndicateId !== user.syndicateId) return void res.status(403).json({ error: "Accès refusé" });
    }
    const allowed = [
      "number", "type", "floor", "surfaceM2", "tantiemes",
      "ownerId", "tenantId", "status", "description",
    ];
    const updates: Record<string, any> = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    const [updated] = await db
      .update(lotsTable)
      .set(updates)
      .where(eq(lotsTable.id, String(req.params.id)))
      .returning();

    if (!updated) return void res.status(404).json({ error: "Lot not found" });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /lots/:id (syndicate_admin; super_admin requires ?supervision=true)
router.delete("/lots/:id", requireAuth, requireOperationalAccess, async (req, res) => {
  try {
    const user = req.user!;
    // Row-level syndicate check before deletion
    if (user.role !== "super_admin") {
      if (!user.syndicateId) return void res.status(403).json({ error: "Syndicat non défini dans le token" });
      const [existing] = await db.select({ buildingId: lotsTable.buildingId }).from(lotsTable).where(eq(lotsTable.id, String(req.params.id))).limit(1);
      if (!existing) return void res.status(404).json({ error: "Lot not found" });
      const [bld] = await db.select({ syndicateId: buildingsTable.syndicateId }).from(buildingsTable).where(eq(buildingsTable.id, existing.buildingId)).limit(1);
      if (!bld || bld.syndicateId !== user.syndicateId) return void res.status(403).json({ error: "Accès refusé" });
    }
    const [lot] = await db
      .delete(lotsTable)
      .where(eq(lotsTable.id, String(req.params.id)))
      .returning();

    if (!lot) return void res.status(404).json({ error: "Lot not found" });

    await db
      .update(buildingsTable)
      .set({ totalLots: sql`GREATEST(${buildingsTable.totalLots} - 1, 0)` })
      .where(eq(buildingsTable.id, lot.buildingId));

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
