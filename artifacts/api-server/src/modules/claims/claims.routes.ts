import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  buildingsTable,
  claimAttachmentsTable,
  claimEventsTable,
  claimsTable,
  lotsTable,
  prestatairesTable,
  travauxTable,
} from "@workspace/db/schema";
import {
  and,
  asc,
  count,
  desc,
  eq,
  sql,
} from "drizzle-orm";
import { requireAuth, type JwtPayload } from "../../middleware/auth.js";
import { serverAuditLog } from "../../lib/audit.js";
import { getPagination, buildPagedResponse } from "../../lib/paginate.js";
import { nextSequenceNumber } from "../../lib/sequences.js";
import { getUserLotIds } from "../../lib/scope.js";
import { FinanceError, sendFinanceError, uniqueViolation } from "../../lib/treasury.js";
import {
  CLAIM_CATEGORIES,
  CLAIM_MANAGERS,
  CLAIM_PRIORITIES,
  CLAIM_STATUSES,
  CLAIM_TEAM,
  OPEN_STATUSES,
  REOPEN_WINDOW_DAYS,
  RESIDENT_REOPEN_LIMIT,
  SLA_HOURS,
  TRANSITIONS,
  allowedTransitions,
  claimManagers,
  dueAtFor,
  notifyClaimEvent,
  retryFailedClaimNotifications,
  teamRoleIn,
  type Claim,
  type ClaimPriority,
  type ClaimStatus,
} from "../../lib/claims.js";
import {
  loadVisible,
  assertFresh,
  addEvent,
  view,
  checkUploads,
  filters,
  OPEN_SQL,
} from "./claims.service.js";
import { listSchema } from "./claims.validation.js";

/**
 * Claims & incidents of a condominium.
 *
 *   residents  report, follow their own claims, answer questions, add photos,
 *              confirm the fix or reopen when the problem persists
 *   team       board, full record, internal comments
 *   managers   qualify, assign, prioritise, schedule, move cards, resolve…
 *   assignee   (team member in charge) progress, questions, resolution
 *
 * Every write carries the version the client last saw (expectedVersion):
 * a stale card gets 409 with the current claim instead of overwriting a
 * colleague's change. Requests with an Idempotency-Key are replay-safe.
 */
const router = Router();

const RESIDENTS = new Set(["member", "tenant"]);

function contextOf(req: Request): { user: JwtPayload; sid: string } {
  const user = req.user!;
  if (!user.syndicateId || user.role === "super_admin") throw new FinanceError(403, "FORBIDDEN", "Ouvrez une copropriété pour gérer ses réclamations");
  return { user, sid: user.syndicateId };
}

function requestKey(req: Request): string | null {
  const raw = req.header("Idempotency-Key")?.trim();
  if (!raw) return null;
  if (!/^[A-Za-z0-9_\-:.]{8,100}$/.test(raw)) throw new FinanceError(400, "INVALID_IDEMPOTENCY_KEY", "En-tête Idempotency-Key invalide");
  return raw;
}

function sendError(res: Response, req: Request, err: unknown) {
  if (err instanceof FinanceError && (err as any).current) {
    return void res.status(err.status).json({ error: err.message, code: err.code, current: (err as any).current });
  }
  sendFinanceError(res, req, err);
}

// ─── Create ───────────────────────────────────────────────────────────────────

const createSchema = z
  .object({
    title: z.string().trim().min(3, "Le titre est obligatoire").max(160),
    description: z.string().trim().min(10, "Décrivez le problème (10 caractères minimum)").max(5000),
    category: z.enum(CLAIM_CATEGORIES, { errorMap: () => ({ message: "Catégorie inconnue" }) }),
    location: z.string().trim().min(2, "Indiquez où se trouve le problème").max(200),
    scope: z.enum(["common", "unit"]).default("common"),
    lotId: z.string().trim().max(100).optional(),
    buildingId: z.string().trim().max(100).optional(),
    priority: z.enum(CLAIM_PRIORITIES).optional(),
    attachments: z.array(z.string().max(500)).max(6).default([]),
  })
  .strict()
  .refine((d) => d.scope === "common" || !!d.lotId, { message: "Choisissez le lot concerné", path: ["lotId"] });

