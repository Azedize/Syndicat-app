import { Request } from "express";
import { eq, SQL } from "drizzle-orm";
import { AnyColumn } from "drizzle-orm";

/**
 * Returns a Drizzle WHERE condition for syndicateId scoping.
 *
 * - super_admin with no ?syndicateId= → no filter (sees all)
 * - super_admin with ?syndicateId=X  → filters to X
 * - any other role                   → filters to their own syndicateId
 */
export function syndicateWhere(req: Request, column: AnyColumn): SQL | undefined {
  if (req.user!.role === "super_admin") {
    const sid = req.query.syndicateId as string | undefined;
    if (!sid) return undefined;
    return eq(column, sid);
  }
  if (!req.user!.syndicateId) {
    throw Object.assign(new Error("Syndicat non défini dans le token"), { status: 403 });
  }
  return eq(column, req.user!.syndicateId);
}

/**
 * Returns the effective syndicateId for INSERT operations.
 * For super_admin, uses the ?syndicateId= query param or falls back to body.syndicateId.
 */
export function effectiveSyndicateId(req: Request, bodyValue?: string): string {
  if (req.user!.role === "super_admin") {
    const sid = (req.query.syndicateId as string | undefined) ?? bodyValue;
    if (!sid) {
      throw Object.assign(new Error("syndicateId est requis"), { status: 400 });
    }
    return sid;
  }
  if (!req.user!.syndicateId) {
    throw Object.assign(new Error("Syndicat non défini dans le token"), { status: 403 });
  }
  return req.user!.syndicateId;
}
