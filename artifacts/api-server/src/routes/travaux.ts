import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  travauxTable,
  prestatairesTable,
  buildingsTable,
  lotsTable,
  membersTable,
  tenantsTable,
  transactionsTable,
} from "@workspace/db/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { isSyndicateTeamRole, requireAuth, requireAdmin } from "../middleware/auth.js";
import { createAlert } from "../lib/notify.js";
import { serverAuditLog } from "../lib/audit.js";
import { getUserBuildingIds, assertUserCanAccessBuilding } from "../lib/scope.js";

const router = Router();

function getMutationSyndicate(
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

async function getScopedTravail(id: string, syndicateId: string) {
  const [row] = await db
    .select({ travail: travauxTable })
    .from(travauxTable)
    .innerJoin(buildingsTable, eq(travauxTable.buildingId, buildingsTable.id))
    .where(
      and(
        eq(travauxTable.id, id),
        eq(buildingsTable.syndicateId, syndicateId),
      ),
    )
    .limit(1);
  return row?.travail;
}

async function assertPrestataireMatchesBuilding(
  prestataireId: string,
  buildingId: string,
): Promise<void> {
  const [[prestataire], [building]] = await Promise.all([
    db
      .select({
        buildingId: prestatairesTable.buildingId,
        syndicateId: prestatairesTable.syndicateId,
      })
      .from(prestatairesTable)
      .where(eq(prestatairesTable.id, prestataireId))
      .limit(1),
    db
      .select({ syndicateId: buildingsTable.syndicateId })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, buildingId))
      .limit(1),
  ]);

  if (!building) {
    throw Object.assign(new Error("Immeuble introuvable"), { status: 400 });
  }
  if (!prestataire) {
    throw Object.assign(new Error("Prestataire introuvable"), { status: 400 });
  }
  if (prestataire.buildingId && prestataire.buildingId !== buildingId) {
    throw Object.assign(
      new Error("Le prestataire ne correspond pas à l'immeuble sélectionné"),
      { status: 400 },
    );
  }
  if (prestataire.syndicateId && prestataire.syndicateId !== building.syndicateId) {
    throw Object.assign(
      new Error("Le prestataire n'appartient pas au syndicat de l'immeuble"),
      { status: 400 },
    );
  }
}

async function assertRequestedLotAccess(
  user: NonNullable<Express.Request["user"]>,
  lotId: string,
  buildingId: string,
): Promise<void> {
  const [lot] = await db
    .select({
      buildingId: lotsTable.buildingId,
      ownerId: lotsTable.ownerId,
      tenantId: lotsTable.tenantId,
    })
    .from(lotsTable)
    .where(eq(lotsTable.id, lotId))
    .limit(1);

  if (!lot || lot.buildingId !== buildingId) {
    throw Object.assign(new Error("Lot ou immeuble invalide"), { status: 400 });
  }

  if (user.role === "member") {
    if (lot.ownerId === user.userId) return;
    const [member] = await db
      .select({ id: membersTable.id })
      .from(membersTable)
      .where(eq(membersTable.email, user.email))
      .limit(1);
    if (member && lot.ownerId === member.id) return;
    throw Object.assign(new Error("Accès refusé à ce lot"), { status: 403 });
  }

  if (user.role === "tenant") {
    if (lot.tenantId === user.userId) return;
    const [tenant] = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.email, user.email))
      .limit(1);
    if (tenant && lot.tenantId === tenant.id) return;
    throw Object.assign(new Error("Accès refusé à ce lot"), { status: 403 });
  }
}

