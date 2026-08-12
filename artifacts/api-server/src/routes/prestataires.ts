import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  prestatairesTable,
  contratsPrestatairesTable,
  travauxTable,
  prestataireEvaluationsTable,
  buildingsTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, count, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { syndicateWhere, effectiveSyndicateId } from "../lib/syndicate-filter.js";
import { getUserBuildingIds, assertUserCanAccessBuilding } from "../lib/scope.js";
import { serverAuditLog } from "../lib/audit.js";

const router = Router();

// ─── Prestataires ───────────────────────────────────────────────────────────

// GET /prestataires
router.get("/prestataires", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { buildingId, type, status } = req.query as Record<string, string>;

    const conditions: any[] = [];

    if (user.role === "member" || user.role === "tenant") {
      const buildingIds = await getUserBuildingIds(user);
      if (buildingIds.length === 0) return void res.json({ data: [], total: 0 });
      const providerIds = await db
        .selectDistinct({ id: contratsPrestatairesTable.prestataireId })
        .from(contratsPrestatairesTable)
        .where(inArray(contratsPrestatairesTable.buildingId, buildingIds));
      const ids = providerIds.map((p) => p.id);
      if (ids.length === 0) return void res.json({ data: [], total: 0 });
      conditions.push(inArray(prestatairesTable.id, ids));
    } else {
      const sw = syndicateWhere(req, prestatairesTable.syndicateId);
      if (sw) conditions.push(sw);
    }

    if (buildingId) conditions.push(eq(prestatairesTable.buildingId, buildingId));
    if (type) conditions.push(eq(prestatairesTable.type, type));
    if (status) conditions.push(eq(prestatairesTable.status, status));

    const rows = await db
      .select()
      .from(prestatairesTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(prestatairesTable.name);

    if (rows.length === 0) return void res.json({ data: [], total: 0 });

    // Batch-load contracts and open work-order counts to avoid N+1
    const ids = rows.map((p) => p.id);
    const [contracts, workCounts] = await Promise.all([
      db.select().from(contratsPrestatairesTable).where(inArray(contratsPrestatairesTable.prestataireId, ids)),
      db
        .select({ prestataireId: travauxTable.prestataireId, count: count() })
        .from(travauxTable)
        .where(
          and(
            inArray(travauxTable.prestataireId, ids),
            sql`${travauxTable.status} NOT IN ('completed','cancelled')`,
          ),
        )
        .groupBy(travauxTable.prestataireId),
    ]);

    const today = new Date().toISOString().split("T")[0];
    const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const contractsByProvider = new Map<string, typeof contracts>();
    for (const c of contracts) {
      const list = contractsByProvider.get(c.prestataireId) ?? [];
      list.push(c);
      contractsByProvider.set(c.prestataireId, list);
    }
    const workCountMap = new Map(workCounts.map((w) => [w.prestataireId, w.count]));

    const enriched = rows.map((p) => {
      const providerContracts = contractsByProvider.get(p.id) ?? [];
      const activeContracts = providerContracts.filter((c) => c.status === "active");
      const expiringContracts = activeContracts.filter(
        (c) => c.endDate && c.endDate <= in30 && c.endDate >= today,
      );
      return {
        ...p,
        activeContracts: activeContracts.length,
        openWorkOrders: workCountMap.get(p.id) ?? 0,
        expiringContracts: expiringContracts.length,
        contracts: providerContracts,
      };
    });

    res.json({ data: enriched, total: enriched.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /prestataires/dashboard — super admin global stats
router.get(
  "/prestataires/dashboard",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const sw = syndicateWhere(req, prestatairesTable.syndicateId);

      const providers = await db.select().from(prestatairesTable).where(sw);
      const providerIds = providers.map((p) => p.id);

      const contracts = providerIds.length
        ? await db
            .select()
            .from(contratsPrestatairesTable)
            .where(inArray(contratsPrestatairesTable.prestataireId, providerIds))
        : [];

      const travauxRows = providerIds.length
        ? await db
            .select()
            .from(travauxTable)
            .where(inArray(travauxTable.prestataireId, providerIds))
        : [];

      const today = new Date().toISOString().split("T")[0];
      const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const contratsExpires = contracts.filter((c) => c.status === "expired").length;
      const contratsBientotExpires = contracts.filter(
        (c) => c.status === "active" && c.endDate && c.endDate <= in30 && c.endDate >= today,
      ).length;

      const coutTotal = travauxRows.reduce((sum, t) => sum + Number(t.actualAmount ?? 0), 0);

      const ranked = [...providers]
        .filter((p) => p.rating !== null && Number(p.evaluationsCount ?? 0) > 0)
        .sort((a, b) => Number(b.rating) - Number(a.rating));

      res.json({
        data: {
          totalPrestataires: providers.length,
          prestatairesActifs: providers.filter((p) => p.status === "active").length,
          contratsExpires,
          contratsBientotExpires,
          totalInterventions: travauxRows.length,
          coutTotal,
          meilleursPrestataires: ranked.slice(0, 5),
          moinsBonsPrestataires: ranked.slice(-5).reverse(),
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// GET /prestataires/:id
// Access rules:
//   super_admin  — unrestricted
//   syndicate_admin — only providers belonging to their syndicate
//   member / tenant — only providers linked to their building via an active contract
router.get("/prestataires/:id", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const [p] = await db
      .select()
      .from(prestatairesTable)
      .where(eq(prestatairesTable.id, String(req.params.id)));

    if (!p) return void res.status(404).json({ error: "Not found" });

    // ─── Syndicate / building isolation ──────────────────────────────────────
    if (user.role !== "super_admin") {
      if (!user.syndicateId) {
        return void res.status(403).json({ error: "Syndicat non défini dans le token" });
      }
      if (user.role === "syndicate_admin" || user.role === "president" ||
          user.role === "treasurer" || user.role === "secretary" ||
          user.role === "committee_member") {
        // Syndicate management may only view providers scoped to their syndicate.
        if (p.syndicateId !== user.syndicateId) {
          return void res.status(403).json({ error: "Accès refusé" });
        }
      } else {
        // member / tenant: only providers associated with their building via a contract
        const buildingIds = await getUserBuildingIds(user);
        if (buildingIds.length === 0) {
          return void res.status(403).json({ error: "Accès refusé" });
        }
        const [linked] = await db
          .select({ id: contratsPrestatairesTable.id })
          .from(contratsPrestatairesTable)
          .where(and(
            eq(contratsPrestatairesTable.prestataireId, p.id),
            inArray(contratsPrestatairesTable.buildingId, buildingIds),
          ))
          .limit(1);
        if (!linked) {
          return void res.status(403).json({ error: "Accès refusé" });
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const [contracts, recentTravaux, evaluations] = await Promise.all([
      db
        .select()
        .from(contratsPrestatairesTable)
        .where(eq(contratsPrestatairesTable.prestataireId, p.id))
        .orderBy(desc(contratsPrestatairesTable.createdAt)),
      db
        .select()
        .from(travauxTable)
        .where(eq(travauxTable.prestataireId, p.id))
        .orderBy(desc(travauxTable.createdAt))
        .limit(20),
      db
        .select()
        .from(prestataireEvaluationsTable)
        .where(eq(prestataireEvaluationsTable.prestataireId, p.id))
        .orderBy(desc(prestataireEvaluationsTable.createdAt))
        .limit(20),
    ]);

    res.json({ ...p, contracts, recentTravaux, evaluations });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

const createPrestataireSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.string().min(1).max(60),
  contactName: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(300).optional(),
  ice: z.string().max(30).optional(),
  rc: z.string().max(30).optional(),
  buildingId: z.string().optional(),
  notes: z.string().max(2000).optional(),
  documentUrl: z.string().min(1, "Un document (image ou PDF) justifiant le besoin est obligatoire"),
});

// POST /prestataires
router.post("/prestataires", requireAuth, requireAdmin, async (req, res) => {
  const parsed = createPrestataireSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
  }
  try {
    const user = (req as any).user;
    const [p] = await db
      .insert(prestatairesTable)
      .values({
        ...parsed.data,
        syndicateId: effectiveSyndicateId(req, user.syndicateId),
      })
      .returning();

    await serverAuditLog(req, {
      action: "CREATE",
      entity: "prestataire",
      entityId: p.id,
      details: `Prestataire créé: ${p.name} (${p.type})`,
    });

    res.status(201).json(p);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

function isSamePrestataireSyndicate(user: any, syndicateId: string | null): boolean {
  return user.role === "super_admin" || syndicateId === user.syndicateId;
}

// PUT /prestataires/:id
router.put("/prestataires/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = (req as any).user;
    const [existing] = await db.select().from(prestatairesTable).where(eq(prestatairesTable.id, String(req.params.id)));
    if (!existing) return void res.status(404).json({ error: "Not found" });
    if (!isSamePrestataireSyndicate(user, existing.syndicateId)) {
      return void res.status(403).json({ error: "Accès refusé" });
    }

    const allowed = [
      "name", "type", "contactName", "phone", "email", "address",
      "ice", "rc", "status", "notes", "documentUrl",
    ];
    const updates: Record<string, any> = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    const [updated] = await db
      .update(prestatairesTable)
      .set(updates)
      .where(eq(prestatairesTable.id, String(req.params.id)))
      .returning();

    if (!updated) return void res.status(404).json({ error: "Not found" });

    await serverAuditLog(req, {
      action: "UPDATE",
      entity: "prestataire",
      entityId: updated.id,
      details: `Prestataire modifié: ${updated.name}`,
      syndicateId: updated.syndicateId ?? undefined,
    });

    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /prestataires/:id
router.delete("/prestataires/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = (req as any).user;
    const [existing] = await db.select().from(prestatairesTable).where(eq(prestatairesTable.id, String(req.params.id)));
    if (!existing) return void res.status(404).json({ error: "Not found" });
    if (!isSamePrestataireSyndicate(user, existing.syndicateId)) {
      return void res.status(403).json({ error: "Accès refusé" });
    }

    const [deleted] = await db
      .delete(prestatairesTable)
      .where(eq(prestatairesTable.id, String(req.params.id)))
      .returning();

    if (!deleted) return void res.status(404).json({ error: "Not found" });

    await serverAuditLog(req, {
      action: "DELETE",
      entity: "prestataire",
      entityId: deleted.id,
      details: `Prestataire supprimé: ${deleted.name}`,
      syndicateId: deleted.syndicateId ?? undefined,
    });

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Evaluations ────────────────────────────────────────────────────────────

const evaluationSchema = z.object({
  travauxId: z.string().optional(),
  quality: z.number().int().min(1).max(5),
  speed: z.number().int().min(1).max(5),
  communication: z.number().int().min(1).max(5),
  price: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

// POST /prestataires/:id/evaluations — rate a provider after an intervention
router.post(
  "/prestataires/:id/evaluations",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const parsed = evaluationSchema.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
    }
    try {
      const user = (req as any).user;
      const { quality, speed, communication, price, comment, travauxId } = parsed.data;
      const average = (quality + speed + communication + price) / 4;

      const [prestataire] = await db
        .select()
        .from(prestatairesTable)
        .where(eq(prestatairesTable.id, String(req.params.id)));
      if (!prestataire) return void res.status(404).json({ error: "Prestataire introuvable" });
      if (!isSamePrestataireSyndicate(user, prestataire.syndicateId)) {
        return void res.status(403).json({ error: "Accès refusé" });
      }

      const [evaluation] = await db
        .insert(prestataireEvaluationsTable)
        .values({
          prestataireId: String(req.params.id),
          travauxId,
          syndicateId: user.syndicateId,
          quality,
          speed,
          communication,
          price,
          average: average.toFixed(2),
          comment,
          ratedById: user.userId,
          ratedByName: user.name,
        })
        .returning();

      // Recompute the provider's running average rating
      const allEvals = await db
        .select({ average: prestataireEvaluationsTable.average })
        .from(prestataireEvaluationsTable)
        .where(eq(prestataireEvaluationsTable.prestataireId, String(req.params.id)));
      const newAverage =
        allEvals.reduce((sum, e) => sum + Number(e.average), 0) / allEvals.length;

      await db
        .update(prestatairesTable)
        .set({ rating: newAverage.toFixed(2), evaluationsCount: allEvals.length })
        .where(eq(prestatairesTable.id, String(req.params.id)));

      await serverAuditLog(req, {
        action: "CREATE",
        entity: "prestataire_evaluation",
        entityId: evaluation.id,
        details: `Évaluation de ${prestataire.name}: ${average.toFixed(1)}/5`,
      });

      res.status(201).json({ data: evaluation, newRating: newAverage });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// GET /prestataires/ranking/top — best/worst rated providers
router.get("/prestataires/ranking/top", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const sw = syndicateWhere(req, prestatairesTable.syndicateId);
    const conditions = [sql`${prestatairesTable.evaluationsCount} > 0`];
    if (sw) conditions.push(sw);

    const rows = await db
      .select()
      .from(prestatairesTable)
      .where(and(...conditions))
      .orderBy(desc(prestatairesTable.rating));

    res.json({ data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Contracts ────────────────────────────────────────────────────────────

// GET /contrats
router.get("/contrats", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { buildingId, prestataireId, status } = req.query as Record<string, string>;

    const conditions: any[] = [];

    if (user.role === "member" || user.role === "tenant") {
      const buildingIds = await getUserBuildingIds(user);
      if (buildingIds.length === 0) return void res.json({ data: [], total: 0 });
      conditions.push(inArray(contratsPrestatairesTable.buildingId, buildingIds));
    }

    if (buildingId) conditions.push(eq(contratsPrestatairesTable.buildingId, buildingId));
    if (prestataireId) conditions.push(eq(contratsPrestatairesTable.prestataireId, prestataireId));
    if (status) conditions.push(eq(contratsPrestatairesTable.status, status));

    const rows = await db
      .select()
      .from(contratsPrestatairesTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(contratsPrestatairesTable.createdAt));

    if (rows.length === 0) return void res.json({ data: [], total: 0 });

    const providerIds = [...new Set(rows.map((c) => c.prestataireId))];
    const providers = await db
      .select({ id: prestatairesTable.id, name: prestatairesTable.name, type: prestatairesTable.type })
      .from(prestatairesTable)
      .where(inArray(prestatairesTable.id, providerIds));
    const providerMap = new Map(providers.map((p) => [p.id, p]));

    const enriched = rows.map((c) => ({
      ...c,
      prestataireNom: providerMap.get(c.prestataireId)?.name ?? "",
      prestataireType: providerMap.get(c.prestataireId)?.type ?? "",
    }));

    res.json({ data: enriched, total: enriched.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

const createContractSchema = z.object({
  prestataireId: z.string().min(1),
  buildingId: z.string().min(1),
  title: z.string().min(1).max(200),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  monthlyAmount: z.number().positive().optional(),
  annualAmount: z.number().positive().optional(),
  autoRenew: z.boolean().optional(),
  documentUrl: z.string().min(1, "Le PDF du contrat est obligatoire"),
  notes: z.string().max(2000).optional(),
});

// POST /contrats — the contract PDF is mandatory
router.post("/contrats", requireAuth, requireAdmin, async (req, res) => {
  const parsed = createContractSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
  }
  try {
    const user = (req as any).user;
    const { prestataireId, buildingId, title, startDate, endDate, monthlyAmount, annualAmount, autoRenew, documentUrl, notes } = parsed.data;
    try { await assertUserCanAccessBuilding(user, buildingId); } catch { return void res.status(403).json({ error: "Accès refusé" }); }

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
      } as any)
      .returning();

    await serverAuditLog(req, {
      action: "CREATE",
      entity: "contrat_prestataire",
      entityId: contract.id,
      details: `Contrat créé: ${title}`,
    });

    res.status(201).json(contract);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

async function findContract(id: string) {
  const [contract] = await db
    .select()
    .from(contratsPrestatairesTable)
    .where(eq(contratsPrestatairesTable.id, id));
  return contract;
}

// PUT /contrats/:id — generic field edits (not for lifecycle transitions)
router.put("/contrats/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = (req as any).user;
    const existing = await findContract(String(req.params.id));
    if (!existing) return void res.status(404).json({ error: "Not found" });
    try { await assertUserCanAccessBuilding(user, existing.buildingId); } catch { return void res.status(403).json({ error: "Accès refusé" }); }

    const allowed = [
      "title", "startDate", "endDate", "monthlyAmount", "annualAmount",
      "autoRenew", "documentUrl", "notes",
    ];
    const updates: Record<string, any> = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }

    const [updated] = await db
      .update(contratsPrestatairesTable)
      .set(updates)
      .where(eq(contratsPrestatairesTable.id, String(req.params.id)))
      .returning();

    if (!updated) return void res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /contrats/:id/renew — extends the contract, optionally with a new end date / PDF
const renewSchema = z.object({
  endDate: z.string().min(1, "La nouvelle date de fin est obligatoire"),
  documentUrl: z.string().optional(),
  monthlyAmount: z.number().positive().optional(),
  annualAmount: z.number().positive().optional(),
});
router.post("/contrats/:id/renew", requireAuth, requireAdmin, async (req, res) => {
  const parsed = renewSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
  }
  try {
    const user = (req as any).user;
    const existing = await findContract(String(req.params.id));
    if (!existing) return void res.status(404).json({ error: "Not found" });
    try { await assertUserCanAccessBuilding(user, existing.buildingId); } catch { return void res.status(403).json({ error: "Accès refusé" }); }

    const { endDate, documentUrl, monthlyAmount, annualAmount } = parsed.data;

    const [renewed] = await db
      .insert(contratsPrestatairesTable)
      .values({
        prestataireId: existing.prestataireId,
        buildingId: existing.buildingId,
        title: existing.title,
        startDate: existing.endDate ?? new Date().toISOString().split("T")[0],
        endDate,
        monthlyAmount: monthlyAmount ?? existing.monthlyAmount,
        annualAmount: annualAmount ?? existing.annualAmount,
        autoRenew: existing.autoRenew,
        documentUrl: documentUrl ?? existing.documentUrl,
        renewedFromContractId: existing.id,
        notes: existing.notes,
      } as any)
      .returning();

    await db
      .update(contratsPrestatairesTable)
      .set({ status: "renewed" })
      .where(eq(contratsPrestatairesTable.id, existing.id));

    await serverAuditLog(req, {
      action: "RENEW",
      entity: "contrat_prestataire",
      entityId: renewed.id,
      details: `Contrat renouvelé: ${existing.title} (nouvelle échéance ${endDate})`,
    });

    res.status(201).json(renewed);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /contrats/:id/suspend
router.post("/contrats/:id/suspend", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = (req as any).user;
    const existing = await findContract(String(req.params.id));
    if (!existing) return void res.status(404).json({ error: "Not found" });
    try { await assertUserCanAccessBuilding(user, existing.buildingId); } catch { return void res.status(403).json({ error: "Accès refusé" }); }

    const [updated] = await db
      .update(contratsPrestatairesTable)
      .set({ status: "suspended" })
      .where(eq(contratsPrestatairesTable.id, String(req.params.id)))
      .returning();
    if (!updated) return void res.status(404).json({ error: "Not found" });

    await serverAuditLog(req, {
      action: "SUSPEND",
      entity: "contrat_prestataire",
      entityId: updated.id,
      details: `Contrat suspendu: ${updated.title}`,
    });

    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /contrats/:id/reactivate — undo a suspension
router.post("/contrats/:id/reactivate", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = (req as any).user;
    const existing = await findContract(String(req.params.id));
    if (!existing) return void res.status(404).json({ error: "Not found" });
    try { await assertUserCanAccessBuilding(user, existing.buildingId); } catch { return void res.status(403).json({ error: "Accès refusé" }); }

    const [updated] = await db
      .update(contratsPrestatairesTable)
      .set({ status: "active" })
      .where(eq(contratsPrestatairesTable.id, String(req.params.id)))
      .returning();
    if (!updated) return void res.status(404).json({ error: "Not found" });

    await serverAuditLog(req, {
      action: "REACTIVATE",
      entity: "contrat_prestataire",
      entityId: updated.id,
      details: `Contrat réactivé: ${updated.title}`,
    });

    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /contrats/:id/resilier — terminate for good
const resilierSchema = z.object({
  reason: z.string().min(1, "Le motif de résiliation est obligatoire").max(1000),
});
router.post("/contrats/:id/resilier", requireAuth, requireAdmin, async (req, res) => {
  const parsed = resilierSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Motif requis" });
  }
  try {
    const user = (req as any).user;
    const existing = await findContract(String(req.params.id));
    if (!existing) return void res.status(404).json({ error: "Not found" });
    try { await assertUserCanAccessBuilding(user, existing.buildingId); } catch { return void res.status(403).json({ error: "Accès refusé" }); }

    const [updated] = await db
      .update(contratsPrestatairesTable)
      .set({
        status: "terminated",
        terminatedAt: new Date(),
        terminationReason: parsed.data.reason,
      })
      .where(eq(contratsPrestatairesTable.id, String(req.params.id)))
      .returning();
    if (!updated) return void res.status(404).json({ error: "Not found" });

    await serverAuditLog(req, {
      action: "TERMINATE",
      entity: "contrat_prestataire",
      entityId: updated.id,
      details: `Contrat résilié: ${updated.title} — ${parsed.data.reason}`,
    });

    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
