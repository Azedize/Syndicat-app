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

interface SubscriptionWindow {
  status: string | null;
  trialEndDate: Date | null;
  currentPeriodEnd: Date | null;
  gracePeriodEnd: Date | null;
}

/**
 * Deny-by-default: only an explicitly valid window grants write access.
 * - trial  → requires a trial end date in the future
 * - active → valid until currentPeriodEnd; a null end date is an open-ended
 *            grant, which only a super_admin can set (PUT /subscriptions/:id)
 * - grace  → valid until gracePeriodEnd (a missing end date is NOT unlimited)
 * - pending_payment, suspended, cancelled, expired, unknown → read-only
 */
export function isWritableSubscription(sub: SubscriptionWindow, now = new Date()): boolean {
  switch (sub.status) {
    case "trial":
      return !!sub.trialEndDate && now <= sub.trialEndDate;
    case "active":
      return !sub.currentPeriodEnd || now <= sub.currentPeriodEnd;
    case "grace":
      return !!sub.gracePeriodEnd && now <= sub.gracePeriodEnd;
    default:
      return false;
  }
}

export async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) { res.status(401).json({ error: "Non authentifié" }); return; }
    // super_admin is not subject to subscription gating
    if (user.role === "super_admin") { next(); return; }
    if (!user.syndicateId) { next(); return; }

    // Consider every subscription row, not only the newest: starting a plan
    // change creates a new `pending_payment` row, which must not lock out a
    // syndicate whose current subscription is still valid.
    const subs = await db
      .select({
        status: syndicateSubscriptionsTable.status,
        trialEndDate: syndicateSubscriptionsTable.trialEndDate,
        currentPeriodEnd: syndicateSubscriptionsTable.currentPeriodEnd,
        gracePeriodEnd: syndicateSubscriptionsTable.gracePeriodEnd,
      })
      .from(syndicateSubscriptionsTable)
      .where(eq(syndicateSubscriptionsTable.syndicateId, user.syndicateId))
      .orderBy(desc(syndicateSubscriptionsTable.createdAt))
      .limit(20);

    // No subscription at all is not a free pass: every syndicate receives a
    // trial at creation, so its absence means read-only until one exists.
    if (!subs.some((sub) => isWritableSubscription(sub))) {
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
