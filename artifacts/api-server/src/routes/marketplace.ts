import { Router } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  productsTable,
  cartItemsTable,
  ordersTable,
  reviewsTable,
  productFavoritesTable,
  productReportsTable,
  productCommentsTable,
  marketplacePromotionsTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and, desc, asc, ilike, or, inArray, count, ne } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../middleware/auth.js";
import { sendEmail } from "../lib/notify.js";
import { marketplaceModerationTemplate } from "../lib/email/templates.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parsePage(q: Record<string, string>) {
  const page = Math.max(1, parseInt(q.page ?? "1") || 1);
  const limit = Math.min(50, Math.max(1, parseInt(q.limit ?? "20") || 20));
  return { page, limit, offset: (page - 1) * limit };
}

function isAdmin(role: string) {
  // Only the platform super_admin has marketplace admin privileges.
  // syndicate_admin has NO moderation rights — they see the public catalogue only.
  return role === "super_admin";
}

// ─── Auto-scan: prohibited words + spam detection ─────────────────────────────

const PROHIBITED_WORDS = [
  // Weapons
  "arme", "fusil", "pistolet", "couteau", "explosif", "munition",
  // Drugs
  "drogue", "cannabis", "cocaine", "héroïne", "crack", "stupéfiant",
  // Alcohol (for dry jurisdictions)
  "alcool", "whisky", "vodka", "bière", "vin",
  // Adult
  "porn", "sexe", "adulte", "escort",
  // Counterfeit
  "contrefaçon", "faux", "réplique", "copie",
  // Dangerous
  "dangereux", "illégal", "frauduleux",
];

const SPAM_PATTERNS = [
  /(.)\1{6,}/i,               // 7+ repeated chars
  /https?:\/\//gi,            // URLs in title
  /\d{10,}/,                  // Long digit strings (phone spam)
  /whatsapp|telegram|signal/i, // External contact channels
];

function autoScan(title: string, description: string): { flagged: boolean; reason?: string } {
  const combined = `${title} ${description}`.toLowerCase();
  for (const word of PROHIBITED_WORDS) {
    if (combined.includes(word)) {
      return { flagged: true, reason: `Contenu interdit détecté : "${word}"` };
    }
  }
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(combined)) {
      return { flagged: true, reason: "Indicateur de spam détecté dans le contenu" };
    }
  }
  return { flagged: false };
}

// ─── GET /products ─────────────────────────────────────────────────────────────
// Cross-syndicate: approved products visible to all authenticated users.
// Admins can filter by any status.

