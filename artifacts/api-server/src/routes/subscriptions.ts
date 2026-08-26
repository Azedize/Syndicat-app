import { Router } from "express";
import { db } from "@workspace/db";
import {
  subscriptionPlansTable,
  syndicateSubscriptionsTable,
  syndicatesTable,
  billingInvoicesTable,
  subscriptionPaymentsTable,
} from "@workspace/db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import {
  requireAuth,
  requireAdmin,
  requireRole,
  requireSuperAdmin,
} from "../middleware/auth.js";
import { logger } from "../lib/logger.js";
import { serverAuditLog } from "../lib/audit.js";

const router = Router();

function requireSubscriptionScope(
  req: any,
  res: any,
  next: any,
  requireSupervisionForSuperAdmin = false,
): void {
  if (req.user.role !== "super_admin" && !req.user.syndicateId) {
    res.status(403).json({ error: "Syndicat non défini dans le token" });
    return;
  }
  if (
    requireSupervisionForSuperAdmin &&
    req.user.role === "super_admin" &&
    (req.query.supervision !== "true" || !requestedSyndicateId(req))
  ) {
    res.status(403).json({
      error:
        "La supervision et un syndicat cible sont requis pour cette opération.",
      code: "SUPERVISION_REQUIRED",
    });
    return;
  }
  next();
}

function requestedSyndicateId(req: any): string | undefined {
  const value =
    typeof req.query?.syndicateId === "string"
      ? req.query.syndicateId.trim()
      : "";
  return value || undefined;
}

function assertSupervisedTarget(
  req: any,
  res: any,
  resourceSyndicateId: string | null | undefined,
): boolean {
  if (req.user?.role !== "super_admin") return true;
  const targetSyndicateId = requestedSyndicateId(req);
  if (
    req.query?.supervision !== "true" ||
    !targetSyndicateId ||
    resourceSyndicateId !== targetSyndicateId
  ) {
    res.status(404).json({ error: "Ressource introuvable" });
    return false;
  }
  return true;
}

