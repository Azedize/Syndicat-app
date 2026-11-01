import { Request, Response } from "express";

// ─── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Chat data is syndicate-scoped for every non-platform session. A malformed
 * or partially migrated JWT must not be allowed to continue with an empty
 * scope, even when the requested resource is addressed by a direct ID.
 */
export function hasChatSyndicateScope(req: Request, res: Response): boolean {
  if (req.user?.role !== "super_admin" && !req.user?.syndicateId) {
    res.status(403).json({
      error: "Syndicat non défini dans le token",
      code: "SYNDICATE_SCOPE_REQUIRED",
    });
    return false;
  }
  return true;
}
