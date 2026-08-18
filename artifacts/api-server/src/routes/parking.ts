import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  parkingSpotsTable,
  vehiclesTable,
  parkingViolationsTable,
  visitorParkingReservationsTable,
  buildingsTable,
  lotsTable,
  usersTable,
  tenantsTable,
  membersTable,
} from "@workspace/db/schema";
import { eq, and, desc, inArray, or, lte, gte } from "drizzle-orm";
import {
  isSyndicateTeamRole,
  requireAuth,
  requireAdmin,
} from "../middleware/auth.js";
import type { JwtPayload } from "../middleware/auth.js";
import { createAlert, sendPushToUsers } from "../lib/notify.js";
import { getUserBuildingIds } from "../lib/scope.js";

const router = Router();

// ─── Access-control helpers ──────────────────────────────────────────────────

/** Returns the set of building IDs the authenticated user is allowed to act on. */
async function getScopedBuildingIds(user: JwtPayload): Promise<string[]> {
  if (user.role === "super_admin") return []; // empty = "all"
  if (isSyndicateTeamRole(user.role)) {
    if (!user.syndicateId) {
      throw Object.assign(new Error("Syndicat non défini dans le token"), {
        status: 403,
      });
    }
    const bldgs = await db
      .select({ id: buildingsTable.id })
      .from(buildingsTable)
      .where(eq(buildingsTable.syndicateId, user.syndicateId));
    return bldgs.map((b) => b.id);
  }
  return getUserBuildingIds(user);
}

/**
 * Asserts that the requesting user is allowed to act on the given buildingId.
 * Returns the permitted building IDs for query scoping (empty = super_admin / unconstrained).
 * Throws with `{ status, error }` when access is denied.
 */
async function assertBuildingAccess(
  user: JwtPayload,
  buildingId: string,
): Promise<void> {
  if (user.role === "super_admin") return; // super_admin can see everything
  const allowed = await getScopedBuildingIds(user);
  if (!allowed.includes(buildingId)) {
    const err: any = new Error("Accès refusé à cet immeuble");
    err.status = 403;
    throw err;
  }
}

async function assertLotMatchesBuilding(
  lotId: string,
  buildingId: string,
): Promise<void> {
  const [lot] = await db
    .select({ buildingId: lotsTable.buildingId })
    .from(lotsTable)
    .where(eq(lotsTable.id, lotId))
    .limit(1);
  if (!lot) {
    throw Object.assign(new Error("Lot introuvable"), { status: 400 });
  }
  if (lot.buildingId !== buildingId) {
    throw Object.assign(new Error("Le lot n'appartient pas à cet immeuble"), {
      status: 400,
    });
  }
}

async function getSyndicateAdminIds(syndicateId: string): Promise<string[]> {
  const admins = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.syndicateId, syndicateId),
        eq(usersTable.role, "syndicate_admin"),
      ),
    );
  return admins.map((a) => a.id);
}

// ─── Parking Spots ──────────────────────────────────────────────────────────

