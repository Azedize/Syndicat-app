import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { reclamationsTable } from "@workspace/db/schema";
import { eq, and, desc, or, ilike, count } from "drizzle-orm";
import { requireAuth, requireAdmin, assertSyndicateAccess } from "../middleware/auth.js";
import { syndicateWhere } from "../lib/syndicate-filter.js";
import { getPagination, buildPagedResponse } from "../lib/paginate.js";
import { serverAuditLog } from "../lib/audit.js";
import { createIncidentConversation, addResponsibleToIncidentConversation } from "./chat.js";

const router = Router();

function parseJson<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

function serialize(row: any) {
  return {
    ...row,
    documentsJoints: parseJson<string[]>(row.documentsJoints, []),
    etapes: parseJson<{ date: string; action: string; auteur: string }[]>(row.etapes, []),
  };
}

const isAdminRole = (role: string) => role === "super_admin" || role === "syndicate_admin";

const TYPES = ["salaire", "condition_travail", "discrimination", "harcelement", "licenciement", "conge", "avancement", "securite", "autre"] as const;
const STATUTS = ["deposee", "en_instruction", "transmise_direction", "en_mediation", "resolue", "classee", "contentieux"] as const;
const PRIORITES = ["urgente", "haute", "normale", "basse"] as const;

// ─── GET /reclamations ────────────────────────────────────────────────────────
router.get("/reclamations", requireAuth, async (req, res) => {
  const { statut, type, priorite, search } = req.query as Record<string, string>;
  const pagination = getPagination(req, 50);
  try {
    const conditions: any[] = [];
    // Tenant guard: a syndicate never sees another syndicate's grievances.
    const scope = syndicateWhere(req, reclamationsTable.syndicateId);
    if (scope) conditions.push(scope);
    // IDOR guard: non-admins only ever see their own grievances.
    if (!isAdminRole(req.user!.role)) {
      conditions.push(eq(reclamationsTable.memberId, req.user!.userId));
    }
    if (statut) conditions.push(eq(reclamationsTable.statut, statut));
    if (type) conditions.push(eq(reclamationsTable.type, type));
    if (priorite) conditions.push(eq(reclamationsTable.priorite, priorite));
    if (search) {
      conditions.push(or(
        ilike(reclamationsTable.titre, `%${search}%`),
        ilike(reclamationsTable.reference, `%${search}%`),
      ));
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      db.select().from(reclamationsTable).where(where)
        .orderBy(desc(reclamationsTable.createdAt))
        .limit(pagination.limit).offset(pagination.offset),
      db.select({ value: count() }).from(reclamationsTable).where(where),
    ]);

    res.json(buildPagedResponse(rows.map(serialize), Number(total), pagination));
  } catch (err: any) {
    if (err?.status) { res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) }); return; }
    req.log.error(err); res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /reclamations/:id ────────────────────────────────────────────────────
router.get("/reclamations/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id);
  try {
    const [row] = await db.select().from(reclamationsTable).where(eq(reclamationsTable.id, id));
    // Another syndicate's grievance is reported as not found, not forbidden.
    if (!row || !assertSyndicateAccess(req, row.syndicateId)) { res.status(404).json({ error: "Réclamation introuvable" }); return; }
    if (!isAdminRole(req.user!.role) && row.memberId !== req.user!.userId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    res.json({ data: serialize(row) });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

// ─── POST /reclamations ───────────────────────────────────────────────────────
router.post("/reclamations", requireAuth, async (req, res) => {
  const schema = z.object({
    titre: z.string().min(1).max(200),
    description: z.string().min(1).max(5000),
    type: z.enum(TYPES),
    anonymous: z.boolean().default(false),
    service: z.string().max(200).optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Données invalides", details: result.error.flatten() }); return; }

  if (!req.user!.syndicateId) { res.status(403).json({ error: "Syndicat non défini dans le token" }); return; }

  try {
    const { titre, description, type, anonymous, service } = result.data;
    const reference = `REC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const nowIso = new Date().toISOString();

    const [row] = await db.insert(reclamationsTable).values({
      syndicateId: req.user!.syndicateId,
      reference,
      titre,
      description,
      type,
      statut: "deposee",
      priorite: "normale",
      memberId: anonymous ? null : req.user!.userId,
      memberName: anonymous ? "Anonyme" : req.user!.name,
      service: service ?? "",
      dateDepot: nowIso,
      anonymous,
      documentsJoints: "[]",
      etapes: JSON.stringify([{ date: nowIso, action: "Réclamation déposée auprès du syndicat", auteur: anonymous ? "Anonyme" : req.user!.name }]),
    } as any).returning();

    await serverAuditLog(req, { action: "CREATE", entity: "reclamation", entityId: row.id, details: titre, platformAction: true });
    res.status(201).json({ data: serialize(row), message: "Réclamation déposée", reference });

    // Fire-and-forget: open a dedicated incident conversation between the
    // resident and their syndicate admins so follow-up happens in chat.
    createIncidentConversation({
      incidentId: row.id,
      syndicateId: req.user!.syndicateId ?? null,
      memberId: anonymous ? null : req.user!.userId,
      memberName: anonymous ? "Anonyme" : req.user!.name,
      title: titre,
    }).catch((err) => req.log.warn({ err }, "Failed to auto-create incident conversation"));
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

// ─── PUT /reclamations/:id — admin: status/priority/handling updates ─────────
router.put("/reclamations/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const schema = z.object({
    statut: z.enum(STATUTS).optional(),
    priorite: z.enum(PRIORITES).optional(),
    traitePar: z.string().max(200).optional(),
    commentaireAdmin: z.string().max(5000).optional(),
    etapeAction: z.string().max(500).optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }

  try {
    const [existing] = await db.select().from(reclamationsTable).where(eq(reclamationsTable.id, id));
    if (!existing || !assertSyndicateAccess(req, existing.syndicateId)) { res.status(404).json({ error: "Réclamation introuvable" }); return; }

    const { statut, priorite, traitePar, commentaireAdmin, etapeAction } = result.data;
    const updates: Record<string, any> = {};
    if (statut) updates.statut = statut;
    if (priorite) updates.priorite = priorite;
    if (traitePar !== undefined) updates.traitePar = traitePar;
    if (commentaireAdmin !== undefined) updates.commentaireAdmin = commentaireAdmin;
    if (statut === "resolue" || statut === "classee") updates.dateCloture = new Date().toISOString();

    if (statut || etapeAction) {
      const etapes = parseJson<any[]>(existing.etapes, []);
      etapes.push({ date: new Date().toISOString(), action: etapeAction ?? `Statut mis à jour: ${statut}`, auteur: req.user!.name });
      updates.etapes = JSON.stringify(etapes);
    }
    if (!traitePar && !existing.traitePar && (statut === "en_instruction" || statut === "en_mediation" || statut === "contentieux")) {
      updates.traitePar = req.user!.name;
    }

    const [updated] = await db.update(reclamationsTable).set(updates).where(eq(reclamationsTable.id, id)).returning();
    await serverAuditLog(req, { action: "UPDATE", entity: "reclamation", entityId: id, details: existing.titre, platformAction: true });
    res.json({ data: serialize(updated), message: "Réclamation mise à jour" });

    // A responsible party was newly assigned — pull them into the incident chat thread.
    if (updates.traitePar && !existing.traitePar) {
      addResponsibleToIncidentConversation(id, req.user!.userId)
        .catch((err) => req.log.warn({ err }, "Failed to add responsible party to incident conversation"));
    }
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

export default router;
