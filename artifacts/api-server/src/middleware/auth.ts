import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { createHash, randomUUID } from "node:crypto";

// Tokens are only ever signed and verified with HS256 — pinning the algorithm
// prevents algorithm-confusion attacks if the secret format ever changes.
const JWT_ALGORITHM = "HS256" as const;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET environment variable is required but was not provided. " +
        "Set it to a strong random string of at least 32 characters.",
    );
  }
  if (secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be at least 32 characters long for security.",
    );
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
  /** "must change password": temporary credentials, restricted session. */
  mcp?: boolean;
}

/** Endpoints a restricted (must-change-password) session may still call. */
const PASSWORD_CHANGE_ALLOWED_PATHS = new Set([
  "/api/auth/change-password",
  "/api/auth/me",
  "/api/auth/logout",
]);

/** Audience of short-lived download tickets (see signFileTicket). */
const FILE_TICKET_AUDIENCE = "file";
const FILE_TICKET_TTL_SECONDS = 5 * 60;

type TokenSource = { raw: string; fromQuery: boolean };

function readRawToken(req: Request): TokenSource | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return { raw: auth.slice(7), fromQuery: false };
  // PDF/file URLs opened via Linking.openURL or <Image> cannot attach an
  // Authorization header; they carry a download ticket in ?token= instead.
  if (typeof req.query.token === "string") {
    return { raw: req.query.token, fromQuery: true };
  }
  return null;
}

/**
 * Verifies a token for the channel it arrived on:
 * - Authorization header → a regular access token (never a download ticket)
 * - ?token= query string  → only a download ticket, only on GET/HEAD.
 * A session token therefore never appears in URLs (proxy logs, browser
 * history, Referer), and a leaked URL is read-only and expires in minutes.
 */
function verifyRequestToken(req: Request, source: TokenSource): JwtPayload {
  const payload = jwt.verify(source.raw, getJwtSecret(), {
    algorithms: [JWT_ALGORITHM],
  }) as JwtPayload & { aud?: string | string[] };
  const isTicket = payload.aud === FILE_TICKET_AUDIENCE;
  if (source.fromQuery) {
    if (!isTicket || (req.method !== "GET" && req.method !== "HEAD")) {
      throw new Error("Query-string tokens must be GET download tickets");
    }
  } else if (isTicket) {
    throw new Error("Download tickets cannot be used as bearer tokens");
  }
  return payload;
}

/** Short-lived, read-only credential for URLs that cannot carry a header. */
export function signFileTicket(user: JwtPayload): string {
  return jwt.sign(
    {
      userId: user.userId,
      email: user.email,
      role: user.role,
      syndicateId: user.syndicateId,
      name: user.name,
    },
    getJwtSecret(),
    {
      algorithm: JWT_ALGORITHM,
      audience: FILE_TICKET_AUDIENCE,
      expiresIn: FILE_TICKET_TTL_SECONDS,
    },
  );
}

export { FILE_TICKET_TTL_SECONDS };

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const source = readRawToken(req);
  if (!source) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }
  let payload: JwtPayload;
  try {
    payload = verifyRequestToken(req, source);
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré" });
    return;
  }
  if (
    payload.mcp &&
    !PASSWORD_CHANGE_ALLOWED_PATHS.has(req.originalUrl.split("?")[0])
  ) {
    res.status(403).json({
      error: "Vous devez changer votre mot de passe temporaire avant de continuer.",
      code: "PASSWORD_CHANGE_REQUIRED",
    });
    return;
  }
  req.user = payload;
  next();
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

/** Finance access: full financial management (admin + treasurer), always syndicate-scoped. */
export function requireFinanceAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }
  if (req.user.role !== "syndicate_admin" && req.user.role !== "treasurer") {
    res.status(403).json({ error: "Accès refusé" });
    return;
  }
  if (!req.user.syndicateId) {
    res.status(403).json({ error: "Syndicat non défini dans le token" });
    return;
  }
  next();
}

/** Governance access: meetings, elections, AG (admin + president + secretary + committee_member) */
export const requireGovernanceAccess = requireRole(
  "syndicate_admin",
  "president",
  "secretary",
  "committee_member",
);

/** Document management access (admin + secretary + president) */
export const requireDocumentAccess = requireRole(
  "syndicate_admin",
  "secretary",
  "president",
);

/** Shorthand: requires super_admin or syndicate_admin role */
export const requireAdmin = requireRole("super_admin", "syndicate_admin");

/** Shorthand: requires tenant (locataire) role */
export const requireTenant = requireRole("tenant");

/** Blocks tenant users — passes members and admins */
export function requireNotTenant(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }
  if (req.user.role === "tenant") {
    res
      .status(403)
      .json({ error: "Accès réservé aux membres et administrateurs" });
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
export function requireOperationalAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }
  const { role } = req.user;
  if (isSyndicateTeamRole(role)) {
    // A management role without a tenant scope must never reach a route that
    // may fall back to a global query. The JWT is the source of truth for
    // syndicate isolation; fail closed before the handler runs.
    if (!req.user.syndicateId) {
      res.status(403).json({ error: "Syndicat non défini dans le token" });
      return;
    }
    next();
    return;
  }
  if (role === "super_admin") {
    if (req.query.supervision !== "true") {
      res.status(403).json({
        error:
          "Les Super Admins doivent activer le mode supervision pour accéder aux opérations d'un syndicat.",
        code: "SUPERVISION_REQUIRED",
        hint: "Ajoutez ?supervision=true à la requête.",
      });
      return;
    }
    next();
    return;
  }
  res
    .status(403)
    .json({ error: "Accès réservé aux membres de l'équipe du syndicat" });
}

/**
 * Asserts that the authenticated user may access a resource belonging to the given syndicate.
 * Returns true if access is allowed, false otherwise.
 * Use this inside route handlers after fetching the resource, to enforce row-level syndicate isolation.
 */
export function assertSyndicateAccess(
  req: Request,
  resourceSyndicateId: string | null | undefined,
): boolean {
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
export function softAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const source = readRawToken(req);
  if (source) {
    try {
      const payload = verifyRequestToken(req, source);
      // A restricted session is treated as anonymous by optional-auth routes.
      if (!payload.mcp) req.user = payload;
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
  const { mcp, ...claims } = payload;
  return jwt.sign(mcp ? { ...claims, mcp: true } : claims, getJwtSecret(), {
    expiresIn: "15m",
    algorithm: JWT_ALGORITHM,
  });
}

/** Refresh token: long-lived (30 days) — the token itself is just a UUID.
 *  The expiry is enforced by the DB row, not the JWT. */
export function signRefreshToken(): string {
  return randomUUID();
}

/**
 * One-way digest used to persist bearer secrets (refresh tokens, password
 * reset tokens). A database leak then exposes no usable session or reset link.
 * SHA-256 is sufficient because the tokens are high-entropy random values.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** bcrypt cost for password hashes (≈250 ms on commodity hardware). */
export const BCRYPT_COST = 12;
