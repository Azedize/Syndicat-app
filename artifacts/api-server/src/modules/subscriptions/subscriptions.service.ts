// Abonnements : statut, moyens de paiement, finalisation d'un paiement, essai gratuit.

import { db } from "@workspace/db";
import {
  subscriptionPlansTable,
  syndicateSubscriptionsTable,
  billingInvoicesTable,
  subscriptionPaymentsTable,
} from "@workspace/db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";

// ─── Helpers ────────────────────────────────────────────────────────────────

export function computeSubscriptionStatus(sub: {
  status: string | null;
  trialEndDate: Date | null;
  currentPeriodEnd: Date | null;
  gracePeriodEnd: Date | null;
}) {
  const now = new Date();
  const status = sub.status ?? "trial";

  if (status === "trial") {
    if (sub.trialEndDate && now > sub.trialEndDate) return "expired";
    return "trial";
  }
  if (status === "active") {
    if (sub.currentPeriodEnd && now > sub.currentPeriodEnd) {
      if (sub.gracePeriodEnd && now <= sub.gracePeriodEnd) return "grace";
      return "expired";
    }
    return "active";
  }
  return status;
}

export function getDaysRemaining(date: Date | null): number | null {
  if (!date) return null;
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function enrichSubscription(sub: any, plan: any) {
  const effectiveStatus = computeSubscriptionStatus(sub);
  const isExpired =
    effectiveStatus === "expired" || effectiveStatus === "suspended";
  const isReadOnly = isExpired;
  const isTrial = effectiveStatus === "trial";
  const isGrace = effectiveStatus === "grace";

  const expiryDate = isTrial ? sub.trialEndDate : sub.currentPeriodEnd;
  const daysRemaining = getDaysRemaining(expiryDate);

  return {
    ...sub,
    effectiveStatus,
    isExpired,
    isReadOnly,
    isTrial,
    isGrace,
    daysRemaining,
    expiryDate: expiryDate
      ? expiryDate instanceof Date
        ? expiryDate.toISOString()
        : expiryDate
      : null,
    plan: plan ?? null,
  };
}

export const PAYMENT_METHODS = [
  {
    id: "card",
    label: "Carte bancaire",
    configured: () =>
      Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY),
    provider: "stripe",
  },
  {
    id: "paypal",
    label: "PayPal",
    // No PayPal integration exists (no order creation, no verified webhook):
    // credentials alone must not offer a method nobody can complete.
    configured: () => false,
    provider: "paypal",
  },
  // Bank transfer does not require a third-party credential: the transfer
  // remains pending until a super_admin confirms it.
  {
    id: "bank_transfer",
    label: "Virement bancaire",
    configured: () => true,
    provider: "bank_transfer",
  },
  {
    id: "moroccan_gateway",
    label: "Passerelle marocaine",
    // Not integrated: the provider (CMI or another acquirer) and its technical
    // specification (payment page, signed server notification) must be
    // contracted first. See PAYMENT_PROVIDERS.md.
    configured: () => false,
    provider: "moroccan_gateway",
  },
] as const;

export function availablePaymentMethods() {
  return PAYMENT_METHODS.map((method) => ({
    id: method.id,
    label: method.label,
    provider: method.provider,
    configured: method.configured(),
  }));
}

export function paymentMethodConfig(methodId: string) {
  return PAYMENT_METHODS.find((method) => method.id === methodId);
}

export function periodEndFrom(start: Date, interval: string) {
  const end = new Date(start);
  if (interval === "yearly") end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end;
}


