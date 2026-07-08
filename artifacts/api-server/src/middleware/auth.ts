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

export interface JwtPayload {
  userId: string;
  email: string;
  role: "super_admin" | "syndicate_admin" | "member" | "tenant";
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
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret()) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token invalide ou expiré" });
  }
}

export function requireRole(...roles: JwtPayload["role"][]) {
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
