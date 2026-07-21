import { Router } from "express";
import { db } from "@workspace/db";
import {
  subscriptionPlansTable,
  syndicateSubscriptionsTable,
  syndicatesTable,
  billingInvoicesTable,
} from "@workspace/db/schema";
import { eq, desc, and, lt, gte, isNull } from "drizzle-orm";
import { requireAuth, requireAdmin, requireRole, requireSuperAdmin } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";

const router = Router();

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
  const isExpired = effectiveStatus === "expired" || effectiveStatus === "suspended";
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
    expiryDate: expiryDate ? (expiryDate instanceof Date ? expiryDate.toISOString() : expiryDate) : null,
    plan: plan ?? null,
  };
}

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

router.get("/subscriptions/plans/all", requireAuth, requireSuperAdmin, async (_req, res) => {
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
});

// ─── POST /subscriptions/plans (super_admin — create plan) ───────────────

router.post("/subscriptions/plans", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const {
      name, description, price, yearlyPrice, interval, features,
      maxBuildings, maxLots, maxMembers, maxStorageGb, maxDocuments, maxSignatures,
      isTrial, sortOrder, color, isActive,
    } = req.body as Record<string, any>;

    if (!name) { res.status(400).json({ error: "name est requis" }); return; }

    const [plan] = await db.insert(subscriptionPlansTable).values({
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
      isTrial: isTrial ?? false,
      sortOrder: sortOrder ?? 0,
      color: color ?? "#2563EB",
      isActive: isActive !== false,
    } as any).returning();

    res.status(201).json({ data: plan, message: "Plan créé" });
  } catch (e) {
    logger.error(e, "POST subscriptions/plans error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── PUT /subscriptions/plans/:id (super_admin — update plan) ────────────

router.put("/subscriptions/plans/:id", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const planId = String(req.params.id);
    const update: Record<string, any> = {};
    const allowed = ["name","description","price","yearlyPrice","interval","features","maxBuildings","maxLots",
      "maxMembers","maxStorageGb","maxDocuments","maxSignatures","isTrial","sortOrder","color","isActive"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === "features" && Array.isArray(req.body[key])) {
          update[key] = JSON.stringify(req.body[key]);
        } else if (["price","yearlyPrice"].includes(key) && req.body[key] !== null) {
          update[key] = String(req.body[key]);
        } else {
          update[key] = req.body[key];
        }
      }
    }
    const [updated] = await db.update(subscriptionPlansTable).set(update).where(eq(subscriptionPlansTable.id, planId)).returning();
    if (!updated) { res.status(404).json({ error: "Plan introuvable" }); return; }
    res.json({ data: updated, message: "Plan mis à jour" });
  } catch (e) {
    logger.error(e, "PUT subscriptions/plans/:id error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /subscriptions/my ───────────────────────────────────────────────

router.get("/subscriptions/my", requireAuth, async (req, res) => {
  try {
    const syndicateId = req.user!.syndicateId;
    if (!syndicateId) {
      // super_admin has no syndicateId — return null cleanly
      if (req.user!.role === "super_admin") { res.json({ data: null }); return; }
      res.status(400).json({ error: "Aucun syndicat associé" }); return;
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
      .leftJoin(subscriptionPlansTable, eq(syndicateSubscriptionsTable.planId, subscriptionPlansTable.id))
      .where(eq(syndicateSubscriptionsTable.syndicateId, syndicateId))
      .orderBy(desc(syndicateSubscriptionsTable.createdAt))
      .limit(1);

    if (!row) { res.json({ data: null }); return; }

    const enriched = enrichSubscription(row, row.planName ? {
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
    } : null);

    res.json({ data: enriched });
  } catch (e) {
    logger.error(e, "subscriptions/my error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /subscriptions/status (lightweight — for middleware/banner) ──────

router.get("/subscriptions/status", requireAuth, async (req, res) => {
  try {
    const syndicateId = req.user!.syndicateId;
    if (!syndicateId) { res.json({ data: { isReadOnly: false, effectiveStatus: "active", daysRemaining: null } }); return; }

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

    if (!row) { res.json({ data: { isReadOnly: false, effectiveStatus: "no_subscription", daysRemaining: null } }); return; }

    const effectiveStatus = computeSubscriptionStatus(row as any);
    const isReadOnly = effectiveStatus === "expired" || effectiveStatus === "suspended";
    const expiryDate = row.status === "trial" ? row.trialEndDate : row.currentPeriodEnd;

    res.json({ data: { effectiveStatus, isReadOnly, daysRemaining: getDaysRemaining(expiryDate) } });
  } catch (e) {
    logger.error(e, "subscriptions/status error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /subscriptions (super_admin — all) ───────────────────────────────

router.get("/subscriptions", requireAuth, requireRole("super_admin"), async (_req, res) => {
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
      .leftJoin(syndicatesTable, eq(syndicateSubscriptionsTable.syndicateId, syndicatesTable.id))
      .leftJoin(subscriptionPlansTable, eq(syndicateSubscriptionsTable.planId, subscriptionPlansTable.id))
      .orderBy(desc(syndicateSubscriptionsTable.createdAt));

    const enriched = rows.map((r) => enrichSubscription(r, r.planName ? {
      name: r.planName, price: r.planPrice, interval: r.planInterval, color: r.planColor, isTrial: r.planIsTrial,
    } : null));

    res.json({ data: enriched });
  } catch (e) {
    logger.error(e, "GET subscriptions error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /subscriptions (subscribe to a paid plan) ──────────────────────

router.post("/subscriptions", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { planId, syndicateId: targetSyndicateId, billingInterval } = req.body as {
      planId: string; syndicateId?: string; billingInterval?: "monthly" | "yearly";
    };
    if (!planId) { res.status(400).json({ error: "planId est requis" }); return; }

    const syndicateId = req.user!.role === "super_admin" ? targetSyndicateId : req.user!.syndicateId;
    if (!syndicateId) { res.status(400).json({ error: "syndicateId est requis" }); return; }

    const [plan] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, planId));
    if (!plan) { res.status(404).json({ error: "Plan introuvable" }); return; }

    const now = new Date();
    const periodEnd = new Date(now);
    if (billingInterval === "yearly") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    // Cancel existing
    await db.update(syndicateSubscriptionsTable)
      .set({ status: "cancelled", canceledAt: now })
      .where(eq(syndicateSubscriptionsTable.syndicateId, syndicateId));

    const [sub] = await db.insert(syndicateSubscriptionsTable).values({
      syndicateId,
      planId,
      status: "active",
      autoRenew: true,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    } as any).returning();

    // Create invoice
    const price = billingInterval === "yearly" ? plan.yearlyPrice : plan.price;
    if (price && Number(price) > 0) {
      await db.insert(billingInvoicesTable).values({
        syndicateId,
        subscriptionId: sub.id,
        amount: String(price),
        status: "open",
        dueDate: now,
        description: `Abonnement ${plan.name} — ${billingInterval === "yearly" ? "annuel" : "mensuel"}`,
        periodStart: now,
        periodEnd: periodEnd,
      } as any);
    }

    res.status(201).json({ data: sub, message: "Abonnement activé" });
  } catch (e) {
    logger.error(e, "POST subscriptions error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── PUT /subscriptions/:id ───────────────────────────────────────────────

router.put("/subscriptions/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = req.user!;
    const id = String(req.params.id);
    const { status, autoRenew, notes } = req.body as { status?: string; autoRenew?: boolean; notes?: string };

    if (user.role === "syndicate_admin") {
      const [target] = await db
        .select({ syndicateId: syndicateSubscriptionsTable.syndicateId })
        .from(syndicateSubscriptionsTable)
        .where(eq(syndicateSubscriptionsTable.id, id));
      if (!target) { res.status(404).json({ error: "Abonnement introuvable" }); return; }
      if (target.syndicateId !== user.syndicateId) { res.status(403).json({ error: "Accès refusé" }); return; }
    }

    const update: Record<string, any> = {};
    if (status !== undefined) {
      update.status = status;
      if (status === "cancelled") update.canceledAt = new Date();
    }
    if (autoRenew !== undefined) update.autoRenew = autoRenew;
    if (notes !== undefined) update.notes = notes;

    const [updated] = await db.update(syndicateSubscriptionsTable)
      .set(update)
      .where(eq(syndicateSubscriptionsTable.id, id))
      .returning();

    if (!updated) { res.status(404).json({ error: "Abonnement introuvable" }); return; }
    res.json({ data: updated, message: "Mis à jour" });
  } catch (e) {
    logger.error(e, "PUT subscriptions/:id error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /subscriptions/trial (auto-assign trial — internal) ────────────

router.post("/subscriptions/trial", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { syndicateId } = req.body as { syndicateId: string };
    if (!syndicateId) { res.status(400).json({ error: "syndicateId requis" }); return; }
    const sub = await assignTrial(syndicateId);
    res.status(201).json({ data: sub, message: "Essai gratuit activé" });
  } catch (e) {
    logger.error(e, "POST subscriptions/trial error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /subscriptions/invoices ─────────────────────────────────────────

router.get("/subscriptions/invoices", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const syndicateId = user.role === "super_admin" ? (req.query.syndicateId as string | undefined) : user.syndicateId;
    if (!syndicateId) { res.json({ data: [] }); return; }

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
});

// ─── PUT /subscriptions/invoices/:id/pay (mark invoice as paid) ──────────

router.put("/subscriptions/invoices/:id/pay", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const [updated] = await db.update(billingInvoicesTable)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(billingInvoicesTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Facture introuvable" }); return; }
    res.json({ data: updated, message: "Facture marquée payée" });
  } catch (e) {
    logger.error(e, "PUT invoices/:id/pay error");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

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

  const [sub] = await db.insert(syndicateSubscriptionsTable).values({
    syndicateId,
    planId: trialPlan?.id ?? null,
    status: "trial",
    autoRenew: false,
    trialStartDate: now,
    trialEndDate: trialEnd,
  } as any).returning();

  return sub;
}

export default router;
