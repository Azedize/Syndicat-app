import { Router } from "express";
import { db } from "@workspace/db";
import {
  buildingsTable,
  lotsTable,
  membersTable,
  tenantsTable,
  travauxTable,
  appelsDeFondsTable,
  sinistresTable,
} from "@workspace/db/schema";
import { eq, and, sql, desc, count } from "drizzle-orm";
import { requireAuth, requireAdmin, requireOperationalAccess } from "../middleware/auth.js";

const router = Router();

// GET /buildings — List all buildings for this syndicate
router.get("/buildings", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const isSuperAdmin = user.role === "super_admin";

    const rows = await db
      .select()
      .from(buildingsTable)
      .where(
        isSuperAdmin
          ? undefined
          : eq(buildingsTable.syndicateId, user.syndicateId ?? "")
      )
      .orderBy(desc(buildingsTable.createdAt));

    // Enrich with lot/owner counts
    const enriched = await Promise.all(
      rows.map(async (b) => {
        const [lotCount] = await db
          .select({ count: count() })
          .from(lotsTable)
          .where(eq(lotsTable.buildingId, b.id));

        const [openTravaux] = await db
          .select({ count: count() })
          .from(travauxTable)
          .where(
            and(
              eq(travauxTable.buildingId, b.id),
              sql`${travauxTable.status} NOT IN ('completed','cancelled')`
            )
          );

        const [pendingCharges] = await db
          .select({ count: count() })
          .from(appelsDeFondsTable)
          .where(
            and(
              eq(appelsDeFondsTable.buildingId, b.id),
              eq(appelsDeFondsTable.status, "pending")
            )
          );

        return {
          ...b,
          lotCount: lotCount.count,
          openTravaux: openTravaux.count,
          pendingCharges: pendingCharges.count,
        };
      })
    );

    res.json({ data: enriched, total: enriched.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /buildings/:id — Building detail with lots, stats
router.get("/buildings/:id", requireAuth, async (req, res) => {
  try {
    const [building] = await db
      .select()
      .from(buildingsTable)
      .where(eq(buildingsTable.id, req.params.id));

    if (!building) return res.status(404).json({ error: "Building not found" });

    // Syndicate isolation for non-super_admin
    const user = req.user!;
    if (user.role !== "super_admin" && building.syndicateId && building.syndicateId !== user.syndicateId) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const lots = await db
      .select()
      .from(lotsTable)
      .where(eq(lotsTable.buildingId, building.id))
      .orderBy(lotsTable.floor, lotsTable.number);

    const travaux = await db
      .select()
      .from(travauxTable)
      .where(eq(travauxTable.buildingId, building.id))
      .orderBy(desc(travauxTable.createdAt))
      .limit(10);

    const sinistres = await db
      .select()
      .from(sinistresTable)
      .where(eq(sinistresTable.buildingId, building.id))
      .orderBy(desc(sinistresTable.createdAt))
      .limit(5);

    const [chargeStats] = await db
      .select({
        pending: sql<number>`COUNT(*) FILTER (WHERE ${appelsDeFondsTable.status} = 'pending')`,
        overdue: sql<number>`COUNT(*) FILTER (WHERE ${appelsDeFondsTable.status} = 'overdue')`,
        paid: sql<number>`COUNT(*) FILTER (WHERE ${appelsDeFondsTable.status} = 'paid')`,
        totalCollected: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount}) FILTER (WHERE ${appelsDeFondsTable.status} = 'paid'), 0)`,
        totalPending: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount}) FILTER (WHERE ${appelsDeFondsTable.status} IN ('pending','overdue')), 0)`,
      })
      .from(appelsDeFondsTable)
      .where(eq(appelsDeFondsTable.buildingId, building.id));

    res.json({ building, lots, travaux, sinistres, chargeStats });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /buildings — Create building (syndicate_admin; super_admin requires ?supervision=true)
router.post("/buildings", requireAuth, requireOperationalAccess, async (req, res) => {
  try {
    const user = (req as any).user;
    const {
      name, address, city, type, totalFloors, totalLots,
      constructionYear, bankAccount, registrationNumber, description,
    } = req.body;

    if (!name || !address) {
      return res.status(400).json({ error: "name and address are required" });
    }

    const syndicateId = user.role === "super_admin"
      ? req.body.syndicateId ?? user.syndicateId
      : user.syndicateId;

    const [building] = await db
      .insert(buildingsTable)
      .values({
        name,
        address,
        city: city ?? "Casablanca",
        type: type ?? "residential",
        totalFloors: totalFloors ?? 0,
        totalLots: totalLots ?? 0,
        constructionYear,
        syndicateId,
        adminId: user.id,
        bankAccount,
        registrationNumber,
        description,
      })
      .returning();

    res.status(201).json(building);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /buildings/:id — Update building (syndicate_admin: own syndicate only; super_admin requires ?supervision=true)
router.put("/buildings/:id", requireAuth, requireOperationalAccess, async (req, res) => {
  try {
    // Syndicate isolation for syndicate_admin
    if (req.user!.role === "syndicate_admin") {
      const [existing] = await db.select({ syndicateId: buildingsTable.syndicateId }).from(buildingsTable).where(eq(buildingsTable.id, req.params.id));
      if (existing && existing.syndicateId !== req.user!.syndicateId) {
        return res.status(403).json({ error: "Accès refusé" });
      }
    }
    const allowed = [
      "name", "address", "city", "type", "totalFloors", "totalLots",
      "constructionYear", "bankAccount", "registrationNumber", "description", "status",
    ];
    const updates: Record<string, any> = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    const [updated] = await db
      .update(buildingsTable)
      .set(updates)
      .where(eq(buildingsTable.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Building not found" });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
