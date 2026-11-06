import type { NextFunction, Request, Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { JwtPayload, UserRole } from "../middleware/auth.js";

/**
 * Condominium access & session context.
 *
 * A session acts in one condominium (syndicate) at a time: the access token
 * carries { syndicateId, role } and every route scopes data to it. A person
 * may act in a condominium through:
 *   - their home context  (users.syndicate_id + users.role),
 *   - an assignment       (syndicate_memberships, one role per condominium),
 *   - their syndic company (organization_members role org_admin → acts as
 *     syndicate_admin in every condominium of the company).
 *
 * The token is never trusted on its own: every authenticated request is
 * re-checked here against the database, so a revoked assignment, a disabled
 * account, a role change or an archived condominium takes effect on the very
 * next request — including download tickets — not when the token expires.
 */

export const TEAM_ROLES = ["syndicate_admin", "president", "treasurer", "secretary", "committee_member"] as const;
export type CondominiumStatus = "draft" | "active" | "suspended" | "archived";

export interface ContextRole {
  syndicateId: string;
  role: UserRole;
  via: "home" | "membership" | "org_admin";
}

/** Role a person may act with in a condominium, or null (no access). */
export async function resolveContextRole(userId: string, syndicateId: string): Promise<ContextRole | null> {
  const rows = (await db.execute(sql`
    SELECT u.role AS home_role, u.syndicate_id AS home_syndicate, u.status AS user_status,
      (SELECT m.role FROM syndicate_memberships m
        WHERE m.user_id = u.id AND m.syndicate_id = ${syndicateId} AND m.status = 'active' LIMIT 1) AS membership_role,
      EXISTS (SELECT 1 FROM organization_members om JOIN syndicates s ON s.organization_id = om.organization_id
        WHERE om.user_id = u.id AND s.id = ${syndicateId} AND om.status = 'active' AND om.role = 'org_admin') AS org_admin
    FROM users u WHERE u.id = ${userId}
  `)) as unknown as { home_role: string; home_syndicate: string | null; user_status: string; membership_role: string | null; org_admin: boolean }[];
  const r = rows[0];
  if (!r || r.user_status !== "active") return null;
  // The strongest grant wins: company administration, then an explicit
  // assignment, then the home context.
  if (r.org_admin) return { syndicateId, role: "syndicate_admin", via: "org_admin" };
  if (r.membership_role) return { syndicateId, role: r.membership_role as UserRole, via: "membership" };
  if (r.home_syndicate === syndicateId) return { syndicateId, role: r.home_role as UserRole, via: "home" };
  return null;
}

export interface AccessibleContext {
  syndicateId: string;
  name: string;
  city: string | null;
  status: CondominiumStatus;
  organizationId: string | null;
  organizationName: string | null;
  role: UserRole;
  via: ContextRole["via"];
}

/** Every condominium the person can switch to (archived ones only for company admins). */
export async function listContexts(userId: string): Promise<AccessibleContext[]> {
  const rows = (await db.execute(sql`
    WITH grants AS (
      SELECT u.syndicate_id AS syndicate_id, u.role AS role, 'home' AS via, 3 AS rank
        FROM users u WHERE u.id = ${userId} AND u.syndicate_id IS NOT NULL AND u.status = 'active'
      UNION ALL
      SELECT m.syndicate_id, m.role, 'membership', 2
        FROM syndicate_memberships m WHERE m.user_id = ${userId} AND m.status = 'active'
      UNION ALL
      SELECT s.id, 'syndicate_admin', 'org_admin', 1
        FROM organization_members om JOIN syndicates s ON s.organization_id = om.organization_id
        WHERE om.user_id = ${userId} AND om.status = 'active' AND om.role = 'org_admin'
    ), best AS (
      SELECT DISTINCT ON (syndicate_id) syndicate_id, role, via FROM grants ORDER BY syndicate_id, rank
    )
    SELECT b.syndicate_id, b.role, b.via, s.name, s.city, s.status, s.organization_id, o.name AS organization_name
    FROM best b
    JOIN syndicates s ON s.id = b.syndicate_id
    LEFT JOIN organizations o ON o.id = s.organization_id
    WHERE s.status <> 'archived' OR b.via = 'org_admin'
    ORDER BY o.name NULLS LAST, s.name
  `)) as unknown as Record<string, any>[];
  return rows.map((r) => ({
    syndicateId: r.syndicate_id,
    name: r.name,
    city: r.city,
    status: r.status,
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    role: r.role,
    via: r.via,
  }));
}

type Decision =
  | { ok: true; status: CondominiumStatus | null; orgAdmin: boolean }
  | { ok: false; http: number; code: string; message: string };

/** Is the token's { userId, syndicateId, role } still a valid grant right now? */
export async function checkSessionAccess(p: JwtPayload): Promise<Decision> {
  const rows = (await db.execute(sql`
    SELECT u.status AS user_status, u.role AS home_role, u.syndicate_id AS home_syndicate,
      floor(extract(epoch FROM u.password_changed_at))::bigint AS password_changed_s,
      s.id AS syndicate_id, s.status AS syndicate_status, o.status AS org_status,
      (SELECT m.role FROM syndicate_memberships m
        WHERE m.user_id = u.id AND m.syndicate_id = s.id AND m.status = 'active' LIMIT 1) AS membership_role,
      EXISTS (SELECT 1 FROM organization_members om
        WHERE om.user_id = u.id AND om.organization_id = s.organization_id AND om.status = 'active' AND om.role = 'org_admin') AS org_admin
    FROM users u
    LEFT JOIN syndicates s ON s.id = ${p.syndicateId ?? null}
    LEFT JOIN organizations o ON o.id = s.organization_id
    WHERE u.id = ${p.userId}
  `)) as unknown as Record<string, any>[];
  const r = rows[0];
  const revoked = (message: string): Decision => ({ ok: false, http: 401, code: "SESSION_CONTEXT_REVOKED", message });
  if (!r || r.user_status !== "active") return { ok: false, http: 401, code: "ACCOUNT_DISABLED", message: "Compte désactivé ou introuvable" };
  // A token issued before the last password change (reset or change) is closed:
  // a reset usually means the old password leaked. Same second = after (iat is in seconds).
  if (r.password_changed_s != null && typeof p.iat === "number" && p.iat < Number(r.password_changed_s)) {
    return { ok: false, http: 401, code: "SESSION_PASSWORD_CHANGED", message: "Mot de passe modifié : reconnectez-vous." };
  }

  if (p.role === "super_admin") {
    return r.home_role === "super_admin" ? { ok: true, status: null, orgAdmin: false } : revoked("Accès plateforme révoqué");
  }
  if (!p.syndicateId) {
    // Account without a condominium yet (syndic before onboarding).
    return r.home_role === p.role && !r.home_syndicate ? { ok: true, status: null, orgAdmin: false } : revoked("Session à renouveler");
  }
  if (!r.syndicate_id) return revoked("Copropriété introuvable");

  const granted =
    (p.role === "syndicate_admin" && r.org_admin) ||
    r.membership_role === p.role ||
    (r.home_syndicate === p.syndicateId && r.home_role === p.role);
  if (!granted) return revoked("Votre accès à cette copropriété a changé : reconnectez-vous.");

  const status: CondominiumStatus = r.org_status === "suspended" && r.syndicate_status === "active" ? "suspended" : r.syndicate_status;
  return { ok: true, status, orgAdmin: !!r.org_admin };
}

/** Paths that manage condominiums themselves and do their own authorization. */
// Personal-data rights (Loi 09-08: access to one's own data, proof of consent)
// apply whatever the lifecycle of the condominium.
const LIFECYCLE_EXEMPT = [
  /^\/api\/auth\//,
  /^\/api\/organizations(\/|$)/,
  /^\/api\/condominiums(\/|$)/,
  /^\/api\/me\/contexts$/,
  /^\/api\/me\/terms-acceptances$/,
  /^\/api\/me\/data-export$/,
  /^\/api\/me\/email-change\/(request|confirm)$/,
  /^\/api\/me\/account\/delete$/,
  /^\/api\/users\/push-token$/,
];
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Global middleware (after softAuth): rejects tokens whose grant no longer
 * exists and applies the condominium lifecycle:
 *  - draft:     configuration in progress — team only, residents refused;
 *  - active:    normal operation;
 *  - suspended: read-only for everybody (writes → 423);
 *  - archived:  history kept, readable only by the syndic company's
 *               administrators, no writes at all.
 */
export async function enforceSessionContext(req: Request, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) return next();
  try {
    const decision = await checkSessionAccess(user);
    if (!decision.ok) {
      return void res.status(decision.http).json({ error: decision.message, code: decision.code });
    }
    const path = req.originalUrl.split("?")[0];
    if (LIFECYCLE_EXEMPT.some((re) => re.test(path)) || user.role === "super_admin") return next();
    const resident = user.role === "member" || user.role === "tenant";
    switch (decision.status) {
      case "draft":
        if (resident) {
          return void res.status(403).json({ error: "Cette copropriété n'est pas encore ouverte.", code: "CONDOMINIUM_NOT_ACTIVE" });
        }
        break;
      case "suspended":
        if (!READ_METHODS.has(req.method)) {
          return void res.status(423).json({ error: "Copropriété suspendue : consultation seule.", code: "CONDOMINIUM_SUSPENDED" });
        }
        break;
      case "archived":
        if (!decision.orgAdmin) {
          return void res.status(403).json({ error: "Cette copropriété est archivée.", code: "CONDOMINIUM_ARCHIVED" });
        }
        if (!READ_METHODS.has(req.method)) {
          return void res.status(423).json({ error: "Copropriété archivée : consultation seule.", code: "CONDOMINIUM_ARCHIVED" });
        }
        break;
    }
    next();
  } catch (err) {
    req.log?.error?.(err);
    res.status(503).json({ error: "Vérification d'accès indisponible. Réessayez.", code: "ACCESS_CHECK_UNAVAILABLE" });
  }
}

