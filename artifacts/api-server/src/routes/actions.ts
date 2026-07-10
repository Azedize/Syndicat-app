import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  unionActionsTable,
  actionSupportsTable,
  actionParticipantsTable,
} from "@workspace/db/schema";
import { eq, and, desc, count, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { syndicateWhere, effectiveSyndicateId } from "../lib/syndicate-filter.js";
import { getPagination, buildPagedResponse } from "../lib/paginate.js";
import { serverAuditLog } from "../lib/audit.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson<T>(val: string, fallback: T): T {
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

function isSameSyndicate(req: any, syndicateId: string): boolean {
  return req.user.role === "super_admin" || req.user.syndicateId === syndicateId;
}

/** Annotate action rows with support/participant counts + user state */
async function annotateActions(actions: any[], userId: string) {
  if (actions.length === 0) return [];

  const ids = actions.map((a) => a.id);

  const [supportCounts, participantCounts, userSupports, userParticipates] = await Promise.all([
    db
      .select({ actionId: actionSupportsTable.actionId, count: count() })
      .from(actionSupportsTable)
      .where(inArray(actionSupportsTable.actionId, ids))
      .groupBy(actionSupportsTable.actionId),

    db
      .select({ actionId: actionParticipantsTable.actionId, count: count() })
      .from(actionParticipantsTable)
      .where(inArray(actionParticipantsTable.actionId, ids))
      .groupBy(actionParticipantsTable.actionId),

    db
      .select({ actionId: actionSupportsTable.actionId })
      .from(actionSupportsTable)
      .where(and(inArray(actionSupportsTable.actionId, ids), eq(actionSupportsTable.userId, userId))),

    db
      .select({ actionId: actionParticipantsTable.actionId })
      .from(actionParticipantsTable)
      .where(and(inArray(actionParticipantsTable.actionId, ids), eq(actionParticipantsTable.userId, userId))),
  ]);

  const supportMap = new Map(supportCounts.map((r) => [r.actionId, Number(r.count)]));
  const participantMap = new Map(participantCounts.map((r) => [r.actionId, Number(r.count)]));
  const userSupportsSet = new Set(userSupports.map((r) => r.actionId));
  const userParticipatesSet = new Set(userParticipates.map((r) => r.actionId));

  return actions.map((a) => ({
    ...a,
    demands: parseJson<string[]>(a.demands, []),
    updates: parseJson<Array<{ date: string; text: string }>>(a.updates, []),
    tags: parseJson<string[]>(a.tags, []),
    supportCount: supportMap.get(a.id) ?? 0,
    participantsConfirmed: participantMap.get(a.id) ?? 0,
    userSupports: userSupportsSet.has(a.id),
    userParticipates: userParticipatesSet.has(a.id),
  }));
}

// ─── GET /actions ─────────────────────────────────────────────────────────────

router.get("/actions", requireAuth, async (req, res) => {
  const { type, status } = req.query as Record<string, string>;
  const pagination = getPagination(req);

  try {
    const conditions: any[] = [];
    const syndicateFilter = syndicateWhere(req, unionActionsTable.syndicateId);
    if (syndicateFilter) conditions.push(syndicateFilter);
    if (type) conditions.push(eq(unionActionsTable.type, type as any));
    if (status) conditions.push(eq(unionActionsTable.status, status as any));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      db.select().from(unionActionsTable)
        .where(where)
        .orderBy(desc(unionActionsTable.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.select({ value: count() }).from(unionActionsTable).where(where),
    ]);

    const annotated = await annotateActions(rows, req.user!.userId);
    res.json(buildPagedResponse(annotated, Number(total), pagination));
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

// ─── GET /actions/:id ─────────────────────────────────────────────────────────

router.get("/actions/:id", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  try {
    const [action] = await db.select().from(unionActionsTable).where(eq(unionActionsTable.id, id));
    if (!action) { res.status(404).json({ error: "Action introuvable" }); return; }
    if (!isSameSyndicate(req, action.syndicateId)) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    const [annotated] = await annotateActions([action], req.user!.userId);
    res.json({ data: annotated });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

// ─── POST /actions ────────────────────────────────────────────────────────────

router.post(
  "/actions",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const schema = z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(5000).default(""),
      type: z.enum(["greve", "manifestation", "petition", "negociation", "communique"]),
      status: z.enum(["planned", "active", "completed", "cancelled"]).default("planned"),
      date: z.string().min(1),
      location: z.string().max(200).optional(),
      organizer: z.string().min(1).max(200),
      participantsTarget: z.number().int().min(0).default(0),
      demands: z.array(z.string()).default([]),
      updates: z.array(z.object({ date: z.string(), text: z.string() })).default([]),
      tags: z.array(z.string()).default([]),
      syndicateId: z.string().optional(),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides", details: result.error.flatten() }); return;
    }

    try {
      const { syndicateId: sid, demands, updates, tags, ...rest } = result.data;
      const syndicateId = effectiveSyndicateId(req, sid);
      const [row] = await db.insert(unionActionsTable).values({
        ...rest,
        syndicateId,
        demands: JSON.stringify(demands),
        updates: JSON.stringify(updates),
        tags: JSON.stringify(tags),
        createdBy: req.user!.userId,
      }).returning();

      await serverAuditLog(req, { action: "CREATE", entity: "union_action", entityId: row.id, details: row.title, syndicateId });
      const [annotated] = await annotateActions([row], req.user!.userId);
      res.status(201).json({ data: annotated, message: "Action syndicale créée" });
    } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },
);

// ─── PUT /actions/:id ─────────────────────────────────────────────────────────

router.put(
  "/actions/:id",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = req.params.id as string;
    const schema = z.object({
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).optional(),
      type: z.enum(["greve", "manifestation", "petition", "negociation", "communique"]).optional(),
      status: z.enum(["planned", "active", "completed", "cancelled"]).optional(),
      date: z.string().optional(),
      location: z.string().max(200).nullable().optional(),
      organizer: z.string().min(1).max(200).optional(),
      participantsTarget: z.number().int().min(0).optional(),
      demands: z.array(z.string()).optional(),
      updates: z.array(z.object({ date: z.string(), text: z.string() })).optional(),
      tags: z.array(z.string()).optional(),
    });

    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" }); return;
    }

    try {
      const [action] = await db.select().from(unionActionsTable).where(eq(unionActionsTable.id, id));
      if (!action) { res.status(404).json({ error: "Action introuvable" }); return; }
      if (!isSameSyndicate(req, action.syndicateId)) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }

      const { demands, updates, tags, ...rest } = result.data;
      const updateData: Record<string, any> = { ...rest };
      if (demands !== undefined) updateData.demands = JSON.stringify(demands);
      if (updates !== undefined) updateData.updates = JSON.stringify(updates);
      if (tags !== undefined) updateData.tags = JSON.stringify(tags);

      const [updated] = await db.update(unionActionsTable).set(updateData).where(eq(unionActionsTable.id, id)).returning();
      await serverAuditLog(req, { action: "UPDATE", entity: "union_action", entityId: id, syndicateId: action.syndicateId });
      const [annotated] = await annotateActions([updated], req.user!.userId);
      res.json({ data: annotated, message: "Action mise à jour" });
    } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },
);

