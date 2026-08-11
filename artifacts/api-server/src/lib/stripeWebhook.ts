import Stripe from "stripe";
import { db } from "@workspace/db";
import {
  subscriptionPaymentsTable,
  syndicateSubscriptionsTable,
} from "@workspace/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getStripeClient, getStripeWebhookSecret } from "./stripeClient.js";
import { finalizeSuccessfulPayment } from "../routes/subscriptions.js";
import { logger } from "./logger.js";

function asUnixDate(value: number | null | undefined): Date | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000)
    : undefined;
}

function subscriptionPeriod(subscription: Stripe.Subscription) {
  const periods = subscription.items.data
    .map((item) => ({
      start: item.current_period_start,
      end: item.current_period_end,
    }))
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end));

  if (periods.length === 0) {
    return {
      start: subscription.start_date,
      end: undefined,
    };
  }

  return {
    start: Math.min(...periods.map(({ start }) => start)),
    end: Math.max(...periods.map(({ end }) => end)),
  };
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const subscription = invoice.parent?.subscription_details?.subscription;
  return typeof subscription === "string" ? subscription : subscription?.id;
}

async function markPaymentFailed(paymentId: string, reason: string) {
  const [payment] = await db
    .update(subscriptionPaymentsTable)
    .set({
      status: "failed",
      failureCode: "STRIPE_PAYMENT_FAILED",
      failureMessage: reason.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(subscriptionPaymentsTable.id, paymentId),
        inArray(subscriptionPaymentsTable.status, ["pending", "processing"]),
      ),
    )
    .returning();

  if (payment?.subscriptionId) {
    await db
      .update(syndicateSubscriptionsTable)
      .set({
        status: "cancelled",
        canceledAt: new Date(),
        notes: "Paiement Stripe échoué",
      })
      .where(
        and(
          eq(syndicateSubscriptionsTable.id, payment.subscriptionId),
          eq(syndicateSubscriptionsTable.status, "pending_payment"),
        ),
      );
  }
}

async function syncStripeSubscription(subscription: Stripe.Subscription) {
  const period = subscriptionPeriod(subscription);
  const [payment] = await db
    .select({
      paymentId: subscriptionPaymentsTable.id,
      subscriptionId: subscriptionPaymentsTable.subscriptionId,
    })
    .from(subscriptionPaymentsTable)
    .where(eq(subscriptionPaymentsTable.providerReference, subscription.id))
    .limit(1);

  if (!payment?.subscriptionId) return;

  const status =
    subscription.status === "active"
      ? "active"
      : subscription.status === "trialing"
        ? "trial"
        : subscription.status === "past_due"
          ? "grace"
          : subscription.status === "canceled" ||
              subscription.status === "unpaid" ||
              subscription.status === "incomplete_expired"
            ? "cancelled"
            : "suspended";

  await db
    .update(syndicateSubscriptionsTable)
    .set({
      status,
      autoRenew: !subscription.cancel_at_period_end && status === "active",
      currentPeriodStart: asUnixDate(period.start),
      currentPeriodEnd: asUnixDate(period.end),
      renewalDate: asUnixDate(period.end),
      canceledAt:
        status === "cancelled" ? new Date() : subscription.cancel_at_period_end
          ? asUnixDate(subscription.cancel_at)
          : null,
      gracePeriodEnd: status === "grace" ? asUnixDate(period.end) : null,
    } as any)
    .where(eq(syndicateSubscriptionsTable.id, payment.subscriptionId));
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const paymentId = session.metadata?.paymentId;
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

  if (!paymentId || !subscriptionId) {
    logger.warn({ sessionId: session.id }, "Stripe Checkout session missing payment metadata");
    return;
  }

  if (session.payment_status === "unpaid") return;
  await finalizeSuccessfulPayment(paymentId, subscriptionId);
}

export async function processStripeWebhook(payload: Buffer, signature: string) {
  const stripe = getStripeClient();
  const event = stripe.webhooks.constructEvent(
    payload,
    signature,
    getStripeWebhookSecret(),
  );

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentId = session.metadata?.paymentId;
      if (paymentId) await markPaymentFailed(paymentId, "Le paiement Stripe a échoué");
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncStripeSubscription(event.data.object as Stripe.Subscription);
      break;
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (subscriptionId) {
        await db
          .update(syndicateSubscriptionsTable)
          .set({ status: "grace", notes: "Échec de renouvellement Stripe" })
          .where(
            eq(
              syndicateSubscriptionsTable.id,
              (
                await db
                  .select({ subscriptionId: subscriptionPaymentsTable.subscriptionId })
                  .from(subscriptionPaymentsTable)
                  .where(eq(subscriptionPaymentsTable.providerReference, subscriptionId))
                  .limit(1)
              )[0]?.subscriptionId ?? "",
            ),
          );
      }
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (subscriptionId) {
        await syncStripeSubscription(
          await stripe.subscriptions.retrieve(subscriptionId),
        );
      }
      break;
    }
    default:
      break;
  }
}