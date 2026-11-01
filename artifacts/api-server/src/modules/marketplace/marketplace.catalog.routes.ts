// marketplace: catalog endpoints (mounted by marketplace.routes.ts, in order).
import { Router } from "express";
import {
  sql,
  eq,
  and,
  desc,
  asc,
  ilike,
  or,
  inArray,
  count,
  gte,
  lte,
} from "drizzle-orm";
import { db } from "@workspace/db";
import {
  auditLogsTable,
  productsTable,
  reviewsTable,
  productFavoritesTable,
  productReportsTable,
  marketplacePromotionsTable,
} from "@workspace/db/schema";
import { requireAuth, requireSuperAdmin } from "../../middleware/auth.js";
import {
  PUBLIC_PRODUCT_STATUSES,
  parsePage,
  categoryVariants,
  canModerate,
  isAdmin,
  residenceScope,
  catalogueScope,
  listingOpenTo,
  residenceCities,
  verifiedResidents,
  forViewerList,
  forViewer,
} from "./marketplace.service.js";

const router = Router();

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
      // availability=all also lists what a neighbour has reserved (shown as
      // « Réservé »); by default only what can still be reserved.
      conds.push(q.availability === "all" ? inArray(productsTable.status, ["approved", "reserved"]) : eq(productsTable.status, "approved"));
      conds.push(catalogueScope(user, q)!);
    }

    if (q.category && q.category !== "Tous") conds.push(inArray(productsTable.category, categoryVariants(q.category)));
    if (q.condition) conds.push(eq(productsTable.condition, q.condition));
    if (q.featured === "true") conds.push(eq(productsTable.featured, true));
    if (q.sellerId === "me") conds.push(eq(productsTable.sellerId, user.userId));
    else if (q.sellerId) conds.push(eq(productsTable.sellerId, q.sellerId));

    for (const [key, op] of [["minPrice", gte], ["maxPrice", lte]] as const) {
      if (q[key] === undefined || q[key] === "") continue;
      if (!/^\d+(\.\d{1,2})?$/.test(q[key])) {
        res.status(400).json({ error: `${key} invalide`, code: "INVALID_PRICE_FILTER" });
        return;
      }
      conds.push(op(productsTable.price, q[key]));
    }

    if (q.search?.trim()) {
      // The user's text is matched literally: % and _ are not wildcards.
      const needle = `%${q.search.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      conds.push(
        or(
          ilike(productsTable.name, needle),
          ilike(productsTable.description, needle),
          ilike(productsTable.sellerName, needle),
          ilike(productsTable.location, needle),
          ilike(productsTable.brand, needle),
        ) as ReturnType<typeof eq>,
      );
    }

    const where = conds.length ? and(...conds) : undefined;
    // The id breaks ties, so pages never repeat or skip a listing.
    const order =
      q.sort === "price_asc"
        ? [asc(productsTable.price), desc(productsTable.createdAt), asc(productsTable.id)]
        : q.sort === "price_desc"
          ? [desc(productsTable.price), desc(productsTable.createdAt), asc(productsTable.id)]
          : [desc(productsTable.boosted), desc(productsTable.featured), desc(productsTable.createdAt), asc(productsTable.id)];

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(productsTable)
        .where(where)
        .orderBy(...order)
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(productsTable).where(where),
    ]);

    res.json({ data: await forViewerList(rows, req.user!), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /products/zones — cities with listings, for the « all residences » filter
// Only open condominiums; counts approved listings. No addresses, no names.
router.get("/products/zones", requireAuth, async (_req, res) => {
  try {
    const rows = (await db.execute(sql`
      SELECT s.city AS city, s.region AS region, count(p.id)::int AS listings
        FROM products p JOIN syndicates s ON s.id = p.syndicate_id
       WHERE p.status = 'approved' AND s.status = 'active' AND s.city IS NOT NULL AND s.city <> ''
         AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = s.organization_id AND o.status = 'suspended')
       GROUP BY s.city, s.region
       ORDER BY count(p.id) DESC, s.city`)) as unknown as { rows?: { city: string; region: string | null; listings: number }[] } & { city: string; region: string | null; listings: number }[];
    res.json({ data: rows.rows ?? rows });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /products/featured ────────────────────────────────────────────────────

router.get("/products/featured", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.status, "approved"), eq(productsTable.featured, true), residenceScope(req.user!)))
      .orderBy(desc(productsTable.boosted), desc(productsTable.createdAt))
      .limit(12);
    res.json({ data: await forViewerList(rows, req.user!) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /products/pending — admin moderation queue ──────────────────────────

// ─── GET /products/moderation-queue — listings awaiting a decision ──────────
// The syndic sees their residence's, the platform every residence's. Oldest
// first (first come, first served); the id keeps pages stable.
router.get("/products/moderation-queue", requireAuth, async (req, res) => {
  const user = req.user!;
  if (user.role !== "super_admin" && user.role !== "syndicate_admin") {
    res.status(403).json({ error: "Réservé au syndic et à la plateforme" });
    return;
  }
  if (user.role === "syndicate_admin" && !user.syndicateId) {
    res.status(403).json({ error: "Syndicat non défini dans le token" });
    return;
  }
  const q = req.query as Record<string, string>;
  const { page, limit, offset } = parsePage(q);
  const status = q.status ?? "pending_review";
  if (!["pending_review", "modification_requested", "rejected"].includes(status)) {
    res.status(400).json({ error: "Statut de file invalide" });
    return;
  }
  try {
    const where = and(
      eq(productsTable.status, status),
      user.role === "syndicate_admin" ? eq(productsTable.syndicateId, user.syndicateId!) : undefined,
    );
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(productsTable).where(where).orderBy(asc(productsTable.createdAt), asc(productsTable.id)).limit(limit).offset(offset),
      db.select({ total: count() }).from(productsTable).where(where),
    ]);
    res.json({ data: rows.map((p) => ({ ...forViewer(p, user), sellerName: p.sellerName, rejectionReason: p.rejectionReason })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /products/:id/moderation-history — decisions taken on a listing ────
router.get("/products/:id/moderation-history", requireAuth, async (req, res) => {
  try {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, String(req.params.id)));
    const user = req.user!;
    if (!product || (!canModerate(user, product) && product.sellerId !== user.userId)) {
      res.status(404).json({ error: "Produit introuvable" });
      return;
    }
    const rows = await db
      .select({ at: auditLogsTable.createdAt, action: auditLogsTable.action, details: auditLogsTable.details, byRole: auditLogsTable.actorRole })
      .from(auditLogsTable)
      .where(and(eq(auditLogsTable.entity, "product_moderation"), eq(auditLogsTable.entityId, product.id)))
      .orderBy(desc(auditLogsTable.createdAt));
    res.json({ data: rows });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

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
      res.json({ data: rows.map((p) => forViewer(p, req.user!)), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
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
        .where(and(inArray(productsTable.id, ids), inArray(productsTable.status, ["approved", "reserved"]), catalogueScope(req.user!, { scope: "all" })))
        .orderBy(desc(productsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(productsTable)
        .where(and(inArray(productsTable.id, ids), inArray(productsTable.status, ["approved", "reserved"]), catalogueScope(req.user!, { scope: "all" }))),
    ]);

    res.json({ data: await forViewerList(rows, req.user!), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
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
    res.json({ data: rows.map((p) => forViewer(p, req.user!)), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
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

// Registered before /products/:id, which would otherwise match "reported" as an id.
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

// ─── GET /products/:id — detail + view count increment ───────────────────────

router.get("/products/:id", requireAuth, async (req, res) => {
  const id = String(req.params.id) as string;
  const user = req.user!;
  try {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    if (!product) { res.status(404).json({ error: "Produit introuvable" }); return; }

    // Same residence only; a reserved or sold listing stays readable (the buyer
    // must be able to open what they reserved). 404 rather than 403: another
    // residence's listing does not exist for this viewer.
    // Own residence or another open condominium; a reserved or sold listing
    // stays readable (the buyer must open what they reserved).
    const visible =
      isAdmin(user.role) ||
      product.sellerId === user.userId ||
      (PUBLIC_PRODUCT_STATUSES.has(product.status ?? "") && (await listingOpenTo(user, product)));
    if (!visible) {
      res.status(404).json({ error: "Produit introuvable" }); return;
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

    const verified = await verifiedResidents([product]);
    res.json({
      data: {
        ...forViewer(product, user, (await residenceCities([product.syndicateId])).get(product.syndicateId ?? "")),
        sellerVerifiedResident: verified.has(`${product.sellerId}:${product.syndicateId}`),
        canReview: product.status === "sold" && product.reservedBy === user.userId,
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

export default router;
