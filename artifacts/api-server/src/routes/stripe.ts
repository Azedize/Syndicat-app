import { Router } from "express";
import { db } from "@workspace/db";
import {
  subscriptionPlansTable,
  subscriptionPaymentsTable,
  syndicateSubscriptionsTable,
  usersTable,
} from "@workspace/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { getStripeClient } from "../lib/stripeClient.js";
import { logger } from "../lib/logger.js";

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

function envPriceKey(planId: string) {
  return `STRIPE_PRICE_${planId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;
}

async function resolveStripePrice(
  plan: { id: string; price: string | null; yearlyPrice: string | null },
  interval: "monthly" | "yearly",
) {
  const stripe = getStripeClient();
  const expectedAmount = Number(interval === "yearly" ? plan.yearlyPrice : plan.price);
  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
    throw Object.assign(new Error("Le prix du plan n'est pas configuré"), {
      status: 409,
      code: "PLAN_PRICE_NOT_CONFIGURED",
    });
  }

  const configuredPriceId = process.env[envPriceKey(plan.id)];
  if (configuredPriceId) {
    const price = await stripe.prices.retrieve(configuredPriceId);
    if (
      !price.active ||
      price.type !== "recurring" ||
      price.currency !== "mad" ||
      price.unit_amount !== Math.round(expectedAmount * 100) ||
      price.recurring?.interval !== (interval === "yearly" ? "year" : "month")
    ) {
      throw Object.assign(new Error("Le prix Stripe configuré ne correspond pas au plan"), {
        status: 409,
        code: "STRIPE_PRICE_MISMATCH",
      });
    }
    return price;
  }

  const products = await stripe.products.list({ active: true, limit: 100 });
  const product = products.data.find((candidate) => candidate.metadata?.mizanPlanId === plan.id);
  if (!product) {
    throw Object.assign(
      new Error("Aucun produit Stripe n'est associé à ce plan. Exécutez seed-stripe-products."),
      { status: 409, code: "STRIPE_PRICE_NOT_CONFIGURED" },
    );
  }

  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  const price = prices.data.find(
    (candidate) =>
      candidate.type === "recurring" &&
      candidate.currency === "mad" &&
      candidate.unit_amount === Math.round(expectedAmount * 100) &&
      candidate.recurring?.interval === (interval === "yearly" ? "year" : "month"),
  );
  if (!price) {
    throw Object.assign(new Error("Aucun prix Stripe correspondant à ce plan"), {
      status: 409,
      code: "STRIPE_PRICE_NOT_CONFIGURED",
    });
  }
  return price;
}

async function findOrCreateCustomer(userId: string, email: string, name: string) {
  const stripe = getStripeClient();
  const existing = await stripe.customers.search({
    query: `metadata['mizanUserId']:'${userId.replaceAll("'", "")}'`,
    limit: 1,
  });
  if (existing.data[0]) return existing.data[0];
  return stripe.customers.create({
    email,
    name,
    metadata: { mizanUserId: userId },
  });
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

    const [existingPayment] = await db
      .select()
      .from(subscriptionPaymentsTable)
      .where(
        and(
          eq(subscriptionPaymentsTable.syndicateId, syndicateId),
          eq(subscriptionPaymentsTable.planId, planId),
          eq(subscriptionPaymentsTable.billingInterval, interval),
          eq(subscriptionPaymentsTable.paymentMethod, "card"),
          inArray(subscriptionPaymentsTable.status, ["pending", "processing"]),
        ),
      )
      .limit(1);
    if (existingPayment?.metadata && (existingPayment.metadata as any).checkoutUrl) {
      return res.json({
        data: existingPayment,
        url: (existingPayment.metadata as any).checkoutUrl,
        duplicate: true,
      });
    }

    const price = await resolveStripePrice(plan, interval);
    const customer = await findOrCreateCustomer(user.userId, user.email, user.name);
    const idempotencyKey = `stripe_checkout:${customer.id}:${planId}:${interval}:${Date.now()}`;

    const created = await db.transaction(async (tx) => {
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
          idempotencyKey,
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

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
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
    });

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