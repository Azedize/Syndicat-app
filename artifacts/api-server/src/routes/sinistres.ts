import { Router } from "express";
import { db } from "@workspace/db";
import {
  sinistresTable,
  lotsTable,
  buildingsTable,
  usersTable,
  membersTable,
  tenantsTable,
} from "@workspace/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  isSyndicateTeamRole,
  requireAuth,
  requireOperationalAccess,
} from "../middleware/auth.js";
import { createAlert, sendEmailToMany } from "../lib/notify.js";
import { incidentNotificationTemplate } from "../lib/email/templates.js";
import { getUserBuildingIds } from "../lib/scope.js";

const router = Router();

function forbidden(message = "Accès refusé") {
  return Object.assign(new Error(message), { status: 403 });
}

async function getClaimBuildingAccess(
  user: NonNullable<Express.Request["user"]>,
  buildingId: string,
) {
  const [building] = await db
    .select({ id: buildingsTable.id, syndicateId: buildingsTable.syndicateId })
    .from(buildingsTable)
    .where(eq(buildingsTable.id, buildingId))
    .limit(1);
  if (!building) return null;

  if (user.role === "super_admin") return building;
  if (isSyndicateTeamRole(user.role)) {
    if (!user.syndicateId || building.syndicateId !== user.syndicateId)
      throw forbidden();
    return building;
  }

  const allowedBuildings = await getUserBuildingIds(user);
  if (!allowedBuildings.includes(buildingId)) throw forbidden();
  return building;
}

function getSupervisedSyndicate(
  req: import("express").Request,
  res: import("express").Response,
): string | null {
  const user = req.user!;
  if (user.role === "super_admin") {
    const syndicateId =
      typeof req.query.syndicateId === "string" ? req.query.syndicateId : "";
    if (req.query.supervision !== "true" || !syndicateId) {
      res.status(403).json({
        error: "La supervision et un syndicat cible sont requis.",
        code: "SUPERVISION_REQUIRED",
      });
      return null;
    }
    return syndicateId;
  }
  if (!user.syndicateId) {
    res.status(403).json({ error: "Syndicat non défini dans le token" });
    return null;
  }
  return user.syndicateId;
}

async function getScopedClaim(id: string, syndicateId: string) {
  const [row] = await db
    .select({ sinistre: sinistresTable })
    .from(sinistresTable)
    .innerJoin(buildingsTable, eq(sinistresTable.buildingId, buildingsTable.id))
    .where(
      and(
        eq(sinistresTable.id, id),
        eq(buildingsTable.syndicateId, syndicateId),
      ),
    )
    .limit(1);
  return row?.sinistre;
}