// GET /travaux — List work orders (no N+1: batch joins)
router.get("/travaux", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { buildingId, status, priority, type, prestataireId } = req.query as Record<string, string>;

    const conditions: any[] = [];

    if (buildingId) {
      // Verify the requesting user actually has access to the requested building
      // before using it as a filter — prevents cross-syndicate data leaks.
      try {
        await assertUserCanAccessBuilding(user, buildingId);
      } catch {
        return void res.status(403).json({ error: "Accès refusé à cet immeuble" });
      }
      conditions.push(eq(travauxTable.buildingId, buildingId));
    } else if (isSyndicateTeamRole(user.role)) {
      if (!user.syndicateId) {
        return void res.status(403).json({ error: "Syndicat non défini dans le token" });
      }
      // Scope to buildings belonging to this syndicate
      const buildingsInSyndicate = await db
        .select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.syndicateId, user.syndicateId));
      const ids = buildingsInSyndicate.map((b) => b.id);
      if (ids.length === 0) return void res.json({ data: [], total: 0 });
      conditions.push(inArray(travauxTable.buildingId, ids));
    } else if (user.role === "member" || user.role === "tenant") {
      // Scope to buildings the member/tenant is linked to
      const ids = await getUserBuildingIds(user);
      if (ids.length === 0) return void res.json({ data: [], total: 0 });
      conditions.push(inArray(travauxTable.buildingId, ids));
      // Residents only see the requests they submitted. Building-level access
      // alone would expose other occupants' descriptions and attachments.
      conditions.push(eq(travauxTable.reportedById, user.userId));
    }
    // super_admin with no buildingId filter sees all

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

    if (rows.length === 0) return void res.json({ data: [], total: 0 });

    // Batch-load prestataires and lots to avoid N+1
    const prestataireIds = [...new Set(rows.map((r) => r.prestataireId).filter(Boolean))] as string[];
    const lotIds = [...new Set(rows.map((r) => r.lotId).filter(Boolean))] as string[];

    const [prestataires, lots] = await Promise.all([
      prestataireIds.length
        ? db
            .select({
              id: prestatairesTable.id,
              name: prestatairesTable.name,
              phone: prestatairesTable.phone,
              type: prestatairesTable.type,
              buildingId: prestatairesTable.buildingId,
              syndicateId: prestatairesTable.syndicateId,
            })
            .from(prestatairesTable)
            .where(inArray(prestatairesTable.id, prestataireIds))
        : [],
      lotIds.length
        ? db
            .select({
              id: lotsTable.id,
              number: lotsTable.number,
              floor: lotsTable.floor,
              type: lotsTable.type,
              buildingId: lotsTable.buildingId,
            })
            .from(lotsTable)
            .where(inArray(lotsTable.id, lotIds))
        : [],
    ]);

    const prestataireMap = new Map(prestataires.map((p) => [p.id, p]));
    const lotMap = new Map(lots.map((l) => [l.id, l]));

    const buildingRows = await db
      .select({ id: buildingsTable.id, syndicateId: buildingsTable.syndicateId })
      .from(buildingsTable)
      .where(inArray(buildingsTable.id, [...new Set(rows.map((r) => r.buildingId))]));
    const syndicateByBuilding = new Map(buildingRows.map((b) => [b.id, b.syndicateId]));
    const enriched = rows.map((t) => {
      const syndicateId = syndicateByBuilding.get(t.buildingId);
      const provider = t.prestataireId ? prestataireMap.get(t.prestataireId) : undefined;
      const lot = t.lotId ? lotMap.get(t.lotId) : undefined;
      const providerBelongs =
        !!provider &&
        (!provider.buildingId || provider.buildingId === t.buildingId) &&
        !!syndicateId &&
        provider.syndicateId === syndicateId;
      const lotBelongs = !!lot && lot.buildingId === t.buildingId;
      return {
        ...t,
        prestataire: providerBelongs ? provider : null,
        lot: lotBelongs ? lot : null,
      };
    });

    res.json({ data: enriched, total: enriched.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /travaux/:id
router.get("/travaux/:id", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const [travail] = await db
      .select()
      .from(travauxTable)
      .where(eq(travauxTable.id, String(String(req.params.id))));

    if (!travail) return void res.status(404).json({ error: "Not found" });

    // Scope check: verify user has access to this work order's building
    try {
      await assertUserCanAccessBuilding(user, travail.buildingId);
    } catch {
      return void res.status(403).json({ error: "Accès refusé" });
    }
    if (
      (user.role === "member" || user.role === "tenant") &&
      travail.reportedById !== user.userId
    ) {
      return void res.status(403).json({ error: "Accès refusé" });
    }

    const [prestataire, lot, building] = await Promise.all([
      travail.prestataireId
        ? db.select().from(prestatairesTable).where(eq(prestatairesTable.id, travail.prestataireId)).then(([p]) => p ?? null)
        : Promise.resolve(null),
      travail.lotId
        ? db.select().from(lotsTable).where(eq(lotsTable.id, travail.lotId)).then(([l]) => l ?? null)
        : Promise.resolve(null),
      db.select().from(buildingsTable).where(eq(buildingsTable.id, travail.buildingId)).then(([b]) => b ?? null),
    ]);

    if (
      !building ||
      (prestataire &&
        (prestataire.syndicateId !== building.syndicateId ||
          (prestataire.buildingId && prestataire.buildingId !== building.id))) ||
      (lot && lot.buildingId !== building.id)
    ) {
      return void res.status(409).json({
        error: "Les relations du bon de travaux sont incohérentes",
      });
    }

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

// POST /travaux — Create work order / incident
router.post("/travaux", requireAuth, async (req, res) => {
  const parsed = createTravauxSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
  }
  try {
    const user = (req as any).user;
    const { title, description, type, priority, buildingId, lotId, prestataireId, estimatedAmount, startDate, endDate, notes } = parsed.data;
    const effectiveSyndicateId = getMutationSyndicate(req, res);
    if (!effectiveSyndicateId) return;

    if (prestataireId && !isSyndicateTeamRole(user.role) && user.role !== "super_admin") {
      return void res.status(403).json({ error: "Seule l'équipe de gestion peut affecter un prestataire" });
    }

    // Scope check: verify the caller is allowed to create a work order for this building
    try {
      await assertUserCanAccessBuilding(user, buildingId);
    } catch {
      return void res.status(403).json({ error: "Accès refusé à cet immeuble" });
    }
    const [buildingScope] = await db
      .select({ id: buildingsTable.id })
      .from(buildingsTable)
      .where(
        and(
          eq(buildingsTable.id, buildingId),
          eq(buildingsTable.syndicateId, effectiveSyndicateId),
        ),
      )
      .limit(1);
    if (!buildingScope) {
      return void res.status(403).json({ error: "Accès refusé à cet immeuble" });
    }

    if (lotId) {
      const [lot] = await db
        .select({ buildingId: lotsTable.buildingId })
        .from(lotsTable)
        .where(eq(lotsTable.id, lotId))
        .limit(1);
      if (!lot) return void res.status(400).json({ error: "Lot introuvable" });
      if (lot.buildingId !== buildingId) {
        return void res.status(400).json({ error: "Le lot ne correspond pas à l'immeuble sélectionné" });
      }
      try {
        await assertRequestedLotAccess(user, lotId, buildingId);
      } catch (error: any) {
        return void res.status(error.status ?? 400).json({ error: error.message });
      }
    }

    if (prestataireId) {
      try {
        await assertPrestataireMatchesBuilding(prestataireId, buildingId);
      } catch (error: any) {
        return void res.status(error.status ?? 400).json({ error: error.message });
      }
    }

    const [travail] = await db
      .insert(travauxTable)
      .values({
        title,
        description,
        type: type ?? "entretien",
        priority: priority ?? "normal",
        status: prestataireId ? "assigned" : "reported",
        buildingId,
        lotId,
        prestataireId,
        assignedById: prestataireId ? user.userId : undefined,
        assignedAt: prestataireId ? new Date() : undefined,
        reportedById: user.userId,
        reportedByName: user.name,
        estimatedAmount: estimatedAmount !== undefined ? String(estimatedAmount) : undefined,
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

    await serverAuditLog(req, {
      action: "CREATE",
      entity: "travaux",
      entityId: travail.id,
      details: `Incident créé: ${title}`,
    });

    res.status(201).json({ data: travail, message: "Bon de travaux créé" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /travaux/:id/assign — assign a provider, tracks response time
router.post("/travaux/:id/assign", requireAuth, requireAdmin, async (req, res) => {
  const { prestataireId } = req.body;
  if (!prestataireId) return void res.status(400).json({ error: "prestataireId requis" });
  try {
    const user = (req as any).user;
    const effectiveSyndicateId = getMutationSyndicate(req, res);
    if (!effectiveSyndicateId) return;
    const travail = await getScopedTravail(String(req.params.id), effectiveSyndicateId);
    if (!travail) return void res.status(404).json({ error: "Not found" });
    try { await assertUserCanAccessBuilding(user, travail.buildingId); } catch { return void res.status(403).json({ error: "Accès refusé" }); }
    try {
      await assertPrestataireMatchesBuilding(String(prestataireId), travail.buildingId);
    } catch (error: any) {
      return void res.status(error.status ?? 400).json({ error: error.message });
    }

    const now = new Date();
    const responseTimeMinutes = Math.round((now.getTime() - new Date(travail.createdAt as any).getTime()) / 60000);

    const [updated] = await db
      .update(travauxTable)
      .set({
        prestataireId,
        status: "assigned",
        assignedById: user.userId,
        assignedAt: now,
        responseTimeMinutes,
      })
      .where(eq(travauxTable.id, String(String(req.params.id))))
      .returning();

    await serverAuditLog(req, {
      action: "ASSIGN",
      entity: "travaux",
      entityId: updated.id,
      details: `Prestataire assigné à: ${updated.title}`,
    });

    res.json({ data: updated, message: "Prestataire assigné" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /travaux/:id/report — upload intervention proof (report + photos + invoice)
const reportSchema = z.object({
  reportUrl: z.string().min(1, "Le rapport d'intervention est obligatoire"),
  photoUrls: z.array(z.string()).min(1, "Au moins une photo est requise comme preuve"),
  invoiceUrl: z.string().min(1, "La facture est obligatoire"),
  invoiceAmount: z.number().positive().optional(),
});
router.post("/travaux/:id/report", requireAuth, requireAdmin, async (req, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Documents manquants" });
  }
  try {
    const user = (req as any).user;
    const effectiveSyndicateId = getMutationSyndicate(req, res);
    if (!effectiveSyndicateId) return;
    const existing = await getScopedTravail(String(req.params.id), effectiveSyndicateId);
    if (!existing) return void res.status(404).json({ error: "Not found" });
    try { await assertUserCanAccessBuilding(user, existing.buildingId); } catch { return void res.status(403).json({ error: "Accès refusé" }); }
    const { reportUrl, photoUrls, invoiceUrl, invoiceAmount } = parsed.data;
    const [updated] = await db
      .update(travauxTable)
      .set({
        reportUrl,
        photoUrls: JSON.stringify(photoUrls),
        invoiceUrl,
        invoiceAmount: invoiceAmount !== undefined ? String(invoiceAmount) : undefined,
        status: "pending_validation",
      })
      .where(eq(travauxTable.id, String(String(req.params.id))))
      .returning();

    if (!updated) return void res.status(404).json({ error: "Not found" });

    await serverAuditLog(req, {
      action: "SUBMIT_REPORT",
      entity: "travaux",
      entityId: updated.id,
      details: `Rapport d'intervention soumis: ${updated.title}`,
    });

    res.json({ data: updated, message: "Rapport soumis, en attente de validation" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /travaux/:id/validate — syndic validates proof, creates the financial
// transaction, and closes the intervention. Blocked without full documentation.
router.post("/travaux/:id/validate", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = (req as any).user;
    const effectiveSyndicateId = getMutationSyndicate(req, res);
    if (!effectiveSyndicateId) return;
    const travail = await getScopedTravail(String(req.params.id), effectiveSyndicateId);
    if (!travail) return void res.status(404).json({ error: "Not found" });
    try { await assertUserCanAccessBuilding(user, travail.buildingId); } catch { return void res.status(403).json({ error: "Accès refusé" }); }

    const photos: string[] = JSON.parse(travail.photoUrls ?? "[]");
    if (!travail.reportUrl || !travail.invoiceUrl || photos.length === 0) {
      return void res.status(400).json({
        error:
          "Impossible de valider : rapport d'intervention, photos et facture sont tous obligatoires. Merci de compléter le dossier avant de continuer.",
      });
    }

    const now = new Date();
    const resolutionTimeMinutes = Math.round(
      (now.getTime() - new Date((travail.assignedAt ?? travail.createdAt) as any).getTime()) / 60000,
    );

    const amount = travail.invoiceAmount ?? travail.estimatedAmount ?? 0;

    const [building] = await db
      .select({ syndicateId: buildingsTable.syndicateId })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, travail.buildingId));

    const [transaction] = await db
      .insert(transactionsTable)
      .values({
        type: "depense",
        amount: String(amount),
        label: `Intervention: ${travail.title}`,
        date: now.toISOString().split("T")[0],
        status: "paid",
        syndicateId: building?.syndicateId,
        proofUrl: travail.invoiceUrl,
      })
      .returning();

    const [updated] = await db
      .update(travauxTable)
      .set({
        status: "completed",
        completedAt: now,
        actualAmount: String(amount),
        validatedById: user.userId,
        validatedByName: user.name,
        validatedAt: now,
        transactionId: transaction.id,
        resolutionTimeMinutes,
      })
      .where(eq(travauxTable.id, String(String(req.params.id))))
      .returning();

    await serverAuditLog(req, {
      action: "VALIDATE",
      entity: "travaux",
      entityId: updated.id,
      details: `Intervention validée et clôturée: ${updated.title} — ${amount} MAD`,
    });

    res.json({ data: updated, message: "Intervention validée, paiement enregistré" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /travaux/:id — Update work order (status, assignment, amounts)
router.put("/travaux/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (req.body.status === "completed") {
      return void res.status(400).json({
        error: "Utilisez /travaux/:id/validate pour clôturer une intervention (rapport, photos et facture requis).",
      });
    }

    const user = (req as any).user;
    const effectiveSyndicateId = getMutationSyndicate(req, res);
    if (!effectiveSyndicateId) return;
    const existing = await getScopedTravail(String(req.params.id), effectiveSyndicateId);
    if (!existing) return void res.status(404).json({ error: "Not found" });
    try { await assertUserCanAccessBuilding(user, existing.buildingId); } catch { return void res.status(403).json({ error: "Accès refusé" }); }
    if (req.body.prestataireId) {
      try {
        await assertPrestataireMatchesBuilding(String(req.body.prestataireId), existing.buildingId);
      } catch (error: any) {
        return void res.status(error.status ?? 400).json({ error: error.message });
      }
    }

    const allowed = [
      "title", "description", "type", "status", "priority",
      "prestataireId", "estimatedAmount", "actualAmount",
      "startDate", "endDate", "notes", "assignedById",
    ];
    const updates: Record<string, any> = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    const [updated] = await db
      .update(travauxTable)
      .set(updates)
      .where(eq(travauxTable.id, String(String(req.params.id))))
      .returning();

    if (!updated) return void res.status(404).json({ error: "Not found" });
    res.json({ data: updated, message: "Bon de travaux mis à jour" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /travaux/:id
router.delete("/travaux/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = (req as any).user;
    const effectiveSyndicateId = getMutationSyndicate(req, res);
    if (!effectiveSyndicateId) return;
    const existing = await getScopedTravail(String(req.params.id), effectiveSyndicateId);
    if (!existing) return void res.status(404).json({ error: "Not found" });
    try { await assertUserCanAccessBuilding(user, existing.buildingId); } catch { return void res.status(403).json({ error: "Accès refusé" }); }

    const [deleted] = await db
      .delete(travauxTable)
      .where(eq(travauxTable.id, String(String(req.params.id))))
      .returning();

    if (!deleted) return void res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
