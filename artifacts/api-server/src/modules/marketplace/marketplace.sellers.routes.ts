// marketplace: sellers endpoints (mounted by marketplace.routes.ts, in order).
import { Router } from "express";
import { z } from "zod";
import {
  sql,
  eq,
  and,
  desc,
  count,
} from "drizzle-orm";
import { db } from "@workspace/db";
import {
  productsTable,
  reviewsTable,
  productReportsTable,
  marketplacePromotionsTable,
  usersTable,
} from "@workspace/db/schema";
import { requireAuth, requireSuperAdmin } from "../../middleware/auth.js";
import { isAdmin, listingOpenTo, verifiedResidents } from "./marketplace.service.js";

const router = Router();

// ─── GET /sellers/:id/reputation ──────────────────────────────────────────────

router.get("/sellers/:id/reputation", requireAuth, async (req, res) => {
  const sellerId = String(req.params.id) as string;
  try {
    const [[sellerInfo], [ratingData], [salesData]] = await Promise.all([
      db.select({ name: usersTable.email }).from(usersTable).where(eq(usersTable.id, sellerId)).limit(1),
      db
        .select({
          avgRating: sql<string>`coalesce(avg(${reviewsTable.rating})::numeric(3,1), 0)`,
          totalReviews: count(),
        })
        .from(reviewsTable)
        .innerJoin(productsTable, eq(reviewsTable.productId, productsTable.id))
        .where(eq(productsTable.sellerId, sellerId)),
      db
        .select({ totalSold: count() })
        .from(productsTable)
        .where(and(eq(productsTable.sellerId, sellerId), eq(productsTable.status, "sold"))),
    ]);

    const totalListings = await db
      .select({ total: count() })
      .from(productsTable)
      .where(eq(productsTable.sellerId, sellerId));

    const avgRating = Number((ratingData as any)?.avgRating ?? 0);
    const totalReviews = Number((ratingData as any)?.totalReviews ?? 0);
    const totalSold = Number((salesData as any)?.totalSold ?? 0);
    const totalListingCount = Number(totalListings[0]?.total ?? 0);

    // Facts only. (The former "trust score" mixed ratings and sales into an
    // invented figure, and "verified" meant three sales, not an identity.)
    const verified = await verifiedResidents([{ sellerId, syndicateId: req.user!.syndicateId ?? null }]);

    res.json({
      data: {
        sellerId,
        avgRating: avgRating.toFixed(1),
        totalReviews,
        totalSold,
        totalListings: totalListingCount,
        verifiedResident: verified.has(`${sellerId}:${req.user!.syndicateId}`),
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /stats — admin marketplace dashboard stats ───────────────────────────

router.get(
  "/stats",
  requireAuth,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const [
        [{ pending }],
        [{ approved }],
        [{ rejected }],
        [{ reported }],
        [{ sold }],
        [{ reserved }],
        topSellers,
        mostViewed,
      ] = await Promise.all([
        db.select({ pending: count() }).from(productsTable).where(eq(productsTable.status, "pending_review")),
        db.select({ approved: count() }).from(productsTable).where(eq(productsTable.status, "approved")),
        db.select({ rejected: count() }).from(productsTable).where(eq(productsTable.status, "rejected")),
        db
          .select({ reported: count() })
          .from(productReportsTable)
          .where(eq(productReportsTable.status, "pending")),
        db.select({ sold: count() }).from(productsTable).where(eq(productsTable.status, "sold")),
        db.select({ reserved: count() }).from(productsTable).where(eq(productsTable.status, "reserved")),
        db
          .select({
            sellerId: productsTable.sellerId,
            sellerName: productsTable.sellerName,
            totalSold: count(),
          })
          .from(productsTable)
          .where(eq(productsTable.status, "sold"))
          .groupBy(productsTable.sellerId, productsTable.sellerName)
          .orderBy(desc(count()))
          .limit(5),
        db
          .select({ id: productsTable.id, name: productsTable.name, viewCount: productsTable.viewCount, sellerName: productsTable.sellerName })
          .from(productsTable)
          .where(eq(productsTable.status, "approved"))
          .orderBy(desc(productsTable.viewCount))
          .limit(5),
      ]);

      res.json({
        data: {
          pending: Number(pending),
          approved: Number(approved),
          rejected: Number(rejected),
          reported: Number(reported),
          sold: Number(sold),
          reserved: Number(reserved),
          topSellers,
          mostViewed,
        },
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /products/:id/report — abuse report ─────────────────────────────────

const REPORT_AUTO_ESCALATE_THRESHOLD = 3;

router.post("/products/:id/report", requireAuth, async (req, res) => {
  const productId = String(req.params.id) as string;
  const schema = z.object({
    reason: z.enum(["spam", "inappropriate", "fraude", "mauvaise_info", "produit_interdit", "faux_produit", "autre"]),
    details: z.string().max(1000).default(""),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides" });
    return;
  }
  try {
    const user = req.user!;
    const [product] = await db
      .select({ id: productsTable.id, status: productsTable.status, syndicateId: productsTable.syndicateId })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);
    if (!product || product.status !== "approved" || !(await listingOpenTo(req.user!, { sellerId: null, syndicateId: product.syndicateId }))) {
      res.status(404).json({ error: "Produit introuvable" });
      return;
    }

    const [existingReport] = await db
      .select({ id: productReportsTable.id })
      .from(productReportsTable)
      .where(
        and(
          eq(productReportsTable.productId, productId),
          eq(productReportsTable.reporterId, user.userId),
          eq(productReportsTable.status, "pending"),
        ),
      )
      .limit(1);
    if (existingReport) {
      res.status(409).json({ error: "Vous avez déjà signalé ce produit" });
      return;
    }

    const [report] = await db
      .insert(productReportsTable)
      .values({
        productId,
        reporterId: user.userId,
        reporterName: user.name,
        ...result.data,
      })
      .returning();

    // Auto-escalate: if pending reports reach threshold, send product back to moderation
    const [{ reportCount }] = await db
      .select({ reportCount: count() })
      .from(productReportsTable)
      .where(and(eq(productReportsTable.productId, productId), eq(productReportsTable.status, "pending")));

    if (Number(reportCount) >= REPORT_AUTO_ESCALATE_THRESHOLD) {
      await db
        .update(productsTable)
        .set({
          status: "pending_review",
          moderationNote: `Renvoyé en modération automatiquement — ${reportCount} signalements reçus`,
          moderatedBy: null,
          moderatedAt: null,
        })
        .where(and(eq(productsTable.id, productId), eq(productsTable.status, "approved")));
    }

    res.status(201).json({ data: report, message: "Signalement envoyé — merci pour votre vigilance" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /products/:id/promote — premium promotion ───────────────────────────

router.post(
  "/products/:id/promote",
  requireAuth,
  requireSuperAdmin,
  async (req, res) => {
    const productId = String(req.params.id) as string;
    const schema = z.object({
      type: z.enum(["featured", "top_search", "homepage"]),
      durationDays: z.number().int().min(1).max(90),
      amount: z.number().nonnegative().default(0),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }
    try {
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
      if (!product) { res.status(404).json({ error: "Produit introuvable" }); return; }

      const user = req.user!;
      const now = new Date();
      const endDate = new Date(now.getTime() + result.data.durationDays * 86_400_000);

      const [promo] = await db
        .insert(marketplacePromotionsTable)
        .values({
          productId,
          sellerId: product.sellerId ?? user.userId,
          type: result.data.type,
          startDate: now,
          endDate,
          amount: String(result.data.amount),
          status: "active",
          approvedBy: user.userId,
        })
        .returning();

      await db
        .update(productsTable)
        .set({
          boosted: true,
          boostType: result.data.type,
          boostExpiresAt: endDate,
          featured:
            result.data.type === "featured" || result.data.type === "homepage" ? true : undefined,
        })
        .where(eq(productsTable.id, productId));

      res.status(201).json({ data: promo, message: "Promotion activée avec succès" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Sponsored-listing purchase flow (seller-initiated) ────────────────────────
// Product → seller requests a promotion + uploads payment proof → admin
// validates the proof → listing becomes sponsored (boosted/featured).
// Mirrors the appels-de-fonds "submit payment / admin validates" convention.

const PROMO_RATE_PER_DAY: Record<"featured" | "top_search" | "homepage", number> = {
  top_search: 15,
  featured: 25,
  homepage: 40,
};

// POST /products/:id/promotions/request — seller submits a sponsorship request with proof of payment
router.post("/products/:id/promotions/request", requireAuth, async (req, res) => {
  const productId = String(req.params.id) as string;
  const schema = z.object({
    type: z.enum(["featured", "top_search", "homepage"]),
    durationDays: z.number().int().min(1).max(90),
    paymentMethod: z.string().min(1),
    proofUrl: z.string().min(1).optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides" });
    return;
  }
  try {
    const user = req.user!;
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    if (!product) { res.status(404).json({ error: "Produit introuvable" }); return; }
    if (!isAdmin(user.role) && product.sellerId !== user.userId) {
      res.status(403).json({ error: "Vous ne pouvez promouvoir que vos propres annonces" });
      return;
    }

    const { type, durationDays, paymentMethod, proofUrl } = result.data;

    // Reject local device URIs — they are not accessible from the server
    if (proofUrl && (proofUrl.startsWith("file://") || proofUrl.startsWith("content://"))) {
      res.status(400).json({
        error: "Le justificatif doit être téléchargé sur le serveur avant la soumission. URI local non accepté.",
        code: "LOCAL_URI_REJECTED",
      });
      return;
    }

    const now = new Date();
    const endDate = new Date(now.getTime() + durationDays * 86_400_000);
    const amount = PROMO_RATE_PER_DAY[type] * durationDays;

    const [promo] = await db
      .insert(marketplacePromotionsTable)
      .values({
        productId,
        sellerId: product.sellerId ?? user.userId,
        type,
        startDate: now,
        endDate,
        amount: String(amount),
        status: "pending_payment",
        paymentMethod,
        proofUrl: proofUrl ?? null,
      })
      .returning();

    res.status(201).json({ data: promo, message: "Demande de sponsorisation envoyée, en attente de validation du paiement" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /products/promotions/pending — admin queue of sponsorship requests awaiting payment validation
router.get(
  "/products/promotions/pending",
  requireAuth,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const rows = await db
        .select({
          promo: marketplacePromotionsTable,
          productName: productsTable.name,
          sellerName: productsTable.sellerName,
        })
        .from(marketplacePromotionsTable)
        .innerJoin(productsTable, eq(marketplacePromotionsTable.productId, productsTable.id))
        .where(eq(marketplacePromotionsTable.status, "pending_payment"))
        .orderBy(desc(marketplacePromotionsTable.createdAt));
      res.json({ data: rows.map((r) => ({ ...r.promo, productName: r.productName, sellerName: r.sellerName })) });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// PUT /products/promotions/:id/validate — admin approves or rejects a sponsorship payment
router.put(
  "/products/promotions/:id/validate",
  requireAuth,
  requireSuperAdmin,
  async (req, res) => {
    const promoId = String(req.params.id) as string;
    const schema = z.object({
      approve: z.boolean(),
      rejectionReason: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
    try {
      const user = req.user!;
      const [promo] = await db
        .select()
        .from(marketplacePromotionsTable)
        .where(eq(marketplacePromotionsTable.id, promoId));
      if (!promo) { res.status(404).json({ error: "Demande introuvable" }); return; }
      if (promo.status !== "pending_payment") {
        res.status(400).json({ error: "Cette demande n'est pas en attente de validation" });
        return;
      }
      if (!result.data.approve && !result.data.rejectionReason) {
        res.status(400).json({ error: "Un motif de rejet est obligatoire" });
        return;
      }
      // Enforce: admin cannot approve a sponsorship without proof of payment
      if (result.data.approve && !promo.proofUrl) {
        res.status(400).json({
          error: "Validation refusée : une pièce justificative (proofUrl) est obligatoire avant d'approuver le paiement.",
          code: "PROOF_REQUIRED",
        });
        return;
      }

      const now = new Date();
      if (result.data.approve) {
        // Sponsorship window starts now, not at request time, so the seller
        // gets the full duration they paid for.
        const originalDurationMs = promo.endDate.getTime() - promo.startDate.getTime();
        const newEndDate = new Date(now.getTime() + originalDurationMs);

        const [updated] = await db
          .update(marketplacePromotionsTable)
          .set({
            status: "active",
            startDate: now,
            endDate: newEndDate,
            approvedBy: user.userId,
            validatedAt: now,
            rejectionReason: null,
          })
          .where(eq(marketplacePromotionsTable.id, promoId))
          .returning();

        await db
          .update(productsTable)
          .set({
            boosted: true,
            boostType: promo.type,
            boostExpiresAt: newEndDate,
            featured: promo.type === "featured" || promo.type === "homepage" ? true : undefined,
          })
          .where(eq(productsTable.id, promo.productId));

        res.json({ data: updated, message: "Paiement validé — annonce sponsorisée activée" });
      } else {
        const [updated] = await db
          .update(marketplacePromotionsTable)
          .set({
            status: "rejected",
            rejectionReason: result.data.rejectionReason,
            approvedBy: user.userId,
            validatedAt: now,
          })
          .where(eq(marketplacePromotionsTable.id, promoId))
          .returning();
        res.json({ data: updated, message: "Demande de sponsorisation rejetée" });
      }
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /products/:id/reports — admin view reports ───────────────────────────

router.get(
  "/products/:id/reports",
  requireAuth,
  requireSuperAdmin,
  async (req, res) => {
    const productId = String(req.params.id) as string;
    try {
      const rows = await db
        .select()
        .from(productReportsTable)
        .where(eq(productReportsTable.productId, productId))
        .orderBy(desc(productReportsTable.createdAt));
      res.json({ data: rows });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

export default router;
