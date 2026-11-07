/**
 * Organizational structure of a condominium: statutory bodies, optional
 * committees, positions, assigned members, committee tasks and versions.
 *
 * Who does what (business rule to confirm, see GOVERNANCE_RULES):
 *   - the syndic administrator (syndicate_admin; super_admin under supervision)
 *     configures the structure, positions and assignments;
 *   - committee members act inside their committee within the capabilities of
 *     their position (tasks, recommendations, reports, read-only views);
 *   - everybody in the condominium reads what the visibility allows.
 * The statutory bodies (general assembly, syndic, syndic adjoint) cannot be
 * removed, renamed or closed here, and their holders come from the elections
 * (conseil_syndical mandates), never from this module. An assignment never
 * changes users.role.
 */
import { Router, type Request } from "express";
import { z } from "zod";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  alertsTable,
  auditLogsTable,
  buildingsTable,
  conseilSyndicalTable,
  expensesTable,
  claimsTable,
  budgetsTable,
  meetingsTable,
  orgAssignmentsTable,
  orgComponentsTable,
  orgPositionsTable,
  orgStructuresTable,
  orgStructureVersionsTable,
  orgTasksTable,
  syndicateMembershipsTable,
  usersTable,
} from "@workspace/db/schema";
import { requireAuth, isSyndicateTeamRole, type UserRole } from "../../middleware/auth.js";
import { serverAuditLog } from "../../lib/audit.js";
import { createAlert, sendPushToUsers } from "../../lib/notify.js";
import { frenchCopy, type NotificationKey } from "../../lib/notification-texts.js";
import { localToday } from "../../lib/charge-time.js";
import { sendRouteError } from "../../lib/route-error.js";
import { requireSyndicateScope } from "../elections/elections.access.js";
import { CAPABILITIES, checkPermissions, COMPONENT_TYPES, RESERVED_POWERS, recommend, STATUTORY_TYPES, TEMPLATES, typeOf, type Capability, type Profile } from "./org.catalog.js";

const router = Router();

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const fail = (status: number, code: string, message: string) => Object.assign(new Error(message), { status, code });
const sidOf = (req: Request): string => (req.user!.role === "super_admin" ? String(req.query.syndicateId) : req.user!.syndicateId!);
const isManager = (req: Request) => req.user!.role === "syndicate_admin" || req.user!.role === "super_admin";
function requireManager(req: Request) {
  if (!isManager(req)) throw fail(403, "ORG_MANAGE_FORBIDDEN", "Seul le syndic gestionnaire configure l'organisation de la copropriété");
}

const profileSchema = z
  .object({
    residenceType: z.string().max(60).optional(),
    buildings: z.number().int().min(0).max(500).optional(),
    floors: z.number().int().min(0).max(200).optional(),
    lots: z.number().int().min(0).max(100_000).optional(),
    residents: z.number().int().min(0).max(1_000_000).optional(),
    employees: z.number().int().min(0).max(10_000).optional(),
    professionalSyndic: z.boolean().optional(),
    hasDeputy: z.boolean().optional(),
    multiSyndicateComplex: z.boolean().optional(),
    securityStaff: z.boolean().optional(),
    maintenanceStaff: z.boolean().optional(),
    elevators: z.number().int().min(0).max(500).optional(),
    gardens: z.boolean().optional(),
    parking: z.boolean().optional(),
    pool: z.boolean().optional(),
    otherFacilities: z.boolean().optional(),
  })
  .strict();

async function structureOf(sid: string) {
  const [s] = await db.select().from(orgStructuresTable).where(eq(orgStructuresTable.syndicateId, sid));
  return s ?? null;
}

/** Ids of the active assignments of a user in a condominium, with their capabilities. */
async function capabilitiesOf(userId: string, componentId: string): Promise<{ member: boolean; leader: boolean; caps: Set<Capability> }> {
  const rows = await db
    .select({ permissions: orgPositionsTable.permissions, isLeader: orgPositionsTable.isLeader })
    .from(orgAssignmentsTable)
    .innerJoin(orgPositionsTable, eq(orgPositionsTable.id, orgAssignmentsTable.positionId))
    .where(and(eq(orgAssignmentsTable.componentId, componentId), eq(orgAssignmentsTable.userId, userId), eq(orgAssignmentsTable.status, "active")));
  return { member: rows.length > 0, leader: rows.some((r) => r.isLeader), caps: new Set(rows.flatMap((r) => r.permissions as Capability[])) };
}

/** What a viewer may see of a component (visibility + membership). */
function visibleTo(c: typeof orgComponentsTable.$inferSelect, role: UserRole, memberOf: Set<string>, manager: boolean) {
  if (manager || memberOf.has(c.id)) return true;
  if (c.visibility === "members") return true;
  if (c.visibility === "team") return isSyndicateTeamRole(role);
  return false;
}

async function notifyUsers(sid: string, userIds: string[], key: NotificationKey, params: Record<string, string | number>) {
  if (!userIds.length) return;
  const fr = frenchCopy(key, params);
  await db.insert(alertsTable).values(
    userIds.map((u) => ({ syndicateId: sid, recipientUserId: u, title: fr.title, message: fr.message, key, params, type: "info", date: localToday(), target: "member" })) as any,
  );
  await sendPushToUsers(userIds, fr.title, fr.message, { link: "/organization" }).catch(() => {});
}

/** Snapshot of a structure for its version history. */
async function snapshot(tx: Tx, structureId: string) {
  const components = await tx.select().from(orgComponentsTable).where(eq(orgComponentsTable.structureId, structureId));
  const ids = components.map((c) => c.id);
  const positions = ids.length ? await tx.select().from(orgPositionsTable).where(inArray(orgPositionsTable.componentId, ids)) : [];
  const assignments = ids.length ? await tx.select().from(orgAssignmentsTable).where(and(inArray(orgAssignmentsTable.componentId, ids), eq(orgAssignmentsTable.status, "active"))) : [];
  return { components, positions, assignments };
}