function requireSupervisedTargetWhenProvided(
  req: any,
  res: any,
  next: any,
): void {
  if (
    req.user?.role === "super_admin" &&
    requestedSyndicateId(req) &&
    req.query.supervision !== "true"
  ) {
    res.status(403).json({
      error: "La supervision est requise pour cibler un syndicat.",
      code: "SUPERVISION_REQUIRED",
    });
    return;
  }
  next();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeSubscriptionStatus(sub: {
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

function getDaysRemaining(date: Date | null): number | null {
  if (!date) return null;
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function enrichSubscription(sub: any, plan: any) {
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

const PAYMENT_METHODS = [
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
    configured: () =>
      Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
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
    configured: () =>
      Boolean(
        process.env.MOROCCAN_PAYMENT_GATEWAY_URL &&
        process.env.MOROCCAN_PAYMENT_GATEWAY_KEY,
      ),
    provider: "moroccan_gateway",
  },
] as const;

function availablePaymentMethods() {
  return PAYMENT_METHODS.map((method) => ({
    id: method.id,
    label: method.label,
    provider: method.provider,
    configured: method.configured(),
  }));
}

function paymentMethodConfig(methodId: string) {
  return PAYMENT_METHODS.find((method) => method.id === methodId);
}

function periodEndFrom(start: Date, interval: string) {
  const end = new Date(start);
  if (interval === "yearly") end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end;
}

function paymentError(res: any, code: string, error: string, status = 400) {
  res.status(status).json({ error, code });
}

export async function finalizeSuccessfulPayment(
  paymentId: string,
  providerReference?: string,
) {
  return db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(subscriptionPaymentsTable)
      .where(eq(subscriptionPaymentsTable.id, paymentId))
      .limit(1);
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

// ─── GET /subscriptions/plans/public ─────────────────────────────────────
// Public endpoint — no auth required. Used by the pre-login welcome flow.

router.get("/subscriptions/plans/public", async (_req, res) => {
  try {
    const plans = await db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.isActive, true))
      .orderBy(subscriptionPlansTable.sortOrder, subscriptionPlansTable.name);
    res.json({ data: plans });
  } catch (e) {
    logger.error(e, "Failed to fetch public plans");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /subscriptions/plans ─────────────────────────────────────────────

router.get("/subscriptions/plans", requireAuth, async (_req, res) => {
  try {
    const plans = await db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.isActive, true))
      .orderBy(subscriptionPlansTable.sortOrder, subscriptionPlansTable.name);
    res.json({ data: plans });
  } catch (e) {
    logger.error(e, "subscriptions/plans error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /subscriptions/plans/all (super_admin — includes inactive) ────────

router.get(
  "/subscriptions/plans/all",
  requireAuth,
  requireSuperAdmin,
  async (_req, res) => {
    try {
      const plans = await db
        .select()
        .from(subscriptionPlansTable)
        .orderBy(subscriptionPlansTable.sortOrder, subscriptionPlansTable.name);
      res.json({ data: plans });
    } catch (e) {
      logger.error(e, "subscriptions/plans/all error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /subscriptions/plans (super_admin — create plan) ───────────────

router.post(
  "/subscriptions/plans",
  requireAuth,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const {
        name,
        description,
        price,
        yearlyPrice,
        interval,
        features,
        maxBuildings,
        maxLots,
        maxMembers,
        maxStorageGb,
        maxDocuments,
        maxSignatures,
        maxApartments,
        maxUsers,
        supportLevel,
        isTrial,
        sortOrder,
        color,
        isActive,
      } = req.body as Record<string, any>;

      if (!name) {
        res.status(400).json({ error: "name est requis" });
        return;
      }

      const [plan] = await db
        .insert(subscriptionPlansTable)
        .values({
          name,
          description: description ?? null,
          price: price ? String(price) : null,
          yearlyPrice: yearlyPrice ? String(yearlyPrice) : null,
          interval: interval ?? "monthly",
          features: features ? JSON.stringify(features) : "[]",
          maxBuildings: maxBuildings ?? null,
          maxLots: maxLots ?? null,
          maxMembers: maxMembers ?? null,
          maxStorageGb: maxStorageGb ?? null,
          maxDocuments: maxDocuments ?? null,
          maxSignatures: maxSignatures ?? null,
          maxApartments: maxApartments ?? null,
          maxUsers: maxUsers ?? null,
          supportLevel: supportLevel ?? null,
          isTrial: isTrial ?? false,
          sortOrder: sortOrder ?? 0,
          color: color ?? "#2563EB",
          isActive: isActive !== false,
        } as any)
        .returning();

      res.status(201).json({ data: plan, message: "Plan créé" });
    } catch (e) {
      logger.error(e, "POST subscriptions/plans error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── PUT /subscriptions/plans/:id (super_admin — update plan) ────────────

router.put(
  "/subscriptions/plans/:id",
  requireAuth,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const planId = String(req.params.id);
      const update: Record<string, any> = {};
      const allowed = [
        "name",
        "description",
        "price",
        "yearlyPrice",
        "interval",
        "features",
        "maxBuildings",
        "maxLots",
        "maxMembers",
        "maxStorageGb",
        "maxDocuments",
        "maxSignatures",
        "maxApartments",
        "maxUsers",
        "supportLevel",
        "isTrial",
        "sortOrder",
        "color",
        "isActive",
      ];
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          if (key === "features" && Array.isArray(req.body[key])) {
            update[key] = JSON.stringify(req.body[key]);
          } else if (
            ["price", "yearlyPrice"].includes(key) &&
            req.body[key] !== null
          ) {
            update[key] = String(req.body[key]);
          } else {
            update[key] = req.body[key];
          }
        }
      }
      const [updated] = await db
        .update(subscriptionPlansTable)
        .set(update)
        .where(eq(subscriptionPlansTable.id, planId))
        .returning();
      if (!updated) {
        res.status(404).json({ error: "Plan introuvable" });
        return;
      }
      res.json({ data: updated, message: "Plan mis à jour" });
    } catch (e) {
      logger.error(e, "PUT subscriptions/plans/:id error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /subscriptions/my ───────────────────────────────────────────────

router.get(
  "/subscriptions/my",
  requireAuth,
  requireSubscriptionScope,
  async (req, res) => {
    try {
      const syndicateId = req.user!.syndicateId;
      if (!syndicateId) {
        // super_admin has no syndicateId — return null cleanly
        if (req.user!.role === "super_admin") {
          res.json({ data: null });
          return;
        }
        res.status(400).json({ error: "Aucun syndicat associé" });
        return;
      }

      const [row] = await db
        .select({
          id: syndicateSubscriptionsTable.id,
          syndicateId: syndicateSubscriptionsTable.syndicateId,
          planId: syndicateSubscriptionsTable.planId,
          status: syndicateSubscriptionsTable.status,
          autoRenew: syndicateSubscriptionsTable.autoRenew,
          trialStartDate: syndicateSubscriptionsTable.trialStartDate,
          trialEndDate: syndicateSubscriptionsTable.trialEndDate,
          currentPeriodStart: syndicateSubscriptionsTable.currentPeriodStart,
          currentPeriodEnd: syndicateSubscriptionsTable.currentPeriodEnd,
          canceledAt: syndicateSubscriptionsTable.canceledAt,
          gracePeriodEnd: syndicateSubscriptionsTable.gracePeriodEnd,
          createdAt: syndicateSubscriptionsTable.createdAt,
          planName: subscriptionPlansTable.name,
          planPrice: subscriptionPlansTable.price,
          planYearlyPrice: subscriptionPlansTable.yearlyPrice,
          planInterval: subscriptionPlansTable.interval,
          planFeatures: subscriptionPlansTable.features,
          planColor: subscriptionPlansTable.color,
          planDescription: subscriptionPlansTable.description,
          planMaxBuildings: subscriptionPlansTable.maxBuildings,
          planMaxLots: subscriptionPlansTable.maxLots,
          planMaxMembers: subscriptionPlansTable.maxMembers,
          planMaxStorageGb: subscriptionPlansTable.maxStorageGb,
          planMaxDocuments: subscriptionPlansTable.maxDocuments,
          planMaxSignatures: subscriptionPlansTable.maxSignatures,
          planIsTrial: subscriptionPlansTable.isTrial,
        })
        .from(syndicateSubscriptionsTable)
        .leftJoin(
          subscriptionPlansTable,
          eq(syndicateSubscriptionsTable.planId, subscriptionPlansTable.id),
        )
        .where(eq(syndicateSubscriptionsTable.syndicateId, syndicateId))
        .orderBy(desc(syndicateSubscriptionsTable.createdAt))
        .limit(1);

      if (!row) {
        res.json({ data: null });
        return;
      }

      const enriched = enrichSubscription(
        row,
        row.planName
          ? {
              name: row.planName,
              price: row.planPrice,
              yearlyPrice: row.planYearlyPrice,
              interval: row.planInterval,
              features: row.planFeatures,
              color: row.planColor,
              description: row.planDescription,
              maxBuildings: row.planMaxBuildings,
              maxLots: row.planMaxLots,
              maxMembers: row.planMaxMembers,
              maxStorageGb: row.planMaxStorageGb,
              maxDocuments: row.planMaxDocuments,
              maxSignatures: row.planMaxSignatures,
              isTrial: row.planIsTrial,
            }
          : null,
      );

      res.json({ data: enriched });
    } catch (e) {
      logger.error(e, "subscriptions/my error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /subscriptions/status (lightweight — for middleware/banner) ──────

router.get(
  "/subscriptions/status",
  requireAuth,
  requireSubscriptionScope,
  async (req, res) => {
    try {
      const syndicateId = req.user!.syndicateId;
      if (!syndicateId) {
        res.json({
          data: {
            isReadOnly: false,
            effectiveStatus: "active",
            daysRemaining: null,
          },
        });
        return;
      }

      const [row] = await db
        .select({
          status: syndicateSubscriptionsTable.status,
          trialEndDate: syndicateSubscriptionsTable.trialEndDate,
          currentPeriodEnd: syndicateSubscriptionsTable.currentPeriodEnd,
          gracePeriodEnd: syndicateSubscriptionsTable.gracePeriodEnd,
        })
        .from(syndicateSubscriptionsTable)
        .where(eq(syndicateSubscriptionsTable.syndicateId, syndicateId))
        .orderBy(desc(syndicateSubscriptionsTable.createdAt))
        .limit(1);

      if (!row) {
        res.json({
          data: {
            isReadOnly: false,
            effectiveStatus: "no_subscription",
            daysRemaining: null,
          },
        });
        return;
      }

      const effectiveStatus = computeSubscriptionStatus(row as any);
      const isReadOnly =
        effectiveStatus === "expired" || effectiveStatus === "suspended";
      const expiryDate =
        row.status === "trial" ? row.trialEndDate : row.currentPeriodEnd;

      res.json({
        data: {
          effectiveStatus,
          isReadOnly,
          daysRemaining: getDaysRemaining(expiryDate),
        },
      });
    } catch (e) {
      logger.error(e, "subscriptions/status error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /subscriptions (super_admin — all) ───────────────────────────────

router.get(
  "/subscriptions",
  requireAuth,
  requireRole("super_admin"),
  async (_req, res) => {
    try {
      const rows = await db
        .select({
          id: syndicateSubscriptionsTable.id,
          syndicateId: syndicateSubscriptionsTable.syndicateId,
          planId: syndicateSubscriptionsTable.planId,
          status: syndicateSubscriptionsTable.status,
          autoRenew: syndicateSubscriptionsTable.autoRenew,
          trialStartDate: syndicateSubscriptionsTable.trialStartDate,
          trialEndDate: syndicateSubscriptionsTable.trialEndDate,
          currentPeriodStart: syndicateSubscriptionsTable.currentPeriodStart,
          currentPeriodEnd: syndicateSubscriptionsTable.currentPeriodEnd,
          canceledAt: syndicateSubscriptionsTable.canceledAt,
          gracePeriodEnd: syndicateSubscriptionsTable.gracePeriodEnd,
          createdAt: syndicateSubscriptionsTable.createdAt,
          syndicateName: syndicatesTable.name,
          planName: subscriptionPlansTable.name,
          planPrice: subscriptionPlansTable.price,
          planInterval: subscriptionPlansTable.interval,
          planColor: subscriptionPlansTable.color,
          planIsTrial: subscriptionPlansTable.isTrial,
        })
        .from(syndicateSubscriptionsTable)
        .leftJoin(
          syndicatesTable,
          eq(syndicateSubscriptionsTable.syndicateId, syndicatesTable.id),
        )
        .leftJoin(
          subscriptionPlansTable,
          eq(syndicateSubscriptionsTable.planId, subscriptionPlansTable.id),
        )
        .orderBy(desc(syndicateSubscriptionsTable.createdAt));

      const enriched = rows.map((r) =>
        enrichSubscription(
          r,
          r.planName
            ? {
                name: r.planName,
                price: r.planPrice,
                interval: r.planInterval,
                color: r.planColor,
                isTrial: r.planIsTrial,
              }
            : null,
        ),
      );

      res.json({ data: enriched });
    } catch (e) {
      logger.error(e, "GET subscriptions error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /subscriptions/payment-methods ───────────────────────────────────

router.get("/subscriptions/payment-methods", requireAuth, async (_req, res) => {
  res.json({ data: availablePaymentMethods() });
});

// ─── POST /subscriptions (create a pending checkout) ──────────────────────
// This endpoint never activates a subscription. Activation only happens from
// finalizeSuccessfulPayment(), after an authorized payment confirmation.

router.post(
  "/subscriptions",
  requireAuth,
  (req, res, next) => requireSubscriptionScope(req, res, next, true),
  requireAdmin,
  async (req, res) => {
    try {
      const {
        planId,
        syndicateId: targetSyndicateId,
        billingInterval,
        paymentMethod,
        idempotencyKey: bodyKey,
      } = req.body as {
        planId: string;
        syndicateId?: string;
        billingInterval?: "monthly" | "yearly";
        paymentMethod?: string;
        idempotencyKey?: string;
      };
      if (!planId) {
        res.status(400).json({ error: "planId est requis" });
        return;
      }

      const syndicateId =
        req.user!.role === "super_admin"
          ? targetSyndicateId
          : req.user!.syndicateId;
      if (!syndicateId) {
        res.status(400).json({ error: "syndicateId est requis" });
        return;
      }
      const interval = billingInterval === "yearly" ? "yearly" : "monthly";
      const method = paymentMethod ?? "bank_transfer";
      const methodConfig = paymentMethodConfig(method);
      if (!methodConfig) {
        paymentError(
          res,
          "PAYMENT_METHOD_UNSUPPORTED",
          "Mode de paiement non pris en charge",
        );
        return;
      }
      if (!methodConfig.configured()) {
        paymentError(
          res,
          "PAYMENT_METHOD_NOT_CONFIGURED",
          "Ce mode de paiement n'est pas configuré. Choisissez un mode disponible.",
          409,
        );
        return;
      }
      const idempotencyKey = String(
        req.headers["idempotency-key"] ?? bodyKey ?? "",
      ).trim();
      if (!idempotencyKey || idempotencyKey.length > 200) {
        paymentError(
          res,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Une clé d'idempotence est requise pour protéger le paiement",
        );
        return;
      }

      const [plan] = await db
        .select()
        .from(subscriptionPlansTable)
        .where(eq(subscriptionPlansTable.id, planId));
      if (!plan || !plan.isActive) {
        res.status(404).json({ error: "Plan introuvable ou inactif" });
        return;
      }
      if (plan.isTrial) {
        paymentError(
          res,
          "TRIAL_PLAN_NOT_PAYABLE",
          "Le plan d'essai est activé lors de l'inscription",
        );
        return;
      }
      const amount = interval === "yearly" ? plan.yearlyPrice : plan.price;
      if (amount === null || amount === undefined || Number(amount) <= 0) {
        paymentError(
          res,
          "PLAN_PRICE_NOT_CONFIGURED",
          "Le prix de ce plan n'est pas configuré en base de données",
          409,
        );
        return;
      }

      const created = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(subscriptionPaymentsTable)
          .where(eq(subscriptionPaymentsTable.idempotencyKey, idempotencyKey))
          .limit(1);
        if (existing) {
          const sameRequest =
            existing.syndicateId === syndicateId &&
            existing.planId === planId &&
            existing.billingInterval === interval &&
            Number(existing.amount) === Number(amount);
          if (!sameRequest) {
            throw Object.assign(
              new Error(
                "Cette clé d'idempotence est déjà utilisée pour une autre demande",
              ),
              {
                status: 409,
                code: "IDEMPOTENCY_KEY_REUSED",
              },
            );
          }
          return { payment: existing, duplicate: true };
        }

        const now = new Date();
        const [pendingSub] = await tx
          .insert(syndicateSubscriptionsTable)
          .values({
            syndicateId,
            planId,
            status: "pending_payment",
            autoRenew: true,
            notes: `Paiement en attente — ${method}`,
          } as any)
          .returning();
        const [payment] = await tx
          .insert(subscriptionPaymentsTable)
          .values({
            syndicateId,
            subscriptionId: pendingSub.id,
            planId,
            idempotencyKey,
            amount: String(amount),
            currency: "MAD",
            billingInterval: interval,
            paymentMethod: method,
            provider: methodConfig.provider,
            status: "pending",
            metadata: { planName: plan.name, requestedAt: now.toISOString() },
          } as any)
          .returning();
        return { payment, duplicate: false };
      });

      if (!created.duplicate) {
        await serverAuditLog(req, {
          action: "CREATE",
          entity: "subscription_payment",
          entityId: created.payment.id,
          syndicateId,
          platformAction: req.user!.role === "super_admin",
          details: JSON.stringify({
            planId,
            amount: String(amount),
            billingInterval: interval,
            paymentMethod: method,
            status: "pending",
          }),
        });
      }
      res.status(created.duplicate ? 200 : 201).json({
        data: created.payment,
        message: created.duplicate
          ? "Paiement déjà initialisé"
          : "Paiement en attente",
        duplicate: created.duplicate,
        plan: {
          id: plan.id,
          name: plan.name,
          amount,
          billingInterval: interval,
          currency: "MAD",
        },
      });
    } catch (e) {
      if ((e as any)?.code === "23505") {
        const key = String(
          req.headers["idempotency-key"] ?? req.body?.idempotencyKey ?? "",
        );
        const [existing] = await db
          .select()
          .from(subscriptionPaymentsTable)
          .where(eq(subscriptionPaymentsTable.idempotencyKey, key))
          .limit(1);
        if (existing) {
          res.json({
            data: existing,
            duplicate: true,
            message: "Paiement déjà initialisé",
          });
          return;
        }
      }
      logger.error(e, "POST subscriptions error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /subscriptions/payments (auditable payment history) ──────────────

router.get(
  "/subscriptions/payments",
  requireAuth,
  requireSubscriptionScope,
  requireSupervisedTargetWhenProvided,
  requireAdmin,
  async (req, res) => {
    try {
      const syndicateId =
        req.user!.role === "super_admin"
          ? requestedSyndicateId(req)
          : req.user!.syndicateId;
      const where = syndicateId
        ? eq(subscriptionPaymentsTable.syndicateId, syndicateId)
        : undefined;
      const payments = await db
        .select({
          id: subscriptionPaymentsTable.id,
          syndicateId: subscriptionPaymentsTable.syndicateId,
          subscriptionId: subscriptionPaymentsTable.subscriptionId,
          invoiceId: subscriptionPaymentsTable.invoiceId,
          planId: subscriptionPaymentsTable.planId,
          planName: subscriptionPlansTable.name,
          amount: subscriptionPaymentsTable.amount,
          currency: subscriptionPaymentsTable.currency,
          billingInterval: subscriptionPaymentsTable.billingInterval,
          paymentMethod: subscriptionPaymentsTable.paymentMethod,
          provider: subscriptionPaymentsTable.provider,
          providerReference: subscriptionPaymentsTable.providerReference,
          status: subscriptionPaymentsTable.status,
          failureCode: subscriptionPaymentsTable.failureCode,
          failureMessage: subscriptionPaymentsTable.failureMessage,
          processedAt: subscriptionPaymentsTable.processedAt,
          cancelledAt: subscriptionPaymentsTable.cancelledAt,
          refundedAt: subscriptionPaymentsTable.refundedAt,
          createdAt: subscriptionPaymentsTable.createdAt,
        })
        .from(subscriptionPaymentsTable)
        .leftJoin(
          subscriptionPlansTable,
          eq(subscriptionPaymentsTable.planId, subscriptionPlansTable.id),
        )
        .where(where)
        .orderBy(desc(subscriptionPaymentsTable.createdAt));
      res.json({ data: payments });
    } catch (e) {
      logger.error(e, "GET subscriptions/payments error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /subscriptions/payments/:id ──────────────────────────────────────
// Mobile uses this after an app restart or network interruption to reconcile
// the locally persisted attempt with the server's authoritative state.

router.get(
  "/subscriptions/payments/:id",
  requireAuth,
  (req, res, next) => requireSubscriptionScope(req, res, next, true),
  requireAdmin,
  async (req, res) => {
    try {
      const [payment] = await db
        .select({
          id: subscriptionPaymentsTable.id,
          syndicateId: subscriptionPaymentsTable.syndicateId,
          subscriptionId: subscriptionPaymentsTable.subscriptionId,
          invoiceId: subscriptionPaymentsTable.invoiceId,
          planId: subscriptionPaymentsTable.planId,
          amount: subscriptionPaymentsTable.amount,
          currency: subscriptionPaymentsTable.currency,
          billingInterval: subscriptionPaymentsTable.billingInterval,
          paymentMethod: subscriptionPaymentsTable.paymentMethod,
          provider: subscriptionPaymentsTable.provider,
          providerReference: subscriptionPaymentsTable.providerReference,
          status: subscriptionPaymentsTable.status,
          failureCode: subscriptionPaymentsTable.failureCode,
          failureMessage: subscriptionPaymentsTable.failureMessage,
          processedAt: subscriptionPaymentsTable.processedAt,
          cancelledAt: subscriptionPaymentsTable.cancelledAt,
          refundedAt: subscriptionPaymentsTable.refundedAt,
          createdAt: subscriptionPaymentsTable.createdAt,
        })
        .from(subscriptionPaymentsTable)
        .where(eq(subscriptionPaymentsTable.id, String(req.params.id)))
        .limit(1);
      if (!payment) {
        paymentError(res, "PAYMENT_NOT_FOUND", "Paiement introuvable", 404);
        return;
      }
      if (!assertSupervisedTarget(req, res, payment.syndicateId)) return;
      if (
        req.user!.role !== "super_admin" &&
        payment.syndicateId !== req.user!.syndicateId
      ) {
        paymentError(res, "ACCESS_DENIED", "Accès refusé", 403);
        return;
      }
      res.json({ data: payment });
    } catch (e) {
      logger.error(e, "GET subscription payment by id error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /subscriptions/payments/:id/confirm ─────────────────────────────
// Used by a configured provider callback/authorized bank-transfer operator.
// It is deliberately idempotent: a delayed callback returns the existing
// successful result and never creates a second subscription or invoice.

router.post(
  "/subscriptions/payments/:id/confirm",
  requireAuth,
  requireSuperAdmin,
  (req, res, next) => requireSubscriptionScope(req, res, next, true),
  async (req, res) => {
    try {
      const [payment] = await db
        .select({ syndicateId: subscriptionPaymentsTable.syndicateId })
        .from(subscriptionPaymentsTable)
        .where(eq(subscriptionPaymentsTable.id, String(req.params.id)))
        .limit(1);
      if (!payment) {
        paymentError(res, "PAYMENT_NOT_FOUND", "Paiement introuvable", 404);
        return;
      }
      if (!assertSupervisedTarget(req, res, payment.syndicateId)) return;
      const result = await finalizeSuccessfulPayment(
        String(req.params.id),
        req.body?.providerReference,
      );
      await serverAuditLog(req, {
        action: result.duplicate ? "REPLAY" : "CONFIRM",
        entity: "subscription_payment",
        entityId: String(req.params.id),
        syndicateId: (result.payment as any).syndicateId,
        details: JSON.stringify({
          status: "succeeded",
          duplicate: result.duplicate,
        }),
      });
      res.json({
        data: result,
        message: result.duplicate
          ? "Confirmation déjà traitée"
          : "Paiement confirmé, abonnement activé",
      });
    } catch (e) {
      const status = Number((e as any)?.status) || 500;
      if (status < 500) {
        paymentError(
          res,
          (e as any).code ?? "PAYMENT_CONFIRMATION_ERROR",
          (e as Error).message,
          status,
        );
        return;
      }
      logger.error(e, "POST subscription payment confirm error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /subscriptions/payments/:id/fail ─────────────────────────────────

router.post(
  "/subscriptions/payments/:id/fail",
  requireAuth,
  requireSuperAdmin,
  (req, res, next) => requireSubscriptionScope(req, res, next, true),
  async (req, res) => {
    try {
      const targetSyndicateId = requestedSyndicateId(req);
      if (!targetSyndicateId) {
        res
          .status(403)
          .json({
            error: "Un syndicat cible est requis",
            code: "SUPERVISION_REQUIRED",
          });
        return;
      }
      const [payment] = await db
        .update(subscriptionPaymentsTable)
        .set({
          status: "failed",
          failureCode: String(req.body?.failureCode ?? "PAYMENT_FAILED"),
          failureMessage: String(
            req.body?.failureMessage ?? "Le paiement a échoué",
          ),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(subscriptionPaymentsTable.id, String(req.params.id)),
            eq(subscriptionPaymentsTable.syndicateId, targetSyndicateId),
            inArray(subscriptionPaymentsTable.status, [
              "pending",
              "processing",
            ]),
          ),
        )
        .returning();
      if (!payment) {
        paymentError(
          res,
          "PAYMENT_STATE_INVALID",
          "Le paiement n'est pas en attente ou n'existe pas",
          409,
        );
        return;
      }
      await db
        .update(syndicateSubscriptionsTable)
        .set({
          status: "cancelled",
          canceledAt: new Date(),
          notes: "Paiement échoué",
        })
        .where(
          and(
            eq(syndicateSubscriptionsTable.id, payment.subscriptionId ?? ""),
            eq(syndicateSubscriptionsTable.status, "pending_payment"),
          ),
        );
      await serverAuditLog(req, {
        action: "FAIL",
        entity: "subscription_payment",
        entityId: payment.id,
        syndicateId: payment.syndicateId,
        details: JSON.stringify({ failureCode: payment.failureCode }),
      });
      res.json({
        data: payment,
        message: "Paiement échoué. Vous pouvez réessayer.",
      });
    } catch (e) {
      logger.error(e, "POST subscription payment fail error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /subscriptions/payments/:id/cancel ───────────────────────────────

router.post(
  "/subscriptions/payments/:id/cancel",
  requireAuth,
  (req, res, next) => requireSubscriptionScope(req, res, next, true),
  requireAdmin,
  async (req, res) => {
    try {
      const paymentId = String(req.params.id);
      const [payment] = await db
        .select()
        .from(subscriptionPaymentsTable)
        .where(eq(subscriptionPaymentsTable.id, paymentId))
        .limit(1);
      if (!payment) {
        paymentError(res, "PAYMENT_NOT_FOUND", "Paiement introuvable", 404);
        return;
      }
      if (!assertSupervisedTarget(req, res, payment.syndicateId)) return;
      if (
        req.user!.role !== "super_admin" &&
        payment.syndicateId !== req.user!.syndicateId
      ) {
        paymentError(res, "ACCESS_DENIED", "Accès refusé", 403);
        return;
      }
      const [updated] = await db
        .update(subscriptionPaymentsTable)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(subscriptionPaymentsTable.id, paymentId),
            inArray(subscriptionPaymentsTable.status, [
              "pending",
              "processing",
            ]),
          ),
        )
        .returning();
      if (!updated) {
        paymentError(
          res,
          "PAYMENT_STATE_INVALID",
          "Ce paiement ne peut plus être annulé",
          409,
        );
        return;
      }
      await db
        .update(syndicateSubscriptionsTable)
        .set({
          status: "cancelled",
          canceledAt: new Date(),
          notes: "Paiement annulé",
        })
        .where(
          and(
            eq(syndicateSubscriptionsTable.id, updated.subscriptionId ?? ""),
            eq(syndicateSubscriptionsTable.status, "pending_payment"),
          ),
        );
      await serverAuditLog(req, {
        action: "CANCEL",
        entity: "subscription_payment",
        entityId: updated.id,
        syndicateId: updated.syndicateId,
      });
      res.json({
        data: updated,
        message: "Paiement annulé. Vous pouvez réessayer.",
      });
    } catch (e) {
      logger.error(e, "POST subscription payment cancel error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /subscriptions/payments/:id/retry ────────────────────────────────

router.post(
  "/subscriptions/payments/:id/retry",
  requireAuth,
  (req, res, next) => requireSubscriptionScope(req, res, next, true),
  requireAdmin,
  async (req, res) => {
    try {
      const [previous] = await db
        .select()
        .from(subscriptionPaymentsTable)
        .where(eq(subscriptionPaymentsTable.id, String(req.params.id)))
        .limit(1);
      if (!previous) {
        paymentError(res, "PAYMENT_NOT_FOUND", "Paiement introuvable", 404);
        return;
      }
      if (!assertSupervisedTarget(req, res, previous.syndicateId)) return;
      if (
        req.user!.role !== "super_admin" &&
        previous.syndicateId !== req.user!.syndicateId
      ) {
        paymentError(res, "ACCESS_DENIED", "Accès refusé", 403);
        return;
      }
      if (!["failed", "cancelled"].includes(previous.status)) {
        paymentError(
          res,
          "PAYMENT_RETRY_INVALID",
          "Seuls les paiements échoués ou annulés peuvent être réessayés",
          409,
        );
        return;
      }
      const method = String(req.body?.paymentMethod ?? previous.paymentMethod);
      const config = paymentMethodConfig(method);
      if (!config || !config.configured()) {
        paymentError(
          res,
          "PAYMENT_METHOD_NOT_CONFIGURED",
          "Ce mode de paiement n'est pas configuré",
          409,
        );
        return;
      }
      const key = String(
        req.headers["idempotency-key"] ?? req.body?.idempotencyKey ?? "",
      ).trim();
      if (!key) {
        paymentError(
          res,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Une clé d'idempotence est requise",
        );
        return;
      }
      const [existing] = await db
        .select()
        .from(subscriptionPaymentsTable)
        .where(eq(subscriptionPaymentsTable.idempotencyKey, key))
        .limit(1);
      if (existing) {
        res.json({
          data: existing,
          duplicate: true,
          message: "Nouvelle tentative déjà initialisée",
        });
        return;
      }
      const [subscription] = await db
        .insert(syndicateSubscriptionsTable)
        .values({
          syndicateId: previous.syndicateId,
          planId: previous.planId,
          status: "pending_payment",
          autoRenew: true,
          notes: `Nouvelle tentative de paiement ${previous.id}`,
        } as any)
        .returning();
      const [payment] = await db
        .insert(subscriptionPaymentsTable)
        .values({
          syndicateId: previous.syndicateId,
          subscriptionId: subscription.id,
          planId: previous.planId,
          idempotencyKey: key,
          amount: previous.amount,
          currency: previous.currency,
          billingInterval: previous.billingInterval,
          paymentMethod: method,
          provider: config.provider,
          status: "pending",
          metadata: { retryOfPaymentId: previous.id },
        } as any)
        .returning();
      await serverAuditLog(req, {
        action: "RETRY",
        entity: "subscription_payment",
        entityId: payment.id,
        syndicateId: payment.syndicateId,
        details: JSON.stringify({ retryOfPaymentId: previous.id }),
      });
      res
        .status(201)
        .json({
          data: payment,
          duplicate: false,
          message: "Nouvelle tentative de paiement créée",
        });
    } catch (e) {
      logger.error(e, "POST subscription payment retry error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /subscriptions/payments/:id/refund ───────────────────────────────

router.post(
  "/subscriptions/payments/:id/refund",
  requireAuth,
  requireSuperAdmin,
  (req, res, next) => requireSubscriptionScope(req, res, next, true),
  async (req, res) => {
    try {
      const paymentId = String(req.params.id);
      const targetSyndicateId = requestedSyndicateId(req);
      if (!targetSyndicateId) {
        res
          .status(403)
          .json({
            error: "Un syndicat cible est requis",
            code: "SUPERVISION_REQUIRED",
          });
        return;
      }
      const [existingPayment] = await db
        .select({ syndicateId: subscriptionPaymentsTable.syndicateId })
        .from(subscriptionPaymentsTable)
        .where(eq(subscriptionPaymentsTable.id, paymentId))
        .limit(1);
      if (!existingPayment) {
        paymentError(res, "PAYMENT_NOT_FOUND", "Paiement introuvable", 404);
        return;
      }
      if (!assertSupervisedTarget(req, res, existingPayment.syndicateId))
        return;
      const [payment] = await db
        .update(subscriptionPaymentsTable)
        .set({
          status: "refunded",
          refundedAt: new Date(),
          updatedAt: new Date(),
          metadata: { refundReason: req.body?.reason ?? null },
        })
        .where(
          and(
            eq(subscriptionPaymentsTable.id, paymentId),
            eq(subscriptionPaymentsTable.status, "succeeded"),
          ),
        )
        .returning();
      if (!payment) {
        paymentError(
          res,
          "REFUND_INVALID",
          "Seuls les paiements réussis peuvent être remboursés",
          409,
        );
        return;
      }
      if (payment.syndicateId !== targetSyndicateId) {
        res.status(404).json({ error: "Ressource introuvable" });
        return;
      }
      await db
        .update(syndicateSubscriptionsTable)
        .set({
          status: "cancelled",
          canceledAt: new Date(),
          notes: "Paiement remboursé",
        })
        .where(
          and(
            eq(syndicateSubscriptionsTable.id, payment.subscriptionId ?? ""),
            inArray(syndicateSubscriptionsTable.status, ["active", "grace"]),
          ),
        );
      if (payment.invoiceId)
        await db
          .update(billingInvoicesTable)
          .set({ status: "refunded" })
          .where(eq(billingInvoicesTable.id, payment.invoiceId));
      await serverAuditLog(req, {
        action: "REFUND",
        entity: "subscription_payment",
        entityId: payment.id,
        syndicateId: payment.syndicateId,
        details: JSON.stringify({ reason: req.body?.reason ?? null }),
      });
      res.json({
        data: payment,
        message: "Paiement remboursé et abonnement clôturé",
      });
    } catch (e) {
      logger.error(e, "POST subscription payment refund error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── PUT /subscriptions/:id ───────────────────────────────────────────────

router.put(
  "/subscriptions/:id",
  requireAuth,
  (req, res, next) => requireSubscriptionScope(req, res, next, true),
  requireAdmin,
  async (req, res) => {
    try {
      const user = req.user!;
      const id = String(req.params.id);
      const { status, autoRenew, notes } = req.body as {
        status?: string;
        autoRenew?: boolean;
        notes?: string;
      };

      if (user.role === "syndicate_admin") {
        const [target] = await db
          .select({ syndicateId: syndicateSubscriptionsTable.syndicateId })
          .from(syndicateSubscriptionsTable)
          .where(eq(syndicateSubscriptionsTable.id, id));
        if (!target) {
          res.status(404).json({ error: "Abonnement introuvable" });
          return;
        }
        if (target.syndicateId !== user.syndicateId) {
          res.status(403).json({ error: "Accès refusé" });
          return;
        }
      }
      if (user.role === "super_admin") {
        const [target] = await db
          .select({ syndicateId: syndicateSubscriptionsTable.syndicateId })
          .from(syndicateSubscriptionsTable)
          .where(eq(syndicateSubscriptionsTable.id, id));
        if (!target) {
          res.status(404).json({ error: "Abonnement introuvable" });
          return;
        }
        if (!assertSupervisedTarget(req, res, target.syndicateId)) return;
      }

      const update: Record<string, any> = {};
      if (status !== undefined) {
        update.status = status;
        if (status === "cancelled") update.canceledAt = new Date();
      }
      if (autoRenew !== undefined) update.autoRenew = autoRenew;
      if (notes !== undefined) update.notes = notes;

      const [updated] = await db
        .update(syndicateSubscriptionsTable)
        .set(update)
        .where(eq(syndicateSubscriptionsTable.id, id))
        .returning();

      if (!updated) {
        res.status(404).json({ error: "Abonnement introuvable" });
        return;
      }
      res.json({ data: updated, message: "Mis à jour" });
    } catch (e) {
      logger.error(e, "PUT subscriptions/:id error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /subscriptions/trial (auto-assign trial — internal) ────────────

router.post(
  "/subscriptions/trial",
  requireAuth,
  requireSuperAdmin,
  (req, res, next) => requireSubscriptionScope(req, res, next, true),
  async (req, res) => {
    try {
      const syndicateId = requestedSyndicateId(req);
      if (!syndicateId) {
        res.status(400).json({ error: "syndicateId requis" });
        return;
      }
      const [syndicate] = await db
        .select({ id: syndicatesTable.id })
        .from(syndicatesTable)
        .where(eq(syndicatesTable.id, syndicateId))
        .limit(1);
      if (!syndicate) {
        res.status(404).json({ error: "Syndicat introuvable" });
        return;
      }
      const sub = await assignTrial(syndicateId);
      res.status(201).json({ data: sub, message: "Essai gratuit activé" });
    } catch (e) {
      logger.error(e, "POST subscriptions/trial error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /subscriptions/invoices ─────────────────────────────────────────

router.get(
  "/subscriptions/invoices",
  requireAuth,
  (req, res, next) => requireSubscriptionScope(req, res, next, true),
  async (req, res) => {
    try {
      const user = req.user!;
      const syndicateId =
        user.role === "super_admin"
          ? requestedSyndicateId(req)
          : user.syndicateId;
      if (!syndicateId) {
        res.json({ data: [] });
        return;
      }

      const invoices = await db
        .select()
        .from(billingInvoicesTable)
        .where(eq(billingInvoicesTable.syndicateId, syndicateId))
        .orderBy(desc(billingInvoicesTable.createdAt));

      res.json({ data: invoices });
    } catch (e) {
      logger.error(e, "GET subscriptions/invoices error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── PUT /subscriptions/invoices/:id/pay (mark invoice as paid) ──────────

router.put(
  "/subscriptions/invoices/:id/pay",
  requireAuth,
  requireSuperAdmin,
  (req, res, next) => requireSubscriptionScope(req, res, next, true),
  async (req, res) => {
    try {
      const id = String(req.params.id);
      const [invoice] = await db
        .select()
        .from(billingInvoicesTable)
        .where(eq(billingInvoicesTable.id, id))
        .limit(1);
      if (!invoice) {
        res.status(404).json({ error: "Facture introuvable" });
        return;
      }
      if (!assertSupervisedTarget(req, res, invoice.syndicateId)) return;
      if (!invoice.paymentId) {
        paymentError(
          res,
          "PAYMENT_LINK_MISSING",
          "Cette facture ne possède pas de tentative de paiement confirmable",
          409,
        );
        return;
      }
      const result = await finalizeSuccessfulPayment(
        invoice.paymentId,
        req.body?.providerReference,
      );
      await serverAuditLog(req, {
        action: result.duplicate ? "REPLAY" : "CONFIRM",
        entity: "subscription_payment",
        entityId: invoice.paymentId,
        syndicateId: invoice.syndicateId,
        details: JSON.stringify({
          via: "invoice",
          duplicate: result.duplicate,
        }),
      });
      res.json({
        data: result,
        message: result.duplicate
          ? "Confirmation déjà traitée"
          : "Paiement confirmé, abonnement activé",
      });
    } catch (e) {
      const status = Number((e as any)?.status) || 500;
      if (status < 500) {
        paymentError(
          res,
          (e as any).code ?? "PAYMENT_CONFIRMATION_ERROR",
          (e as Error).message,
          status,
        );
        return;
      }
      logger.error(e, "PUT invoices/:id/pay error");
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Exported helper ──────────────────────────────────────────────────────

export async function assignTrial(syndicateId: string): Promise<any> {
  // Find the trial plan
  const [trialPlan] = await db
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.isTrial, true))
    .limit(1);

  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + 30);

  const [sub] = await db
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

export default router;
