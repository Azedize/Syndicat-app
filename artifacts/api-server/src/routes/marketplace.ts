import { Router } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { productsTable, cartItemsTable, ordersTable, reviewsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.get("/products", requireAuth, async (req, res) => {
  const { category, status, sellerId } = req.query as Record<string, string>;
  try {
    const syndicateId = req.user!.syndicateId || "";
    const conditions: any[] = [eq(productsTable.syndicateId, syndicateId)];
    if (category) conditions.push(eq(productsTable.category, category));
    if (status) conditions.push(eq(productsTable.status, status as any));
    if (sellerId === "me") conditions.push(eq(productsTable.sellerId, req.user!.userId));
    const rows = await db
      .select()
      .from(productsTable)
      .where(and(...conditions))
      .orderBy(desc(productsTable.createdAt));
    res.json({ data: rows });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

router.post("/products", requireAuth, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).default(""),
    price: z.number().positive(),
    category: z.string().min(1),
    stock: z.number().int().nonnegative().default(0),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
  try {
    const [product] = await db
      .insert(productsTable)
      .values({
        ...result.data,
        syndicateId: req.user!.syndicateId || "",
        sellerId: req.user!.userId,
        sellerName: req.user!.name,
        status: req.user!.role === "member" ? "pending" : "available",
      })
      .returning();
    res.status(201).json({ data: product, message: "Produit ajouté — en attente de validation" });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

router.put("/products/:id", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const schema = z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    price: z.number().positive().optional(),
    stock: z.number().int().nonnegative().optional(),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
  try {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    if (!product) { res.status(404).json({ error: "Produit introuvable" }); return; }
    if (
      req.user!.role === "member" &&
      product.sellerId !== req.user!.userId
    ) {
      res.status(403).json({ error: "Vous ne pouvez modifier que vos propres produits" }); return;
    }
    if (
      req.user!.role !== "super_admin" &&
      product.syndicateId !== req.user!.syndicateId
    ) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    const [updated] = await db
      .update(productsTable)
      .set(result.data)
      .where(eq(productsTable.id, id))
      .returning();
    res.json({ data: updated, message: "Produit mis à jour" });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

router.delete("/products/:id", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  try {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    if (!product) { res.status(404).json({ error: "Produit introuvable" }); return; }
    const isAdmin = req.user!.role === "super_admin" || req.user!.role === "syndicate_admin";
    if (!isAdmin && product.sellerId !== req.user!.userId) {
      res.status(403).json({ error: "Accès refusé" }); return;
    }
    await db
      .delete(productsTable)
      .where(eq(productsTable.id, id));
    res.json({ message: "Produit supprimé" });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

router.put(
  "/products/:id/validate",
  requireAuth,
  requireRole("super_admin", "syndicate_admin"),
  async (req, res) => {
    const id = req.params.id as string;
    const schema = z.object({ action: z.enum(["approve", "reject"]) });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "Action invalide" }); return; }
    try {
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
      if (!product) { res.status(404).json({ error: "Produit introuvable" }); return; }
      if (
        req.user!.role !== "super_admin" &&
        product.syndicateId !== req.user!.syndicateId
      ) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      const status = result.data.action === "approve" ? "available" : "rejected";
      const [updated] = await db
        .update(productsTable)
        .set({ status })
        .where(eq(productsTable.id, id))
        .returning();
      res.json({
        data: updated,
        message: result.data.action === "approve" ? "Produit validé" : "Produit rejeté",
      });
    } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },
);

router.get("/cart", requireAuth, async (req, res) => {
  try {
    const items = await db
      .select()
      .from(cartItemsTable)
      .where(eq(cartItemsTable.userId, req.user!.userId));
    res.json({ data: items });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

router.post("/cart", requireAuth, async (req, res) => {
  const schema = z.object({
    productId: z.string(),
    quantity: z.number().int().positive().max(100).default(1),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
  try {
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, result.data.productId));
    if (!product) { res.status(404).json({ error: "Produit introuvable" }); return; }
    if (product.status !== "available") {
      res.status(400).json({ error: "Ce produit n'est pas disponible" }); return;
    }
    if (product.sellerId === req.user!.userId) {
      res.status(400).json({ error: "Vous ne pouvez pas acheter votre propre produit" }); return;
    }
    if (product.stock > 0 && result.data.quantity > product.stock) {
      res.status(400).json({ error: `Stock insuffisant (${product.stock} disponible(s))` }); return;
    }
    const existing = await db
      .select()
      .from(cartItemsTable)
      .where(
        and(
          eq(cartItemsTable.userId, req.user!.userId),
          eq(cartItemsTable.productId, result.data.productId),
        ),
      );
    if (existing.length > 0) {
      await db
        .update(cartItemsTable)
        .set({ quantity: existing[0].quantity + result.data.quantity })
        .where(eq(cartItemsTable.id, existing[0].id));
    } else {
      await db.insert(cartItemsTable).values({
        userId: req.user!.userId,
        productId: product.id,
        productName: product.name,
        price: product.price,
        sellerName: product.sellerName,
        quantity: result.data.quantity,
      });
    }
    res.json({ message: "Ajouté au panier" });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

router.put("/cart/:id", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  const schema = z.object({ quantity: z.number().int().positive().max(100) });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
  try {
    const [updated] = await db
      .update(cartItemsTable)
      .set({ quantity: result.data.quantity })
      .where(and(eq(cartItemsTable.id, id), eq(cartItemsTable.userId, req.user!.userId)))
      .returning();
    res.json({ data: updated });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

router.delete("/cart/:id", requireAuth, async (req, res) => {
  const id = req.params.id as string;
  try {
    await db
      .delete(cartItemsTable)
      .where(and(eq(cartItemsTable.id, id), eq(cartItemsTable.userId, req.user!.userId)));
    res.json({ message: "Retiré du panier" });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

router.get("/reviews", requireAuth, async (req, res) => {
  const { productId } = req.query as Record<string, string>;
  try {
    const conditions: any[] = [];
    if (productId) conditions.push(eq(reviewsTable.productId, productId));
    const rows =
      conditions.length > 0
        ? await db
            .select()
            .from(reviewsTable)
            .where(and(...conditions))
            .orderBy(desc(reviewsTable.createdAt))
        : await db.select().from(reviewsTable).orderBy(desc(reviewsTable.createdAt));
    res.json({ data: rows });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

router.post("/reviews", requireAuth, async (req, res) => {
  const schema = z.object({
    productId: z.string().min(1),
    orderId: z.string().min(1),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000).default(""),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
  try {
    const [review] = await db
      .insert(reviewsTable)
      .values({
        ...result.data,
        reviewerId: req.user!.userId,
        reviewerName: req.user!.name,
        date: new Date().toISOString().split("T")[0],
      })
      .returning();
    res.status(201).json({ data: review, message: "Avis publié" });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

router.get("/orders", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(ordersTable)
      .where(
        req.user!.role === "member"
          ? eq(ordersTable.buyerId, req.user!.userId)
          : eq(ordersTable.sellerId, req.user!.userId),
      )
      .orderBy(desc(ordersTable.createdAt));
    res.json({ data: rows });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

router.post("/orders", requireAuth, async (req, res) => {
  const schema = z.object({ cartItemIds: z.array(z.string()).min(1).max(50) });
  const result = schema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Panier invalide" }); return; }
  try {
    const items = await db
      .select()
      .from(cartItemsTable)
      .where(eq(cartItemsTable.userId, req.user!.userId));
    const toOrder = items.filter((i) => result.data.cartItemIds.includes(i.id));
    if (toOrder.length === 0) {
      res.status(400).json({ error: "Aucun article à commander" }); return;
    }
    const orders: any[] = [];
    await db.transaction(async (tx) => {
      for (const item of toOrder) {
        const [product] = await tx
          .select()
          .from(productsTable)
          .where(eq(productsTable.id, item.productId));
        if (!product || product.status !== "available") continue;
        if (product.sellerId === req.user!.userId) continue;
        if (product.stock > 0 && item.quantity > product.stock) continue;
        const [order] = await tx
          .insert(ordersTable)
          .values({
            productId: item.productId,
            productName: item.productName,
            buyerId: req.user!.userId,
            buyerName: req.user!.name,
            sellerId: product.sellerId,
            sellerName: product.sellerName,
            amount: item.price * item.quantity,
            status: "pending",
            type: "purchase",
            date: new Date().toISOString().split("T")[0],
          })
          .returning();
        orders.push(order);
        if (product.stock > 0) {
          await tx
            .update(productsTable)
            .set({ stock: sql`${productsTable.stock} - ${item.quantity}` })
            .where(eq(productsTable.id, product.id));
        }
        await tx.delete(cartItemsTable).where(eq(cartItemsTable.id, item.id));
      }
    });
    if (orders.length === 0) {
      res.status(400).json({ error: "Aucune commande valide — vérifiez le stock et la disponibilité" });
      return;
    }
    res.status(201).json({ data: orders, message: "Commande passée avec succès" });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Erreur serveur" }); }
});

export default router;
