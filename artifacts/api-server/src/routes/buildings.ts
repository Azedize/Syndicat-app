import { Router } from "express";
import { db } from "@workspace/db";
import {
  buildingsTable,
  lotsTable,
  travauxTable,
  appelsDeFondsTable,
  sinistresTable,
} from "@workspace/db/schema";
import { eq, and, sql, desc, count, inArray } from "drizzle-orm";
import {
  isSyndicateTeamRole,
  requireAuth,
  requireOperationalAccess,
} from "../middleware/auth.js";
import { serverAuditLog } from "../lib/audit.js";
import { getUserBuildingIds } from "../lib/scope.js";

const router = Router();

// GET /buildings — List all buildings for this syndicate
// PERFORMANCE: Replaced N+1 (3 queries per building) with 3 batch aggregation queries
router.get("/buildings", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const isSuperAdmin = user.role === "super_admin";
    if (isSuperAdmin && req.query.supervision !== "true") {
      return void res.status(403).json({
        error: "La supervision est requise pour accéder aux immeubles.",
        code: "SUPERVISION_REQUIRED",
      });
    }
    if (isSyndicateTeamRole(user.role) && !user.syndicateId) {
      return void res
        .status(403)
        .json({ error: "Syndicat non défini dans le token" });
    }

    const scopedBuildingIds =
      !isSuperAdmin && !isSyndicateTeamRole(user.role)
        ? await getUserBuildingIds(user)
        : [];
    if (
      !isSuperAdmin &&
      !isSyndicateTeamRole(user.role) &&
      scopedBuildingIds.length === 0
    ) {
      return void res.json({ data: [], total: 0 });
    }

    const rows = await db
      .select()
      .from(buildingsTable)
      .where(
        isSuperAdmin
          ? undefined
          : isSyndicateTeamRole(user.role)
            ? eq(buildingsTable.syndicateId, user.syndicateId!)
            : inArray(buildingsTable.id, scopedBuildingIds),
      )
      .orderBy(desc(buildingsTable.createdAt));

    if (rows.length === 0) return void res.json({ data: [], total: 0 });

    // Batch-load all counts in 3 queries (instead of 3×N queries)
    const buildingIds = rows.map((b) => b.id);

    const [lotCounts, travauxCounts, chargeCounts] = await Promise.all([
      db
        .select({ buildingId: lotsTable.buildingId, cnt: count() })
        .from(lotsTable)
        .where(inArray(lotsTable.buildingId, buildingIds))
        .groupBy(lotsTable.buildingId),
      db
        .select({ buildingId: travauxTable.buildingId, cnt: count() })
        .from(travauxTable)
        .where(
          and(
            inArray(travauxTable.buildingId, buildingIds),
            sql`${travauxTable.status} NOT IN ('completed','cancelled')`,
          ),
        )
        .groupBy(travauxTable.buildingId),
      db
        .select({ buildingId: appelsDeFondsTable.buildingId, cnt: count() })
        .from(appelsDeFondsTable)
        .where(
          and(
            inArray(appelsDeFondsTable.buildingId, buildingIds),
            eq(appelsDeFondsTable.status, "pending"),
          ),
        )
        .groupBy(appelsDeFondsTable.buildingId),
    ]);

    const lotMap = new Map(lotCounts.map((r) => [r.buildingId, Number(r.cnt)]));
    const travauxMap = new Map(
      travauxCounts.map((r) => [r.buildingId, Number(r.cnt)]),
    );
    const chargeMap = new Map(
      chargeCounts.map((r) => [r.buildingId, Number(r.cnt)]),
    );

    const enriched = rows.map((b) => ({
      ...b,
      lotCount: lotMap.get(b.id) ?? 0,
      openTravaux: travauxMap.get(b.id) ?? 0,
      pendingCharges: chargeMap.get(b.id) ?? 0,
    }));

    res.json({ data: enriched, total: enriched.length });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /buildings/:id — Building detail with lots, stats
router.get("/buildings/:id", requireAuth, async (req, res) => {
  try {
    if (req.user!.role === "super_admin" && req.query.supervision !== "true") {
      return void res.status(403).json({
        error: "La supervision est requise pour accéder à cet immeuble.",
        code: "SUPERVISION_REQUIRED",
      });
    }
    const [building] = await db
      .select()
      .from(buildingsTable)
      .where(eq(buildingsTable.id, String(req.params.id)));

    if (!building)
      return void res.status(404).json({ error: "Building not found" });

    // Enforce both syndicate isolation and resident personal-building scope.
    const user = req.user!;
    if (user.role !== "super_admin") {
      if (isSyndicateTeamRole(user.role) && !user.syndicateId) {
        return void res
          .status(403)
          .json({ error: "Syndicat non défini dans le token" });
      }
      if (isSyndicateTeamRole(user.role)) {
        if (building.syndicateId !== user.syndicateId) {
          return void res.status(403).json({ error: "Accès refusé" });
        }
      } else {
        const allowedBuildingIds = await getUserBuildingIds(user);
        if (!allowedBuildingIds.includes(building.id)) {
          return void res.status(403).json({ error: "Accès refusé" });
        }
      }
    }

    const [lots, travaux, sinistres, [chargeStats]] = await Promise.all([
      db
        .select()
        .from(lotsTable)
        .where(eq(lotsTable.buildingId, building.id))
        .orderBy(lotsTable.floor, lotsTable.number),
      db
        .select()
        .from(travauxTable)
        .where(eq(travauxTable.buildingId, building.id))
        .orderBy(desc(travauxTable.createdAt))
        .limit(10),
      db
        .select()
        .from(sinistresTable)
        .where(eq(sinistresTable.buildingId, building.id))
        .orderBy(desc(sinistresTable.createdAt))
        .limit(5),
      db
        .select({
          pending: sql<number>`COUNT(*) FILTER (WHERE ${appelsDeFondsTable.status} = 'pending')`,
          overdue: sql<number>`COUNT(*) FILTER (WHERE ${appelsDeFondsTable.status} = 'overdue')`,
          paid: sql<number>`COUNT(*) FILTER (WHERE ${appelsDeFondsTable.status} = 'paid')`,
          totalCollected: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount}) FILTER (WHERE ${appelsDeFondsTable.status} = 'paid'), 0)`,
          totalPending: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount}) FILTER (WHERE ${appelsDeFondsTable.status} IN ('pending','overdue')), 0)`,
        })
        .from(appelsDeFondsTable)
        .where(eq(appelsDeFondsTable.buildingId, building.id)),
    ]);

    res.json({ building, lots, travaux, sinistres, chargeStats });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /buildings — Create building (syndicate_admin; super_admin requires ?supervision=true)
// SECURITY FIX: use user.userId (not user.id which is undefined in JwtPayload)
router.post(
  "/buildings",
  requireAuth,
  requireOperationalAccess,
  async (req, res) => {
    try {
      const user = req.user!;
      if (isSyndicateTeamRole(user.role) && !user.syndicateId) {
        return void res
          .status(403)
          .json({ error: "Syndicat non défini dans le token" });
      }
      const {
        name,
        address,
        city,
        type,
        totalFloors,
        totalLots,
        constructionYear,
        bankAccount,
        registrationNumber,
        description,
      } = req.body;

      if (!name || !address) {
        return void res
          .status(400)
          .json({ error: "name and address are required" });
      }

      const syndicateId =
        user.role === "super_admin"
          ? (req.body.syndicateId ?? user.syndicateId)
          : user.syndicateId;

      if (!syndicateId) {
        return void res.status(400).json({ error: "syndicateId est requis" });
      }

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
          adminId: user.userId, // FIXED: was user.id (undefined); correct field is user.userId
          bankAccount,
          registrationNumber,
          description,
        })
        .returning();

      await serverAuditLog(req, {
        action: "CREATE",
        entity: "building",
        entityId: building.id,
        syndicateId: syndicateId ?? undefined,
        details: `Immeuble créé: ${name}, ${address}`,
      });

      res.status(201).json(building);
    } catch (e) {
      req.log.error(e);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// PUT /buildings/:id — Update building (syndicate_admin: own syndicate only; super_admin requires ?supervision=true)
router.put(
  "/buildings/:id",
  requireAuth,
  requireOperationalAccess,
  async (req, res) => {
    try {
      const user = req.user!;
      if (isSyndicateTeamRole(user.role) && !user.syndicateId) {
        return void res
          .status(403)
          .json({ error: "Syndicat non défini dans le token" });
      }

      // Syndicate isolation for every syndicate management role
      const [existing] = await db
        .select({ syndicateId: buildingsTable.syndicateId })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, String(req.params.id)));

      if (!existing)
        return void res.status(404).json({ error: "Building not found" });

      if (isSyndicateTeamRole(user.role)) {
        if (!user.syndicateId)
          return void res
            .status(403)
            .json({ error: "Syndicat non défini dans le token" });
        if (existing.syndicateId !== user.syndicateId) {
          return void res.status(403).json({ error: "Accès refusé" });
        }
      }

      const allowed = [
        "name",
        "address",
        "city",
        "type",
        "totalFloors",
        "totalLots",
        "constructionYear",
        "bankAccount",
        "registrationNumber",
        "description",
        "status",
      ];
      const updates: Record<string, any> = {};
      for (const k of allowed) {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
      }

      const [updated] = await db
        .update(buildingsTable)
        .set(updates)
        .where(eq(buildingsTable.id, String(req.params.id)))
        .returning();

      if (!updated)
        return void res.status(404).json({ error: "Building not found" });

      await serverAuditLog(req, {
        action: "UPDATE",
        entity: "building",
        entityId: String(req.params.id),
        syndicateId: existing.syndicateId ?? undefined,
        details: `Immeuble mis à jour: ${JSON.stringify(updates)}`,
      });

      res.json(updated);
    } catch (e) {
      req.log.error(e);
      res.status(500).json({ error: "Server error" });
    }
  },
);

export default router;
