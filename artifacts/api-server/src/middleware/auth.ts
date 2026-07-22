import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET environment variable is required but was not provided. " +
        "Set it to a strong random string of at least 32 characters.",
    );
  }
  if (secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long for security.");
  }
  return secret;
}

/**
 * All possible user roles in the platform:
 *   super_admin      — SaaS platform owner. Manages syndicates, billing, audit.
 *   syndicate_admin  — Full operational manager of a syndicate.
 *   president        — Elected president: governance, signatures, assemblies.
 *   treasurer        — Elected treasurer: finance, budgets, charges, debt recovery.
 *   secretary        — Appointed secretary: documents, meetings, minutes, publications.
 *   committee_member — Elected council member: participates in votes and meetings (read-only elsewhere).
 *   member           — Co-owner / resident: payments, documents, complaints, votes.
 *   tenant           — Renter: documents, complaints, maintenance requests.
 */
export type UserRole =
  | "super_admin"
  | "syndicate_admin"
  | "president"
  | "treasurer"
  | "secretary"
  | "committee_member"
  | "member"
  | "tenant";

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  syndicateId?: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  // Also accept ?token= query param so PDF/file URLs opened via Linking.openURL
  // (which cannot attach Authorization headers) still authenticate correctly.
  const queryToken = typeof req.query.token === "string" ? req.query.token : null;
  const rawToken = auth?.startsWith("Bearer ") ? auth.slice(7) : queryToken;
  if (!rawToken) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }
  try {
    const payload = jwt.verify(rawToken, getJwtSecret()) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré" });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Non authentifié" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Accès refusé" });
      return;
    }
    next();
  };
}

/** All roles that form the syndicate management team (not residents or platform owner) */
export const SYNDICATE_TEAM_ROLES: UserRole[] = [
  "syndicate_admin",
  "president",
  "treasurer",
  "secretary",
  "committee_member",
];

/** Returns true if the given role is part of the syndicate management team */
export function isSyndicateTeamRole(role: UserRole): boolean {
  return SYNDICATE_TEAM_ROLES.includes(role);
}

/** Any syndicate management team member (all 5 management roles) */
export const requireSyndicateTeam = requireRole(...SYNDICATE_TEAM_ROLES);

/** Finance access: full financial management (admin + treasurer) */
export const requireFinanceAccess = requireRole("syndicate_admin", "treasurer");

/** Governance access: meetings, elections, AG (admin + president + secretary + committee_member) */
export const requireGovernanceAccess = requireRole(
  "syndicate_admin", "president", "secretary", "committee_member"
);

/** Document management access (admin + secretary + president) */
export const requireDocumentAccess = requireRole(
  "syndicate_admin", "secretary", "president"
);

/** Shorthand: requires super_admin or syndicate_admin role */
export const requireAdmin = requireRole("super_admin", "syndicate_admin");

/** Shorthand: requires tenant (locataire) role */
export const requireTenant = requireRole("tenant");

/** Blocks tenant users — passes members and admins */
export function requireNotTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.user) { res.status(401).json({ error: "Non authentifié" }); return; }
  if (req.user.role === "tenant") {
    res.status(403).json({ error: "Accès réservé aux membres et administrateurs" });
    return;
  }
  next();
}

/** Shorthand: requires super_admin only */
export const requireSuperAdmin = requireRole("super_admin");

/** Shorthand: requires syndicate_admin only */
export const requireSyndicateAdmin = requireRole("syndicate_admin");

/** Shorthand: requires member only */
export const requireMember = requireRole("member");

/** Shorthand: requires tenant role specifically */
export const requireTenantOnly = requireRole("tenant");

/**
 * Operational route guard — for day-to-day syndicate management routes.
 * - syndicate management team (syndicate_admin, president, treasurer, secretary,
 *   committee_member): access scoped to their syndicate via JWT syndicateId.
 * - super_admin: must pass ?supervision=true to access another syndicate's data.
 * - member / tenant: blocked (403)
 */
export function requireOperationalAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) { res.status(401).json({ error: "Non authentifié" }); return; }
  const { role } = req.user;
  if (isSyndicateTeamRole(role)) { next(); return; }
  if (role === "super_admin") {
    if (req.query.supervision !== "true") {
      res.status(403).json({
        error: "Les Super Admins doivent activer le mode supervision pour accéder aux opérations d'un syndicat.",
        code: "SUPERVISION_REQUIRED",
        hint: "Ajoutez ?supervision=true à la requête.",
      });
      return;
    }
    next();
    return;
  }
  res.status(403).json({ error: "Accès réservé aux membres de l'équipe du syndicat" });
}

/**
 * Asserts that the authenticated user may access a resource belonging to the given syndicate.
 * Returns true if access is allowed, false otherwise.
 * Use this inside route handlers after fetching the resource, to enforce row-level syndicate isolation.
 */
export function assertSyndicateAccess(req: Request, resourceSyndicateId: string | null | undefined): boolean {
  if (!req.user) return false;
  const { role, syndicateId } = req.user;
  if (role === "super_admin") return true;
  return resourceSyndicateId === syndicateId;
}

/**
 * Soft (optional) JWT decoder — sets req.user if a valid bearer token is present,
 * silently skips otherwise. Never rejects the request. Intended as a global
 * pre-middleware so downstream middleware (e.g. subscription enforcement) can
 * read req.user before route-level requireAuth runs.
 */
export function softAuth(req: Request, _res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  const queryToken = typeof req.query.token === "string" ? req.query.token : null;
  const rawToken = auth?.startsWith("Bearer ") ? auth.slice(7) : queryToken;
  if (rawToken) {
    try {
      const payload = jwt.verify(rawToken, getJwtSecret()) as JwtPayload;
      req.user = payload;
    } catch {
      // invalid/expired token — leave req.user unset, let requireAuth reject it
    }
  }
  next();
}

/** Validates at startup — throws if JWT_SECRET is missing so misconfiguration is caught immediately */
export function validateAuthConfig(): void {
  getJwtSecret();
}

/** Access token: short-lived (15 min) */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "15m" });
}

/** Refresh token: long-lived (30 days) — the token itself is just a UUID.
 *  The expiry is enforced by the DB row, not the JWT. */
export function signRefreshToken(): string {
  return crypto.randomUUID();
}
