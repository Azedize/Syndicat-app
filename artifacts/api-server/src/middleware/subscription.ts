/**
 * Subscription enforcement middleware.
 *
 * requireActiveSubscription — blocks write operations when the syndicate's
 * subscription is expired or suspended (read-only mode).
 */

import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { syndicateSubscriptionsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

function isExpiredStatus(status: string | null, trialEndDate: Date | null, currentPeriodEnd: Date | null): boolean {
  const now = new Date();
  if (status === "suspended" || status === "cancelled") return true;
  if (status === "trial") return trialEndDate ? now > trialEndDate : false;
  if (status === "active") return currentPeriodEnd ? now > currentPeriodEnd : false;
  if (status === "expired") return true;
  return false;
}

export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) { res.status(401).json({ error: "Non authentifié" }); return; }
    // super_admin is not subject to subscription gating
    if (user.role === "super_admin") { next(); return; }
    if (!user.syndicateId) { next(); return; }

    const [sub] = await db
      .select({
        status: syndicateSubscriptionsTable.status,
        trialEndDate: syndicateSubscriptionsTable.trialEndDate,
        currentPeriodEnd: syndicateSubscriptionsTable.currentPeriodEnd,
      })
      .from(syndicateSubscriptionsTable)
      .where(eq(syndicateSubscriptionsTable.syndicateId, user.syndicateId))
      .orderBy(desc(syndicateSubscriptionsTable.createdAt))
      .limit(1);

    if (!sub) { next(); return; } // no subscription = allow (onboarding edge case)

    if (isExpiredStatus(sub.status, sub.trialEndDate, sub.currentPeriodEnd)) {
      res.status(402).json({
        error: "Abonnement expiré ou suspendu. Veuillez renouveler votre abonnement pour continuer.",
        code: "SUBSCRIPTION_REQUIRED",
        upgradeUrl: "/abonnements",
      });
      return;
    }

    next();
  } catch (error) {
    req.log?.error(error, "Subscription verification failed");
    res.status(503).json({
      error: "Vérification de l'abonnement temporairement indisponible. Réessayez.",
      code: "SUBSCRIPTION_CHECK_UNAVAILABLE",
    });
  }
}
