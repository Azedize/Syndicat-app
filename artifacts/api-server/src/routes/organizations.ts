import { Router, type Request } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  organizationMembersTable,
  organizationsTable,
  refreshTokensTable,
  syndicateMembershipsTable,
  syndicatesTable,
  usersTable,
} from "@workspace/db/schema";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { serverAuditLog } from "../lib/audit.js";
import { FinanceError, sendFinanceError, uniqueViolation } from "../lib/treasury.js";
import { orgRoleOf, portfolioSyndicateIds, resolveContextRole, TEAM_ROLES, type OrgRole } from "../lib/access.js";
import { assignTrial } from "./subscriptions.js";

/**
 * Syndic companies, their condominiums and who may act in each.
 *
 *  - org_admin  manages the company: creates condominiums, changes their
 *               lifecycle, assigns staff, sees the whole portfolio, and acts
 *               as syndicate_admin in every condominium of the company.
 *  - org_staff  sees and acts only in the condominiums they are assigned to,
 *               with the role of each assignment.
 *  - a condominium's syndicate_admin may manage that condominium's
 *    assignments and settings.
 *
 * Every authorization is read from the database: identifiers in the URL or
 * body only name the target, they never grant anything.
 */
const router = Router();

// ─── Authorization helpers ────────────────────────────────────────────────────

/** Caller's role in the company; unknown company and no membership look the same (404). */
async function requireOrgRole(req: Request, organizationId: string, roles: OrgRole["role"][]): Promise<OrgRole | null> {
  const user = req.user!;
  const [org] = await db.select({ id: organizationsTable.id }).from(organizationsTable).where(eq(organizationsTable.id, organizationId));
  if (!org) throw new FinanceError(404, "ORGANIZATION_NOT_FOUND", "Société de syndic introuvable");
  if (user.role === "super_admin") return null; // platform owner
  const role = await orgRoleOf(user.userId, organizationId);
  if (!role) throw new FinanceError(404, "ORGANIZATION_NOT_FOUND", "Société de syndic introuvable");
  if (!roles.includes(role.role)) throw new FinanceError(403, "FORBIDDEN", "Action réservée aux administrateurs de la société");
  return role;
}

async function loadCondominium(syndicateId: string) {
  const [s] = await db.select().from(syndicatesTable).where(eq(syndicatesTable.id, syndicateId));
  if (!s) throw new FinanceError(404, "CONDOMINIUM_NOT_FOUND", "Copropriété introuvable");
  return s;
}

/**
 * Who may manage a condominium: super admin, an org_admin of its company,
 * or (when allowed) the condominium's syndicate_admin.
 */
async function requireCondominiumManager(req: Request, syndicateId: string, opts: { allowSyndicateAdmin: boolean }) {
  const user = req.user!;
  const condo = await loadCondominium(syndicateId);
  if (user.role === "super_admin") return { condo, asOrgAdmin: true };
  const orgRole = condo.organizationId ? await orgRoleOf(user.userId, condo.organizationId) : null;
  if (orgRole?.role === "org_admin") return { condo, asOrgAdmin: true };
  if (opts.allowSyndicateAdmin) {
    const ctx = await resolveContextRole(user.userId, syndicateId);
    if (ctx?.role === "syndicate_admin") return { condo, asOrgAdmin: false };
  }
  // No grant: indistinguishable from a missing condominium.
  if (!orgRole && !(await resolveContextRole(user.userId, syndicateId))) {
    throw new FinanceError(404, "CONDOMINIUM_NOT_FOUND", "Copropriété introuvable");
  }
  throw new FinanceError(403, "FORBIDDEN", "Action réservée à l'administration de la copropriété");
}

