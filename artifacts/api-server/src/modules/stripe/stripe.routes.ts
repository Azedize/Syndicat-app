import { Router } from "express";
import { db } from "@workspace/db";
import { subscriptionPlansTable, subscriptionPaymentsTable, syndicateSubscriptionsTable } from "@workspace/db/schema";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { getStripeClient } from "../../integrations/stripe/stripeClient.js";
import { logger } from "../../lib/logger.js";
import { resolveStripePrice, findOrCreateCustomer } from "./stripe.service.js";

const router = Router();

function stripeSuccessUrl(req: any) {
  return process.env.APP_URL
    ? `${process.env.APP_URL}/abonnements?stripe=success`
    : `${req.protocol}://${req.get("host")}/api/subscriptions/stripe/success`;
}

function stripeCancelUrl(req: any) {
  return process.env.APP_URL
    ? `${process.env.APP_URL}/abonnements?stripe=cancelled`
    : `${req.protocol}://${req.get("host")}/api/subscriptions/stripe/cancel`;
}

router.post("/subscriptions/stripe/checkout", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = req.user!;
    const { planId, billingInterval, syndicateId: requestedSyndicateId } = req.body as {
      planId?: string;
      billingInterval?: "monthly" | "yearly";
      syndicateId?: string;
    };
    if (!planId) return res.status(400).json({ error: "planId est requis" });

    const syndicateId =
      user.role === "super_admin" ? requestedSyndicateId : user.syndicateId;
    if (!syndicateId) return res.status(400).json({ error: "syndicateId est requis" });
    const interval = billingInterval === "yearly" ? "yearly" : "monthly";

    const [plan] = await db
      .select()
      .from(subscriptionPlansTable)
      .where(and(eq(subscriptionPlansTable.id, planId), eq(subscriptionPlansTable.isActive, true)))
      .limit(1);
    if (!plan || plan.isTrial) return res.status(404).json({ error: "Plan payant introuvable" });

    const price = await resolveStripePrice(plan, interval);
    const customer = await findOrCreateCustomer(user.userId, user.email, user.name);
    // One checkout at a time per condominium: concurrent requests (double
    // click, two devices) are serialized by an advisory lock and the second
    // one gets the checkout already started instead of a second subscription.
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`stripe_checkout:${syndicateId}`}))`);
      const [existing] = await tx
        .select()
        .from(subscriptionPaymentsTable)
        .where(
          and(
            eq(subscriptionPaymentsTable.syndicateId, syndicateId),
            eq(subscriptionPaymentsTable.paymentMethod, "card"),
            eq(subscriptionPaymentsTable.provider, "stripe"),
            inArray(subscriptionPaymentsTable.status, ["pending", "processing"]),
          ),
        )
        .limit(1);
      // A checkout that never got its Stripe session (crash between the two
      // steps) is abandoned after 10 minutes instead of blocking forever.
      const stale = existing && !(existing.metadata as any)?.checkoutUrl && Date.now() - new Date(existing.createdAt as any).getTime() > 10 * 60_000;
      if (existing && stale) {
        await tx
          .update(subscriptionPaymentsTable)
          .set({ status: "failed", failureCode: "CHECKOUT_ABANDONED", failureMessage: "Session de paiement jamais créée", updatedAt: new Date() } as any)
          .where(eq(subscriptionPaymentsTable.id, existing.id));
        if (existing.subscriptionId) {
          await tx
            .update(syndicateSubscriptionsTable)
            .set({ status: "cancelled", canceledAt: new Date(), notes: "Paiement Stripe abandonné" } as any)
            .where(and(eq(syndicateSubscriptionsTable.id, existing.subscriptionId), eq(syndicateSubscriptionsTable.status, "pending_payment")));
        }
      } else if (existing) return { existing };
      const [pendingSubscription] = await tx
        .insert(syndicateSubscriptionsTable)
        .values({
          syndicateId,
          planId,
          status: "pending_payment",
          autoRenew: true,
          notes: "Paiement Stripe en attente",
        } as any)
        .returning();
      const [payment] = await tx
        .insert(subscriptionPaymentsTable)
        .values({
          syndicateId,
          subscriptionId: pendingSubscription.id,
          planId,
          idempotencyKey: `stripe_checkout:${randomUUID()}`,
          amount: String(interval === "yearly" ? plan.yearlyPrice : plan.price),
          currency: "MAD",
          billingInterval: interval,
          paymentMethod: "card",
          provider: "stripe",
          status: "pending",
          metadata: {
            planName: plan.name,
            stripeCustomerId: customer.id,
          },
        } as any)
        .returning();
      return { pendingSubscription, payment };
    });

    if ("existing" in created && created.existing) {
      const ex = created.existing;
      const url = (ex.metadata as any)?.checkoutUrl;
      if (url && ex.planId === planId && ex.billingInterval === interval) {
        return res.json({ data: ex, url, duplicate: true });
      }
      return res.status(409).json({
        error: "Un paiement par carte est déjà en cours pour cette copropriété. Terminez-le ou attendez son expiration.",
        code: "CHECKOUT_IN_PROGRESS",
        data: { paymentId: ex.id, url: url ?? null },
      });
    }
    if (!("payment" in created) || !created.payment || !created.pendingSubscription) {
      throw new Error("Paiement non créé");
    }

    const stripe = getStripeClient();
    let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
    try {
      session = await stripe.checkout.sessions.create(
        {
      mode: "subscription",
      customer: customer.id,
      line_items: [{ price: price.id, quantity: 1 }],
      success_url: stripeSuccessUrl(req),
      cancel_url: stripeCancelUrl(req),
      client_reference_id: created.payment.id,
      metadata: {
        paymentId: created.payment.id,
        subscriptionId: created.pendingSubscription.id,
        planId,
        syndicateId,
        billingInterval: interval,
      },
      subscription_data: {
        metadata: {
          paymentId: created.payment.id,
          subscriptionId: created.pendingSubscription.id,
          syndicateId,
          planId,
        },
      },
        },
        // Stripe replays the same session if this exact request is retried.
        { idempotencyKey: created.payment.idempotencyKey ?? `stripe_checkout:${created.payment.id}` },
      );
    } catch (stripeError) {
      // No session: the pending rows must not block nor pretend a checkout exists.
      await db
        .update(subscriptionPaymentsTable)
        .set({ status: "failed", failureCode: "STRIPE_SESSION_FAILED", failureMessage: String((stripeError as Error)?.message ?? "").slice(0, 500), updatedAt: new Date() } as any)
        .where(eq(subscriptionPaymentsTable.id, created.payment.id));
      await db
        .update(syndicateSubscriptionsTable)
        .set({ status: "cancelled", canceledAt: new Date(), notes: "Session de paiement Stripe non créée" } as any)
        .where(and(eq(syndicateSubscriptionsTable.id, created.pendingSubscription.id), eq(syndicateSubscriptionsTable.status, "pending_payment")));
      throw stripeError;
    }

    const [updatedPayment] = await db
      .update(subscriptionPaymentsTable)
      .set({
        providerReference: session.id,
        metadata: {
          ...(created.payment.metadata as any),
          checkoutUrl: session.url,
          checkoutSessionId: session.id,
          stripeCustomerId: customer.id,
        },
        updatedAt: new Date(),
      } as any)
      .where(eq(subscriptionPaymentsTable.id, created.payment.id))
      .returning();

    return res.status(201).json({ data: updatedPayment, url: session.url, duplicate: false });
  } catch (error: any) {
    logger.error(error, "Stripe Checkout creation failed");
    const status = Number(error?.status) || 500;
    if (status < 500) return res.status(status).json({ error: error.message, code: error.code });
    return res.status(500).json({ error: "Impossible de démarrer le paiement Stripe" });
  }
});

router.post("/subscriptions/stripe/portal", requireAuth, requireAdmin, async (req, res) => {
  try {
    const customer = await findOrCreateCustomer(req.user!.userId, req.user!.email, req.user!.name);
    const session = await getStripeClient().billingPortal.sessions.create({
      customer: customer.id,
      return_url: process.env.APP_URL ?? `${req.protocol}://${req.get("host")}/api/subscriptions/my`,
    });
    return res.json({ url: session.url });
  } catch (error) {
    logger.error(error, "Stripe customer portal creation failed");
    return res.status(500).json({ error: "Impossible d'ouvrir le portail Stripe" });
  }
});

export default router;