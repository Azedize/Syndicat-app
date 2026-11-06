/**
 * Official resignation of the syndic or the syndic adjoint (Loi 18-00 as
 * amended by Loi 106-12):
 *   art. 26 ter  the syndic informs every owner and invites them to a general
 *                assembly held within 30 days of the notification; the
 *                assembly rules on his management and designates a new
 *                syndic; within the same 30 days he hands over to his adjoint
 *                the documents, archives, registers, the treasury situation
 *                and all the assets, cash included;
 *   art. 27      meanwhile the syndic adjoint exercises the same attributions;
 *   art. 27 ter  the adjoint resigns: the syndic calls a general assembly within
 *                one month to designate a new adjoint.
 * Nothing is deleted: the mandate stays (status resigned) and every step is in
 * the audit log. A missing adjoint, a deadline passed without an assembly, or
 * an assembly that designated nobody are shown as escalations; the legal
 * remedies (court, art. 19 and 26 ter) are for the co-owners to pursue.
 */
import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@workspace/db";
import { conseilSyndicalTable, mandateResignationsTable, meetingsTable } from "@workspace/db/schema";
import { requireAuth } from "../../middleware/auth.js";
import { serverAuditLog } from "../../lib/audit.js";
import { createAlert } from "../../lib/notify.js";
import { localToday } from "../../lib/charge-time.js";
import { sendRouteError } from "../../lib/route-error.js";
import { requireSyndicateScope } from "../elections/elections.access.js";

const router = Router();

/** Art. 26 ter: what the resigning syndic hands over to his adjoint. */
export const HANDOVER_ITEMS = ["documents", "archives", "registers", "treasury", "assets", "cash"] as const;
const ROLES = ["syndic", "vice_syndic"] as const;
const DEADLINE_DAYS = 30;

const fail = (status: number, code: string, message: string) => Object.assign(new Error(message), { status, code });
const scopeOf = (req: any): string => (req.user.role === "super_admin" ? String(req.query.syndicateId) : req.user.syndicateId);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The adjoint exercising the syndic's attributions, or the syndic administrator of the platform. */
async function canManage(req: any, r: typeof mandateResignationsTable.$inferSelect) {
  if (req.user.role === "super_admin" || req.user.role === "syndicate_admin") return true;
  if (r.userId === req.user.userId) return true;
  if (r.interimMandateId) {
    const [interim] = await db.select({ userId: conseilSyndicalTable.userId }).from(conseilSyndicalTable).where(eq(conseilSyndicalTable.id, r.interimMandateId));
    if (interim?.userId === req.user.userId) return true;
  }
  return false;
}