async function findUserByEmail(email: string) {
  const [u] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, status: usersTable.status, role: usersTable.role })
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = lower(${email})`);
  if (!u) throw new FinanceError(404, "USER_NOT_FOUND", "Aucun compte MIZAN avec cet email : invitez d'abord la personne (Équipe).");
  if (u.status !== "active") throw new FinanceError(409, "USER_DISABLED", "Ce compte est désactivé");
  if (u.role === "super_admin") throw new FinanceError(400, "INVALID_USER", "Compte plateforme");
  return u;
}

/** Ends the sessions a person opened in a condominium (their next refresh falls back home). */
async function revokeContextSessions(userId: string, syndicateId: string) {
  await db
    .update(refreshTokensTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokensTable.userId, userId),
        eq(refreshTokensTable.contextSyndicateId, syndicateId),
        isNull(refreshTokensTable.revokedAt),
      ),
    );
}

// ─── Companies ────────────────────────────────────────────────────────────────

router.get("/organizations/mine", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select({ id: organizationsTable.id, name: organizationsTable.name, status: organizationsTable.status, role: organizationMembersTable.role })
      .from(organizationMembersTable)
      .innerJoin(organizationsTable, eq(organizationsTable.id, organizationMembersTable.organizationId))
      .where(and(eq(organizationMembersTable.userId, req.user!.userId), eq(organizationMembersTable.status, "active")))
      .orderBy(asc(organizationsTable.name));
    res.json({ data: rows });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

const orgSchema = z.object({
  name: z.string().trim().min(2).max(160),
  legalName: z.string().trim().max(200).optional(),
  iceNumber: z.string().trim().regex(/^\d{15}$/, "ICE invalide (15 chiffres)").optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
});

/** Platform owner registers a syndic company and its first administrator. */
router.post("/organizations", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "super_admin") throw new FinanceError(403, "FORBIDDEN", "Réservé à la plateforme");
    const parsed = orgSchema.extend({ adminEmail: z.string().trim().email() }).strict().safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message, code: "INVALID_ORGANIZATION" });
    const { adminEmail, ...data } = parsed.data;
    const admin = await findUserByEmail(adminEmail);
    const org = await db.transaction(async (tx) => {
      const [o] = await tx.insert(organizationsTable).values({ ...data, createdBy: req.user!.userId }).returning();
      await tx.insert(organizationMembersTable).values({ organizationId: o.id, userId: admin.id, role: "org_admin", grantedBy: req.user!.userId });
      return o;
    });
    await serverAuditLog(req, { action: "ORGANIZATION_CREATED", entity: "organization", entityId: org.id, details: org.name, platformAction: true });
    res.status(201).json({ data: org });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

router.patch("/organizations/:id", requireAuth, async (req, res) => {
  try {
    await requireOrgRole(req, String(req.params.id), ["org_admin"]);
    const parsed = orgSchema.partial().strict().safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message, code: "INVALID_ORGANIZATION" });
    const [o] = await db.update(organizationsTable).set(parsed.data).where(eq(organizationsTable.id, String(req.params.id))).returning();
    await serverAuditLog(req, { action: "ORGANIZATION_UPDATED", entity: "organization", entityId: o.id, details: JSON.stringify(parsed.data), platformAction: true });
    res.json({ data: o });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

// Company staff
router.get("/organizations/:id/members", requireAuth, async (req, res) => {
  try {
    await requireOrgRole(req, String(req.params.id), ["org_admin"]);
    const rows = await db
      .select({
        id: organizationMembersTable.id,
        userId: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: organizationMembersTable.role,
        status: organizationMembersTable.status,
        createdAt: organizationMembersTable.createdAt,
        revokedAt: organizationMembersTable.revokedAt,
      })
      .from(organizationMembersTable)
      .innerJoin(usersTable, eq(usersTable.id, organizationMembersTable.userId))
      .where(eq(organizationMembersTable.organizationId, String(req.params.id)))
      .orderBy(asc(usersTable.name));
    res.json({ data: rows });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

router.post("/organizations/:id/members", requireAuth, async (req, res) => {
  try {
    const orgId = String(req.params.id);
    await requireOrgRole(req, orgId, ["org_admin"]);
    const parsed = z.object({ email: z.string().trim().email(), role: z.enum(["org_admin", "org_staff"]) }).strict().safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message, code: "INVALID_MEMBER" });
    const target = await findUserByEmail(parsed.data.email);
    let row;
    try {
      [row] = await db
        .insert(organizationMembersTable)
        .values({ organizationId: orgId, userId: target.id, role: parsed.data.role, grantedBy: req.user!.userId })
        .returning();
    } catch (err) {
      if (uniqueViolation(err) !== null) throw new FinanceError(409, "ALREADY_MEMBER", "Cette personne fait déjà partie de la société");
      throw err;
    }
    await serverAuditLog(req, { action: "ORGANIZATION_MEMBER_ADDED", entity: "organization", entityId: orgId, details: `${target.email} ${parsed.data.role}`, platformAction: true });
    res.status(201).json({ data: row });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

router.delete("/organizations/:id/members/:memberId", requireAuth, async (req, res) => {
  try {
    const orgId = String(req.params.id);
    await requireOrgRole(req, orgId, ["org_admin"]);
    const revoked = await db.transaction(async (tx) => {
      const [m] = await tx
        .select()
        .from(organizationMembersTable)
        .where(and(eq(organizationMembersTable.id, String(req.params.memberId)), eq(organizationMembersTable.organizationId, orgId), eq(organizationMembersTable.status, "active")))
        .for("update");
      if (!m) throw new FinanceError(404, "MEMBER_NOT_FOUND", "Membre introuvable");
      if (m.role === "org_admin") {
        const [{ n }] = (await tx.execute(sql`SELECT COUNT(*)::int AS n FROM organization_members WHERE organization_id = ${orgId} AND status = 'active' AND role = 'org_admin'`)) as unknown as { n: number }[];
        if (n <= 1) throw new FinanceError(409, "LAST_ADMIN", "La société doit garder au moins un administrateur");
      }
      const [row] = await tx
        .update(organizationMembersTable)
        .set({ status: "revoked", revokedAt: new Date(), revokedBy: req.user!.userId })
        .where(eq(organizationMembersTable.id, m.id))
        .returning();
      return row;
    });
    // Sessions opened through company administration end now.
    const condos = await db.select({ id: syndicatesTable.id }).from(syndicatesTable).where(eq(syndicatesTable.organizationId, orgId));
    for (const c of condos) await revokeContextSessions(revoked.userId, c.id);
    await serverAuditLog(req, { action: "ORGANIZATION_MEMBER_REVOKED", entity: "organization", entityId: orgId, details: revoked.userId, platformAction: true });
    res.json({ data: revoked, message: "Accès retiré" });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

// ─── Condominiums ─────────────────────────────────────────────────────────────

const LANGS = ["fr", "ar", "en", "es"] as const;
const condoSchema = z.object({
  name: z.string().trim().min(2, "Le nom de la copropriété est obligatoire").max(200),
  address: z.string().trim().min(3, "L'adresse est obligatoire").max(300),
  city: z.string().trim().min(2, "La ville est obligatoire").max(100),
  email: z.string().trim().email("Email invalide").optional(),
  phone: z.string().trim().max(30).optional(),
  registrationNumber: z.string().trim().max(60).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/, "Devise invalide (code ISO, ex. MAD)").default("MAD"),
  defaultLanguage: z.enum(LANGS).default("fr"),
  fiscalYearStartMonth: z.number().int().min(1).max(12).default(1),
});

router.get("/organizations/:id/condominiums", requireAuth, async (req, res) => {
  try {
    const orgId = String(req.params.id);
    const role = await requireOrgRole(req, orgId, ["org_admin", "org_staff"]);
    const ids = role ? await portfolioSyndicateIds(req.user!.userId, orgId, role.role) : null;
    const rows = await db
      .select()
      .from(syndicatesTable)
      .where(and(eq(syndicatesTable.organizationId, orgId), ...(ids ? [ids.length ? inArray(syndicatesTable.id, ids) : sql`false`] : [])))
      .orderBy(asc(syndicatesTable.name));
    res.json({ data: rows });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

/**
 * Creates a condominium in the company (status draft until configured).
 * Retry-safe: the same Idempotency-Key returns the condominium already
 * created; two live condominiums of a company cannot share a name.
 */
router.post("/organizations/:id/condominiums", requireAuth, async (req, res) => {
  try {
    const orgId = String(req.params.id);
    await requireOrgRole(req, orgId, ["org_admin"]);
    const parsed = condoSchema.strict().safeParse(req.body);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return void res.status(400).json({ error: i?.message ?? "Données invalides", field: i?.path.join("."), code: "INVALID_CONDOMINIUM" });
    }
    const key = req.header("Idempotency-Key")?.trim() || null;
    if (key && !/^[A-Za-z0-9_\-:.]{8,100}$/.test(key)) throw new FinanceError(400, "INVALID_IDEMPOTENCY_KEY", "En-tête Idempotency-Key invalide");
    if (key) {
      const [existing] = await db
        .select()
        .from(syndicatesTable)
        .where(and(eq(syndicatesTable.organizationId, orgId), eq(syndicatesTable.creationKey, key)));
      if (existing) return void res.status(200).json({ data: existing, replayed: true });
    }
    const condo = await db.transaction(async (tx) => {
      let created;
      try {
        [created] = await tx
          .insert(syndicatesTable)
          .values({
            ...parsed.data,
            sector: "copropriete",
            organizationId: orgId,
            status: "draft",
            statusChangedAt: new Date(),
            creationKey: key,
          })
          .returning();
      } catch (err) {
        const c = uniqueViolation(err);
        if (c?.includes("creation_key")) throw new FinanceError(409, "IDEMPOTENCY_CONFLICT", "Création déjà en cours");
        if (c?.includes("org_name")) throw new FinanceError(409, "CONDOMINIUM_EXISTS", "Une copropriété de la société porte déjà ce nom");
        throw err;
      }
      await assignTrial(created.id, tx);
      return created;
    });
    await serverAuditLog(req, { action: "CONDOMINIUM_CREATED", entity: "syndicate", entityId: condo.id, syndicateId: condo.id, details: condo.name, platformAction: true });
    res.status(201).json({ data: condo });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

router.get("/condominiums/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    const user = req.user!;
    const condo = await loadCondominium(id);
    const allowed =
      user.role === "super_admin" ||
      (condo.organizationId && (await orgRoleOf(user.userId, condo.organizationId))?.role === "org_admin") ||
      TEAM_ROLES.includes(((await resolveContextRole(user.userId, id))?.role ?? "") as (typeof TEAM_ROLES)[number]);
    if (!allowed) throw new FinanceError(404, "CONDOMINIUM_NOT_FOUND", "Copropriété introuvable");
    res.json({ data: condo });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

const settingsSchema = condoSchema.partial().strict();

/** Settings. The currency cannot change once money has been recorded (no silent conversion). */
router.patch("/condominiums/:id/settings", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    const { condo } = await requireCondominiumManager(req, id, { allowSyndicateAdmin: true });
    if (condo.status === "archived") throw new FinanceError(423, "CONDOMINIUM_ARCHIVED", "Copropriété archivée");
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message, code: "INVALID_CONDOMINIUM" });
    if (parsed.data.currency && parsed.data.currency !== condo.currency) {
      const [{ n }] = (await db.execute(sql`
        SELECT (SELECT COUNT(*) FROM ledger_entries WHERE syndicate_id = ${id})
             + (SELECT COUNT(*) FROM appels_de_fonds a JOIN buildings b ON b.id = a.building_id WHERE b.syndicate_id = ${id}) AS n`)) as unknown as { n: string }[];
      if (Number(n) > 0) throw new FinanceError(409, "CURRENCY_LOCKED", "Des opérations financières existent : la devise ne peut plus être changée.");
    }
    let row;
    try {
      [row] = await db.update(syndicatesTable).set(parsed.data).where(eq(syndicatesTable.id, id)).returning();
    } catch (err) {
      if (uniqueViolation(err)?.includes("org_name")) throw new FinanceError(409, "CONDOMINIUM_EXISTS", "Une copropriété de la société porte déjà ce nom");
      throw err;
    }
    await serverAuditLog(req, { action: "CONDOMINIUM_SETTINGS_UPDATED", entity: "syndicate", entityId: id, syndicateId: id, details: JSON.stringify(parsed.data) });
    res.json({ data: row });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

/**
 * Lifecycle transitions (company administrators only):
 *   draft → active (needs at least one building)  · active ↔ suspended
 *   draft | active | suspended → archived (reason, no payment under review)
 * Archiving never deletes or moves anything.
 */
const TRANSITIONS: Record<string, string[]> = {
  draft: ["active", "archived"],
  active: ["suspended", "archived"],
  suspended: ["active", "archived"],
  archived: [],
};

router.post("/condominiums/:id/status", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    await requireCondominiumManager(req, id, { allowSyndicateAdmin: false });
    const parsed = z
      .object({ status: z.enum(["active", "suspended", "archived"]), reason: z.string().trim().max(500).optional() })
      .strict()
      .refine((d) => d.status === "active" || (d.reason ?? "").length >= 3, { message: "Un motif est obligatoire", path: ["reason"] })
      .safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message, code: "INVALID_STATUS" });
    const next = parsed.data.status;
    const updated = await db.transaction(async (tx) => {
      const [condo] = await tx.select().from(syndicatesTable).where(eq(syndicatesTable.id, id)).for("update");
      const from = condo.status ?? "active";
      if (!TRANSITIONS[from]?.includes(next)) {
        throw new FinanceError(409, "INVALID_TRANSITION", `Passage ${from} → ${next} impossible`);
      }
      if (next === "active" && from === "draft") {
        const [{ n }] = (await tx.execute(sql`SELECT COUNT(*)::int AS n FROM buildings WHERE syndicate_id = ${id}`)) as unknown as { n: number }[];
        if (n === 0) throw new FinanceError(409, "NOT_CONFIGURED", "Ajoutez au moins un immeuble avant d'ouvrir la copropriété");
      }
      if (next === "archived") {
        const [{ n }] = (await tx.execute(sql`SELECT COUNT(*)::int AS n FROM appel_payments WHERE syndicate_id = ${id} AND status = 'pending'`)) as unknown as { n: number }[];
        if (n > 0) throw new FinanceError(409, "PAYMENT_UNDER_REVIEW", "Des paiements attendent une validation : traitez-les avant d'archiver");
      }
      const [row] = await tx
        .update(syndicatesTable)
        .set({
          status: next,
          statusReason: parsed.data.reason ?? null,
          statusChangedAt: new Date(),
          ...(next === "archived" ? { archivedAt: new Date() } : {}),
        })
        .where(eq(syndicatesTable.id, id))
        .returning();
      return { row, from };
    });
    await serverAuditLog(req, {
      action: "CONDOMINIUM_STATUS_CHANGED",
      entity: "syndicate",
      entityId: id,
      syndicateId: id,
      details: `${updated.from} → ${next}${parsed.data.reason ? ` — ${parsed.data.reason}` : ""}`,
    });
    res.json({ data: updated.row });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

// ─── Assignments (who acts in a condominium, with which role) ───────────────

router.get("/condominiums/:id/memberships", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    await requireCondominiumManager(req, id, { allowSyndicateAdmin: true });
    const [assignments, home] = await Promise.all([
      db
        .select({
          id: syndicateMembershipsTable.id,
          userId: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          role: syndicateMembershipsTable.role,
          status: syndicateMembershipsTable.status,
          createdAt: syndicateMembershipsTable.createdAt,
          revokedAt: syndicateMembershipsTable.revokedAt,
        })
        .from(syndicateMembershipsTable)
        .innerJoin(usersTable, eq(usersTable.id, syndicateMembershipsTable.userId))
        .where(eq(syndicateMembershipsTable.syndicateId, id))
        .orderBy(asc(usersTable.name)),
      // Team accounts whose home condominium is this one (managed in « Équipe »).
      db
        .select({ userId: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role })
        .from(usersTable)
        .where(and(eq(usersTable.syndicateId, id), inArray(usersTable.role, [...TEAM_ROLES]), eq(usersTable.status, "active"))),
    ]);
    res.json({ data: { assignments, homeTeam: home } });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

const assignSchema = z.object({ email: z.string().trim().email(), role: z.enum(TEAM_ROLES) }).strict();

router.post("/condominiums/:id/memberships", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    const { condo } = await requireCondominiumManager(req, id, { allowSyndicateAdmin: true });
    if (condo.status === "archived") throw new FinanceError(423, "CONDOMINIUM_ARCHIVED", "Copropriété archivée");
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message, code: "INVALID_ASSIGNMENT" });
    const target = await findUserByEmail(parsed.data.email);
    let row;
    try {
      [row] = await db
        .insert(syndicateMembershipsTable)
        .values({ syndicateId: id, userId: target.id, role: parsed.data.role, grantedBy: req.user!.userId })
        .returning();
    } catch (err) {
      if (uniqueViolation(err) !== null) throw new FinanceError(409, "ALREADY_ASSIGNED", "Cette personne est déjà affectée à la copropriété (modifiez son rôle)");
      throw err;
    }
    await serverAuditLog(req, { action: "ASSIGNMENT_GRANTED", entity: "syndicate", entityId: id, syndicateId: id, details: `${target.email} → ${parsed.data.role}` });
    res.status(201).json({ data: row });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

router.patch("/condominiums/:id/memberships/:mid", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    await requireCondominiumManager(req, id, { allowSyndicateAdmin: true });
    const parsed = z.object({ role: z.enum(TEAM_ROLES) }).strict().safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: parsed.error.issues[0]?.message, code: "INVALID_ASSIGNMENT" });
    const [row] = await db
      .update(syndicateMembershipsTable)
      .set({ role: parsed.data.role })
      .where(and(eq(syndicateMembershipsTable.id, String(req.params.mid)), eq(syndicateMembershipsTable.syndicateId, id), eq(syndicateMembershipsTable.status, "active")))
      .returning();
    if (!row) throw new FinanceError(404, "ASSIGNMENT_NOT_FOUND", "Affectation introuvable");
    // The old role's sessions stop at once (the token role no longer matches);
    // the person switches again to get the new role.
    await revokeContextSessions(row.userId, id);
    await serverAuditLog(req, { action: "ASSIGNMENT_ROLE_CHANGED", entity: "syndicate", entityId: id, syndicateId: id, details: `${row.userId} → ${row.role}` });
    res.json({ data: row });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

router.delete("/condominiums/:id/memberships/:mid", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id);
    await requireCondominiumManager(req, id, { allowSyndicateAdmin: true });
    const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 300) : null;
    const [row] = await db
      .update(syndicateMembershipsTable)
      .set({ status: "revoked", revokedAt: new Date(), revokedBy: req.user!.userId, revokeReason: reason })
      .where(and(eq(syndicateMembershipsTable.id, String(req.params.mid)), eq(syndicateMembershipsTable.syndicateId, id), eq(syndicateMembershipsTable.status, "active")))
      .returning();
    if (!row) throw new FinanceError(404, "ASSIGNMENT_NOT_FOUND", "Affectation introuvable");
    await revokeContextSessions(row.userId, id);
    await serverAuditLog(req, { action: "ASSIGNMENT_REVOKED", entity: "syndicate", entityId: id, syndicateId: id, details: `${row.userId} (${row.role})${reason ? ` — ${reason}` : ""}` });
    res.json({ data: row, message: "Accès retiré immédiatement" });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

// ─── Portfolio ────────────────────────────────────────────────────────────────

const METRIC_DEFINITIONS = {
  condominiums: "Copropriétés visibles par vous dans la société (toutes pour un administrateur, celles qui vous sont affectées sinon).",
  activeCondominiums: "Copropriétés au statut « active ».",
  buildings: "Immeubles enregistrés.",
  units: "Lots non archivés.",
  vacantUnits: "Lots non archivés au statut « vacant ».",
  coOwners: "Personnes distinctes (par email) propriétaires d'au moins un lot à ce jour — une personne présente dans plusieurs copropriétés n'est comptée qu'une fois dans le total.",
  outstanding: "Somme, par devise, du reste dû (montant − payé validé) des appels de fonds non soldés et non annulés.",
  overdueCalls: "Appels de fonds au statut « en retard ».",
  paymentsToValidate: "Déclarations de paiement en attente de validation.",
  openIncidents: "Tickets ouverts / en cours + sinistres non clos + interventions non terminées.",
  treasury: "Solde du journal de trésorerie, par devise.",
} as const;

router.get("/organizations/:id/portfolio", requireAuth, async (req, res) => {
  try {
    const orgId = String(req.params.id);
    const role = await requireOrgRole(req, orgId, ["org_admin", "org_staff"]);
    const ids = role ? await portfolioSyndicateIds(req.user!.userId, orgId, role.role) : (await db.select({ id: syndicatesTable.id }).from(syndicatesTable).where(eq(syndicatesTable.organizationId, orgId))).map((r) => r.id);
    if (ids.length === 0) {
      return void res.json({ data: { condominiums: [], totals: null, definitions: METRIC_DEFINITIONS } });
    }
    const list = sql.join(ids.map((i) => sql`${i}`), sql`, `);
    // One row per condominium; every figure is computed by PostgreSQL from
    // the condominium's own records (a record belongs to exactly one
    // condominium, so summing rows never double-counts).
    const rows = (await db.execute(sql`
      SELECT s.id, s.name, s.city, s.status, s.currency,
        (SELECT COUNT(*)::int FROM buildings b WHERE b.syndicate_id = s.id) AS buildings,
        (SELECT COUNT(*)::int FROM lots l JOIN buildings b ON b.id = l.building_id WHERE b.syndicate_id = s.id AND l.archived_at IS NULL) AS units,
        (SELECT COUNT(*)::int FROM lots l JOIN buildings b ON b.id = l.building_id WHERE b.syndicate_id = s.id AND l.archived_at IS NULL AND l.status = 'vacant') AS vacant_units,
        (SELECT COUNT(DISTINCT lower(m.email))::int FROM lot_ownerships o JOIN members m ON m.id = o.member_id
          WHERE o.syndicate_id = s.id AND o.start_date <= CURRENT_DATE AND (o.end_date IS NULL OR o.end_date > CURRENT_DATE)) AS co_owners,
        (SELECT COALESCE(SUM(a.amount - a.amount_paid), 0) FROM appels_de_fonds a JOIN buildings b ON b.id = a.building_id
          WHERE b.syndicate_id = s.id AND a.status NOT IN ('paid', 'cancelled')) AS outstanding,
        (SELECT COUNT(*)::int FROM appels_de_fonds a JOIN buildings b ON b.id = a.building_id WHERE b.syndicate_id = s.id AND a.status = 'overdue') AS overdue_calls,
        (SELECT COUNT(*)::int FROM appel_payments p WHERE p.syndicate_id = s.id AND p.status = 'pending') AS payments_to_validate,
        (SELECT COUNT(*)::int FROM support_tickets t WHERE t.syndicate_id = s.id AND t.status IN ('open', 'in_progress'))
          + (SELECT COUNT(*)::int FROM sinistres x JOIN buildings b ON b.id = x.building_id WHERE b.syndicate_id = s.id AND COALESCE(x.status, 'declared') NOT IN ('resolved', 'closed'))
          + (SELECT COUNT(*)::int FROM travaux w JOIN buildings b ON b.id = w.building_id WHERE b.syndicate_id = s.id AND COALESCE(w.status, 'reported') NOT IN ('completed', 'cancelled')) AS open_incidents,
        (SELECT COALESCE(SUM(CASE WHEN le.direction = 'in' THEN le.amount ELSE -le.amount END), 0) FROM ledger_entries le WHERE le.syndicate_id = s.id) AS treasury
      FROM syndicates s
      WHERE s.id IN (${list})
      ORDER BY s.name
    `)) as unknown as Record<string, any>[];
    const coOwnersTotal = (await db.execute(sql`
      SELECT COUNT(DISTINCT lower(m.email))::int AS n FROM lot_ownerships o JOIN members m ON m.id = o.member_id
      WHERE o.syndicate_id IN (${list}) AND o.start_date <= CURRENT_DATE AND (o.end_date IS NULL OR o.end_date > CURRENT_DATE)
    `)) as unknown as { n: number }[];

    const byCurrency = (field: string) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(r.currency, Math.round(((m.get(r.currency) ?? 0) + Number(r[field])) * 100) / 100);
      return [...m].map(([currency, amount]) => ({ currency, amount: amount.toFixed(2) }));
    };
    const sum = (field: string) => rows.reduce((s, r) => s + Number(r[field] ?? 0), 0);
    const condominiums = rows.map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city,
      status: r.status,
      currency: r.currency,
      buildings: r.buildings,
      units: r.units,
      vacantUnits: r.vacant_units,
      coOwners: r.co_owners,
      outstanding: Number(r.outstanding).toFixed(2),
      overdueCalls: r.overdue_calls,
      paymentsToValidate: r.payments_to_validate,
      openIncidents: r.open_incidents,
      treasury: Number(r.treasury).toFixed(2),
    }));
    res.json({
      data: {
        condominiums,
        totals: {
          condominiums: rows.length,
          activeCondominiums: rows.filter((r) => r.status === "active").length,
          buildings: sum("buildings"),
          units: sum("units"),
          vacantUnits: sum("vacant_units"),
          coOwners: coOwnersTotal[0]?.n ?? 0,
          outstanding: byCurrency("outstanding"),
          overdueCalls: sum("overdue_calls"),
          paymentsToValidate: sum("payments_to_validate"),
          openIncidents: sum("open_incidents"),
          treasury: byCurrency("treasury"),
        },
        definitions: METRIC_DEFINITIONS,
      },
    });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

/** Drill-down: the records behind a portfolio figure, for an authorized condominium. */
async function requirePortfolioAccess(req: Request, orgId: string, syndicateId: string) {
  const role = await requireOrgRole(req, orgId, ["org_admin", "org_staff"]);
  if (!role) return; // super admin
  const ids = await portfolioSyndicateIds(req.user!.userId, orgId, role.role);
  if (!ids.includes(syndicateId)) throw new FinanceError(404, "CONDOMINIUM_NOT_FOUND", "Copropriété introuvable");
}

router.get("/organizations/:id/portfolio/:syndicateId/outstanding", requireAuth, async (req, res) => {
  try {
    await requirePortfolioAccess(req, String(req.params.id), String(req.params.syndicateId));
    const rows = await db.execute(sql`
      SELECT a.id, a.period, a.type, a.status, a.due_date, a.amount, a.amount_paid, a.amount - a.amount_paid AS remaining,
             l.number AS lot_number, m.name AS owner_name
      FROM appels_de_fonds a
      JOIN buildings b ON b.id = a.building_id
      JOIN lots l ON l.id = a.lot_id
      LEFT JOIN members m ON m.id = a.owner_id
      WHERE b.syndicate_id = ${String(req.params.syndicateId)} AND a.status NOT IN ('paid', 'cancelled')
      ORDER BY a.due_date NULLS LAST, l.number
      LIMIT 500
    `);
    res.json({ data: rows });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

router.get("/organizations/:id/portfolio/:syndicateId/incidents", requireAuth, async (req, res) => {
  try {
    const sid = String(req.params.syndicateId);
    await requirePortfolioAccess(req, String(req.params.id), sid);
    const rows = await db.execute(sql`
      SELECT 'ticket' AS kind, t.id, t.title AS label, t.status, t.created_at FROM support_tickets t
        WHERE t.syndicate_id = ${sid} AND t.status IN ('open', 'in_progress')
      UNION ALL
      SELECT 'sinistre', x.id, x.type || ' — ' || left(x.description, 80), COALESCE(x.status, 'declared'), x.created_at FROM sinistres x
        JOIN buildings b ON b.id = x.building_id
        WHERE b.syndicate_id = ${sid} AND COALESCE(x.status, 'declared') NOT IN ('resolved', 'closed')
      UNION ALL
      SELECT 'travaux', w.id, w.title, COALESCE(w.status, 'reported'), w.created_at FROM travaux w
        JOIN buildings b ON b.id = w.building_id
        WHERE b.syndicate_id = ${sid} AND COALESCE(w.status, 'reported') NOT IN ('completed', 'cancelled')
      ORDER BY created_at DESC
      LIMIT 500
    `);
    res.json({ data: rows });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

export default router;
