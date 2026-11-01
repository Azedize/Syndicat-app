// marketplace: listings endpoints (mounted by marketplace.routes.ts, in order).
import { serverAuditLog } from "../../lib/audit.js";
import { Router } from "express";
import { z } from "zod";
import {
  eq,
  and,
  asc,
  ilike,
  or,
  count,
} from "drizzle-orm";
import { db } from "@workspace/db";
import { productsTable, productFavoritesTable, productCommentsTable, usersTable } from "@workspace/db/schema";
import { requireAuth } from "../../middleware/auth.js";
import { sendEmail } from "../../lib/notify.js";
import { marketplaceModerationTemplate } from "../../lib/email/templates.js";
import {
  parsePage,
  canModerate,
  isAdmin,
  listingOpenTo,
  areOwnedMediaPaths,
  autoScan,
  MODERATION_TRANSITIONS,
  getVisibleProductForUser,
} from "./marketplace.service.js";

const router = Router();

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
    if (!adminUser && !user.syndicateId) {
      res.status(403).json({ error: "Syndicat non défini dans le token" });
      return;
    }
    // Marketplace listings are visible across syndicates once approved. A
    // super-admin may therefore create a platform-level listing, but an
    // operational user must always persist the scope carried by their JWT.
    const listingSyndicateId =
      user.role === "super_admin" ? undefined : user.syndicateId;
    const mediaPaths = [
      ...result.data.imageUrls,
      ...(result.data.videoUrl ? [result.data.videoUrl] : []),
    ];
    if (!(await areOwnedMediaPaths(user.userId, mediaPaths))) {
      res.status(403).json({
        error: "Chaque média doit être un fichier privé appartenant au vendeur",
      });
      return;
    }

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
        syndicateId: listingSyndicateId,
        sellerId: user.userId,
        sellerName: user.name,
        status: adminUser ? "approved" : "pending_review",
      } as any)
      .returning();
    res.status(201).json({
      data: product,
      message: adminUser
        ? "Produit publié avec succès"
        : "Annonce soumise — elle sera publiée après validation par le syndic de la résidence",
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
    if (result.data.imageUrls !== undefined || result.data.videoUrl !== undefined) {
      const mediaPaths = [
        ...(result.data.imageUrls ?? []),
        ...(result.data.videoUrl ? [result.data.videoUrl] : []),
      ];
      if (!product.sellerId || !(await areOwnedMediaPaths(product.sellerId, mediaPaths))) {
        res.status(403).json({
          error: "Chaque média doit être un fichier privé appartenant au vendeur",
        });
        return;
      }
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
      // Another residence's listing does not exist for a syndic.
      if (!canModerate(user, product)) {
        res.status(user.role === "syndicate_admin" ? 404 : 403).json({ error: user.role === "syndicate_admin" ? "Produit introuvable" : "Accès refusé" });
        return;
      }
      if (!(action in MODERATION_TRANSITIONS) && user.role !== "super_admin") {
        res.status(403).json({ error: "La mise en avant est une décision de la plateforme", code: "PROMOTION_PLATFORM_ONLY" });
        return;
      }
      if (action in MODERATION_TRANSITIONS) {
        const rule = MODERATION_TRANSITIONS[action as keyof typeof MODERATION_TRANSITIONS];
        if (!rule.from.includes(product.status ?? "")) {
          res.status(409).json({ error: `Action impossible sur une annonce « ${product.status} »`, code: "INVALID_TRANSITION" });
          return;
        }
        if (action !== "approve" && (reason ?? "").trim().length < 5) {
          res.status(400).json({ error: "Un motif (5 caractères au moins) est obligatoire : le vendeur le lira.", code: "REASON_REQUIRED" });
          return;
        }
      }
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
          updates.rejectionReason = reason!.trim();
          break;
        case "request_modification":
          updates.status = "modification_requested";
          updates.rejectionReason = reason!.trim();
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

      await serverAuditLog(req, {
        action: "UPDATE",
        entity: "product_moderation",
        entityId: product.id,
        syndicateId: product.syndicateId ?? undefined,
        details: `${action}: ${product.status} → ${updated.status}${reason ? ` — ${reason.trim().slice(0, 300)}` : ""}${note ? ` (note : ${note.slice(0, 200)})` : ""}`,
      });
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
    const product = await getVisibleProductForUser(productId, req.user!);
    if (!product) {
      res.status(404).json({ error: "Produit introuvable" });
      return;
    }

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
    const product = await getVisibleProductForUser(productId, req.user!);
    if (!product) {
      res.status(404).json({ error: "Produit introuvable" });
      return;
    }

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
    const product = await getVisibleProductForUser(productId, user);
    if (!product) {
      res.status(404).json({ error: "Produit introuvable" });
      return;
    }

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
    if (!(await listingOpenTo(user, product))) {
      res.status(404).json({ error: "Produit introuvable" }); return;
    }
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

export default router;