// ─── DELETE /actions/:id ──────────────────────────────────────────────────────

router.delete(
  "/actions/:id",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = req.params.id as string;
    try {
      const [action] = await db.select().from(unionActionsTable).where(eq(unionActionsTable.id, id));
      if (!action) { res.status(404).json({ error: "Action introuvable" }); return; }
      if (!isSameSyndicate(req, action.syndicateId)) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      await db.transaction(async (tx) => {
        await tx.delete(actionSupportsTable).where(eq(actionSupportsTable.actionId, id));
        await tx.delete(actionParticipantsTable).where(eq(actionParticipantsTable.actionId, id));
        await tx.delete(unionActionsTable).where(eq(unionActionsTable.id, id));
      });
      await serverAuditLog(req, { action: "DELETE", entity: "union_action", entityId: id, details: action.title, syndicateId: action.syndicateId });
      res.json({ message: "Action supprimée" });
    } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },
);

// ─── POST /actions/:id/support ────────────────────────────────────────────────

router.post("/actions/:id/support", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  try {
    const [action] = await db.select({ id: unionActionsTable.id, syndicateId: unionActionsTable.syndicateId })
      .from(unionActionsTable).where(eq(unionActionsTable.id, id));
    if (!action) { res.status(404).json({ error: "Action introuvable" }); return; }
    if (!isSameSyndicate(req, action.syndicateId)) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }

    const existing = await db.select({ id: actionSupportsTable.id })
      .from(actionSupportsTable)
      .where(and(eq(actionSupportsTable.actionId, id), eq(actionSupportsTable.userId, req.user!.userId)));

    if (existing.length > 0) {
      // Toggle off
      await db.delete(actionSupportsTable)
        .where(and(eq(actionSupportsTable.actionId, id), eq(actionSupportsTable.userId, req.user!.userId)));
      res.json({ supported: false, message: "Soutien retiré" });
    } else {
      // Toggle on
      await db.insert(actionSupportsTable).values({ actionId: id, userId: req.user!.userId }).onConflictDoNothing();
      res.json({ supported: true, message: "Soutien enregistré" });
    }
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

// ─── POST /actions/:id/participate ───────────────────────────────────────────

router.post("/actions/:id/participate", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  try {
    const [action] = await db.select().from(unionActionsTable).where(eq(unionActionsTable.id, id));
    if (!action) { res.status(404).json({ error: "Action introuvable" }); return; }
    if (!isSameSyndicate(req, action.syndicateId)) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    if (action.status !== "planned" && action.status !== "active") {
      res.status(400).json({ error: "Cette action n'accepte plus de participants" }); return;
    }

    const existing = await db.select({ id: actionParticipantsTable.id })
      .from(actionParticipantsTable)
      .where(and(eq(actionParticipantsTable.actionId, id), eq(actionParticipantsTable.userId, req.user!.userId)));

    if (existing.length > 0) {
      await db.delete(actionParticipantsTable)
        .where(and(eq(actionParticipantsTable.actionId, id), eq(actionParticipantsTable.userId, req.user!.userId)));
      res.json({ participating: false, message: "Participation annulée" });
    } else {
      await db.insert(actionParticipantsTable)
        .values({ actionId: id, userId: req.user!.userId, userName: req.user!.name })
        .onConflictDoNothing();
      res.json({ participating: true, message: "Participation confirmée" });
    }
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

// ─── GET /actions/:id/participants ────────────────────────────────────────────

router.get(
  "/actions/:id/participants",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = req.params.id as string;
    try {
      const [action] = await db.select({ id: unionActionsTable.id, syndicateId: unionActionsTable.syndicateId })
        .from(unionActionsTable).where(eq(unionActionsTable.id, id));
      if (!action) { res.status(404).json({ error: "Action introuvable" }); return; }
      if (!isSameSyndicate(req, action.syndicateId)) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      const participants = await db.select()
        .from(actionParticipantsTable)
        .where(eq(actionParticipantsTable.actionId, id))
        .orderBy(actionParticipantsTable.createdAt);
      res.json({ data: participants });
    } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },
);

export default router;
