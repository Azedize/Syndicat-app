import { db } from "@workspace/db";
import { refreshTokensTable, otpTokensTable, usersTable } from "@workspace/db/schema";
import { eq, and, gt, count } from "drizzle-orm";
import { signToken, signRefreshToken, hashToken, type JwtPayload } from "../../middleware/auth.js";
import { listContexts, resolveContextRole, type ContextRole } from "../../lib/access.js";

/** Access token for the account, in a condominium context (default: home). */
export function accessTokenFor(user: SessionUser, context?: ContextRole | null): string {
  return signToken({
    userId: user.id,
    email: user.email,
    role: (context?.role ?? user.role) as JwtPayload["role"],
    syndicateId: context?.syndicateId ?? user.syndicateId ?? undefined,
    name: user.name,
    mcp: user.mustChangePassword || undefined,
  });
}

/**
 * Context a new session starts in: the home condominium, or — for an account
 * that only works through assignments (company staff) — the first
 * condominium it can act in.
 */
export async function defaultContext(user: SessionUser): Promise<ContextRole | null> {
  if (user.role === "super_admin") return null;
  if (user.syndicateId) return resolveContextRole(user.id, user.syndicateId);
  const [first] = (await listContexts(user.id)).filter((c) => c.status !== "archived");
  return first ? { syndicateId: first.syndicateId, role: first.role, via: first.via } : null;
}

/** Issues a refresh token bound to a context; only its SHA-256 digest is stored. */
export async function issueRefreshToken(userId: string, contextSyndicateId?: string | null): Promise<string> {
  const token = signRefreshToken();
  await db.insert(refreshTokensTable).values({
    userId,
    token: hashToken(token),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    contextSyndicateId: contextSyndicateId ?? null,
  });
  return token;
}

// ─── Durable OTP rate limit (per email, 5 sends/hour) ────────────────────────
export async function checkOtpRate(email: string): Promise<boolean> {
  const since = new Date(Date.now() - 3600_000);
  const [{ value }] = await db
    .select({ value: count() })
    .from(otpTokensTable)
    .where(
      and(
        eq(otpTokensTable.email, email),
        eq(otpTokensTable.purpose, "email_verification"),
        gt(otpTokensTable.createdAt, since),
      ),
    );
  return Number(value) < 5;
}

export type SessionUser = typeof usersTable.$inferSelect;

export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