router.post("/claims", requireAuth, async (req, res) => {
  try {
    const { user, sid } = contextOf(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return void res.status(400).json({ error: i?.message ?? "Données invalides", field: i?.path.join("."), code: "INVALID_CLAIM" });
    }
    const d = parsed.data;
    if (!RESIDENTS.has(user.role) && !CLAIM_TEAM.has(user.role)) throw new FinanceError(403, "FORBIDDEN", "Accès refusé");
    const key = requestKey(req);
    if (key) {
      const [existing] = await db.select().from(claimsTable).where(and(eq(claimsTable.syndicateId, sid), eq(claimsTable.reporterUserId, user.userId), eq(claimsTable.idempotencyKey, key)));
      if (existing) return void res.status(200).json({ data: await view(existing, user), replayed: true });
    }
    // Place: a lot the resident owns / rents today (any lot of the condominium for the team).
    let buildingId = d.buildingId ?? null;
    let lotId: string | null = null;
    if (d.lotId) {
      const [lot] = await db
        .select({ id: lotsTable.id, buildingId: lotsTable.buildingId })
        .from(lotsTable)
        .innerJoin(buildingsTable, eq(buildingsTable.id, lotsTable.buildingId))
        .where(and(eq(lotsTable.id, d.lotId), eq(buildingsTable.syndicateId, sid)));
      if (!lot) throw new FinanceError(400, "FOREIGN_REFERENCE", "Lot introuvable dans cette copropriété");
      if (RESIDENTS.has(user.role) && !(await getUserLotIds(user)).includes(lot.id)) {
        throw new FinanceError(403, "LOT_NOT_YOURS", "Vous ne pouvez signaler que pour un lot dont vous êtes propriétaire ou locataire");
      }
      lotId = lot.id;
      buildingId = lot.buildingId;
    }
    if (buildingId) {
      const [b] = await db.select({ id: buildingsTable.id }).from(buildingsTable).where(and(eq(buildingsTable.id, buildingId), eq(buildingsTable.syndicateId, sid)));
      if (!b) throw new FinanceError(400, "FOREIGN_REFERENCE", "Immeuble introuvable dans cette copropriété");
    } else {
      // A condominium with a single building: the claim is in that building.
      const only = await db.select({ id: buildingsTable.id }).from(buildingsTable).where(eq(buildingsTable.syndicateId, sid)).limit(2);
      if (only.length === 1) buildingId = only[0].id;
    }
    const uploads = await checkUploads(d.attachments, user, sid);
    // Residents do not set the priority: the team qualifies it.
    const priority: ClaimPriority = CLAIM_MANAGERS.has(user.role) && d.priority ? d.priority : "normal";
    const now = new Date();

    let created: { claim: Claim; eventId: string };
    try {
      created = await db.transaction(async (tx) => {
        const reference = await nextSequenceNumber(tx, sid, "RCL", 6);
        const [claim] = await tx
          .insert(claimsTable)
          .values({
            syndicateId: sid,
            reference,
            title: d.title,
            description: d.description,
            category: d.category,
            scope: d.scope,
            lotId,
            buildingId,
            location: d.location,
            priority,
            dueAt: dueAtFor(now, priority),
            reporterUserId: user.userId,
            reporterName: user.name,
            idempotencyKey: key,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        const ev = await addEvent(tx, claim, user, { type: "created", toStatus: "received", body: d.description });
        if (uploads.length) {
          await tx.insert(claimAttachmentsTable).values(
            uploads.map((u) => ({ claimId: claim.id, syndicateId: sid, objectPath: u.objectPath, fileName: u.originalName, mimeType: u.contentType, uploadedBy: user.userId })),
          );
        }
        return { claim, eventId: ev.id };
      });
    } catch (err) {
      // Two identical submissions at the same time: the second returns the first.
      if (key && uniqueViolation(err)?.includes("idempotency")) {
        const [existing] = await db.select().from(claimsTable).where(and(eq(claimsTable.syndicateId, sid), eq(claimsTable.reporterUserId, user.userId), eq(claimsTable.idempotencyKey, key)));
        if (existing) return void res.status(200).json({ data: await view(existing, user), replayed: true });
      }
      throw err;
    }
    const { claim } = created;
    await serverAuditLog(req, { action: "CLAIM_CREATED", entity: "claim", entityId: claim.id, syndicateId: sid, details: `${claim.reference} — ${claim.category} — ${claim.title}` });
    await notifyClaimEvent(
      { id: created.eventId, claimId: claim.id, syndicateId: sid, authorId: user.userId },
      await claimManagers(sid),
      { title: `Nouvelle réclamation ${claim.reference}`, body: `${claim.title} — ${claim.location}`, type: "info" },
    );
    res.status(201).json({ data: await view(claim, user) });
  } catch (err) {
    sendError(res, req, err);
  }
});

// ─── List, board, record ──────────────────────────────────────────────────────

const PRIORITY_ORDER = sql`CASE ${claimsTable.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`;

router.get("/claims", requireAuth, async (req, res) => {
  try {
    const { user, sid } = contextOf(req);
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) return void res.status(400).json({ error: "Filtres invalides", code: "INVALID_FILTER" });
    const pagination = getPagination(req, 50);
    const where = and(...filters(user, sid, parsed.data));
    const order =
      parsed.data.sort === "oldest" ? [asc(claimsTable.createdAt)]
      : parsed.data.sort === "due" ? [asc(claimsTable.dueAt)]
      : parsed.data.sort === "priority" ? [PRIORITY_ORDER, asc(claimsTable.dueAt)]
      : [desc(claimsTable.createdAt)];
    const [rows, [{ value: total }]] = await Promise.all([
      db.select().from(claimsTable).where(where).orderBy(...order, desc(claimsTable.id)).limit(pagination.limit).offset(pagination.offset),
      db.select({ value: count() }).from(claimsTable).where(where),
    ]);
    res.json(buildPagedResponse(await Promise.all(rows.map((r) => view(r, user))), Number(total), pagination));
  } catch (err) {
    sendError(res, req, err);
  }
});

/**
 * Kanban board: one column per workflow state, each with its database total
 * (with the same filters) and its first cards (most urgent first).
 */
router.get("/claims/board", requireAuth, async (req, res) => {
  try {
    const { user, sid } = contextOf(req);
    if (!CLAIM_TEAM.has(user.role)) throw new FinanceError(403, "FORBIDDEN", "Tableau réservé à l'équipe");
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) return void res.status(400).json({ error: "Filtres invalides", code: "INVALID_FILTER" });
    const perColumn = Math.min(Number(req.query.perColumn) || 50, 100);
    const base = filters(user, sid, { ...parsed.data, status: undefined });
    const statuses = req.query.includeArchived === "true" ? CLAIM_STATUSES : CLAIM_STATUSES.filter((s) => s !== "rejected");
    const totals = await db
      .select({ status: claimsTable.status, n: sql<number>`COUNT(*)::int`, overdue: sql<number>`COUNT(*) FILTER (WHERE ${claimsTable.status} IN (${OPEN_SQL}) AND ${claimsTable.dueAt} < now())::int` })
      .from(claimsTable)
      .where(and(...base))
      .groupBy(claimsTable.status);
    const columns = await Promise.all(
      statuses.map(async (status) => {
        const rows = await db
          .select()
          .from(claimsTable)
          .where(and(...base, eq(claimsTable.status, status)))
          .orderBy(PRIORITY_ORDER, asc(claimsTable.dueAt), desc(claimsTable.id))
          .limit(status === "closed" ? 20 : perColumn);
        const t = totals.find((x) => x.status === status);
        return { status, total: t?.n ?? 0, overdue: t?.overdue ?? 0, cards: await Promise.all(rows.map((r) => view(r, user))) };
      }),
    );
    res.json({ data: { columns, transitions: TRANSITIONS, generatedAt: new Date().toISOString() } });
  } catch (err) {
    sendError(res, req, err);
  }
});

