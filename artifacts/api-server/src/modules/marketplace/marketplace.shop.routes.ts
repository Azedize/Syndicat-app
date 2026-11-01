// marketplace: shop endpoints (mounted by marketplace.routes.ts, in order).
import { Router } from "express";
import { z } from "zod";
import {
  sql,
  type SQL,
  eq,
  and,
  desc,
  ilike,
  or,
  inArray,
  count,
} from "drizzle-orm";
import { db } from "@workspace/db";
import { productsTable, cartItemsTable, ordersTable, reviewsTable } from "@workspace/db/schema";
import { requireAuth, requireSuperAdmin } from "../../middleware/auth.js";
import { localToday } from "../../lib/charge-time.js";
import {
  PUBLIC_PRODUCT_STATUSES,
  parsePage,
  isAdmin,
  residenceScope,
  listingOpenTo,
  forViewerList,
  getVisibleProductForUser,
} from "./marketplace.service.js";

const router = Router();

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
    if (!product || product.status !== "approved" || !(await listingOpenTo(req.user!, product))) {
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
            date: localToday(),
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
  try {
    const user = req.user!;
    let cond: SQL<unknown> | undefined;
    if (q.productId) {
      const product = await getVisibleProductForUser(q.productId, user);
      if (!product) {
        res.status(404).json({ error: "Produit introuvable" });
        return;
      }
      cond = eq(reviewsTable.productId, q.productId);
    } else if (!isAdmin(user.role)) {
      const publicProducts = await db
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(and(inArray(productsTable.status, [...PUBLIC_PRODUCT_STATUSES]), residenceScope(user)));
      cond = inArray(reviewsTable.productId, publicProducts.map((product) => product.id));
    }

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
    // Legacy purchases carry an order; a hand-over between neighbours does not.
    orderId: z.string().min(1).optional(),
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

    // Reviews are reserved to real buyers: either the neighbour who reserved
    // the item the seller then marked as sold, or (legacy) a delivered order.
    let orderId: string | null = null;
    if (result.data.orderId) {
      const [order] = await db
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.id, result.data.orderId),
            eq(ordersTable.productId, result.data.productId),
            eq(ordersTable.buyerId, user.userId),
            eq(ordersTable.status, "delivered"),
          ),
        )
        .limit(1);
      if (!order) {
        res.status(403).json({ error: "Un avis est disponible uniquement après la remise de l'objet", code: "REVIEW_NOT_ALLOWED" });
        return;
      }
      orderId = order.id;
    } else if (!(product.status === "sold" && product.reservedBy === user.userId)) {
      res.status(403).json({ error: "Un avis est disponible uniquement après la remise de l'objet", code: "REVIEW_NOT_ALLOWED" });
      return;
    }
    const [existingReview] = await db
      .select({ id: reviewsTable.id })
      .from(reviewsTable)
      .where(and(eq(reviewsTable.productId, product.id), eq(reviewsTable.reviewerId, user.userId)))
      .limit(1);
    if (existingReview) {
      res.status(409).json({ error: "Vous avez déjà évalué cet échange", code: "REVIEW_ALREADY_EXISTS" });
      return;
    }
    const [review] = await db
      .insert(reviewsTable)
      .values({
        ...result.data,
        orderId,
        productName: product.name,
        reviewerId: user.userId,
        reviewerName: user.name,
        date: localToday(),
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
      conds.push(residenceScope(user)!);
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
    res.json({ data: await forViewerList(rows, req.user!), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