export async function finalizeSuccessfulPayment(
  paymentId: string,
  providerReference?: string,
) {
  return db.transaction(async (tx) => {
    // Row lock: two deliveries of the same confirmation (provider retry,
    // double click) are serialized, and the second one sees "succeeded".
    const [payment] = await tx
      .select()
      .from(subscriptionPaymentsTable)
      .where(eq(subscriptionPaymentsTable.id, paymentId))
      .limit(1)
      .for("update");
    if (!payment)
      throw Object.assign(new Error("Paiement introuvable"), {
        status: 404,
        code: "PAYMENT_NOT_FOUND",
      });
    if (payment.status === "refunded") {
      throw Object.assign(
        new Error("Un paiement remboursé ne peut pas être réactivé"),
        { status: 409, code: "PAYMENT_REFUNDED" },
      );
    }
    if (payment.status === "succeeded") {
      const [existing] = await tx
        .select()
        .from(syndicateSubscriptionsTable)
        .where(eq(syndicateSubscriptionsTable.id, payment.subscriptionId ?? ""))
        .limit(1);
      return {
        payment: existing
          ? { ...payment, subscriptionId: existing.id }
          : payment,
        duplicate: true,
      };
    }
    if (!["pending", "processing"].includes(payment.status)) {
      throw Object.assign(
        new Error("Le paiement n'est pas confirmable dans son état actuel"),
        { status: 409, code: "PAYMENT_STATE_INVALID" },
      );
    }

    const now = new Date();
    const periodEnd = periodEndFrom(now, payment.billingInterval);
    const [current] = await tx
      .select()
      .from(syndicateSubscriptionsTable)
      .where(
        and(
          eq(syndicateSubscriptionsTable.syndicateId, payment.syndicateId),
          inArray(syndicateSubscriptionsTable.status, [
            "active",
            "trial",
            "grace",
            "pending_payment",
          ]),
        ),
      )
      .orderBy(desc(syndicateSubscriptionsTable.createdAt))
      .limit(1);

    if (
      current &&
      current.id !== payment.subscriptionId &&
      ["active", "trial", "grace"].includes(current.status ?? "")
    ) {
      await tx
        .update(syndicateSubscriptionsTable)
        .set({ status: "cancelled", canceledAt: now })
        .where(eq(syndicateSubscriptionsTable.id, current.id));
    }

    const [subscription] = await tx
      .update(syndicateSubscriptionsTable)
      .set({
        status: "active",
        autoRenew: true,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        renewalDate: periodEnd,
        activatedAt: now,
        canceledAt: null,
      })
      .where(
        and(
          eq(syndicateSubscriptionsTable.id, payment.subscriptionId ?? ""),
          eq(syndicateSubscriptionsTable.status, "pending_payment"),
        ),
      )
      .returning();
    if (!subscription) {
      throw Object.assign(
        new Error(
          "La souscription en attente est introuvable ou déjà finalisée",
        ),
        { status: 409, code: "SUBSCRIPTION_FINALIZATION_CONFLICT" },
      );
    }

    const invoiceNumber = `INV-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${payment.id.slice(0, 8).toUpperCase()}`;
    const [invoice] = await tx
      .insert(billingInvoicesTable)
      .values({
        syndicateId: payment.syndicateId,
        subscriptionId: subscription.id,
        paymentId: payment.id,
        invoiceNumber,
        amount: payment.amount,
        status: "paid",
        dueDate: now,
        paidAt: now,
        description: `Abonnement ${payment.planId} — ${payment.billingInterval === "yearly" ? "annuel" : "mensuel"}`,
        periodStart: now,
        periodEnd,
      } as any)
      .returning();

    const [updatedPayment] = await tx
      .update(subscriptionPaymentsTable)
      .set({
        status: "succeeded",
        providerReference: providerReference ?? payment.providerReference,
        subscriptionId: subscription.id,
        invoiceId: invoice.id,
        processedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(subscriptionPaymentsTable.id, payment.id),
          inArray(subscriptionPaymentsTable.status, ["pending", "processing"]),
        ),
      )
      .returning();
    if (!updatedPayment) {
      throw Object.assign(new Error("Le paiement a déjà été traité"), {
        status: 409,
        code: "PAYMENT_ALREADY_PROCESSED",
      });
    }
    return { payment: updatedPayment, subscription, invoice, duplicate: false };
  });
}

type TrialExecutor = Pick<typeof db, "select" | "insert">;

/** Creates the 30-day trial. Pass the onboarding transaction so a syndicate is
 *  never committed without the subscription that makes it writable. */
export async function assignTrial(
  syndicateId: string,
  executor: TrialExecutor = db,
): Promise<any> {
  // Find the trial plan
  const [trialPlan] = await executor
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.isTrial, true))
    .limit(1);

  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + 30);

  const [sub] = await executor
    .insert(syndicateSubscriptionsTable)
    .values({
      syndicateId,
      planId: trialPlan?.id ?? null,
      status: "trial",
      autoRenew: false,
      trialStartDate: now,
      trialEndDate: trialEnd,
    } as any)
    .returning();

  return sub;
}