router.get("/claims/metrics", requireAuth, async (req, res) => {
  try {
    const { user, sid } = contextOf(req);
    if (!CLAIM_TEAM.has(user.role)) throw new FinanceError(403, "FORBIDDEN", "Indicateurs réservés à l'équipe");
    const from = typeof req.query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : null;
    const to = typeof req.query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : null;
    const [m] = (await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status IN (${OPEN_SQL}))::int AS open,
        COUNT(*) FILTER (WHERE status IN (${OPEN_SQL}) AND due_at < now())::int AS overdue,
        COUNT(*) FILTER (WHERE status IN (${OPEN_SQL}) AND assignee_user_id IS NULL AND prestataire_id IS NULL)::int AS unassigned,
        COUNT(*) FILTER (WHERE status = 'awaiting_info')::int AS awaiting_info,
        COUNT(*) FILTER (WHERE resolved_at IS NOT NULL
          AND (${from}::date IS NULL OR resolved_at >= ${from}::date)
          AND (${to}::date IS NULL OR resolved_at < ${to}::date + 1))::int AS resolved_in_period,
        ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) FILTER (WHERE resolved_at IS NOT NULL
          AND (${from}::date IS NULL OR resolved_at >= ${from}::date)
          AND (${to}::date IS NULL OR resolved_at < ${to}::date + 1))::numeric, 1)::float AS avg_resolution_hours,
        COUNT(*) FILTER (WHERE reopen_count > 0)::int AS reopened
      FROM claims WHERE syndicate_id = ${sid}
    `)) as unknown as Record<string, number>[];
    const byStatus = await db.select({ status: claimsTable.status, n: sql<number>`COUNT(*)::int` }).from(claimsTable).where(eq(claimsTable.syndicateId, sid)).groupBy(claimsTable.status);
    const workload = (await db.execute(sql`
      SELECT COALESCE(u.name, p.name, 'Non assignée') AS label, c.assignee_user_id AS user_id, c.prestataire_id,
             COUNT(*)::int AS open, COUNT(*) FILTER (WHERE c.due_at < now())::int AS overdue
      FROM claims c LEFT JOIN users u ON u.id = c.assignee_user_id LEFT JOIN prestataires p ON p.id = c.prestataire_id
      WHERE c.syndicate_id = ${sid} AND c.status IN (${OPEN_SQL})
      GROUP BY 1, 2, 3 ORDER BY open DESC
    `)) as unknown as Record<string, unknown>[];
    res.json({
      data: {
        ...m,
        byStatus: Object.fromEntries(CLAIM_STATUSES.map((s) => [s, byStatus.find((b) => b.status === s)?.n ?? 0])),
        workload,
        period: { from, to },
        slaHours: SLA_HOURS,
        definitions: {
          open: "Réclamations reçues, qualifiées, assignées, en cours ou en attente d'information.",
          overdue: "Réclamations ouvertes dont l'échéance (création + délai de la priorité) est dépassée. L'attente d'information ne suspend pas le délai.",
          unassigned: "Réclamations ouvertes sans responsable ni prestataire.",
          avg_resolution_hours: "Moyenne, en heures, entre la création et la dernière résolution, des réclamations résolues dans la période (rouvertes puis résolues à nouveau : dernière résolution).",
          workload: "Réclamations ouvertes par responsable.",
        },
      },
    });
  } catch (err) {
    sendError(res, req, err);
  }
});

/** Who a claim can be assigned to: the condominium's team and its active providers. */
router.get("/claims/assignees", requireAuth, async (req, res) => {
  try {
    const { user, sid } = contextOf(req);
    if (!CLAIM_MANAGERS.has(user.role)) throw new FinanceError(403, "FORBIDDEN", "Réservé aux gestionnaires");
    const people = (await db.execute(sql`
      SELECT DISTINCT ON (u.id) u.id, u.name, r.role FROM (
        SELECT u.id AS uid, u.role FROM users u WHERE u.syndicate_id = ${sid} AND u.role IN ('syndicate_admin', 'president', 'secretary', 'treasurer', 'committee_member')
        UNION ALL SELECT m.user_id, m.role FROM syndicate_memberships m WHERE m.syndicate_id = ${sid} AND m.status = 'active'
        UNION ALL SELECT om.user_id, 'syndicate_admin' FROM organization_members om JOIN syndicates s ON s.organization_id = om.organization_id
          WHERE s.id = ${sid} AND om.status = 'active' AND om.role = 'org_admin'
      ) r JOIN users u ON u.id = r.uid AND u.status = 'active'
      ORDER BY u.id, u.name
    `)) as unknown as { id: string; name: string; role: string }[];
    const providers = await db
      .select({ id: prestatairesTable.id, name: prestatairesTable.name, type: prestatairesTable.type })
      .from(prestatairesTable)
      .where(and(eq(prestatairesTable.syndicateId, sid), sql`COALESCE(${prestatairesTable.status}, 'active') = 'active'`))
      .orderBy(asc(prestatairesTable.name));
    res.json({ data: { people, providers } });
  } catch (err) {
    sendError(res, req, err);
  }
});

router.get("/claims/:id", requireAuth, async (req, res) => {
  try {
    const { user, sid } = contextOf(req);
    const c = await loadVisible(String(req.params.id), user, sid);
    const isTeam = CLAIM_TEAM.has(user.role);
    const [events, attachments] = await Promise.all([
      db.select().from(claimEventsTable).where(and(eq(claimEventsTable.claimId, c.id), ...(isTeam ? [] : [eq(claimEventsTable.internal, false)]))).orderBy(asc(claimEventsTable.createdAt)),
      db.select().from(claimAttachmentsTable).where(and(eq(claimAttachmentsTable.claimId, c.id), ...(isTeam ? [] : [eq(claimAttachmentsTable.internal, false)]))).orderBy(asc(claimAttachmentsTable.createdAt)),
    ]);
    res.json({
      data: {
        ...(await view(c, user)),
        // Residents get the history without internal data (instructions, costs…)
        events: events.map((e) => ({ id: e.id, type: e.type, fromStatus: e.fromStatus, toStatus: e.toStatus, body: e.body, internal: e.internal, authorName: e.authorName, createdAt: e.createdAt, data: isTeam ? e.data : undefined })),
        attachments: attachments.map((a) => ({ id: a.id, objectPath: a.objectPath, fileName: a.fileName, mimeType: a.mimeType, internal: a.internal, createdAt: a.createdAt })),
      },
    });
  } catch (err) {
    sendError(res, req, err);
  }
});

// ─── Status (the Kanban move) ─────────────────────────────────────────────────

const transitionSchema = z
  .object({
    to: z.enum(CLAIM_STATUSES),
    expectedVersion: z.number().int().positive(),
    note: z.string().trim().max(2000).optional(),
    resolution: z.string().trim().max(4000).optional(),
    reason: z.string().trim().max(1000).optional(),
    question: z.string().trim().max(2000).optional(),
  })
  .strict();

router.post("/claims/:id/transition", requireAuth, async (req, res) => {
  try {
    const { user, sid } = contextOf(req);
    const parsed = transitionSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides", code: "INVALID_TRANSITION" });
    const d = parsed.data;
    const key = requestKey(req);
    const outcome = await db.transaction(async (tx) => {
      const c = await loadVisible(String(req.params.id), user, sid, tx, true);
      // A retried move that already happened answers with the saved state.
      if (c.status === d.to && d.expectedVersion === c.version - 1) return { claim: c, replayed: true, event: null };
      if (key) {
        const [done] = await tx.select({ id: claimEventsTable.id }).from(claimEventsTable).where(and(eq(claimEventsTable.claimId, c.id), eq(claimEventsTable.requestKey, key)));
        if (done) return { claim: c, replayed: true, event: null };
      }
      assertFresh(c, d.expectedVersion);
      const from = c.status as ClaimStatus;
      if (!TRANSITIONS[from].includes(d.to)) throw new FinanceError(409, "INVALID_TRANSITION", `Passage « ${from} » → « ${d.to} » impossible`);
      if (!allowedTransitions(user, c).includes(d.to)) throw new FinanceError(403, "FORBIDDEN", "Vous ne pouvez pas effectuer ce changement de statut");
      const set: Partial<typeof claimsTable.$inferInsert> = { status: d.to, version: c.version + 1, updatedAt: new Date() };
      let type = "status";
      let body: string | null = d.note ?? null;
      if ((d.to === "assigned" || d.to === "in_progress") && !c.assigneeUserId && !c.prestataireId) {
        throw new FinanceError(409, "ASSIGNMENT_REQUIRED", "Désignez d'abord un responsable ou un prestataire");
      }
      if (d.to === "awaiting_info") {
        if (!d.question || d.question.length < 5) throw new FinanceError(400, "QUESTION_REQUIRED", "Posez la question au résident");
        set.statusBeforeInfo = from;
        type = "info_requested";
        body = d.question;
      }
      if (from === "awaiting_info" && d.to !== c.statusBeforeInfo && !CLAIM_MANAGERS.has(user.role)) {
        throw new FinanceError(409, "INVALID_TRANSITION", "La réclamation revient à son état précédent");
      }
      if (d.to === "resolved") {
        if (!d.resolution || d.resolution.length < 10) throw new FinanceError(400, "RESOLUTION_REQUIRED", "Expliquez ce qui a été fait (10 caractères minimum)");
        Object.assign(set, { resolution: d.resolution, resolvedAt: new Date(), resolvedBy: user.userId });
        type = "resolved";
        body = d.resolution;
      }
      if (d.to === "rejected") {
        if (!d.reason || d.reason.length < 5) throw new FinanceError(400, "REASON_REQUIRED", "Indiquez pourquoi la réclamation n'est pas retenue");
        set.rejectionReason = d.reason;
        type = "rejected";
        body = d.reason;
      }
      if (d.to === "closed") {
        Object.assign(set, { closedAt: new Date(), closedBy: user.userId });
        type = "closed";
      }
      const [updated] = await tx.update(claimsTable).set(set).where(and(eq(claimsTable.id, c.id), eq(claimsTable.version, c.version))).returning();
      if (!updated) throw new FinanceError(409, "CLAIM_STALE", "La réclamation a été modifiée entre-temps");
      const event = await addEvent(tx, c, user, { type, fromStatus: from, toStatus: d.to, body, requestKey: key });
      return { claim: updated, replayed: false, event };
    });
    if (outcome.event) {
      const c = outcome.claim;
      await serverAuditLog(req, { action: "CLAIM_STATUS_CHANGED", entity: "claim", entityId: c.id, syndicateId: sid, details: `${c.reference}: ${outcome.event.fromStatus} → ${outcome.event.toStatus}` });
      const toReporter = ["info_requested", "resolved", "rejected", "closed"].includes(outcome.event.type) || outcome.event.toStatus === "in_progress";
      if (toReporter) {
        await notifyClaimEvent(
          { id: outcome.event.id, claimId: c.id, syndicateId: sid, authorId: user.userId },
          [c.reporterUserId],
          {
            title: `Réclamation ${c.reference}`,
            body:
              outcome.event.type === "info_requested" ? `Le syndic a besoin d'une précision : ${outcome.event.body}`
              : outcome.event.type === "resolved" ? `Résolue : ${outcome.event.body}`
              : outcome.event.type === "rejected" ? `Non retenue : ${outcome.event.body}`
              : outcome.event.type === "closed" ? "Votre réclamation est clôturée."
              : "Intervention en cours.",
            type: outcome.event.type === "rejected" ? "warning" : "info",
          },
        );
      }
    }
    res.json({ data: await view(outcome.claim, user), replayed: outcome.replayed });
  } catch (err) {
    sendError(res, req, err);
  }
});