/** Blocking problems and warnings shown before activation. */
async function review(structureId: string, sid: string) {
  const components = await db.select().from(orgComponentsTable).where(eq(orgComponentsTable.structureId, structureId));
  const ids = components.map((c) => c.id);
  const positions = ids.length ? await db.select().from(orgPositionsTable).where(inArray(orgPositionsTable.componentId, ids)) : [];
  const assignments = ids.length ? await db.select().from(orgAssignmentsTable).where(and(inArray(orgAssignmentsTable.componentId, ids), eq(orgAssignmentsTable.status, "active"))) : [];
  const mandates = await db.select().from(conseilSyndicalTable).where(and(eq(conseilSyndicalTable.syndicateId, sid), eq(conseilSyndicalTable.status, "active"), inArray(conseilSyndicalTable.role, ["syndic", "vice_syndic"])));
  // code + parameters for the app to translate; message: the French text
  type Item = { code: string; message: string; componentId?: string; positionTitle?: string; type?: string };
  const errors: Item[] = [];
  const warnings: Item[] = [];
  for (const t of STATUTORY_TYPES) if (!components.some((c) => c.type === t)) errors.push({ code: "STATUTORY_MISSING", message: `Organe obligatoire absent : ${t}`, type: t });
  if (!mandates.some((m) => m.role === "syndic")) warnings.push({ code: "NO_SYNDIC_MANDATE", message: "Aucun syndic désigné par l'assemblée n'est enregistré (élection de type syndic)" });
  if (!mandates.some((m) => m.role === "vice_syndic")) warnings.push({ code: "NO_DEPUTY_MANDATE", message: "Aucun syndic adjoint désigné n'est enregistré" });
  for (const c of components.filter((x) => x.category !== "statutory" && x.status === "active")) {
    const pos = positions.filter((p) => p.componentId === c.id && p.status === "active");
    if (!pos.length) warnings.push({ code: "NO_POSITION", message: `${c.name} : aucun poste défini`, componentId: c.id });
    for (const p of pos) if (p.isLeader && !assignments.some((a) => a.positionId === p.id && a.kind === "holder")) warnings.push({ code: "LEADER_VACANT", message: `${c.name} : poste « ${p.title} » vacant`, componentId: c.id, positionTitle: p.title });
  }
  // Somebody who controls what he manages: the syndic in an audit or financial committee.
  const syndicUsers = new Set(mandates.filter((m) => m.role === "syndic").map((m) => m.userId));
  for (const c of components.filter((x) => ["audit", "financial"].includes(x.type))) {
    if (assignments.some((a) => a.componentId === c.id && syndicUsers.has(a.userId))) warnings.push({ code: "CONFLICT_SYNDIC_CONTROL", message: `${c.name} : le syndic en est membre alors que ce comité suit sa gestion`, componentId: c.id });
  }
  return { errors, warnings };
}

// ─── Catalogue and recommendations ────────────────────────────────────────────

router.get("/org/catalog", requireAuth, (_req, res) => {
  res.json({ data: { types: COMPONENT_TYPES, capabilities: CAPABILITIES, reservedPowers: RESERVED_POWERS, templates: TEMPLATES } });
});