function view(r: typeof mandateResignationsTable.$inferSelect, extra: Record<string, unknown> = {}) {
  const today = localToday();
  const handover = (r.handover ?? {}) as Record<string, boolean>;
  return {
    ...r,
    ...extra,
    handoverItems: HANDOVER_ITEMS.map((key) => ({ key, done: !!handover[key] })),
    daysLeft: Math.ceil((Date.parse(`${r.agDeadline}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000),
    // The 30 days passed and no general assembly was recorded.
    assemblyOverdue: r.status === "open" && !r.agMeetingId && today > r.agDeadline,
  };
}

router.get("/governance/resignations", requireAuth, async (req, res) => {
  try {
    if (!requireSyndicateScope(req, res)) return;
    const rows = await db.select().from(mandateResignationsTable).where(eq(mandateResignationsTable.syndicateId, scopeOf(req))).orderBy(desc(mandateResignationsTable.createdAt));
    const mandateIds = [...new Set(rows.flatMap((r) => [r.mandateId, r.interimMandateId, r.successorMandateId].filter((x): x is string => !!x)))];
    const mandates = mandateIds.length ? await db.select({ id: conseilSyndicalTable.id, name: conseilSyndicalTable.name, role: conseilSyndicalTable.role }).from(conseilSyndicalTable).where(inArray(conseilSyndicalTable.id, mandateIds)) : [];
    const byId = new Map(mandates.map((m) => [m.id, m]));
    res.json({
      data: rows.map((r) => view(r, { mandate: byId.get(r.mandateId) ?? null, interim: r.interimMandateId ? byId.get(r.interimMandateId) ?? null : null, successor: r.successorMandateId ? byId.get(r.successorMandateId) ?? null : null })),
    });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

router.post("/governance/resignations", requireAuth, async (req, res) => {
  const parsed = z
    .object({
      mandateId: z.string().min(1),
      reason: z.string().trim().max(1000).optional(),
      // Date the owners were notified (default today); never in the future.
      notifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Données invalides", code: "INVALID_RESIGNATION" });
  try {
    if (!requireSyndicateScope(req, res)) return;
    const sid = scopeOf(req);
    const today = localToday();
    const notifiedAt = parsed.data.notifiedAt ?? today;
    if (notifiedAt > today) throw fail(400, "NOTIFICATION_IN_FUTURE", "La date de notification ne peut pas être dans le futur");

    const out = await db.transaction(async (tx) => {
      const [mandate] = await tx.select().from(conseilSyndicalTable).where(eq(conseilSyndicalTable.id, parsed.data.mandateId)).for("update");
      if (!mandate || mandate.syndicateId !== sid) throw fail(404, "MANDATE_NOT_FOUND", "Mandat introuvable");
      if (!(ROLES as readonly string[]).includes(mandate.role)) throw fail(400, "NOT_SYNDIC_MANDATE", "Cette procédure concerne le syndic et son adjoint");
      if (mandate.status !== "active") throw fail(409, "MANDATE_NOT_ACTIVE", "Ce mandat n'est plus actif");
      // The holder resigns; the platform's syndic administrator may record a resignation received in writing.
      const self = mandate.userId === req.user!.userId;
      if (!self && req.user!.role !== "syndicate_admin" && req.user!.role !== "super_admin") throw fail(403, "FORBIDDEN", "Seul le titulaire du mandat peut démissionner");

      let interimMandateId: string | null = null;
      let escalation: "none" | "no_deputy" = "none";
      if (mandate.role === "syndic") {
        const [deputy] = await tx
          .select({ id: conseilSyndicalTable.id })
          .from(conseilSyndicalTable)
          .where(and(eq(conseilSyndicalTable.syndicateId, sid), eq(conseilSyndicalTable.role, "vice_syndic"), eq(conseilSyndicalTable.status, "active"), ne(conseilSyndicalTable.id, mandate.id)));
        if (deputy) interimMandateId = deputy.id;
        else escalation = "no_deputy";
      }
      const now = new Date();
      await tx
        .update(conseilSyndicalTable)
        .set({ status: "resigned", resignedAt: now, resignReason: parsed.data.reason ?? null } as any)
        .where(eq(conseilSyndicalTable.id, mandate.id));
      const [row] = await tx
        .insert(mandateResignationsTable)
        .values({
          syndicateId: sid,
          mandateId: mandate.id,
          role: mandate.role,
          userId: mandate.userId,
          reason: parsed.data.reason ?? null,
          notifiedAt,
          agDeadline: addDays(notifiedAt, DEADLINE_DAYS),
          interimMandateId,
          // The adjoint's resignation has no handover to the adjoint.
          handover: mandate.role === "syndic" ? {} : Object.fromEntries(HANDOVER_ITEMS.map((k) => [k, true])),
          escalation,
          createdBy: req.user!.userId,
        } as any)
        .returning();
      return { row, mandate };
    });

    const key = out.mandate.role === "vice_syndic" ? "resignation.viceSyndic" : out.row.escalation === "no_deputy" ? "resignation.syndicNoDeputy" : "resignation.syndic";
    await createAlert({ key, params: { name: out.mandate.name, deadline: out.row.agDeadline }, type: "warning", syndicateId: sid, target: "all" });
    await serverAuditLog(req, {
      action: "MANDATE_RESIGNATION",
      entity: "mandate_resignation",
      entityId: out.row.id,
      syndicateId: sid,
      details: `${out.mandate.role} ${out.mandate.name} — notifiée le ${out.row.notifiedAt}, assemblée avant le ${out.row.agDeadline}${out.row.escalation === "no_deputy" ? " — aucun adjoint en fonction" : ""}`,
    });
    res.status(201).json({ data: view(out.row), message: "Démission enregistrée" });
  } catch (err: any) {
    if (err?.code === "23505") return void res.status(409).json({ error: "Une démission est déjà en cours pour ce mandat", code: "RESIGNATION_EXISTS" });
    sendRouteError(req, res, err);
  }
});

/** Handover to the adjoint (art. 26 ter): each item ticked by the people involved. */
router.put("/governance/resignations/:id/handover", requireAuth, async (req, res) => {
  const parsed = z.object({ items: z.record(z.enum(HANDOVER_ITEMS), z.boolean()) }).safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Éléments de passation invalides", code: "INVALID_HANDOVER" });
  try {
    if (!requireSyndicateScope(req, res)) return;
    const [r] = await db.select().from(mandateResignationsTable).where(and(eq(mandateResignationsTable.id, String(req.params.id)), eq(mandateResignationsTable.syndicateId, scopeOf(req))));
    if (!r) throw fail(404, "RESIGNATION_NOT_FOUND", "Démission introuvable");
    if (r.status !== "open") throw fail(409, "RESIGNATION_CLOSED", "Cette démission est close");
    if (!(await canManage(req, r))) throw fail(403, "FORBIDDEN", "Réservé au démissionnaire, à l'adjoint et au syndic gestionnaire");
    const handover = { ...((r.handover ?? {}) as Record<string, boolean>), ...parsed.data.items };
    const complete = HANDOVER_ITEMS.every((k) => handover[k]);
    const [row] = await db
      .update(mandateResignationsTable)
      .set({ handover, handoverCompletedAt: complete ? (r.handoverCompletedAt ?? new Date()) : null })
      .where(eq(mandateResignationsTable.id, r.id))
      .returning();
    await serverAuditLog(req, { action: "RESIGNATION_HANDOVER", entity: "mandate_resignation", entityId: r.id, syndicateId: r.syndicateId, details: Object.entries(parsed.data.items).map(([k, v]) => `${k}=${v ? "remis" : "non remis"}`).join(", ") });
    res.json({ data: view(row) });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

/** The general assembly called for the resignation (within 30 days, art. 26 ter / 27 ter). */
router.put("/governance/resignations/:id/assembly", requireAuth, async (req, res) => {
  const parsed = z.object({ meetingId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Assemblée requise", code: "INVALID_ASSEMBLY" });
  try {
    if (!requireSyndicateScope(req, res)) return;
    const sid = scopeOf(req);
    const [r] = await db.select().from(mandateResignationsTable).where(and(eq(mandateResignationsTable.id, String(req.params.id)), eq(mandateResignationsTable.syndicateId, sid)));
    if (!r) throw fail(404, "RESIGNATION_NOT_FOUND", "Démission introuvable");
    if (r.status !== "open") throw fail(409, "RESIGNATION_CLOSED", "Cette démission est close");
    if (!(await canManage(req, r))) throw fail(403, "FORBIDDEN", "Réservé au démissionnaire, à l'adjoint et au syndic gestionnaire");
    const [meeting] = await db.select().from(meetingsTable).where(and(eq(meetingsTable.id, parsed.data.meetingId), eq(meetingsTable.syndicateId, sid)));
    if (!meeting) throw fail(404, "MEETING_NOT_FOUND", "Assemblée introuvable dans cette copropriété");
    if (meeting.status === "cancelled") throw fail(400, "MEETING_CANCELLED", "Cette assemblée est annulée");
    const [row] = await db.update(mandateResignationsTable).set({ agMeetingId: meeting.id }).where(eq(mandateResignationsTable.id, r.id)).returning();
    const late = meeting.date > r.agDeadline;
    await serverAuditLog(req, { action: "RESIGNATION_ASSEMBLY", entity: "mandate_resignation", entityId: r.id, syndicateId: sid, details: `Assemblée du ${meeting.date}${late ? ` — après le délai de 30 jours (${r.agDeadline})` : ""}` });
    res.json({ data: view(row), warning: late ? { code: "ASSEMBLY_AFTER_DEADLINE", message: `L'assemblée est fixée après le ${r.agDeadline} : le délai de 30 jours n'est pas respecté` } : null });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

/**
 * Closes the resignation once the assembly designated a successor (a mandate
 * of the same role created after the notification), or records that it
 * designated nobody (escalation no_successor: art. 19, designation by the
 * president of the court of first instance at a co-owner's request).
 */
router.post("/governance/resignations/:id/close", requireAuth, async (req, res) => {
  const parsed = z.union([z.object({ successorMandateId: z.string().min(1) }), z.object({ noSuccessor: z.literal(true) })]).safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Successeur ou constat d'absence de désignation requis", code: "INVALID_CLOSE" });
  try {
    if (!requireSyndicateScope(req, res)) return;
    if (req.user!.role !== "syndicate_admin" && req.user!.role !== "super_admin") throw fail(403, "FORBIDDEN", "Réservé au syndic gestionnaire");
    const sid = scopeOf(req);
    const [r] = await db.select().from(mandateResignationsTable).where(and(eq(mandateResignationsTable.id, String(req.params.id)), eq(mandateResignationsTable.syndicateId, sid)));
    if (!r) throw fail(404, "RESIGNATION_NOT_FOUND", "Démission introuvable");
    if (r.status !== "open") throw fail(409, "RESIGNATION_CLOSED", "Cette démission est déjà close");
    if (!r.agMeetingId) throw fail(409, "ASSEMBLY_REQUIRED", "Indiquez d'abord l'assemblée générale qui a statué");
    if ("noSuccessor" in parsed.data) {
      const [row] = await db.update(mandateResignationsTable).set({ escalation: "no_successor" }).where(eq(mandateResignationsTable.id, r.id)).returning();
      await serverAuditLog(req, { action: "RESIGNATION_NO_SUCCESSOR", entity: "mandate_resignation", entityId: r.id, syndicateId: sid, details: "L'assemblée n'a désigné personne" });
      return void res.json({ data: view(row) });
    }
    const [successor] = await db.select().from(conseilSyndicalTable).where(and(eq(conseilSyndicalTable.id, parsed.data.successorMandateId), eq(conseilSyndicalTable.syndicateId, sid)));
    if (!successor || successor.role !== r.role || successor.status !== "active" || successor.id === r.mandateId) {
      throw fail(400, "SUCCESSOR_INVALID", "Le successeur doit être un mandat actif de la même fonction");
    }
    if (successor.createdAt && successor.createdAt.toISOString().slice(0, 10) < r.notifiedAt) throw fail(400, "SUCCESSOR_TOO_OLD", "Ce mandat est antérieur à la démission");
    // With an adjoint in office, the handover to him (art. 26 ter) comes first.
    if (r.role === "syndic" && r.interimMandateId && !r.handoverCompletedAt) throw fail(409, "HANDOVER_INCOMPLETE", "La passation des documents et des fonds n'est pas terminée");
    const [row] = await db
      .update(mandateResignationsTable)
      .set({ status: "closed", successorMandateId: successor.id, closedAt: new Date(), escalation: "none" })
      .where(and(eq(mandateResignationsTable.id, r.id), eq(mandateResignationsTable.status, "open")))
      .returning();
    if (!row) throw fail(409, "RESIGNATION_CLOSED", "Cette démission est déjà close");
    await serverAuditLog(req, { action: "RESIGNATION_CLOSED", entity: "mandate_resignation", entityId: r.id, syndicateId: sid, details: `Successeur : ${successor.name}` });
    res.json({ data: view(row) });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

export default router;