// ─── Assignment, priority, intervention ───────────────────────────────────────

const assignSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    assigneeUserId: z.string().trim().max(100).nullable().optional(),
    prestataireId: z.string().trim().max(100).nullable().optional(),
    instructions: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((d) => !!d.assigneeUserId || !!d.prestataireId, { message: "Choisissez un responsable ou un prestataire" });

router.post("/claims/:id/assign", requireAuth, async (req, res) => {
  try {
    const { user, sid } = contextOf(req);
    if (!CLAIM_MANAGERS.has(user.role)) throw new FinanceError(403, "FORBIDDEN", "L'affectation est réservée au syndic, au président et au secrétaire");
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message, code: "INVALID_ASSIGNMENT" });
    const d = parsed.data;
    // Only a team member of THIS condominium, or one of its providers.
    if (d.assigneeUserId && !(await teamRoleIn(d.assigneeUserId, sid))) {
      throw new FinanceError(400, "ASSIGNEE_NOT_ALLOWED", "Le responsable doit être un membre de l'équipe de cette copropriété");
    }
    if (d.prestataireId) {
      const [p] = await db.select({ id: prestatairesTable.id, status: prestatairesTable.status }).from(prestatairesTable).where(and(eq(prestatairesTable.id, d.prestataireId), eq(prestatairesTable.syndicateId, sid)));
      if (!p) throw new FinanceError(400, "PROVIDER_NOT_ALLOWED", "Prestataire introuvable dans cette copropriété");
      if (p.status && p.status !== "active") throw new FinanceError(409, "PROVIDER_INACTIVE", "Ce prestataire n'est plus actif");
    }
    const key = requestKey(req);
    const out = await db.transaction(async (tx) => {
      const c = await loadVisible(String(req.params.id), user, sid, tx, true);
      if (key) {
        const [done] = await tx.select({ id: claimEventsTable.id }).from(claimEventsTable).where(and(eq(claimEventsTable.claimId, c.id), eq(claimEventsTable.requestKey, key)));
        if (done) return { claim: c, event: null };
      }
      assertFresh(c, d.expectedVersion);
      if (!(OPEN_STATUSES as readonly string[]).includes(c.status)) throw new FinanceError(409, "CLAIM_NOT_OPEN", "Réclamation terminée : rouvrez-la d'abord");
      const nextStatus = c.status === "received" || c.status === "qualified" ? "assigned" : c.status;
      const [updated] = await tx
        .update(claimsTable)
        .set({
          assigneeUserId: d.assigneeUserId ?? null,
          prestataireId: d.prestataireId ?? null,
          assignedAt: new Date(),
          assignedBy: user.userId,
          status: nextStatus,
          version: c.version + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(claimsTable.id, c.id), eq(claimsTable.version, c.version)))
        .returning();
      if (!updated) throw new FinanceError(409, "CLAIM_STALE", "La réclamation a été modifiée entre-temps");
      // Instructions are internal; the resident only learns that someone is in charge.
      const event = await addEvent(tx, c, user, {
        type: "assigned",
        fromStatus: c.status,
        toStatus: nextStatus,
        body: d.instructions ?? null,
        internal: true,
        data: { assigneeUserId: d.assigneeUserId ?? null, prestataireId: d.prestataireId ?? null, previousAssignee: c.assigneeUserId, previousProvider: c.prestataireId },
        requestKey: key,
      });
      const publicEvent = await addEvent(tx, c, user, { type: "status", fromStatus: c.status, toStatus: nextStatus, body: "Votre réclamation est prise en charge." });
      return { claim: updated, event, publicEvent };
    });
    if (out.event) {
      const c = out.claim;
      await serverAuditLog(req, { action: "CLAIM_ASSIGNED", entity: "claim", entityId: c.id, syndicateId: sid, details: `${c.reference} → ${d.assigneeUserId ?? ""} ${d.prestataireId ?? ""}` });
      await notifyClaimEvent({ id: out.event.id, claimId: c.id, syndicateId: sid, authorId: user.userId }, [d.assigneeUserId], {
        title: `Réclamation ${c.reference} assignée`,
        body: `${c.title} — ${c.location}${d.instructions ? ` — ${d.instructions}` : ""}`,
      });
      await notifyClaimEvent({ id: out.publicEvent!.id, claimId: c.id, syndicateId: sid, authorId: user.userId }, [c.reporterUserId], {
        title: `Réclamation ${c.reference}`,
        body: "Votre réclamation est prise en charge.",
      });
    }
    res.json({ data: await view(out.claim, user) });
  } catch (err) {
    sendError(res, req, err);
  }
});

