import { Router } from "express";
import { db } from "@workspace/db";
import {
  subscriptionPlansTable,
  syndicateSubscriptionsTable,
  syndicatesTable,
} from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin, requireRole } from "../middleware/auth.js";

const router = Router();

// GET /subscriptions/plans — All subscription plans
router.get("/subscriptions/plans", requireAuth, async (_req, res) => {
  try {
    const plans = await db.select().from(subscriptionPlansTable).orderBy(subscriptionPlansTable.name);
    res.json({ data: plans });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /subscriptions/my — Current syndicate subscription (with plan details)
router.get("/subscriptions/my", requireAuth, async (req, res) => {
  try {
    const syndicateId = req.user!.syndicateId;
    if (!syndicateId) { res.status(400).json({ error: "Aucun syndicat associé" }); return; }

    const [sub] = await db
      .select({
        id: syndicateSubscriptionsTable.id,
        syndicateId: syndicateSubscriptionsTable.syndicateId,
        planId: syndicateSubscriptionsTable.planId,
        status: syndicateSubscriptionsTable.status,
        autoRenew: syndicateSubscriptionsTable.autoRenew,
        createdAt: syndicateSubscriptionsTable.createdAt,
        planName: subscriptionPlansTable.name,
        planPrice: subscriptionPlansTable.price,
        planInterval: subscriptionPlansTable.interval,
        planFeatures: subscriptionPlansTable.features,
      })
      .from(syndicateSubscriptionsTable)
      .leftJoin(subscriptionPlansTable, eq(syndicateSubscriptionsTable.planId, subscriptionPlansTable.id))
      .where(eq(syndicateSubscriptionsTable.syndicateId, syndicateId))
      .orderBy(desc(syndicateSubscriptionsTable.createdAt))
      .limit(1);

    res.json({ data: sub ?? null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /subscriptions — All syndicate subscriptions (super_admin only)
router.get("/subscriptions", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    const rows = await db
      .select({
        id: syndicateSubscriptionsTable.id,
        syndicateId: syndicateSubscriptionsTable.syndicateId,
        planId: syndicateSubscriptionsTable.planId,
        status: syndicateSubscriptionsTable.status,
        autoRenew: syndicateSubscriptionsTable.autoRenew,
        createdAt: syndicateSubscriptionsTable.createdAt,
        syndicateName: syndicatesTable.name,
        planName: subscriptionPlansTable.name,
        planPrice: subscriptionPlansTable.price,
        planInterval: subscriptionPlansTable.interval,
      })
      .from(syndicateSubscriptionsTable)
      .leftJoin(syndicatesTable, eq(syndicateSubscriptionsTable.syndicateId, syndicatesTable.id))
      .leftJoin(subscriptionPlansTable, eq(syndicateSubscriptionsTable.planId, subscriptionPlansTable.id))
      .orderBy(desc(syndicateSubscriptionsTable.createdAt));
    res.json({ data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /subscriptions — Subscribe to a plan (admin)
router.post("/subscriptions", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { planId, syndicateId: targetSyndicateId } = req.body as { planId: string; syndicateId?: string };
    if (!planId) { res.status(400).json({ error: "planId est requis" }); return; }

    const syndicateId = req.user!.role === "super_admin" ? targetSyndicateId : req.user!.syndicateId;
    if (!syndicateId) { res.status(400).json({ error: "syndicateId est requis" }); return; }

    const [plan] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, planId));
    if (!plan) { res.status(404).json({ error: "Plan introuvable" }); return; }

    // Cancel existing active subscriptions
    await db.update(syndicateSubscriptionsTable)
      .set({ status: "cancelled" })
      .where(eq(syndicateSubscriptionsTable.syndicateId, syndicateId));

    const [sub] = await db.insert(syndicateSubscriptionsTable).values({
      syndicateId,
      planId,
      status: "active",
      autoRenew: true,
    }).returning();

    res.status(201).json({ data: sub, message: "Abonnement activé" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /subscriptions/:id — Update subscription status (super_admin)
router.put("/subscriptions/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, autoRenew } = req.body as { status?: string; autoRenew?: boolean };

    const update: any = {};
    if (status !== undefined) update.status = status;
    if (autoRenew !== undefined) update.autoRenew = autoRenew;

    const [updated] = await db.update(syndicateSubscriptionsTable)
      .set(update)
      .where(eq(syndicateSubscriptionsTable.id, id))
      .returning();

    if (!updated) { res.status(404).json({ error: "Abonnement introuvable" }); return; }
    res.json({ data: updated, message: "Mis à jour" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