router.get("/products", requireAuth, async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page, limit, offset } = parsePage(q);
  const user = req.user!;

  try {
    const conds: ReturnType<typeof eq>[] = [];

    if (isAdmin(user.role)) {
      if (q.status) conds.push(eq(productsTable.status, q.status));
    } else {
      conds.push(eq(productsTable.status, "approved"));
    }

    if (q.category && q.category !== "Tous") conds.push(eq(productsTable.category, q.category));
    if (q.condition) conds.push(eq(productsTable.condition, q.condition));
    if (q.featured === "true") conds.push(eq(productsTable.featured, true));
    if (q.sellerId === "me") conds.push(eq(productsTable.sellerId, user.userId));
    else if (q.sellerId) conds.push(eq(productsTable.sellerId, q.sellerId));

    if (q.search) {
      conds.push(
        or(
          ilike(productsTable.name, `%${q.search}%`),
          ilike(productsTable.description, `%${q.search}%`),
          ilike(productsTable.sellerName, `%${q.search}%`),
          ilike(productsTable.location, `%${q.search}%`),
        ) as ReturnType<typeof eq>,
      );
    }

    const where = conds.length ? and(...conds) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(productsTable)
        .where(where)
        .orderBy(desc(productsTable.boosted), desc(productsTable.featured), desc(productsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(productsTable).where(where),
    ]);

    res.json({ data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /products/featured ────────────────────────────────────────────────────

router.get("/products/featured", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.status, "approved"), eq(productsTable.featured, true)))
      .orderBy(desc(productsTable.boosted), desc(productsTable.createdAt))
      .limit(12);
    res.json({ data: rows });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /products/pending — admin moderation queue ──────────────────────────

router.get(
  "/products/pending",
  requireAuth,
  requireSuperAdmin,
  async (req, res) => {
    const q = req.query as Record<string, string>;
    const { page, limit, offset } = parsePage(q);
    try {
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(productsTable)
          .where(eq(productsTable.status, "pending_review"))
          .orderBy(asc(productsTable.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: count() })
          .from(productsTable)
          .where(eq(productsTable.status, "pending_review")),
      ]);
      res.json({ data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── GET /products/my-favorites ───────────────────────────────────────────────

router.get("/products/my-favorites", requireAuth, async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page, limit, offset } = parsePage(q);
  const userId = req.user!.userId;
  try {
    const favs = await db
      .select({ productId: productFavoritesTable.productId })
      .from(productFavoritesTable)
      .where(eq(productFavoritesTable.userId, userId));

    const ids = favs.map((f) => f.productId);
    if (!ids.length) {
      res.json({ data: [], pagination: { page, limit, total: 0, pages: 0 } });
      return;
    }

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(productsTable)
        .where(and(inArray(productsTable.id, ids), eq(productsTable.status, "approved")))
        .orderBy(desc(productsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(productsTable)
        .where(and(inArray(productsTable.id, ids), eq(productsTable.status, "approved"))),
    ]);

    res.json({ data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /products/my-listings — seller's own products ───────────────────────

router.get("/products/my-listings", requireAuth, async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page, limit, offset } = parsePage(q);
  const userId = req.user!.userId;
  try {
    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(productsTable)
        .where(eq(productsTable.sellerId, userId))
        .orderBy(desc(productsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(productsTable).where(eq(productsTable.sellerId, userId)),
    ]);
    res.json({ data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /products/my-promotions — seller views their own sponsorship requests/history
router.get("/products/my-promotions", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const rows = await db
      .select({
        promo: marketplacePromotionsTable,
        productName: productsTable.name,
      })
      .from(marketplacePromotionsTable)
      .innerJoin(productsTable, eq(marketplacePromotionsTable.productId, productsTable.id))
      .where(eq(marketplacePromotionsTable.sellerId, user.userId))
      .orderBy(desc(marketplacePromotionsTable.createdAt));
    res.json({ data: rows.map((r) => ({ ...r.promo, productName: r.productName })) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /products/:id — detail + view count increment ───────────────────────

router.get("/products/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
  const user = req.user!;
  try {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    if (!product) { res.status(404).json({ error: "Produit introuvable" }); return; }

    if (product.status !== "approved" && !isAdmin(user.role) && product.sellerId !== user.userId) {
      res.status(403).json({ error: "Produit non disponible" }); return;
    }

    // fire-and-forget view count
    db.update(productsTable)
      .set({ viewCount: sql`${productsTable.viewCount} + 1` })
      .where(eq(productsTable.id, id))
      .execute()
      .catch(() => {});

    const [fav, [{ avgRating, ratingCount }], reports] = await Promise.all([
      db
        .select()
        .from(productFavoritesTable)
        .where(and(eq(productFavoritesTable.productId, id), eq(productFavoritesTable.userId, user.userId)))
        .limit(1),
      db
        .select({
          avgRating: sql<string>`coalesce(avg(${reviewsTable.rating})::numeric(3,1), 0)`,
          ratingCount: count(),
        })
        .from(reviewsTable)
        .where(eq(reviewsTable.productId, id)),
      isAdmin(user.role)
        ? db
            .select({ total: count() })
            .from(productReportsTable)
            .where(
              and(eq(productReportsTable.productId, id), eq(productReportsTable.status, "pending")),
            )
        : Promise.resolve([{ total: 0 }]),
    ]);

    res.json({
      data: {
        ...product,
        isFavorited: fav.length > 0,
        avgRating: Number(avgRating).toFixed(1),
        ratingCount,
        pendingReports: reports[0]?.total ?? 0,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /products ────────────────────────────────────────────────────────────

router.post("/products", requireAuth, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).default(""),
    price: z.number().positive(),
    originalPrice: z.number().positive().optional(),
    category: z.string().min(1),
    condition: z.enum(["neuf", "bon", "acceptable", "mauvais"]).default("bon"),
    brand: z.string().max(100).optional(),
    model: z.string().max(100).optional(),
    purchaseYear: z.string().max(10).optional(),
    sellingReason: z.string().max(500).optional(),
    negotiable: z.boolean().default(false),
    contactPreferences: z.array(z.enum(["chat", "phone", "email"])).default(["chat"]),
    location: z.string().max(200).default(""),
    building: z.string().max(100).optional(),
    block: z.string().max(100).optional(),
    floor: z.string().max(50).optional(),
    imageUrls: z.array(z.string()).max(8).default([]),
    videoUrl: z.string().max(500).optional(),
    stock: z.number().int().nonnegative().default(1),
    sellerPhone: z.string().max(30).optional(),
    sellerEmail: z.string().max(200).optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides", details: result.error.flatten() });
    return;
  }
  try {
    const user = req.user!;
    const adminUser = isAdmin(user.role);

    // Auto-scan for prohibited content
    const scan = autoScan(result.data.name, result.data.description);
    if (scan.flagged && !adminUser) {
      res.status(400).json({ error: scan.reason ?? "Contenu non conforme aux règles du marketplace", code: "CONTENT_FLAGGED" });
      return;
    }

    // Duplicate detection: same seller, same name, still active/pending
    const [existing] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.sellerId, user.userId),
          ilike(productsTable.name, result.data.name.trim()),
          or(eq(productsTable.status, "approved"), eq(productsTable.status, "pending_review")),
        ),
      )
      .limit(1);
    if (existing && !adminUser) {
      res.status(409).json({ error: "Vous avez déjà une annonce similaire en cours. Modifiez-la plutôt que d'en créer une nouvelle.", code: "DUPLICATE_LISTING" });
      return;
    }

    const [product] = await db
      .insert(productsTable)
      .values({
        ...result.data,
        imageUrls: JSON.stringify(result.data.imageUrls),
        contactPreferences: JSON.stringify(result.data.contactPreferences),
        originalPrice: result.data.originalPrice !== undefined ? String(result.data.originalPrice) : undefined,
        syndicateId: user.syndicateId ?? "",
        sellerId: user.userId,
        sellerName: user.name,
        status: adminUser ? "approved" : "pending_review",
      } as any)
      .returning();
    res.status(201).json({
      data: product,
      message: adminUser
        ? "Produit publié avec succès"
        : "Produit soumis — en attente de validation par l'administration",
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── PUT /products/:id ─────────────────────────────────────────────────────────

router.put("/products/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
  const schema = z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    price: z.number().positive().optional(),
    originalPrice: z.number().positive().optional(),
    category: z.string().optional(),
    condition: z.enum(["neuf", "bon", "acceptable", "mauvais"]).optional(),
    brand: z.string().max(100).optional(),
    model: z.string().max(100).optional(),
    purchaseYear: z.string().max(10).optional(),
    sellingReason: z.string().max(500).optional(),
    negotiable: z.boolean().optional(),
    contactPreferences: z.array(z.enum(["chat", "phone", "email"])).optional(),
    location: z.string().max(200).optional(),
    building: z.string().max(100).optional(),
    block: z.string().max(100).optional(),
    floor: z.string().max(50).optional(),
    imageUrls: z.array(z.string()).max(8).optional(),
    videoUrl: z.string().max(500).optional(),
    stock: z.number().int().nonnegative().optional(),
    sellerPhone: z.string().max(30).optional(),
    sellerEmail: z.string().max(200).optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides", details: result.error.flatten() });
    return;
  }
  try {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    if (!product) { res.status(404).json({ error: "Produit introuvable" }); return; }

    const user = req.user!;
    const adminUser = isAdmin(user.role);
    if (!adminUser && product.sellerId !== user.userId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }

    const updates: Record<string, unknown> = { ...result.data };
    if (result.data.imageUrls !== undefined) {
      updates.imageUrls = JSON.stringify(result.data.imageUrls);
    }
    if (result.data.contactPreferences !== undefined) {
      updates.contactPreferences = JSON.stringify(result.data.contactPreferences);
    }
    if (result.data.originalPrice !== undefined) {
      updates.originalPrice = String(result.data.originalPrice);
    }
    // seller editing a live product → re-submit for review
    if (!adminUser && (product.status === "approved" || product.status === "modification_requested")) {
      updates.status = "pending_review";
      updates.moderatedBy = null;
      updates.moderatedAt = null;
    }

    const [updated] = await db
      .update(productsTable)
      .set(updates)
      .where(eq(productsTable.id, id))
      .returning();
    res.json({ data: updated, message: "Produit mis à jour" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── DELETE /products/:id ──────────────────────────────────────────────────────

router.delete("/products/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
  try {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    if (!product) { res.status(404).json({ error: "Produit introuvable" }); return; }

    const user = req.user!;
    if (!isAdmin(user.role) && product.sellerId !== user.userId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    await db.delete(productsTable).where(eq(productsTable.id, id));
    res.json({ message: "Produit supprimé" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /products/:id/moderate — admin actions ──────────────────────────────

router.post(
  "/products/:id/moderate",
  requireAuth,
  requireSuperAdmin,
  async (req, res) => {
    const id = String(req.params.id) as string;
    const schema = z.object({
      action: z.enum([
        "approve",
        "reject",
        "request_modification",
        "feature",
        "unfeature",
        "boost",
        "unboost",
      ]),
      reason: z.string().max(1000).optional(),
      note: z.string().max(1000).optional(),
      boostType: z.enum(["featured", "top_search", "homepage"]).optional(),
      boostDays: z.number().int().min(1).max(90).optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides", details: result.error.flatten() });
      return;
    }
    try {
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
      if (!product) { res.status(404).json({ error: "Produit introuvable" }); return; }

      const { action, reason, note, boostType, boostDays } = result.data;
      const user = req.user!;
      const updates: Record<string, unknown> = {
        moderatedBy: user.userId,
        moderatedAt: new Date(),
        moderationNote: note ?? null,
      };

      switch (action) {
        case "approve":
          updates.status = "approved";
          updates.rejectionReason = null;
          break;
        case "reject":
          updates.status = "rejected";
          updates.rejectionReason = reason ?? "Non conforme aux règles du marketplace";
          break;
        case "request_modification":
          updates.status = "modification_requested";
          updates.rejectionReason = reason ?? "Des modifications sont requises avant publication";
          break;
        case "feature":
          updates.featured = true;
          break;
        case "unfeature":
          updates.featured = false;
          break;
        case "boost":
          updates.boosted = true;
          updates.boostType = boostType ?? "featured";
          updates.boostExpiresAt = new Date(Date.now() + (boostDays ?? 7) * 86_400_000);
          break;
        case "unboost":
          updates.boosted = false;
          updates.boostType = null;
          updates.boostExpiresAt = null;
          break;
      }

      const [updated] = await db
        .update(productsTable)
        .set(updates)
        .where(eq(productsTable.id, id))
        .returning();

      if (product.sellerId && (action === "approve" || action === "reject" || action === "request_modification")) {
        const [seller] = await db
          .select({ email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.id, product.sellerId));
        if (seller) {
          const { subject, html } = marketplaceModerationTemplate(
            product.name ?? "Votre annonce",
            action === "approve" ? "approved" : action === "reject" ? "rejected" : "modification_requested",
            reason ?? note,
          );
          sendEmail(seller.email, subject, html, "marketplace_moderation", null).catch(() => {});
        }
      }

      res.json({ data: updated, message: `Action "${action}" effectuée avec succès` });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── POST /products/:id/favorite — toggle ─────────────────────────────────────

router.post("/products/:id/favorite", requireAuth, async (req, res) => {
  const productId = String(req.params.id) as string;
  const userId = req.user!.userId;
  try {
    const [existing] = await db
      .select()
      .from(productFavoritesTable)
      .where(
        and(eq(productFavoritesTable.productId, productId), eq(productFavoritesTable.userId, userId)),
      );

    if (existing) {
      await db
        .delete(productFavoritesTable)
        .where(
          and(
            eq(productFavoritesTable.productId, productId),
            eq(productFavoritesTable.userId, userId),
          ),
        );
      res.json({ isFavorited: false, message: "Retiré des favoris" });
    } else {
      await db.insert(productFavoritesTable).values({ productId, userId });
      res.json({ isFavorited: true, message: "Ajouté aux favoris" });
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /products/:id/comments ───────────────────────────────────────────────

router.get("/products/:id/comments", requireAuth, async (req, res) => {
  const productId = String(req.params.id) as string;
  const q = req.query as Record<string, string>;
  const { page, limit, offset } = parsePage(q);
  try {
    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(productCommentsTable)
        .where(eq(productCommentsTable.productId, productId))
        .orderBy(asc(productCommentsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(productCommentsTable)
        .where(eq(productCommentsTable.productId, productId)),
    ]);
    res.json({ data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /products/:id/comments ──────────────────────────────────────────────

router.post("/products/:id/comments", requireAuth, async (req, res) => {
  const productId = String(req.params.id) as string;
  const schema = z.object({ content: z.string().min(1).max(1000) });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Le commentaire ne peut pas être vide" });
    return;
  }
  try {
    const user = req.user!;
    const [comment] = await db
      .insert(productCommentsTable)
      .values({
        productId,
        userId: user.userId,
        userName: user.name,
        userRole: user.role,
        content: result.data.content,
      })
      .returning();
    res.status(201).json({ data: comment });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── DELETE /products/:id/comments/:commentId ─────────────────────────────────

router.delete("/products/:id/comments/:commentId", requireAuth, async (req, res) => {
  const { id: productId, commentId } = req.params as Record<string, string>;
  try {
    const [comment] = await db
      .select()
      .from(productCommentsTable)
      .where(
        and(
          eq(productCommentsTable.id, commentId),
          eq(productCommentsTable.productId, productId),
        ),
      );
    if (!comment) { res.status(404).json({ error: "Commentaire introuvable" }); return; }

    const user = req.user!;
    if (!isAdmin(user.role) && comment.userId !== user.userId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    await db.delete(productCommentsTable).where(eq(productCommentsTable.id, commentId));
    res.json({ message: "Commentaire supprimé" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /products/:id/reserve — buyer reserves a product ───────────────────

router.post("/products/:id/reserve", requireAuth, async (req, res) => {
  const productId = String(req.params.id) as string;
  try {
    const user = req.user!;
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    if (!product) { res.status(404).json({ error: "Produit introuvable" }); return; }
    if (product.status !== "approved") {
      res.status(400).json({ error: "Ce produit n'est pas disponible à la réservation" }); return;
    }
    if (product.sellerId === user.userId) {
      res.status(400).json({ error: "Vous ne pouvez pas réserver votre propre produit" }); return;
    }
    const [updated] = await db
      .update(productsTable)
      .set({ status: "reserved", reservedBy: user.userId, reservedByName: user.name, reservedAt: new Date() })
      .where(and(eq(productsTable.id, productId), eq(productsTable.status, "approved")))
      .returning();
    if (!updated) { res.status(409).json({ error: "Ce produit vient d'être réservé par quelqu'un d'autre" }); return; }
    res.json({ data: updated, message: "Produit réservé avec succès" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── DELETE /products/:id/reserve — cancel reservation ───────────────────────

router.delete("/products/:id/reserve", requireAuth, async (req, res) => {
  const productId = String(req.params.id) as string;
  try {
    const user = req.user!;
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    if (!product) { res.status(404).json({ error: "Produit introuvable" }); return; }
    if (product.status !== "reserved") { res.status(400).json({ error: "Ce produit n'est pas réservé" }); return; }
    // Only the buyer who reserved or the seller or admin can cancel
    if (!isAdmin(user.role) && product.reservedBy !== user.userId && product.sellerId !== user.userId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    const [updated] = await db
      .update(productsTable)
      .set({ status: "approved", reservedBy: null, reservedByName: null, reservedAt: null })
      .where(eq(productsTable.id, productId))
      .returning();
    res.json({ data: updated, message: "Réservation annulée" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── POST /products/:id/mark-sold — seller marks product as sold ──────────────

router.post("/products/:id/mark-sold", requireAuth, async (req, res) => {
  const productId = String(req.params.id) as string;
  try {
    const user = req.user!;
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    if (!product) { res.status(404).json({ error: "Produit introuvable" }); return; }
    if (!isAdmin(user.role) && product.sellerId !== user.userId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    if (!["approved", "reserved"].includes(product.status ?? "")) {
      res.status(400).json({ error: "Seuls les produits disponibles ou réservés peuvent être marqués comme vendus" }); return;
    }
    const [updated] = await db
      .update(productsTable)
      .set({ status: "sold", soldAt: new Date(), stock: 0 })
      .where(eq(productsTable.id, productId))
      .returning();
    res.json({ data: updated, message: "Produit marqué comme vendu. La transaction est archivée." });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

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

    // Community trust score: weighted from ratings + sold items + review count
    const trustScore = Math.min(
      100,
      Math.round((avgRating / 5) * 50 + Math.min(totalSold * 5, 30) + Math.min(totalReviews * 2, 20)),
    );

    res.json({
      data: {
        sellerId,
        avgRating: avgRating.toFixed(1),
        totalReviews,
        totalSold,
        totalListings: totalListingCount,
        trustScore,
        isVerified: totalSold >= 3 && avgRating >= 3.5,
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

// ─── GET /products/reported — admin: products with pending reports ─────────────

router.get(
  "/products/reported",
  requireAuth,
  requireSuperAdmin,
  async (req, res) => {
    const q = req.query as Record<string, string>;
    const { page, limit, offset } = parsePage(q);
    try {
      // Products that have at least 1 pending report
      const reportedIds = await db
        .selectDistinct({ productId: productReportsTable.productId })
        .from(productReportsTable)
        .where(eq(productReportsTable.status, "pending"));

      const ids = reportedIds.map((r) => r.productId).filter(Boolean) as string[];
      if (!ids.length) {
        res.json({ data: [], pagination: { page, limit, total: 0, pages: 0 } });
        return;
      }

      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            product: productsTable,
            reportCount: sql<number>`(select count(*) from product_reports where product_id = ${productsTable.id} and status = 'pending')`,
          })
          .from(productsTable)
          .where(inArray(productsTable.id, ids))
          .orderBy(desc(productsTable.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(productsTable).where(inArray(productsTable.id, ids)),
      ]);

      res.json({
        data: rows.map((r) => ({ ...r.product, reportCount: Number(r.reportCount) })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
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

// ─── Cart ─────────────────────────────────────────────────────────────────────

router.get("/cart", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(cartItemsTable)
      .where(eq(cartItemsTable.userId, req.user!.userId))
      .orderBy(desc(cartItemsTable.createdAt));
    res.json({ data: rows });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/cart", requireAuth, async (req, res) => {
  const schema = z.object({
    productId: z.string(),
    quantity: z.number().int().positive().default(1),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides" });
    return;
  }
  try {
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, result.data.productId));
    if (!product || product.status !== "approved") {
      res.status(404).json({ error: "Produit non disponible" });
      return;
    }
    if (product.sellerId === req.user!.userId) {
      res.status(400).json({ error: "Vous ne pouvez pas acheter vos propres produits" });
      return;
    }
    const [existing] = await db
      .select()
      .from(cartItemsTable)
      .where(
        and(
          eq(cartItemsTable.userId, req.user!.userId),
          eq(cartItemsTable.productId, result.data.productId),
        ),
      );
    if (existing) {
      const [updated] = await db
        .update(cartItemsTable)
        .set({ quantity: existing.quantity! + result.data.quantity })
        .where(eq(cartItemsTable.id, existing.id))
        .returning();
      res.json({ data: updated, message: "Panier mis à jour" });
      return;
    }
    const [item] = await db
      .insert(cartItemsTable)
      .values({
        userId: req.user!.userId,
        productId: product.id,
        productName: product.name,
        price: product.price,
        sellerName: product.sellerName,
        quantity: result.data.quantity,
      })
      .returning();
    res.status(201).json({ data: item, message: "Produit ajouté au panier" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.put("/cart/:id", requireAuth, async (req, res) => {
  const schema = z.object({ quantity: z.number().int().positive() });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Quantité invalide" });
    return;
  }
  try {
    const [item] = await db
      .select()
      .from(cartItemsTable)
      .where(
        and(
          eq(cartItemsTable.id, String(req.params.id) as string),
          eq(cartItemsTable.userId, req.user!.userId),
        ),
      );
    if (!item) { res.status(404).json({ error: "Article introuvable" }); return; }
    const [updated] = await db
      .update(cartItemsTable)
      .set({ quantity: result.data.quantity })
      .where(eq(cartItemsTable.id, item.id))
      .returning();
    res.json({ data: updated });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/cart/:id", requireAuth, async (req, res) => {
  try {
    await db
      .delete(cartItemsTable)
      .where(
        and(
          eq(cartItemsTable.id, String(req.params.id) as string),
          eq(cartItemsTable.userId, req.user!.userId),
        ),
      );
    res.json({ message: "Article retiré du panier" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/cart", requireAuth, async (req, res) => {
  try {
    await db.delete(cartItemsTable).where(eq(cartItemsTable.userId, req.user!.userId));
    res.json({ message: "Panier vidé" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Orders ───────────────────────────────────────────────────────────────────

router.get("/orders", requireAuth, async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page, limit, offset } = parsePage(q);
  const user = req.user!;
  try {
    const cond = isAdmin(user.role)
      ? undefined
      : or(eq(ordersTable.buyerId, user.userId), eq(ordersTable.sellerId, user.userId));

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(ordersTable)
        .where(cond)
        .orderBy(desc(ordersTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(ordersTable).where(cond),
    ]);
    res.json({ data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/orders", requireAuth, async (req, res) => {
  const schema = z.object({ cartItemIds: z.array(z.string()).min(1) });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides" });
    return;
  }
  try {
    const items = await db
      .select()
      .from(cartItemsTable)
      .where(eq(cartItemsTable.userId, req.user!.userId));
    const toOrder = items.filter((i) => result.data.cartItemIds.includes(i.id));
    if (!toOrder.length) {
      res.status(400).json({ error: "Aucun article à commander" });
      return;
    }
    const orders: unknown[] = [];
    await db.transaction(async (tx) => {
      for (const item of toOrder) {
        const [product] = await tx
          .select()
          .from(productsTable)
          .where(eq(productsTable.id, item.productId));
        if (!product || product.status !== "approved") continue;
        if (product.sellerId === req.user!.userId) continue;
        if (product.stock !== null && product.stock > 0 && item.quantity! > product.stock) continue;
        const [order] = await tx
          .insert(ordersTable)
          .values({
            productId: item.productId,
            productName: item.productName,
            buyerId: req.user!.userId,
            buyerName: req.user!.name,
            sellerId: product.sellerId,
            sellerName: product.sellerName,
            amount: String(Number(item.price) * (item.quantity ?? 1)),
            status: "pending",
            type: "purchase",
            date: new Date().toISOString().split("T")[0],
          })
          .returning();
        orders.push(order);
        if (product.stock !== null && product.stock > 0) {
          await tx
            .update(productsTable)
            .set({ stock: sql`${productsTable.stock} - ${item.quantity}` })
            .where(eq(productsTable.id, product.id));
        }
        await tx.delete(cartItemsTable).where(eq(cartItemsTable.id, item.id));
      }
    });
    if (!orders.length) {
      res.status(400).json({ error: "Aucune commande valide — vérifiez la disponibilité" });
      return;
    }
    res.status(201).json({ data: orders, message: "Commande passée avec succès" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.put(
  "/orders/:id",
  requireAuth,
  requireSuperAdmin,
  async (req, res) => {
    const schema = z.object({
      status: z.enum(["pending", "confirmed", "shipped", "delivered", "cancelled"]),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Statut invalide" });
      return;
    }
    try {
      const [order] = await db
        .update(ordersTable)
        .set({ status: result.data.status })
        .where(eq(ordersTable.id, String(req.params.id) as string))
        .returning();
      res.json({ data: order });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Reviews ──────────────────────────────────────────────────────────────────

router.get("/reviews", requireAuth, async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page, limit, offset } = parsePage(q);
  const cond = q.productId ? eq(reviewsTable.productId, q.productId) : undefined;
  try {
    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(reviewsTable)
        .where(cond)
        .orderBy(desc(reviewsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(reviewsTable).where(cond),
    ]);
    res.json({ data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/reviews", requireAuth, async (req, res) => {
  const schema = z.object({
    productId: z.string(),
    orderId: z.string().optional(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(2000).default(""),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Données invalides" });
    return;
  }
  try {
    const user = req.user!;
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, result.data.productId));
    if (!product) { res.status(404).json({ error: "Produit introuvable" }); return; }
    const [review] = await db
      .insert(reviewsTable)
      .values({
        ...result.data,
        productName: product.name,
        reviewerId: user.userId,
        reviewerName: user.name,
        date: new Date().toISOString().split("T")[0],
      })
      .returning();
    res.status(201).json({ data: review });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── Alias /marketplace → /products (backward-compat) ──────────────────────
// Some older client versions hit /marketplace instead of /products.
// Forward the request so they get a real response instead of a 404.

router.get("/marketplace", requireAuth, async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page, limit, offset } = parsePage(q);
  const user = req.user!;

  try {
    const conds: ReturnType<typeof eq>[] = [];
    if (isAdmin(user.role)) {
      if (q.status) conds.push(eq(productsTable.status, q.status));
    } else {
      conds.push(eq(productsTable.status, "approved"));
    }
    if (q.category && q.category !== "Tous") conds.push(eq(productsTable.category, q.category));
    if (q.search) {
      conds.push(
        or(
          ilike(productsTable.name, `%${q.search}%`),
          ilike(productsTable.description, `%${q.search}%`),
        ) as ReturnType<typeof eq>,
      );
    }
    const where = conds.length ? and(...conds) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(productsTable).where(where)
        .orderBy(desc(productsTable.boosted), desc(productsTable.featured), desc(productsTable.createdAt))
        .limit(limit).offset(offset),
      db.select({ total: count() }).from(productsTable).where(where),
    ]);
    res.json({ data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