router.post("/claims/:id/priority", requireAuth, async (req, res) => {
  try {
    const { user, sid } = contextOf(req);
    if (!CLAIM_MANAGERS.has(user.role)) throw new FinanceError(403, "FORBIDDEN", "La priorité est fixée par le syndic, le président ou le secrétaire");
    const parsed = z.object({ priority: z.enum(CLAIM_PRIORITIES), expectedVersion: z.number().int().positive() }).strict().safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Priorité invalide", code: "INVALID_PRIORITY" });
    const updated = await db.transaction(async (tx) => {
      const c = await loadVisible(String(req.params.id), user, sid, tx, true);
      assertFresh(c, parsed.data.expectedVersion);
      if (c.priority === parsed.data.priority) return c;
      const [row] = await tx
        .update(claimsTable)
        .set({ priority: parsed.data.priority, dueAt: dueAtFor(c.createdAt, parsed.data.priority), version: c.version + 1, updatedAt: new Date() })
        .where(and(eq(claimsTable.id, c.id), eq(claimsTable.version, c.version)))
        .returning();
      if (!row) throw new FinanceError(409, "CLAIM_STALE", "La réclamation a été modifiée entre-temps");
      await addEvent(tx, c, user, { type: "priority", body: `${c.priority} → ${parsed.data.priority}`, internal: true });
      return row;
    });
    res.json({ data: await view(updated, user) });
  } catch (err) {
    sendError(res, req, err);
  }
});

const scheduleSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    scheduledFor: z.string().datetime({ offset: true }),
    instructions: z.string().trim().max(2000).optional(),
    // Create the work order (travaux) of the provider: report, invoice and
    // payment then follow the existing intervention workflow.
    createWorkOrder: z.boolean().default(false),
    // Building of a common-area claim, when the condominium has several
    buildingId: z.string().trim().max(100).optional(),
  })
  .strict();

router.post("/claims/:id/schedule", requireAuth, async (req, res) => {
  try {
    const { user, sid } = contextOf(req);
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Date invalide", code: "INVALID_SCHEDULE" });
    const d = parsed.data;
    const when = new Date(d.scheduledFor);
    const key = requestKey(req);
    const out = await db.transaction(async (tx) => {
      const c = await loadVisible(String(req.params.id), user, sid, tx, true);
      if (!CLAIM_MANAGERS.has(user.role) && c.assigneeUserId !== user.userId) throw new FinanceError(403, "FORBIDDEN", "Seuls les gestionnaires ou le responsable planifient l'intervention");
      if (key) {
        const [done] = await tx.select({ id: claimEventsTable.id }).from(claimEventsTable).where(and(eq(claimEventsTable.claimId, c.id), eq(claimEventsTable.requestKey, key)));
        if (done) return { claim: c, event: null };
      }
      assertFresh(c, d.expectedVersion);
      if (!["assigned", "in_progress"].includes(c.status)) throw new FinanceError(409, "NOT_ASSIGNED", "Assignez la réclamation avant de planifier l'intervention");
      let travauxId = c.travauxId;
      let buildingId = c.buildingId;
      if (d.buildingId && d.buildingId !== buildingId) {
        const [b] = await tx.select({ id: buildingsTable.id }).from(buildingsTable).where(and(eq(buildingsTable.id, d.buildingId), eq(buildingsTable.syndicateId, sid)));
        if (!b) throw new FinanceError(400, "FOREIGN_REFERENCE", "Immeuble introuvable dans cette copropriété");
        buildingId = b.id;
      }
      if (d.createWorkOrder && !travauxId) {
        if (!c.prestataireId) throw new FinanceError(409, "PROVIDER_REQUIRED", "Un bon de travaux demande un prestataire");
        if (!buildingId) throw new FinanceError(409, "BUILDING_REQUIRED", "Précisez l'immeuble concerné");
        const [w] = await tx
          .insert(travauxTable)
          .values({
            title: `${c.reference} — ${c.title}`,
            description: `${c.description}\n\nLieu : ${c.location}${d.instructions ? `\nConsignes : ${d.instructions}` : ""}`,
            type: c.category === "ascenseur" ? "ascenseur" : "entretien",
            priority: c.priority === "urgent" ? "urgent" : c.priority === "high" ? "high" : "normal",
            status: "assigned",
            buildingId,
            lotId: c.lotId,
            prestataireId: c.prestataireId,
            reportedById: c.reporterUserId,
            reportedByName: c.reporterName,
            assignedById: user.userId,
            assignedAt: new Date(),
            startDate: d.scheduledFor.slice(0, 10),
          })
          .returning();
        travauxId = w.id;
      }
      const [updated] = await tx
        .update(claimsTable)
        .set({ scheduledFor: when, travauxId, buildingId, status: c.status === "assigned" ? "in_progress" : c.status, version: c.version + 1, updatedAt: new Date() })
        .where(and(eq(claimsTable.id, c.id), eq(claimsTable.version, c.version)))
        .returning();
      if (!updated) throw new FinanceError(409, "CLAIM_STALE", "La réclamation a été modifiée entre-temps");
      // The date is shared with the resident; the instructions stay internal.
      const event = await addEvent(tx, c, user, { type: "scheduled", fromStatus: c.status, toStatus: updated.status, body: `Intervention prévue le ${when.toISOString()}`, data: { scheduledFor: when.toISOString(), travauxId }, requestKey: key });
      if (d.instructions) await addEvent(tx, c, user, { type: "comment", body: d.instructions, internal: true });
      return { claim: updated, event };
    });
    if (out.event) {
      await notifyClaimEvent({ id: out.event.id, claimId: out.claim.id, syndicateId: sid, authorId: user.userId }, [out.claim.reporterUserId], {
        title: `Réclamation ${out.claim.reference}`,
        body: `Intervention prévue le ${when.toLocaleString("fr-MA", { timeZone: "Africa/Casablanca" })}.`,
      });
    }
    res.json({ data: await view(out.claim, user) });
  } catch (err) {
    sendError(res, req, err);
  }
});

// ─── Comments, work log, attachments ──────────────────────────────────────────

const commentSchema = z.object({ text: z.string().trim().min(1).max(4000), internal: z.boolean().default(false), attachments: z.array(z.string().max(500)).max(6).default([]) }).strict();