// GET /parking/spots — list spots (scoped to user's buildings)
router.get("/parking/spots", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { buildingId, type, status } = req.query as Record<string, string>;

    const conditions: any[] = [];

    if (buildingId) {
      // Validate user actually has access to the requested building
      await assertBuildingAccess(user, buildingId);
      conditions.push(eq(parkingSpotsTable.buildingId, buildingId));
    } else {
      // Scope automatically based on role
      const ids = await getScopedBuildingIds(user);
      if (ids.length === 0 && user.role !== "super_admin") {
        return void res.json({ data: [], total: 0 });
      }
      if (ids.length > 0) {
        conditions.push(inArray(parkingSpotsTable.buildingId, ids));
      }
      // super_admin with no buildingId filter sees all → no condition added
    }

    if (type) conditions.push(eq(parkingSpotsTable.type, type));
    if (status) conditions.push(eq(parkingSpotsTable.status, status));

    const spots = await db
      .select()
      .from(parkingSpotsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(parkingSpotsTable.spotNumber);

    if (spots.length === 0) return void res.json({ data: [], total: 0 });

    // Batch-load lots
    const lotIds = [
      ...new Set(spots.map((s) => s.lotId).filter(Boolean)),
    ] as string[];
    const lots = lotIds.length
      ? await db
          .select({
            id: lotsTable.id,
            number: lotsTable.number,
            type: lotsTable.type,
          })
          .from(lotsTable)
          .where(inArray(lotsTable.id, lotIds))
      : [];
    const lotMap = new Map(lots.map((l) => [l.id, l]));

    const enriched = spots.map((s) => ({
      ...s,
      lot: s.lotId ? (lotMap.get(s.lotId) ?? null) : null,
    }));

    res.json({ data: enriched, total: enriched.length });
  } catch (e: any) {
    if (e?.status) return void res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /parking/spots/my — current user's assigned spot
router.get("/parking/spots/my", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const lotIds: string[] = [];

    if (user.role === "tenant") {
      // Tenants: look up their lot via the tenants table (matched by id or email)
      const tenantRows = await db
        .select({ lotId: tenantsTable.lotId })
        .from(tenantsTable)
        .where(
          or(
            eq(tenantsTable.id, user.userId),
            eq(tenantsTable.email, user.email),
          ),
        );
      tenantRows.forEach((r) => {
        if (r.lotId) lotIds.push(r.lotId);
      });
    } else if (user.role === "member") {
      // Members: lots can be owned by userId or membersTable.id (see scope.ts pattern)
      const [member] = await db
        .select({ id: membersTable.id })
        .from(membersTable)
        .where(eq(membersTable.email, user.email))
        .limit(1);
      const ownerIds = member ? [user.userId, member.id] : [user.userId];
      const memberLots = await db
        .select({ id: lotsTable.id })
        .from(lotsTable)
        .where(inArray(lotsTable.ownerId, ownerIds));
      memberLots.forEach((l) => lotIds.push(l.id));
    } else {
      // Admins: no personal spot concept
      return void res.json({ data: null });
    }

    if (lotIds.length === 0) return void res.json({ data: null });

    const [spot] = await db
      .select()
      .from(parkingSpotsTable)
      .where(inArray(parkingSpotsTable.lotId, lotIds))
      .limit(1);

    res.json({ data: spot ?? null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

const createSpotSchema = z.object({
  buildingId: z.string().min(1),
  spotNumber: z.string().min(1).max(20),
  type: z.enum(["resident", "garage", "visitor"]).default("resident"),
  floor: z.string().max(20).optional(),
  lotId: z.string().optional(),
  notes: z.string().max(500).optional(),
});

// POST /parking/spots — create spot (admin only)
router.post("/parking/spots", requireAdmin, async (req, res) => {
  const parsed = createSpotSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
  }
  try {
    const user = req.user!;
    // Syndicate admins may only manage their own buildings
    await assertBuildingAccess(user, parsed.data.buildingId);
    if (parsed.data.lotId) {
      await assertLotMatchesBuilding(parsed.data.lotId, parsed.data.buildingId);
    }

    const [spot] = await db
      .insert(parkingSpotsTable)
      .values({
        buildingId: parsed.data.buildingId,
        spotNumber: parsed.data.spotNumber,
        type: parsed.data.type,
        floor: parsed.data.floor,
        lotId: parsed.data.lotId,
        notes: parsed.data.notes,
        status: "available",
      })
      .returning();

    res.status(201).json({ data: spot, message: "Place de parking créée" });
  } catch (e: any) {
    if (e?.status) return void res.status(e.status).json({ error: e.message });
    if (e?.code === "23505") {
      return void res
        .status(409)
        .json({ error: "Ce numéro de place existe déjà dans cet immeuble" });
    }
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /parking/spots/:id — update / assign lot (admin only)
router.put("/parking/spots/:id", requireAdmin, async (req, res) => {
  try {
    const user = req.user!;
    // Verify admin has access to this spot's building
    const [existing] = await db
      .select({ buildingId: parkingSpotsTable.buildingId })
      .from(parkingSpotsTable)
      .where(eq(parkingSpotsTable.id, String(req.params.id)));
    if (!existing)
      return void res.status(404).json({ error: "Place introuvable" });
    await assertBuildingAccess(user, existing.buildingId);

    const { lotId, status, notes, floor } = req.body as Record<string, string>;
    if (lotId) {
      await assertLotMatchesBuilding(lotId, existing.buildingId);
    }
    const [spot] = await db
      .update(parkingSpotsTable)
      .set({
        ...(lotId !== undefined ? { lotId: lotId || null } : {}),
        ...(status ? { status } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(floor !== undefined ? { floor } : {}),
      })
      .where(eq(parkingSpotsTable.id, String(req.params.id)))
      .returning();

    res.json({ data: spot, message: "Place mise à jour" });
  } catch (e: any) {
    if (e?.status) return void res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Vehicles ────────────────────────────────────────────────────────────────

// GET /parking/vehicles — list vehicles (own or all for admin)
router.get("/parking/vehicles", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (isSyndicateTeamRole(user.role) && !user.syndicateId) {
      return void res
        .status(403)
        .json({ error: "Syndicat non défini dans le token" });
    }
    const conditions: any[] = [];

    if (user.role === "member" || user.role === "tenant") {
      conditions.push(eq(vehiclesTable.userId, user.userId));
    } else if (isSyndicateTeamRole(user.role)) {
      const users = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.syndicateId, user.syndicateId!));
      const ids = users.map((u) => u.id);
      if (ids.length === 0) return void res.json({ data: [], total: 0 });
      conditions.push(inArray(vehiclesTable.userId, ids));
    }

    const vehicles = await db
      .select()
      .from(vehiclesTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(vehiclesTable.createdAt));

    // Batch-load owners + lots
    const ownerIds = [...new Set(vehicles.map((v) => v.userId))];
    const lotIds = [
      ...new Set(vehicles.map((v) => v.lotId).filter(Boolean)),
    ] as string[];

    const [owners, lots] = await Promise.all([
      ownerIds.length
        ? db
            .select({
              id: usersTable.id,
              name: usersTable.name,
              email: usersTable.email,
            })
            .from(usersTable)
            .where(inArray(usersTable.id, ownerIds))
        : [],
      lotIds.length
        ? db
            .select({ id: lotsTable.id, number: lotsTable.number })
            .from(lotsTable)
            .where(inArray(lotsTable.id, lotIds))
        : [],
    ]);

    const ownerMap = new Map(owners.map((o) => [o.id, o]));
    const lotMap = new Map(lots.map((l) => [l.id, l]));

    const enriched = vehicles.map((v) => ({
      ...v,
      owner: ownerMap.get(v.userId) ?? null,
      lot: v.lotId ? (lotMap.get(v.lotId) ?? null) : null,
    }));

    res.json({ data: enriched, total: enriched.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

const registerVehicleSchema = z.object({
  plateNumber: z.string().min(1).max(20),
  brand: z.string().max(50).optional(),
  model: z.string().max(50).optional(),
  color: z.string().max(30).optional(),
  lotId: z.string().optional(),
});

// POST /parking/vehicles — register a vehicle
router.post("/parking/vehicles", requireAuth, async (req, res) => {
  const parsed = registerVehicleSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
  }
  try {
    const user = req.user!;
    if (parsed.data.lotId) {
      const [lot] = await db
        .select({
          id: lotsTable.id,
          buildingId: lotsTable.buildingId,
          ownerId: lotsTable.ownerId,
          tenantId: lotsTable.tenantId,
        })
        .from(lotsTable)
        .where(eq(lotsTable.id, parsed.data.lotId))
        .limit(1);
      if (!lot) return void res.status(400).json({ error: "Lot introuvable" });
      await assertBuildingAccess(user, lot.buildingId);
      if (user.role === "member") {
        const [member] = await db
          .select({ id: membersTable.id })
          .from(membersTable)
          .where(eq(membersTable.email, user.email))
          .limit(1);
        if (![user.userId, member?.id].includes(lot.ownerId ?? "")) {
          return void res
            .status(403)
            .json({ error: "Ce lot n'est pas rattaché à votre compte" });
        }
      } else if (user.role === "tenant") {
        const [tenant] = await db
          .select({ id: tenantsTable.id })
          .from(tenantsTable)
          .where(
            or(
              eq(tenantsTable.id, user.userId),
              eq(tenantsTable.email, user.email),
            ),
          )
          .limit(1);
        if (lot.tenantId !== tenant?.id) {
          return void res
            .status(403)
            .json({ error: "Ce lot n'est pas rattaché à votre compte" });
        }
      }
    }
    const [vehicle] = await db
      .insert(vehiclesTable)
      .values({
        userId: user.userId,
        plateNumber: parsed.data.plateNumber.toUpperCase().trim(),
        brand: parsed.data.brand,
        model: parsed.data.model,
        color: parsed.data.color,
        lotId: parsed.data.lotId,
        status: "active",
      })
      .returning();

    res.status(201).json({ data: vehicle, message: "Véhicule enregistré" });
  } catch (e: any) {
    if (e?.code === "23505") {
      return void res
        .status(409)
        .json({ error: "Cette plaque est déjà enregistrée" });
    }
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /parking/vehicles/:id — remove a vehicle (own only, or admin)
router.delete("/parking/vehicles/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (isSyndicateTeamRole(user.role) && !user.syndicateId) {
      return void res
        .status(403)
        .json({ error: "Syndicat non défini dans le token" });
    }
    const [vehicle] = await db
      .select()
      .from(vehiclesTable)
      .where(eq(vehiclesTable.id, String(req.params.id)));

    if (!vehicle)
      return void res.status(404).json({ error: "Véhicule introuvable" });

    if (
      vehicle.userId !== user.userId &&
      user.role !== "super_admin" &&
      user.role !== "syndicate_admin"
    ) {
      return void res.status(403).json({ error: "Accès refusé" });
    }
    // Syndicate admin: ensure the vehicle owner belongs to their syndicate
    if (user.role === "syndicate_admin" && user.syndicateId) {
      const [owner] = await db
        .select({ syndicateId: usersTable.syndicateId })
        .from(usersTable)
        .where(eq(usersTable.id, vehicle.userId));
      if (owner?.syndicateId !== user.syndicateId) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
    }

    await db
      .delete(vehiclesTable)
      .where(eq(vehiclesTable.id, String(req.params.id)));
    res.json({ message: "Véhicule supprimé" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Parking Violations ──────────────────────────────────────────────────────

// GET /parking/violations — list violations
router.get("/parking/violations", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { buildingId, status } = req.query as Record<string, string>;
    const conditions: any[] = [];

    if (buildingId) {
      await assertBuildingAccess(user, buildingId);
      conditions.push(eq(parkingViolationsTable.buildingId, buildingId));
    } else {
      const ids = await getScopedBuildingIds(user);
      if (ids.length === 0 && user.role !== "super_admin") {
        return void res.json({ data: [], total: 0 });
      }
      if (ids.length > 0)
        conditions.push(inArray(parkingViolationsTable.buildingId, ids));
    }

    if (status) conditions.push(eq(parkingViolationsTable.status, status));

    // Building access alone is not enough for residents: violation records
    // contain reporter identity, photos, and notes. Management can review the
    // building queue, while members/tenants only receive their own reports.
    if (user.role === "member" || user.role === "tenant") {
      conditions.push(eq(parkingViolationsTable.reportedById, user.userId));
    }

    const violations = await db
      .select()
      .from(parkingViolationsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(parkingViolationsTable.reportedAt));

    // Batch-load spots
    const spotIds = [
      ...new Set(violations.map((v) => v.spotId).filter(Boolean)),
    ] as string[];
    const spots = spotIds.length
      ? await db
          .select({
            id: parkingSpotsTable.id,
            spotNumber: parkingSpotsTable.spotNumber,
            type: parkingSpotsTable.type,
          })
          .from(parkingSpotsTable)
          .where(inArray(parkingSpotsTable.id, spotIds))
      : [];
    const spotMap = new Map(spots.map((s) => [s.id, s]));

    const enriched = violations.map((v) => ({
      ...v,
      spot: v.spotId ? (spotMap.get(v.spotId) ?? null) : null,
    }));

    res.json({ data: enriched, total: enriched.length });
  } catch (e: any) {
    if (e?.status) return void res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

const reportViolationSchema = z.object({
  buildingId: z.string().min(1),
  spotId: z.string().optional(),
  plateNumber: z.string().min(1).max(20),
  photoUrl: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

// POST /parking/violations — report a violation
router.post("/parking/violations", requireAuth, async (req, res) => {
  const parsed = reportViolationSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
  }
  try {
    const user = req.user!;
    const { buildingId, spotId, plateNumber, photoUrl, notes } = parsed.data;

    // Verify reporter is a member of this building
    await assertBuildingAccess(user, buildingId);

    // If a spotId is given, validate it belongs to the same building
    if (spotId) {
      const [spotCheck] = await db
        .select({ buildingId: parkingSpotsTable.buildingId })
        .from(parkingSpotsTable)
        .where(eq(parkingSpotsTable.id, spotId));
      if (!spotCheck || spotCheck.buildingId !== buildingId) {
        return void res
          .status(400)
          .json({ error: "La place indiquée n'appartient pas à cet immeuble" });
      }
    }

    const [violation] = await db
      .insert(parkingViolationsTable)
      .values({
        buildingId,
        spotId: spotId ?? null,
        plateNumber: plateNumber.toUpperCase().trim(),
        reportedById: user.userId,
        reportedByName: user.name,
        photoUrl: photoUrl ?? null,
        notes: notes ?? null,
        status: "open",
        reportedAt: new Date(),
      })
      .returning();

    // Check if the plate is a registered vehicle (unauthorized parking or wrong spot)
    const [registeredVehicle] = await db
      .select()
      .from(vehiclesTable)
      .innerJoin(lotsTable, eq(vehiclesTable.lotId, lotsTable.id))
      .where(
        and(
          eq(vehiclesTable.plateNumber, plateNumber.toUpperCase().trim()),
          eq(lotsTable.buildingId, buildingId),
        ),
      )
      .limit(1);

    const alertTitle = registeredVehicle
      ? `🚗 Véhicule enregistré mal garé : ${plateNumber}`
      : `⚠️ Infraction parking — plaque inconnue : ${plateNumber}`;

    const [building] = await db
      .select({ syndicateId: buildingsTable.syndicateId })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, buildingId));

    if (building?.syndicateId) {
      await createAlert({
        title: alertTitle,
        message: `Signalé par ${user.name}${notes ? ` — ${notes}` : ""}`,
        type: "warning",
        syndicateId: building.syndicateId,
        target: "admin",
      });
      const adminIds = await getSyndicateAdminIds(building.syndicateId);
      if (adminIds.length > 0) {
        await sendPushToUsers(adminIds, alertTitle, `Signalé par ${user.name}`);
      }
    }

    res.status(201).json({ data: violation, message: "Infraction signalée" });
  } catch (e: any) {
    if (e?.status) return void res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /parking/violations/:id/status — resolve or dismiss (admin only)
router.put("/parking/violations/:id/status", requireAdmin, async (req, res) => {
  const { status } = req.body as { status: string };
  if (!["resolved", "dismissed"].includes(status)) {
    return void res
      .status(400)
      .json({
        error: "Statut invalide. Valeurs acceptées: resolved, dismissed",
      });
  }
  try {
    const user = req.user!;
    // Verify admin has access to the violation's building
    const [existing] = await db
      .select({ buildingId: parkingViolationsTable.buildingId })
      .from(parkingViolationsTable)
      .where(eq(parkingViolationsTable.id, String(req.params.id)));
    if (!existing)
      return void res.status(404).json({ error: "Infraction introuvable" });
    await assertBuildingAccess(user, existing.buildingId);

    const [violation] = await db
      .update(parkingViolationsTable)
      .set({ status, resolvedById: user.userId, resolvedAt: new Date() })
      .where(eq(parkingViolationsTable.id, String(req.params.id)))
      .returning();

    if (!violation)
      return void res.status(404).json({ error: "Infraction introuvable" });

    await sendPushToUsers(
      [violation.reportedById],
      `Infraction ${status === "resolved" ? "résolue" : "classée"} — ${violation.plateNumber}`,
      `Votre signalement a été traité par l'administration`,
    );

    res.json({ data: violation, message: "Statut mis à jour" });
  } catch (e: any) {
    if (e?.status) return void res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Visitor Parking Reservations ────────────────────────────────────────────

// GET /parking/reservations — list reservations
router.get("/parking/reservations", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { spotId, status } = req.query as Record<string, string>;
    const conditions: any[] = [];

    if (user.role === "member" || user.role === "tenant") {
      conditions.push(
        eq(visitorParkingReservationsTable.requestedById, user.userId),
      );
    } else if (user.role !== "super_admin") {
      const buildingIds = await getScopedBuildingIds(user);
      if (buildingIds.length === 0)
        return void res.json({ data: [], total: 0 });
      const scopedSpots = await db
        .select({ id: parkingSpotsTable.id })
        .from(parkingSpotsTable)
        .where(inArray(parkingSpotsTable.buildingId, buildingIds));
      const spotIds = scopedSpots.map((s) => s.id);
      if (spotIds.length === 0) return void res.json({ data: [], total: 0 });
      conditions.push(inArray(visitorParkingReservationsTable.spotId, spotIds));
    }
    if (spotId) {
      await assertBuildingAccess(
        user,
        await db
          .select({ buildingId: parkingSpotsTable.buildingId })
          .from(parkingSpotsTable)
          .where(eq(parkingSpotsTable.id, spotId))
          .limit(1)
          .then(([spot]) => spot?.buildingId ?? ""),
      );
      conditions.push(eq(visitorParkingReservationsTable.spotId, spotId));
    }
    if (status)
      conditions.push(eq(visitorParkingReservationsTable.status, status));

    const reservations = await db
      .select()
      .from(visitorParkingReservationsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(visitorParkingReservationsTable.startTime));

    // Batch-load spots
    const spotIds = [...new Set(reservations.map((r) => r.spotId))];
    const spots = spotIds.length
      ? await db
          .select({
            id: parkingSpotsTable.id,
            spotNumber: parkingSpotsTable.spotNumber,
            floor: parkingSpotsTable.floor,
            buildingId: parkingSpotsTable.buildingId,
          })
          .from(parkingSpotsTable)
          .where(inArray(parkingSpotsTable.id, spotIds))
      : [];
    const spotMap = new Map(spots.map((s) => [s.id, s]));

    const enriched = reservations.map((r) => ({
      ...r,
      spot: spotMap.get(r.spotId) ?? null,
    }));

    res.json({ data: enriched, total: enriched.length });
  } catch (e: any) {
    if (e?.status) return void res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

const createReservationSchema = z.object({
  spotId: z.string().min(1),
  visitorName: z.string().min(1).max(100),
  visitorPlate: z.string().max(20).optional(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  notes: z.string().max(500).optional(),
});

// POST /parking/reservations — reserve a visitor spot (with transaction for race-safety)
router.post("/parking/reservations", requireAuth, async (req, res) => {
  const parsed = createReservationSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
  }
  try {
    const user = req.user!;
    const { spotId, visitorName, visitorPlate, startTime, endTime, notes } =
      parsed.data;

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return void res.status(400).json({ error: "Dates invalides" });
    }
    if (end <= start) {
      return void res
        .status(400)
        .json({
          error: "La date de fin doit être postérieure à la date de début",
        });
    }

    // Verify the spot exists, is a visitor spot, and user has building access
    const [spot] = await db
      .select()
      .from(parkingSpotsTable)
      .where(eq(parkingSpotsTable.id, spotId));
    if (!spot) return void res.status(404).json({ error: "Place introuvable" });
    if (spot.type !== "visitor") {
      return void res
        .status(400)
        .json({ error: "Cette place n'est pas une place visiteur" });
    }
    await assertBuildingAccess(user, spot.buildingId);

    // Use a transaction so the overlap check and insert are atomic
    const reservation = await db.transaction(async (tx) => {
      const overlapping = await tx
        .select({ id: visitorParkingReservationsTable.id })
        .from(visitorParkingReservationsTable)
        .where(
          and(
            eq(visitorParkingReservationsTable.spotId, spotId),
            eq(visitorParkingReservationsTable.status, "confirmed"),
            lte(visitorParkingReservationsTable.startTime, end),
            gte(visitorParkingReservationsTable.endTime, start),
          ),
        )
        .limit(1);

      if (overlapping.length > 0) {
        const err: any = new Error(
          "Cette place est déjà réservée sur ce créneau",
        );
        err.status = 409;
        throw err;
      }

      const [created] = await tx
        .insert(visitorParkingReservationsTable)
        .values({
          spotId,
          requestedById: user.userId,
          visitorName,
          visitorPlate: visitorPlate ? visitorPlate.toUpperCase().trim() : null,
          startTime: start,
          endTime: end,
          status: "confirmed",
          notes: notes ?? null,
        })
        .returning();

      return created;
    });

    // Notify requester
    await sendPushToUsers(
      [user.userId],
      `✅ Réservation parking confirmée — Place ${spot.spotNumber}`,
      `${visitorName} · ${start.toLocaleDateString("fr-FR")} ${start.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} → ${end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
    );

    res
      .status(201)
      .json({ data: reservation, message: "Réservation confirmée" });
  } catch (e: any) {
    if (e?.status) return void res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /parking/reservations/:id — cancel a reservation
router.delete("/parking/reservations/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (isSyndicateTeamRole(user.role) && !user.syndicateId) {
      return void res
        .status(403)
        .json({ error: "Syndicat non défini dans le token" });
    }
    const [reservation] = await db
      .select()
      .from(visitorParkingReservationsTable)
      .where(eq(visitorParkingReservationsTable.id, String(req.params.id)));

    if (!reservation)
      return void res.status(404).json({ error: "Réservation introuvable" });

    // Only the requester or an admin can cancel
    if (reservation.requestedById !== user.userId) {
      if (user.role !== "super_admin" && user.role !== "syndicate_admin") {
        return void res.status(403).json({ error: "Accès refusé" });
      }
      // Syndicate admins can only cancel reservations in their buildings
      const [spot] = await db
        .select({ buildingId: parkingSpotsTable.buildingId })
        .from(parkingSpotsTable)
        .where(eq(parkingSpotsTable.id, reservation.spotId));
      if (!spot)
        return void res
          .status(409)
          .json({ error: "La place associée est introuvable" });
      await assertBuildingAccess(user, spot.buildingId);
    }

    const [updated] = await db
      .update(visitorParkingReservationsTable)
      .set({ status: "cancelled" })
      .where(eq(visitorParkingReservationsTable.id, String(req.params.id)))
      .returning();

    res.json({ data: updated, message: "Réservation annulée" });
  } catch (e: any) {
    if (e?.status) return void res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /parking/availability/:spotId — booked time slots for a visitor spot
router.get("/parking/availability/:spotId", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const [spot] = await db
      .select({ buildingId: parkingSpotsTable.buildingId })
      .from(parkingSpotsTable)
      .where(eq(parkingSpotsTable.id, String(req.params.spotId)));
    if (!spot) return void res.status(404).json({ error: "Place introuvable" });
    await assertBuildingAccess(user, spot.buildingId);

    const { from, to } = req.query as Record<string, string>;
    const start = from ? new Date(from) : new Date();
    const end = to ? new Date(to) : new Date(Date.now() + 7 * 86400000);

    const booked = await db
      .select({
        id: visitorParkingReservationsTable.id,
        startTime: visitorParkingReservationsTable.startTime,
        endTime: visitorParkingReservationsTable.endTime,
      })
      .from(visitorParkingReservationsTable)
      .where(
        and(
          eq(visitorParkingReservationsTable.spotId, String(req.params.spotId)),
          eq(visitorParkingReservationsTable.status, "confirmed"),
          gte(visitorParkingReservationsTable.endTime, start),
          lte(visitorParkingReservationsTable.startTime, end),
        ),
      )
      .orderBy(visitorParkingReservationsTable.startTime);

    res.json({ data: booked });
  } catch (e: any) {
    if (e?.status) return void res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