// ─── Company-level authorization ─────────────────────────────────────────────

export interface OrgRole {
  organizationId: string;
  role: "org_admin" | "org_staff";
}

/** The person's role in a syndic company (null if none). */
export async function orgRoleOf(userId: string, organizationId: string): Promise<OrgRole | null> {
  const rows = (await db.execute(sql`
    SELECT om.role FROM organization_members om JOIN organizations o ON o.id = om.organization_id
    WHERE om.user_id = ${userId} AND om.organization_id = ${organizationId} AND om.status = 'active'
    LIMIT 1
  `)) as unknown as { role: OrgRole["role"] }[];
  return rows[0] ? { organizationId, role: rows[0].role } : null;
}

/** Condominiums of a company the person may see in the portfolio (admin: all; staff: assigned). */
export async function portfolioSyndicateIds(userId: string, organizationId: string, role: OrgRole["role"]): Promise<string[]> {
  const rows = (await db.execute(
    role === "org_admin"
      ? sql`SELECT id FROM syndicates WHERE organization_id = ${organizationId}`
      : sql`SELECT s.id FROM syndicates s
            WHERE s.organization_id = ${organizationId}
              AND (EXISTS (SELECT 1 FROM syndicate_memberships m WHERE m.syndicate_id = s.id AND m.user_id = ${userId} AND m.status = 'active')
                   OR EXISTS (SELECT 1 FROM users u WHERE u.id = ${userId} AND u.syndicate_id = s.id
                              AND u.role IN ('syndicate_admin', 'president', 'treasurer', 'secretary', 'committee_member')))`,
  )) as unknown as { id: string }[];
  return rows.map((r) => r.id);
}