router.post("/claims/:id/comments", requireAuth, async (req, res) => {
  try {
    const { user, sid } = contextOf(req);
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Message invalide", code: "INVALID_COMMENT" });
    const d = parsed.data;
    const isTeam = CLAIM_TEAM.has(user.role);
    if (d.internal && !isTeam) throw new FinanceError(403, "FORBIDDEN", "Les notes internes sont réservées à l'équipe");
    const uploads = await checkUploads(d.attachments, user, sid);
    const key = requestKey(req);
    const out = await db.transaction(async (tx) => {
      const c = await loadVisible(String(req.params.id), user, sid, tx, true);
      if (key) {
        const [done] = await tx.select({ id: claimEventsTable.id }).from(claimEventsTable).where(and(eq(claimEventsTable.claimId, c.id), eq(claimEventsTable.requestKey, key)));
        if (done) return { claim: c, event: null, answered: false };
      }
      if (c.status === "closed" || c.status === "rejected") throw new FinanceError(409, "CLAIM_CLOSED", "Réclamation terminée : rouvrez-la pour la compléter");
      // The resident's answer to a question puts the claim back where it was.
      const answered = !isTeam && c.status === "awaiting_info" && c.reporterUserId === user.userId;
      const event = await addEvent(tx, c, user, { type: answered ? "info_provided" : "comment", body: d.text, internal: d.internal, requestKey: key, fromStatus: answered ? c.status : null, toStatus: answered ? c.statusBeforeInfo : null });
      if (uploads.length) {
        await tx.insert(claimAttachmentsTable).values(uploads.map((u) => ({ claimId: c.id, syndicateId: sid, objectPath: u.objectPath, fileName: u.originalName, mimeType: u.contentType, internal: d.internal, uploadedBy: user.userId })));
      }
      const [updated] = await tx
        .update(claimsTable)
        .set({ ...(answered ? { status: c.statusBeforeInfo ?? "qualified", statusBeforeInfo: null } : {}), version: c.version + 1, updatedAt: new Date() })
        .where(eq(claimsTable.id, c.id))
        .returning();
      return { claim: updated, event, answered };
    });
    if (out.event) {
      const c = out.claim;
      const recipients = isTeam ? (d.internal ? [] : [c.reporterUserId]) : [c.assigneeUserId, ...(await claimManagers(sid))];
      await notifyClaimEvent({ id: out.event.id, claimId: c.id, syndicateId: sid, authorId: user.userId }, recipients, {
        title: `Réclamation ${c.reference}`,
        body: `${out.answered ? "Réponse du résident" : "Nouveau message"} : ${d.text.slice(0, 140)}`,
      });
    }
    res.status(201).json({ data: await view(out.claim, user) });
  } catch (err) {
    sendError(res, req, err);
  }
});

const workSchema = z
  .object({
    description: z.string().trim().min(5).max(4000),
    materials: z.string().trim().max(1000).optional(),
    durationMinutes: z.number().int().positive().max(100_000).optional(),
    // Cost and supplier quotation details are internal by nature.
    cost: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
    shareWithResident: z.boolean().default(true),
    attachments: z.array(z.string().max(500)).max(6).default([]),
  })
  .strict();

router.post("/claims/:id/work", requireAuth, async (req, res) => {
  try {
    const { user, sid } = contextOf(req);
    const parsed = workSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides", code: "INVALID_WORK" });
    const d = parsed.data;
    const uploads = await checkUploads(d.attachments, user, sid);
    const key = requestKey(req);
    const updated = await db.transaction(async (tx) => {
      const c = await loadVisible(String(req.params.id), user, sid, tx, true);
      if (!CLAIM_MANAGERS.has(user.role) && c.assigneeUserId !== user.userId) throw new FinanceError(403, "FORBIDDEN", "Seuls les gestionnaires ou le responsable consignent une intervention");
      if (!["assigned", "in_progress", "awaiting_info"].includes(c.status)) throw new FinanceError(409, "NOT_IN_PROGRESS", "Aucune intervention en cours sur cette réclamation");
      if (key) {
        const [done] = await tx.select({ id: claimEventsTable.id }).from(claimEventsTable).where(and(eq(claimEventsTable.claimId, c.id), eq(claimEventsTable.requestKey, key)));
        if (done) return c;
      }
      // What was done can be shared; materials, time and cost stay internal.
      await addEvent(tx, c, user, { type: "work", body: d.description, internal: !d.shareWithResident, requestKey: key });
      if (d.materials || d.durationMinutes || d.cost) {
        await addEvent(tx, c, user, { type: "work", body: "Détails de l'intervention", internal: true, data: { materials: d.materials, durationMinutes: d.durationMinutes, cost: d.cost } });
      }
      if (uploads.length) {
        await tx.insert(claimAttachmentsTable).values(uploads.map((u) => ({ claimId: c.id, syndicateId: sid, objectPath: u.objectPath, fileName: u.originalName, mimeType: u.contentType, internal: !d.shareWithResident, uploadedBy: user.userId })));
      }
      const [row] = await tx
        .update(claimsTable)
        .set({ status: c.status === "assigned" ? "in_progress" : c.status, version: c.version + 1, updatedAt: new Date() })
        .where(eq(claimsTable.id, c.id))
        .returning();
      return row;
    });
    res.status(201).json({ data: await view(updated, user) });
  } catch (err) {
    sendError(res, req, err);
  }
});

router.post("/claims/:id/attachments", requireAuth, async (req, res) => {
  try {
    const { user, sid } = contextOf(req);
    const parsed = z.object({ objectPath: z.string().max(500), internal: z.boolean().default(false) }).strict().safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Pièce jointe invalide", code: "INVALID_ATTACHMENT" });
    if (parsed.data.internal && !CLAIM_TEAM.has(user.role)) throw new FinanceError(403, "FORBIDDEN", "Pièces internes réservées à l'équipe");
    const [u] = await checkUploads([parsed.data.objectPath], user, sid);
    const c = await loadVisible(String(req.params.id), user, sid);
    if (c.status === "closed" || c.status === "rejected") throw new FinanceError(409, "CLAIM_CLOSED", "Réclamation terminée");
    await db.transaction(async (tx) => {
      await tx.insert(claimAttachmentsTable).values({ claimId: c.id, syndicateId: sid, objectPath: u.objectPath, fileName: u.originalName, mimeType: u.contentType, internal: parsed.data.internal, uploadedBy: user.userId });
      await addEvent(tx, c, user, { type: "attachment", body: u.originalName ?? "Pièce jointe", internal: parsed.data.internal });
    });
    res.status(201).json({ data: { objectPath: u.objectPath } });
  } catch (err) {
    sendError(res, req, err);
  }
});