// GET /sinistres — (no N+1: batch lot lookup)
router.get("/sinistres", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { buildingId, status, type } = req.query as Record<string, string>;

    const conditions: any[] = [];

    if (buildingId) {
      const building = await getClaimBuildingAccess(user, buildingId);
      if (!building)
        return void res.status(404).json({ error: "Immeuble introuvable" });
      conditions.push(eq(sinistresTable.buildingId, buildingId));
    } else if (user.role !== "super_admin") {
      const ids = isSyndicateTeamRole(user.role)
        ? user.syndicateId
          ? (
              await db
                .select({ id: buildingsTable.id })
                .from(buildingsTable)
                .where(eq(buildingsTable.syndicateId, user.syndicateId))
            ).map((b) => b.id)
          : []
        : await getUserBuildingIds(user);
      if (ids.length === 0) return void res.json({ data: [], total: 0 });
      conditions.push(inArray(sinistresTable.buildingId, ids));
    }

    // Members and tenants only see the incidents they personally reported —
    // they must not see other residents' claims in the syndicate.
    if (user.role === "member" || user.role === "tenant") {
      conditions.push(eq(sinistresTable.reportedById, user.userId));
    }

    if (status) conditions.push(eq(sinistresTable.status, status));
    if (type) conditions.push(eq(sinistresTable.type, type));

    const rows = await db
      .select()
      .from(sinistresTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(sinistresTable.createdAt));

    if (rows.length === 0) return void res.json({ data: [], total: 0 });

    // Batch-load lots to avoid N+1
    const lotIds = [
      ...new Set(rows.map((r) => r.lotId).filter(Boolean)),
    ] as string[];
    const lots = lotIds.length
      ? await db
          .select({
            id: lotsTable.id,
            number: lotsTable.number,
            floor: lotsTable.floor,
          })
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
    const error = e as { status?: number; message?: string };
    if (error.status)
      return void res
        .status(error.status)
        .json({ error: error.message ?? "Accès refusé" });
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /sinistres — Declare a claim/incident
router.post("/sinistres", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const {
      buildingId,
      lotId,
      type,
      description,
      date,
      estimatedAmount,
      notes,
      urgency,
      imageUrls,
    } = req.body;

    if (!buildingId || !type || !description || !date) {
      return void res
        .status(400)
        .json({
          error: "buildingId, type, description et date sont obligatoires",
        });
    }

    const supervisedSyndicateId =
      user.role === "super_admin"
        ? getSupervisedSyndicate(req, res)
        : user.syndicateId;
    if (!supervisedSyndicateId && user.role !== "super_admin") {
      return;
    }

    const building = await getClaimBuildingAccess(user, String(buildingId));
    if (!building)
      return void res.status(404).json({ error: "Immeuble introuvable" });
    if (building.syndicateId !== supervisedSyndicateId) {
      return void res
        .status(403)
        .json({ error: "Accès refusé à cet immeuble" });
    }

    if (lotId) {
      const [lot] = await db
        .select({
          buildingId: lotsTable.buildingId,
          ownerId: lotsTable.ownerId,
          tenantId: lotsTable.tenantId,
        })
        .from(lotsTable)
        .where(eq(lotsTable.id, String(lotId)))
        .limit(1);
      if (!lot || lot.buildingId !== String(buildingId)) {
        return void res.status(400).json({ error: "Lot ou immeuble invalide" });
      }
      if (user.role === "member" && lot.ownerId !== user.userId) {
        const [member] = await db
          .select({ id: membersTable.id })
          .from(membersTable)
          .where(eq(membersTable.email, user.email))
          .limit(1);
        if (!member || lot.ownerId !== member.id)
          return void res.status(403).json({ error: "Accès refusé" });
      }
      if (user.role === "tenant" && lot.tenantId !== user.userId) {
        const [tenant] = await db
          .select({ id: tenantsTable.id })
          .from(tenantsTable)
          .where(eq(tenantsTable.email, user.email))
          .limit(1);
        if (!tenant || lot.tenantId !== tenant.id)
          return void res.status(403).json({ error: "Accès refusé" });
      }
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
        urgency: urgency ?? "normal",
        imageUrls: JSON.stringify(Array.isArray(imageUrls) ? imageUrls : []),
        reportedById: user.userId,
        reportedByName: user.name,
        notes,
      } as any)
      .returning();

    // Find syndicate for scoped alert
    createAlert({
      title: `🚨 Sinistre déclaré: ${type}`,
      message: description,
      type: "error",
      syndicateId: building?.syndicateId ?? null,
      target: "admin",
    }).catch(() => {});

    (async () => {
      const admins = await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(
          building?.syndicateId
            ? and(
                eq(usersTable.syndicateId, building.syndicateId),
                eq(usersTable.role, "syndicate_admin"),
              )
            : eq(usersTable.role, "super_admin"),
        );
      const { subject, html } = incidentNotificationTemplate(
        type,
        description,
        urgency ?? "normal",
      );
      await sendEmailToMany(
        admins.map((a) => a.email),
        subject,
        html,
        "incident_notification",
        building?.syndicateId ?? null,
      );
    })().catch(() => {});

    res
      .status(201)
      .json({ data: sinistre, message: "Sinistre déclaré avec succès" });
  } catch (e) {
    const error = e as { status?: number; message?: string };
    if (error.status)
      return void res
        .status(error.status)
        .json({ error: error.message ?? "Accès refusé" });
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /sinistres/:id — Update claim status/amounts
router.put(
  "/sinistres/:id",
  requireAuth,
  requireOperationalAccess,
  async (req, res) => {
    try {
      const user = req.user!;
      const syndicateId = getSupervisedSyndicate(req, res);
      if (!syndicateId) return;
      const existing = await getScopedClaim(String(req.params.id), syndicateId);
      if (!existing)
        return void res
          .status(404)
          .json({ error: "Sinistre introuvable ou accès refusé" });

      const allowed = [
        "status",
        "urgency",
        "estimatedAmount",
        "indemnisedAmount",
        "claimNumber",
        "notes",
        "contractorId",
        "resolutionNote",
        "invoiceUrl",
        "imageUrls",
      ];
      const updates: Record<string, any> = {};
      for (const k of allowed) {
        if (req.body[k] !== undefined) {
          updates[k] =
            k === "imageUrls" && Array.isArray(req.body[k])
              ? JSON.stringify(req.body[k])
              : req.body[k];
        }
      }
      // Auto-set resolvedAt when closing
      if (req.body.status === "resolved" || req.body.status === "closed") {
        updates.resolvedAt = new Date();
      }

      const [updated] = await db
        .update(sinistresTable)
        .set(updates)
        .where(
          and(
            eq(sinistresTable.id, String(req.params.id)),
            eq(sinistresTable.buildingId, existing.buildingId),
          ),
        )
        .returning();

      if (!updated)
        return void res.status(404).json({ error: "Sinistre introuvable" });
      res.json({ data: updated, message: "Sinistre mis à jour" });
    } catch (e) {
      const error = e as { status?: number; message?: string };
      if (error.status)
        return void res
          .status(error.status)
          .json({ error: error.message ?? "Accès refusé" });
      console.error(e);
      res.status(500).json({ error: "Server error" });
    }
  },
);

export default router;