router.post("/org/recommendations", requireAuth, async (req, res) => {
  try {
    if (!requireSyndicateScope(req, res)) return;
    const parsed = profileSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw fail(400, "INVALID_PROFILE", "Profil de résidence invalide");
    res.json({ data: recommend(parsed.data as Profile) });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

// ─── Structure ────────────────────────────────────────────────────────────────

router.get("/org/structure", requireAuth, async (req, res) => {
  try {
    if (!requireSyndicateScope(req, res)) return;
    const sid = sidOf(req);
    const manager = isManager(req);
    // Facts of the condominium, to prefill the wizard.
    const [facts] = (await db.execute(sql`
      SELECT (SELECT count(*)::int FROM buildings WHERE syndicate_id = ${sid}) AS buildings,
             (SELECT count(*)::int FROM lots l JOIN buildings b ON b.id = l.building_id WHERE b.syndicate_id = ${sid} AND l.archived_at IS NULL) AS lots,
             (SELECT count(*)::int FROM users WHERE syndicate_id = ${sid} AND status = 'active') AS residents,
             (SELECT COALESCE(max(total_floors), 0)::int FROM buildings WHERE syndicate_id = ${sid}) AS floors`)) as unknown as Record<string, number>[];
    const mandates = await db
      .select({ id: conseilSyndicalTable.id, role: conseilSyndicalTable.role, name: conseilSyndicalTable.name, userId: conseilSyndicalTable.userId, mandateStart: conseilSyndicalTable.mandateStart, mandateEnd: conseilSyndicalTable.mandateEnd })
      .from(conseilSyndicalTable)
      .where(and(eq(conseilSyndicalTable.syndicateId, sid), eq(conseilSyndicalTable.status, "active"), inArray(conseilSyndicalTable.role, ["syndic", "vice_syndic"])));
    const s = await structureOf(sid);
    if (!s) return void res.json({ data: null, facts, statutoryHolders: mandates, canManage: manager });
    if (s.status === "draft" && !manager) return void res.json({ data: null, facts, statutoryHolders: mandates, canManage: false });

    const components = await db.select().from(orgComponentsTable).where(eq(orgComponentsTable.structureId, s.id)).orderBy(asc(orgComponentsTable.sortOrder), asc(orgComponentsTable.createdAt));
    const myAssignments = await db.select({ componentId: orgAssignmentsTable.componentId }).from(orgAssignmentsTable).where(and(eq(orgAssignmentsTable.syndicateId, sid), eq(orgAssignmentsTable.userId, req.user!.userId), eq(orgAssignmentsTable.status, "active")));
    const memberOf = new Set(myAssignments.map((a) => a.componentId));
    const visible = components.filter((c) => visibleTo(c, req.user!.role, memberOf, manager));
    const ids = visible.map((c) => c.id);
    const positions = ids.length ? await db.select().from(orgPositionsTable).where(inArray(orgPositionsTable.componentId, ids)).orderBy(desc(orgPositionsTable.isLeader), asc(orgPositionsTable.createdAt)) : [];
    const assignments = ids.length
      ? await db
          .select({ a: orgAssignmentsTable, name: usersTable.name })
          .from(orgAssignmentsTable)
          .innerJoin(usersTable, eq(usersTable.id, orgAssignmentsTable.userId))
          .where(and(inArray(orgAssignmentsTable.componentId, ids), manager ? sql`true` : eq(orgAssignmentsTable.status, "active")))
          .orderBy(desc(orgAssignmentsTable.createdAt))
      : [];
    res.json({
      data: {
        ...s,
        components: visible.map((c) => ({
          ...c,
          legalStatus: typeOf(c.type)?.legalStatus ?? "internal",
          legalBasis: typeOf(c.type)?.legalBasis ?? null,
          mine: memberOf.has(c.id),
          positions: positions
            .filter((p) => p.componentId === c.id)
            .map((p) => ({ ...p, assignments: assignments.filter((x) => x.a.positionId === p.id).map((x) => ({ ...x.a, userName: x.name })) })),
        })),
      },
      facts,
      statutoryHolders: mandates,
      canManage: manager,
      review: manager ? await review(s.id, sid) : null,
    });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

/** Creates the structure from a template: statutory bodies + the template's committees with default positions. */
router.post("/org/structure", requireAuth, async (req, res) => {
  const parsed = z.object({ template: z.enum(["small", "medium", "large", "custom"]), profile: profileSchema.default({}), components: z.array(z.string()).max(30).optional() }).safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Données invalides", code: "INVALID_STRUCTURE" });
  try {
    if (!requireSyndicateScope(req, res)) return;
    requireManager(req);
    const sid = sidOf(req);
    const chosen = parsed.data.components ?? TEMPLATES[parsed.data.template];
    const unknown = chosen.filter((t) => !typeOf(t) || STATUTORY_TYPES.includes(t));
    if (unknown.length) throw fail(400, "UNKNOWN_COMPONENT", `Composantes inconnues : ${unknown.join(", ")}`);
    const out = await db.transaction(async (tx) => {
      const [s] = await tx
        .insert(orgStructuresTable)
        .values({ syndicateId: sid, template: parsed.data.template, profile: parsed.data.profile, status: "draft", createdBy: req.user!.userId })
        .onConflictDoNothing()
        .returning();
      if (!s) throw fail(409, "STRUCTURE_EXISTS", "Cette copropriété a déjà une organisation : modifiez-la");
      let order = 0;
      for (const type of [...STATUTORY_TYPES, ...chosen]) {
        const def = typeOf(type)!;
        const [c] = await tx
          .insert(orgComponentsTable)
          .values({ structureId: s.id, syndicateId: sid, category: def.category, type, name: defaultName(type), responsibilities: def.responsibilities, visibility: "members", sortOrder: order++, createdBy: req.user!.userId })
          .returning();
        for (const p of def.positions) await tx.insert(orgPositionsTable).values({ componentId: c.id, title: p.title, isLeader: !!p.isLeader, permissions: p.permissions, responsibilities: p.responsibilities ?? [] });
      }
      return s;
    });
    await serverAuditLog(req, { action: "ORG_STRUCTURE_CREATED", entity: "org_structure", entityId: out.id, syndicateId: sid, details: `Modèle ${parsed.data.template} — ${chosen.join(", ") || "organes légaux seulement"}` });
    res.status(201).json({ data: out });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

/** Activates the current configuration as a new version (snapshot kept). */
router.post("/org/structure/activate", requireAuth, async (req, res) => {
  const parsed = z.object({ reason: z.string().trim().max(500).optional(), decisionMeetingId: z.string().optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return void res.status(400).json({ error: "Données invalides", code: "INVALID_ACTIVATION" });
  try {
    if (!requireSyndicateScope(req, res)) return;
    requireManager(req);
    const sid = sidOf(req);
    const s = await structureOf(sid);
    if (!s) throw fail(404, "STRUCTURE_NOT_FOUND", "Aucune organisation à activer");
    if (parsed.data.decisionMeetingId) await assertMeeting(sid, parsed.data.decisionMeetingId);
    const { errors, warnings } = await review(s.id, sid);
    if (errors.length) return void res.status(422).json({ error: errors[0].message, code: "STRUCTURE_INVALID", errors, warnings });
    const version = await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(orgStructuresTable).where(eq(orgStructuresTable.id, s.id)).for("update");
      const next = (locked.version ?? 0) + 1;
      await tx.insert(orgStructureVersionsTable).values({ structureId: s.id, version: next, snapshot: await snapshot(tx, s.id), reason: parsed.data.reason ?? null, decisionMeetingId: parsed.data.decisionMeetingId ?? null, createdBy: req.user!.userId });
      await tx.update(orgStructuresTable).set({ status: "active", version: next, activatedAt: new Date(), activatedBy: req.user!.userId, updatedAt: new Date() }).where(eq(orgStructuresTable.id, s.id));
      return next;
    });
    await createAlert({ key: "org.structureActivated", params: { version }, type: "info", syndicateId: sid, target: "all" });
    await serverAuditLog(req, { action: "ORG_STRUCTURE_ACTIVATED", entity: "org_structure", entityId: s.id, syndicateId: sid, details: `Version ${version}${parsed.data.reason ? ` — ${parsed.data.reason}` : ""}` });
    res.json({ data: { version, warnings } });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

router.get("/org/structure/history", requireAuth, async (req, res) => {
  try {
    if (!requireSyndicateScope(req, res)) return;
    if (!isManager(req) && !isSyndicateTeamRole(req.user!.role)) throw fail(403, "FORBIDDEN", "Réservé à l'équipe de gestion");
    const sid = sidOf(req);
    const s = await structureOf(sid);
    if (!s) return void res.json({ data: { versions: [], events: [] } });
    const versions = await db
      .select({ id: orgStructureVersionsTable.id, version: orgStructureVersionsTable.version, reason: orgStructureVersionsTable.reason, decisionMeetingId: orgStructureVersionsTable.decisionMeetingId, createdAt: orgStructureVersionsTable.createdAt, createdBy: orgStructureVersionsTable.createdBy })
      .from(orgStructureVersionsTable)
      .where(eq(orgStructureVersionsTable.structureId, s.id))
      .orderBy(desc(orgStructureVersionsTable.version));
    const events = await db
      .select({ action: auditLogsTable.action, details: auditLogsTable.details, userName: auditLogsTable.userName, createdAt: auditLogsTable.createdAt })
      .from(auditLogsTable)
      .where(and(eq(auditLogsTable.syndicateId, sid), sql`${auditLogsTable.action} LIKE 'ORG_%'`))
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(100);
    res.json({ data: { versions, events } });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

// ─── Components ───────────────────────────────────────────────────────────────

const componentSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  objectives: z.string().trim().max(2000).optional(),
  responsibilities: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  reportingFrequency: z.enum(["monthly", "quarterly", "half_yearly", "yearly", "none"]).optional(),
  visibility: z.enum(["members", "team", "component"]).optional(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  decisionMeetingId: z.string().nullable().optional(),
});

async function assertMeeting(sid: string, meetingId: string) {
  const [m] = await db.select({ id: meetingsTable.id }).from(meetingsTable).where(and(eq(meetingsTable.id, meetingId), eq(meetingsTable.syndicateId, sid)));
  if (!m) throw fail(404, "MEETING_NOT_FOUND", "Assemblée introuvable dans cette copropriété");
}

async function componentIn(sid: string, id: string) {
  const [c] = await db.select().from(orgComponentsTable).where(and(eq(orgComponentsTable.id, id), eq(orgComponentsTable.syndicateId, sid)));
  if (!c) throw fail(404, "COMPONENT_NOT_FOUND", "Composante introuvable");
  return c;
}

router.post("/org/components", requireAuth, async (req, res) => {
  const parsed = componentSchema.extend({ type: z.string().min(2).max(40) }).safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Données invalides", code: "INVALID_COMPONENT" });
  try {
    if (!requireSyndicateScope(req, res)) return;
    requireManager(req);
    const sid = sidOf(req);
    const def = typeOf(parsed.data.type);
    if (!def) throw fail(400, "UNKNOWN_COMPONENT", "Type de composante inconnu");
    if (def.category === "statutory") throw fail(409, "STATUTORY_EXISTS", "Les organes légaux existent déjà : ils ne se créent pas ici");
    const s = await structureOf(sid);
    if (!s) throw fail(404, "STRUCTURE_NOT_FOUND", "Créez d'abord l'organisation");
    if (parsed.data.decisionMeetingId) await assertMeeting(sid, parsed.data.decisionMeetingId);
    if (parsed.data.type === "custom" && !parsed.data.name) throw fail(400, "NAME_REQUIRED", "Donnez un nom à la composante");
    const c = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(orgComponentsTable)
        .values({
          structureId: s.id, syndicateId: sid, category: def.category, type: def.type, name: parsed.data.name ?? defaultName(def.type), description: parsed.data.description ?? null,
          objectives: parsed.data.objectives ?? null, responsibilities: parsed.data.responsibilities ?? def.responsibilities, reportingFrequency: parsed.data.reportingFrequency ?? null,
          visibility: parsed.data.visibility ?? "members", startsOn: parsed.data.startsOn ?? null, endsOn: parsed.data.endsOn ?? null, decisionMeetingId: parsed.data.decisionMeetingId ?? null,
          sortOrder: 100, createdBy: req.user!.userId,
        })
        .returning();
      for (const p of def.positions) await tx.insert(orgPositionsTable).values({ componentId: row.id, title: p.title, isLeader: !!p.isLeader, permissions: p.permissions, responsibilities: p.responsibilities ?? [] });
      return row;
    });
    await serverAuditLog(req, { action: "ORG_COMPONENT_CREATED", entity: "org_component", entityId: c.id, syndicateId: sid, details: `${c.name} (${c.type})` });
    res.status(201).json({ data: c });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

router.put("/org/components/:id", requireAuth, async (req, res) => {
  const parsed = componentSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Données invalides", code: "INVALID_COMPONENT" });
  try {
    if (!requireSyndicateScope(req, res)) return;
    requireManager(req);
    const sid = sidOf(req);
    const c = await componentIn(sid, String(req.params.id));
    if (c.status === "closed") throw fail(409, "COMPONENT_CLOSED", "Cette composante est close");
    // Statutory bodies: their name, existence and status come from the law.
    if (c.category === "statutory" && (parsed.data.name !== undefined || parsed.data.status !== undefined || parsed.data.visibility !== undefined)) {
      throw fail(409, "STATUTORY_PROTECTED", "Organe légal : il ne se renomme pas, ne se désactive pas et reste visible de tous");
    }
    if (parsed.data.decisionMeetingId) await assertMeeting(sid, parsed.data.decisionMeetingId);
    const [row] = await db.update(orgComponentsTable).set(parsed.data).where(eq(orgComponentsTable.id, c.id)).returning();
    await serverAuditLog(req, { action: "ORG_COMPONENT_UPDATED", entity: "org_component", entityId: c.id, syndicateId: sid, details: `${c.name} : ${Object.keys(parsed.data).join(", ")}` });
    res.json({ data: row });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

/** Removal only for a component never used (no assignment, no task); otherwise it is closed. */
router.delete("/org/components/:id", requireAuth, async (req, res) => {
  try {
    if (!requireSyndicateScope(req, res)) return;
    requireManager(req);
    const sid = sidOf(req);
    const c = await componentIn(sid, String(req.params.id));
    if (c.category === "statutory") throw fail(409, "STATUTORY_PROTECTED", "Les organes légaux (assemblée générale, syndic, syndic adjoint) ne peuvent pas être supprimés");
    const [{ used }] = (await db.execute(sql`SELECT (EXISTS (SELECT 1 FROM org_assignments WHERE component_id = ${c.id}) OR EXISTS (SELECT 1 FROM org_tasks WHERE component_id = ${c.id})) AS used`)) as unknown as { used: boolean }[];
    if (used) throw fail(409, "HAS_HISTORY", "Cette composante a un historique (membres ou tâches) : clôturez-la au lieu de la supprimer");
    await db.delete(orgComponentsTable).where(eq(orgComponentsTable.id, c.id));
    await serverAuditLog(req, { action: "ORG_COMPONENT_DELETED", entity: "org_component", entityId: c.id, syndicateId: sid, details: `${c.name} (jamais utilisée)` });
    res.json({ data: { id: c.id } });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

router.post("/org/components/:id/close", requireAuth, async (req, res) => {
  const parsed = z.object({ reason: z.string().trim().min(3).max(1000), decisionMeetingId: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Motif de clôture requis", code: "REASON_REQUIRED" });
  try {
    if (!requireSyndicateScope(req, res)) return;
    requireManager(req);
    const sid = sidOf(req);
    const c = await componentIn(sid, String(req.params.id));
    if (c.category === "statutory") throw fail(409, "STATUTORY_PROTECTED", "Un organe légal ne se clôt pas");
    if (c.status === "closed") throw fail(409, "COMPONENT_CLOSED", "Déjà close");
    if (parsed.data.decisionMeetingId) await assertMeeting(sid, parsed.data.decisionMeetingId);
    const today = localToday();
    const ended = await db.transaction(async (tx) => {
      // Members' access ends today; assignments, tasks and documents stay.
      const rows = await tx
        .update(orgAssignmentsTable)
        .set({ status: "ended", endDate: today, endReason: `Clôture : ${parsed.data.reason}` })
        .where(and(eq(orgAssignmentsTable.componentId, c.id), eq(orgAssignmentsTable.status, "active")))
        .returning({ userId: orgAssignmentsTable.userId });
      await tx
        .update(orgComponentsTable)
        .set({ status: "closed", closedAt: new Date(), closeReason: parsed.data.reason, decisionMeetingId: parsed.data.decisionMeetingId ?? c.decisionMeetingId, endsOn: today })
        .where(eq(orgComponentsTable.id, c.id));
      return rows.map((r) => r.userId);
    });
    await notifyUsers(sid, [...new Set(ended)], "org.componentClosed", { component: c.name });
    await serverAuditLog(req, { action: "ORG_COMPONENT_CLOSED", entity: "org_component", entityId: c.id, syndicateId: sid, details: `${c.name} — ${parsed.data.reason} — ${ended.length} affectation(s) terminée(s)` });
    res.json({ data: { id: c.id, endedAssignments: ended.length } });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

// ─── Positions ────────────────────────────────────────────────────────────────

const positionSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  responsibilities: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  permissions: z.array(z.string()).max(20).default([]),
  scope: z.string().trim().max(500).optional(),
  isLeader: z.boolean().default(false),
  maxHolders: z.number().int().min(1).max(100).nullable().optional(),
});

/** Titles that would pass for the legal positions of syndic or adjoint inside a committee. */
const LEGAL_TITLES = /^\s*(syndic|syndic adjoint|vice[- ]syndic|nائب السنديك|السنديك)\s*$/i;

router.post("/org/components/:id/positions", requireAuth, async (req, res) => {
  const parsed = positionSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Données invalides", code: "INVALID_POSITION" });
  try {
    if (!requireSyndicateScope(req, res)) return;
    requireManager(req);
    const sid = sidOf(req);
    const c = await componentIn(sid, String(req.params.id));
    if (c.category === "statutory") throw fail(409, "STATUTORY_PROTECTED", "Les titulaires des organes légaux sont désignés par l'assemblée (élections), pas ici");
    if (c.status === "closed") throw fail(409, "COMPONENT_CLOSED", "Cette composante est close");
    if (LEGAL_TITLES.test(parsed.data.title)) throw fail(422, "LEGAL_TITLE", "Ce titre est celui d'une fonction légale (syndic, syndic adjoint) : choisissez un autre intitulé");
    const perms = checkPermissions(parsed.data.permissions);
    if (!perms.ok) throw fail(422, perms.code, perms.message);
    const [p] = await db.insert(orgPositionsTable).values({ componentId: c.id, ...parsed.data, maxHolders: parsed.data.maxHolders ?? null }).returning();
    await serverAuditLog(req, { action: "ORG_POSITION_CREATED", entity: "org_position", entityId: p.id, syndicateId: sid, details: `${c.name} — ${p.title} — ${p.permissions.join(", ") || "aucune permission"}` });
    res.status(201).json({ data: p });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

router.put("/org/positions/:id", requireAuth, async (req, res) => {
  const parsed = positionSchema.partial().extend({ status: z.enum(["active", "inactive"]).optional() }).safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Données invalides", code: "INVALID_POSITION" });
  try {
    if (!requireSyndicateScope(req, res)) return;
    requireManager(req);
    const sid = sidOf(req);
    const [p] = await db.select({ p: orgPositionsTable, sid: orgComponentsTable.syndicateId }).from(orgPositionsTable).innerJoin(orgComponentsTable, eq(orgComponentsTable.id, orgPositionsTable.componentId)).where(eq(orgPositionsTable.id, String(req.params.id)));
    if (!p || p.sid !== sid) throw fail(404, "POSITION_NOT_FOUND", "Poste introuvable");
    if (parsed.data.title && LEGAL_TITLES.test(parsed.data.title)) throw fail(422, "LEGAL_TITLE", "Ce titre est celui d'une fonction légale (syndic, syndic adjoint)");
    if (parsed.data.permissions) {
      const perms = checkPermissions(parsed.data.permissions);
      if (!perms.ok) throw fail(422, perms.code, perms.message);
    }
    const [row] = await db.update(orgPositionsTable).set(parsed.data).where(eq(orgPositionsTable.id, p.p.id)).returning();
    await serverAuditLog(req, { action: "ORG_POSITION_UPDATED", entity: "org_position", entityId: p.p.id, syndicateId: sid, details: `${p.p.title} : ${Object.keys(parsed.data).join(", ")}` });
    res.json({ data: row });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

// ─── Assignments ──────────────────────────────────────────────────────────────

/** The user belongs to the condominium (home or active membership). */
async function assertBelongs(sid: string, userId: string) {
  const [u] = await db.select({ id: usersTable.id, name: usersTable.name, status: usersTable.status, syndicateId: usersTable.syndicateId }).from(usersTable).where(eq(usersTable.id, userId));
  if (!u || u.status !== "active") throw fail(404, "USER_NOT_FOUND", "Personne introuvable ou inactive");
  if (u.syndicateId !== sid) {
    const [m] = await db.select({ id: syndicateMembershipsTable.id }).from(syndicateMembershipsTable).where(and(eq(syndicateMembershipsTable.userId, userId), eq(syndicateMembershipsTable.syndicateId, sid), eq(syndicateMembershipsTable.status, "active")));
    if (!m) throw fail(403, "USER_OUTSIDE_CONDOMINIUM", "Cette personne n'appartient pas à la copropriété");
  }
  return u;
}

const assignSchema = z.object({
  userId: z.string().min(1),
  kind: z.enum(["holder", "substitute"]).default("holder"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  decisionMeetingId: z.string().optional(),
  decisionDocumentId: z.string().optional(),
});

async function assign(tx: Tx, req: Request, sid: string, positionId: string, d: z.infer<typeof assignSchema>, replacing?: string) {
  const [p] = await tx.select({ p: orgPositionsTable, c: orgComponentsTable }).from(orgPositionsTable).innerJoin(orgComponentsTable, eq(orgComponentsTable.id, orgPositionsTable.componentId)).where(eq(orgPositionsTable.id, positionId)).for("update");
  if (!p || p.c.syndicateId !== sid) throw fail(404, "POSITION_NOT_FOUND", "Poste introuvable");
  if (p.c.category === "statutory") throw fail(409, "STATUTORY_PROTECTED", "Les titulaires des organes légaux sont désignés par l'assemblée");
  if (p.c.status === "closed" || p.p.status !== "active") throw fail(409, "POSITION_CLOSED", "Ce poste n'accepte plus de membre");
  if (p.p.maxHolders && d.kind === "holder") {
    const [{ n }] = (await tx.execute(sql`SELECT count(*)::int AS n FROM org_assignments WHERE position_id = ${positionId} AND status = 'active' AND kind = 'holder' ${replacing ? sql`AND id <> ${replacing}` : sql``}`)) as unknown as { n: number }[];
    if (n >= p.p.maxHolders) throw fail(409, "POSITION_FULL", `Ce poste a déjà ${p.p.maxHolders} titulaire(s)`);
  }
  const startDate = d.startDate ?? localToday();
  if (d.endDate && d.endDate < startDate) throw fail(400, "DATES_INVALID", "La fin précède le début");
  try {
    const [a] = await tx
      .insert(orgAssignmentsTable)
      .values({ syndicateId: sid, componentId: p.c.id, positionId, userId: d.userId, kind: d.kind, startDate, endDate: d.endDate ?? null, decisionMeetingId: d.decisionMeetingId ?? null, decisionDocumentId: d.decisionDocumentId ?? null, createdBy: req.user!.userId })
      .returning();
    return { a, position: p.p, component: p.c };
  } catch (err: any) {
    if (err?.code === "23505" || err?.cause?.code === "23505") throw fail(409, "ALREADY_ASSIGNED", "Cette personne occupe déjà ce poste");
    throw err;
  }
}

router.post("/org/positions/:id/assignments", requireAuth, async (req, res) => {
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Données invalides", code: "INVALID_ASSIGNMENT" });
  try {
    if (!requireSyndicateScope(req, res)) return;
    requireManager(req);
    const sid = sidOf(req);
    await assertBelongs(sid, parsed.data.userId);
    if (parsed.data.decisionMeetingId) await assertMeeting(sid, parsed.data.decisionMeetingId);
    const out = await db.transaction((tx) => assign(tx, req, sid, String(req.params.id), parsed.data));
    await notifyUsers(sid, [parsed.data.userId], "org.assigned", { position: out.position.title, component: out.component.name });
    await serverAuditLog(req, { action: "ORG_MEMBER_ASSIGNED", entity: "org_assignment", entityId: out.a.id, syndicateId: sid, details: `${out.component.name} — ${out.position.title} — ${parsed.data.userId} (${parsed.data.kind})` });
    res.status(201).json({ data: out.a });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

router.post("/org/assignments/:id/end", requireAuth, async (req, res) => {
  const parsed = z.object({ reason: z.string().trim().min(3).max(500), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Motif requis", code: "REASON_REQUIRED" });
  try {
    if (!requireSyndicateScope(req, res)) return;
    requireManager(req);
    const sid = sidOf(req);
    const [a] = await db.select().from(orgAssignmentsTable).where(and(eq(orgAssignmentsTable.id, String(req.params.id)), eq(orgAssignmentsTable.syndicateId, sid)));
    if (!a) throw fail(404, "ASSIGNMENT_NOT_FOUND", "Affectation introuvable");
    if (a.status !== "active") throw fail(409, "ASSIGNMENT_ENDED", "Déjà terminée");
    const endDate = parsed.data.endDate ?? localToday();
    if (endDate < a.startDate) throw fail(400, "DATES_INVALID", "La fin précède le début");
    const [row] = await db.update(orgAssignmentsTable).set({ status: "ended", endDate, endReason: parsed.data.reason }).where(and(eq(orgAssignmentsTable.id, a.id), eq(orgAssignmentsTable.status, "active"))).returning();
    const [names] = await db.select({ position: orgPositionsTable.title, component: orgComponentsTable.name }).from(orgPositionsTable).innerJoin(orgComponentsTable, eq(orgComponentsTable.id, orgPositionsTable.componentId)).where(eq(orgPositionsTable.id, a.positionId));
    await notifyUsers(sid, [a.userId], "org.assignmentEnded", { position: names.position, component: names.component });
    await serverAuditLog(req, { action: "ORG_MEMBER_ENDED", entity: "org_assignment", entityId: a.id, syndicateId: sid, details: `${names.component} — ${names.position} — ${parsed.data.reason}` });
    res.json({ data: row });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

/** Replacement: the current assignment ends (kept) and the new one is linked to it, in one transaction. */
router.post("/org/assignments/:id/replace", requireAuth, async (req, res) => {
  const parsed = z.object({ userId: z.string().min(1), reason: z.string().trim().min(3).max(500), decisionMeetingId: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Remplaçant et motif requis", code: "INVALID_REPLACEMENT" });
  try {
    if (!requireSyndicateScope(req, res)) return;
    requireManager(req);
    const sid = sidOf(req);
    await assertBelongs(sid, parsed.data.userId);
    if (parsed.data.decisionMeetingId) await assertMeeting(sid, parsed.data.decisionMeetingId);
    const out = await db.transaction(async (tx) => {
      const [a] = await tx.select().from(orgAssignmentsTable).where(and(eq(orgAssignmentsTable.id, String(req.params.id)), eq(orgAssignmentsTable.syndicateId, sid))).for("update");
      if (!a) throw fail(404, "ASSIGNMENT_NOT_FOUND", "Affectation introuvable");
      if (a.status !== "active") throw fail(409, "ASSIGNMENT_ENDED", "Cette affectation est déjà terminée");
      if (a.userId === parsed.data.userId) throw fail(400, "SAME_PERSON", "Le remplaçant est déjà titulaire");
      const today = localToday();
      await tx.update(orgAssignmentsTable).set({ status: "ended", endDate: today < a.startDate ? a.startDate : today, endReason: `Remplacement : ${parsed.data.reason}` }).where(eq(orgAssignmentsTable.id, a.id));
      const next = await assign(tx, req, sid, a.positionId, { userId: parsed.data.userId, kind: a.kind as "holder", decisionMeetingId: parsed.data.decisionMeetingId }, a.id);
      await tx.update(orgAssignmentsTable).set({ replacedBy: next.a.id }).where(eq(orgAssignmentsTable.id, a.id));
      return { previous: a, next };
    });
    await notifyUsers(sid, [out.previous.userId], "org.assignmentEnded", { position: out.next.position.title, component: out.next.component.name });
    await notifyUsers(sid, [parsed.data.userId], "org.assigned", { position: out.next.position.title, component: out.next.component.name });
    await serverAuditLog(req, { action: "ORG_MEMBER_REPLACED", entity: "org_assignment", entityId: out.next.a.id, syndicateId: sid, details: `${out.next.component.name} — ${out.next.position.title} — remplace ${out.previous.userId} : ${parsed.data.reason}` });
    res.status(201).json({ data: out.next.a, replaced: out.previous.id });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

// ─── Committee workspace: tasks, recommendations, reports ─────────────────────

/** Who may act in a committee: the syndic administrator, or a member with the capability. */
async function workspaceAccess(req: Request, c: typeof orgComponentsTable.$inferSelect) {
  if (isManager(req)) return { manager: true, member: true, leader: true, caps: new Set<Capability>(CAPABILITIES) };
  const a = await capabilitiesOf(req.user!.userId, c.id);
  return { manager: false, ...a };
}

router.get("/org/components/:id/workspace", requireAuth, async (req, res) => {
  try {
    if (!requireSyndicateScope(req, res)) return;
    const sid = sidOf(req);
    const c = await componentIn(sid, String(req.params.id));
    const acc = await workspaceAccess(req, c);
    if (!acc.member) throw fail(403, "NOT_COMMITTEE_MEMBER", "Réservé aux membres de cette composante");
    const tasks = acc.caps.has("tasks.view")
      ? await db.select().from(orgTasksTable).where(eq(orgTasksTable.componentId, c.id)).orderBy(desc(orgTasksTable.createdAt)).limit(200)
      : [];
    // Read-only views opened by the position's capabilities (never an approval).
    let finance = null;
    if (acc.caps.has("finance.view")) {
      const year = new Date().getUTCFullYear();
      const budgets = await db.select({ year: budgetsTable.year, total: budgetsTable.totalAmount, status: budgetsTable.status }).from(budgetsTable).innerJoin(buildingsTable, eq(buildingsTable.id, budgetsTable.buildingId)).where(and(eq(buildingsTable.syndicateId, sid), eq(budgetsTable.year, year)));
      const expenses = await db.select({ id: expensesTable.id, reference: expensesTable.reference, label: expensesTable.label, amount: expensesTable.amount, status: expensesTable.status, createdAt: expensesTable.createdAt }).from(expensesTable).where(eq(expensesTable.syndicateId, sid)).orderBy(desc(expensesTable.createdAt)).limit(20);
      finance = { budgets, expenses };
    }
    let maintenance = null;
    if (acc.caps.has("maintenance.view")) {
      maintenance = {
        openClaims: await db.select({ id: claimsTable.id, reference: claimsTable.reference, title: claimsTable.title, status: claimsTable.status, priority: claimsTable.priority }).from(claimsTable).where(and(eq(claimsTable.syndicateId, sid), sql`${claimsTable.status} NOT IN ('resolved','closed','rejected')`)).orderBy(desc(claimsTable.createdAt)).limit(20),
      };
    }
    res.json({ data: { component: c, capabilities: [...acc.caps], leader: acc.leader, tasks, finance, maintenance } });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

router.post("/org/components/:id/tasks", requireAuth, async (req, res) => {
  const parsed = z
    .object({ kind: z.enum(["task", "recommendation", "report"]).default("task"), title: z.string().trim().min(3).max(200), description: z.string().trim().max(5000).optional(), assigneeUserId: z.string().optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
    .safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Données invalides", code: "INVALID_TASK" });
  try {
    if (!requireSyndicateScope(req, res)) return;
    const sid = sidOf(req);
    const c = await componentIn(sid, String(req.params.id));
    if (c.status !== "active") throw fail(409, "COMPONENT_NOT_ACTIVE", "Cette composante n'est pas active");
    const acc = await workspaceAccess(req, c);
    const need: Capability = parsed.data.kind === "recommendation" ? "recommendations.create" : parsed.data.kind === "report" ? "reports.create" : "tasks.manage";
    if (!acc.caps.has(need)) throw fail(403, "CAPABILITY_REQUIRED", `Permission requise : ${need}`);
    if (parsed.data.assigneeUserId) {
      const m = await capabilitiesOf(parsed.data.assigneeUserId, c.id);
      if (!m.member) throw fail(400, "ASSIGNEE_NOT_MEMBER", "La tâche ne peut être confiée qu'à un membre de la composante");
    }
    const [t] = await db.insert(orgTasksTable).values({ syndicateId: sid, componentId: c.id, ...parsed.data, createdBy: req.user!.userId }).returning();
    if (t.kind === "recommendation") await createAlert({ key: "org.recommendation", params: { component: c.name, title: t.title }, type: "info", syndicateId: sid, target: "admin" });
    await serverAuditLog(req, { action: "ORG_TASK_CREATED", entity: "org_task", entityId: t.id, syndicateId: sid, details: `${c.name} — ${t.kind} — ${t.title}` });
    res.status(201).json({ data: t });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

router.put("/org/tasks/:id", requireAuth, async (req, res) => {
  const parsed = z.object({ status: z.enum(["open", "in_progress", "done", "cancelled"]) }).safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Statut invalide", code: "INVALID_TASK" });
  try {
    if (!requireSyndicateScope(req, res)) return;
    const sid = sidOf(req);
    const [t] = await db.select().from(orgTasksTable).where(and(eq(orgTasksTable.id, String(req.params.id)), eq(orgTasksTable.syndicateId, sid)));
    if (!t) throw fail(404, "TASK_NOT_FOUND", "Tâche introuvable");
    const c = await componentIn(sid, t.componentId);
    const acc = await workspaceAccess(req, c);
    if (!(acc.caps.has("tasks.manage") || t.assigneeUserId === req.user!.userId)) throw fail(403, "CAPABILITY_REQUIRED", "Permission requise : tasks.manage");
    const [row] = await db.update(orgTasksTable).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(orgTasksTable.id, t.id)).returning();
    await serverAuditLog(req, { action: "ORG_TASK_UPDATED", entity: "org_task", entityId: t.id, syndicateId: sid, details: `${t.title} → ${parsed.data.status}` });
    res.json({ data: row });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

/** The syndic answers a committee's recommendation: his decision, recorded. */
router.post("/org/tasks/:id/respond", requireAuth, async (req, res) => {
  const parsed = z.object({ response: z.enum(["accepted", "declined"]), note: z.string().trim().max(2000).optional() }).safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Réponse invalide", code: "INVALID_RESPONSE" });
  try {
    if (!requireSyndicateScope(req, res)) return;
    if (!isManager(req)) throw fail(403, "SYNDIC_ONLY", "La décision sur une recommandation revient au syndic");
    const sid = sidOf(req);
    const [t] = await db.select().from(orgTasksTable).where(and(eq(orgTasksTable.id, String(req.params.id)), eq(orgTasksTable.syndicateId, sid)));
    if (!t || t.kind !== "recommendation") throw fail(404, "RECOMMENDATION_NOT_FOUND", "Recommandation introuvable");
    const [row] = await db.update(orgTasksTable).set({ syndicResponse: parsed.data.response, syndicResponseNote: parsed.data.note ?? null, status: "done", updatedAt: new Date() }).where(eq(orgTasksTable.id, t.id)).returning();
    await serverAuditLog(req, { action: "ORG_RECOMMENDATION_ANSWERED", entity: "org_task", entityId: t.id, syndicateId: sid, details: `${t.title} → ${parsed.data.response}` });
    res.json({ data: row });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

/** The condominium's people who can be assigned (for the wizard's member picker). */
router.get("/org/people", requireAuth, async (req, res) => {
  try {
    if (!requireSyndicateScope(req, res)) return;
    requireManager(req);
    const sid = sidOf(req);
    const rows = await db
      .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
      .from(usersTable)
      .where(and(eq(usersTable.status, "active"), or(eq(usersTable.syndicateId, sid), sql`EXISTS (SELECT 1 FROM syndicate_memberships m WHERE m.user_id = ${usersTable.id} AND m.syndicate_id = ${sid} AND m.status = 'active')`)))
      .orderBy(asc(usersTable.name))
      .limit(1000);
    res.json({ data: rows });
  } catch (err) {
    sendRouteError(req, res, err);
  }
});

function defaultName(type: string): string {
  return (
    {
      general_assembly: "Assemblée générale",
      syndic: "Syndic",
      vice_syndic: "Syndic adjoint",
      syndicate_council: "Conseil syndical (ensemble immobilier)",
      financial: "Comité financier",
      maintenance: "Comité technique et maintenance",
      security: "Comité sécurité",
      communication: "Comité communication",
      social: "Comité vie sociale",
      environment: "Comité espaces verts et environnement",
      legal: "Comité juridique et conformité",
      audit: "Comité audit et transparence",
      parking: "Comité stationnement et équipements",
      building: "Référents d'immeuble",
      custom: "Composante",
    } as Record<string, string>
  )[type] ?? type;
}

export default router;