// ─── Resident confirmation and reopening ──────────────────────────────────────

router.post("/claims/:id/confirm", requireAuth, async (req, res) => {
  try {
    const { user, sid } = contextOf(req);
    const updated = await db.transaction(async (tx) => {
      const c = await loadVisible(String(req.params.id), user, sid, tx, true);
      if (c.reporterUserId !== user.userId) throw new FinanceError(403, "FORBIDDEN", "Seul l'auteur confirme la résolution");
      if (c.status === "closed") return c;
      if (c.status !== "resolved") throw new FinanceError(409, "NOT_RESOLVED", "La réclamation n'est pas résolue");
      const [row] = await tx.update(claimsTable).set({ status: "closed", closedAt: new Date(), closedBy: user.userId, version: c.version + 1, updatedAt: new Date() }).where(eq(claimsTable.id, c.id)).returning();
      await addEvent(tx, c, user, { type: "confirmed", fromStatus: "resolved", toStatus: "closed", body: "Le résident confirme que le problème est réglé." });
      return row;
    });
    res.json({ data: await view(updated, user) });
  } catch (err) {
    sendError(res, req, err);
  }
});

router.post("/claims/:id/reopen", requireAuth, async (req, res) => {
  try {
    const { user, sid } = contextOf(req);
    const parsed = z.object({ reason: z.string().trim().min(10, "Décrivez ce qui ne va toujours pas (10 caractères minimum)").max(2000) }).strict().safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message, code: "REASON_REQUIRED" });
    const key = requestKey(req);
    const out = await db.transaction(async (tx) => {
      const c = await loadVisible(String(req.params.id), user, sid, tx, true);
      if (key) {
        const [done] = await tx.select({ id: claimEventsTable.id }).from(claimEventsTable).where(and(eq(claimEventsTable.claimId, c.id), eq(claimEventsTable.requestKey, key)));
        if (done) return { claim: c, event: null };
      }
      const isManager = CLAIM_MANAGERS.has(user.role);
      if (!isManager && c.reporterUserId !== user.userId) throw new FinanceError(403, "FORBIDDEN", "Seul l'auteur ou un gestionnaire peut rouvrir");
      if (c.status !== "resolved" && c.status !== "closed") throw new FinanceError(409, "NOT_REOPENABLE", "Seule une réclamation résolue ou clôturée peut être rouverte");
      if (!isManager) {
        const end = c.closedAt ?? c.resolvedAt;
        if (c.status === "closed" && end && Date.now() - end.getTime() > REOPEN_WINDOW_DAYS * 86_400_000) {
          throw new FinanceError(409, "REOPEN_WINDOW_PASSED", `Plus de ${REOPEN_WINDOW_DAYS} jours après la clôture : déposez une nouvelle réclamation`);
        }
        if (c.reopenCount >= RESIDENT_REOPEN_LIMIT) throw new FinanceError(409, "REOPEN_LIMIT", "Cette réclamation a déjà été rouverte plusieurs fois : le syndic va vous recontacter");
      }
      const next: ClaimStatus = c.assigneeUserId || c.prestataireId ? "in_progress" : "qualified";
      // The previous resolution stays in the history (event data), never lost.
      const [row] = await tx
        .update(claimsTable)
        .set({ status: next, resolution: null, resolvedAt: null, resolvedBy: null, closedAt: null, closedBy: null, reopenCount: c.reopenCount + 1, dueAt: dueAtFor(new Date(), c.priority as ClaimPriority), version: c.version + 1, updatedAt: new Date() })
        .where(and(eq(claimsTable.id, c.id), eq(claimsTable.version, c.version)))
        .returning();
      if (!row) throw new FinanceError(409, "CLAIM_STALE", "La réclamation a été modifiée entre-temps");
      const event = await addEvent(tx, c, user, {
        type: "reopened",
        fromStatus: c.status,
        toStatus: next,
        body: parsed.data.reason,
        data: { previousResolution: c.resolution, previousResolvedAt: c.resolvedAt, previousResolvedBy: c.resolvedBy },
        requestKey: key,
      });
      return { claim: row, event };
    });
    if (out.event) {
      const c = out.claim;
      await serverAuditLog(req, { action: "CLAIM_REOPENED", entity: "claim", entityId: c.id, syndicateId: sid, details: `${c.reference} (${c.reopenCount}) — ${parsed.data.reason}` });
      await notifyClaimEvent({ id: out.event.id, claimId: c.id, syndicateId: sid, authorId: user.userId }, [c.assigneeUserId, c.reporterUserId, ...(await claimManagers(sid))], {
        title: `Réclamation ${c.reference} rouverte`,
        body: parsed.data.reason.slice(0, 160),
        type: "warning",
      });
    }
    res.json({ data: await view(out.claim, user) });
  } catch (err) {
    sendError(res, req, err);
  }
});

/** Re-delivers notifications whose delivery failed (managers). */
router.post("/claims/notifications/retry", requireAuth, async (req, res) => {
  try {
    const { user, sid } = contextOf(req);
    if (!CLAIM_MANAGERS.has(user.role)) throw new FinanceError(403, "FORBIDDEN", "Réservé aux gestionnaires");
    res.json({ data: await retryFailedClaimNotifications(sid) });
  } catch (err) {
    sendError(res, req, err);
  }
});

export default router;
