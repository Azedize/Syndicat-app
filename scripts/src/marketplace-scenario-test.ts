/**
 * The residence market (2026-10-22):
 *  - « my residence » by default; « all residences » (2026-10-31) lists the
 *    other open condominiums too, by city, with the seller's building, flat
 *    and direct contact hidden; a closed condominium's listing does not exist;
 *  - the seller's floor is never exposed to others; « verified neighbour »
 *    reflects an active account attached to the condominium;
 *  - reserve → the buyer keeps access to the listing → the seller marks it
 *    handed over → the buyer, and only the buyer, rates the exchange once.
 *
 * Every row it changes is restored.
 */
import { db, pool } from "@workspace/db";
import { productsTable, reviewsTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { TEST_EMAIL_LIKE, writableSubscriptionSql } from "./test-domain.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const PASSWORD = "MizanTest#2026";
const checks: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const rows = <T>(r: unknown) => ((r as { rows?: T[] }).rows ?? (r as T[]));
async function login(email: string) {
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  const j = (await r.json()) as any;
  if (!j?.data?.token) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(j).slice(0, 80)}`);
  return j.data.token as string;
}
async function call(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}

async function main() {
  // An approved listing whose seller is a generated resident, plus a buyer
  // and a third resident of the same condominium, and a listing elsewhere.
  const [setup] = rows<{ product_id: string; syndicate_id: string; seller_email: string; buyer_email: string; third_email: string; floor: string | null }>(await db.execute(sql`
    SELECT p.id AS product_id, p.syndicate_id, s.email AS seller_email, p.floor,
      (SELECT u.email FROM users u JOIN members m ON m.syndicate_id = u.syndicate_id AND lower(m.email) = lower(u.email) AND m.status = 'active'
        WHERE u.syndicate_id = p.syndicate_id AND u.role = 'member' AND u.status = 'active' AND u.id <> p.seller_id AND u.email LIKE ${TEST_EMAIL_LIKE} ORDER BY u.email LIMIT 1) AS buyer_email,
      (SELECT u.email FROM users u JOIN members m ON m.syndicate_id = u.syndicate_id AND lower(m.email) = lower(u.email) AND m.status = 'active'
        WHERE u.syndicate_id = p.syndicate_id AND u.role = 'member' AND u.status = 'active' AND u.id <> p.seller_id AND u.email LIKE ${TEST_EMAIL_LIKE} ORDER BY u.email DESC LIMIT 1) AS third_email
    FROM products p
    JOIN users s ON s.id = p.seller_id AND s.status = 'active' AND s.email LIKE ${TEST_EMAIL_LIKE}
    JOIN syndicates sy ON sy.id = p.syndicate_id AND sy.status = 'active'
    WHERE p.status = 'approved' AND ${sql.raw(writableSubscriptionSql("sy"))}
    ORDER BY p.id LIMIT 1`));
  if (!setup?.buyer_email || setup.buyer_email === setup.third_email) throw new Error("fixture: need a listing and two other residents");
  // With a photo, so the cross-residence media rule is exercised too.
  const [elsewhere] = rows<{ id: string; city: string }>(await db.execute(sql`
    SELECT p.id, s.city FROM products p JOIN syndicates s ON s.id = p.syndicate_id
     WHERE p.status = 'approved' AND p.syndicate_id <> ${setup.syndicate_id} AND s.status = 'active' AND s.city IS NOT NULL AND p.image_urls LIKE '["/objects/%'
       AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = s.organization_id AND o.status = 'suspended') LIMIT 1`));
  const [closed] = rows<{ id: string }>(await db.execute(sql`
    SELECT p.id FROM products p JOIN syndicates s ON s.id = p.syndicate_id
     WHERE p.status = 'approved' AND (s.status <> 'active' OR EXISTS (SELECT 1 FROM organizations o WHERE o.id = s.organization_id AND o.status = 'suspended')) LIMIT 1`));
  const [before] = await db.select().from(productsTable).where(eq(productsTable.id, setup.product_id));

  const buyer = await login(setup.buyer_email);
  const seller = await login(setup.seller_email);
  const third = await login(setup.third_email);

  let testReviewId: string | null = null;
  try {
    // 1. Residence scope
    const list = await call(buyer, "GET", "/products?limit=100");
    const all: any[] = list.body?.data ?? [];
    check("by default, the list holds the buyer's residence only", list.status === 200 && all.length > 0 && all.every((p) => p.syndicateId === setup.syndicate_id), `${all.length} listing(s)`);
    check("the seller's floor is never sent to others", all.every((p) => p.floor === null));
    const mine = all.find((p) => p.id === setup.product_id);
    check("the seller is shown as a verified neighbour", mine?.sellerVerifiedResident === true);
    // All residences: other open condominiums, by city; private details hidden.
    const wide = await call(buyer, "GET", "/products?scope=all&limit=50");
    const others = (wide.body?.data ?? []).filter((p: any) => p.syndicateId !== setup.syndicate_id);
    check("« all residences » also lists other condominiums", wide.status === 200 && others.length > 0, `${others.length} from elsewhere`);
    check("a listing from elsewhere shows its city, never the building or the flat", others.length > 0 && others.every((p: any) => p.otherResidence === true && p.building === null && p.floor === null && p.residenceCity));
    check("no direct contact for a listing from elsewhere", others.every((p: any) => p.sellerPhone === null && p.sellerEmail === null));
    const city = await call(buyer, "GET", `/products?scope=all&city=${encodeURIComponent(elsewhere.city)}&limit=50`);
    check("the city filter keeps that city only", city.status === 200 && (city.body?.data ?? []).length > 0 && (city.body?.data ?? []).every((p: any) => p.residenceCity === elsewhere.city), elsewhere.city);
    const zones = await call(buyer, "GET", "/products/zones");
    check("the zones list the cities with listings", zones.status === 200 && (zones.body?.data ?? []).some((z: any) => z.city === elsewhere.city && z.listings > 0));
    const detail = await call(buyer, "GET", `/products/${elsewhere.id}`);
    check("the detail of a listing from elsewhere opens, masked", detail.status === 200 && detail.body?.data?.otherResidence === true && detail.body?.data?.building === null, String(detail.status));
    // Its photo opens too (public listing of an open condominium), and only that.
    const img = JSON.parse(detail.body?.data?.imageUrls ?? "[]")[0];
    if (img) {
      const r = await fetch(`${BASE}/storage${img}`, { headers: { Authorization: `Bearer ${buyer}` } });
      check("the photo of a listing from elsewhere opens", r.status === 200, String(r.status));
    }
    const fav = await call(buyer, "POST", `/products/${elsewhere.id}/favorite`);
    await call(buyer, "POST", `/products/${elsewhere.id}/favorite`); // toggled back
    check("it can be saved", fav.status === 200, String(fav.status));
    if (closed) {
      const r = await call(buyer, "GET", `/products/${closed.id}`);
      check("a closed or suspended condominium's listing does not exist (404)", r.status === 404, String(r.status));
    }
    const rep = await call(buyer, "GET", `/sellers/${before.sellerId}/reputation`);
    check("reputation shows facts, no invented trust score", rep.status === 200 && !("trustScore" in (rep.body?.data ?? {})) && typeof rep.body?.data?.verifiedResident === "boolean");

    // 2. Reserve → hand-over → review
    const early = await call(buyer, "POST", "/reviews", { productId: setup.product_id, rating: 5 });
    check("no review before the hand-over", early.status === 403, String(early.status));
    const res = await call(buyer, "POST", `/products/${setup.product_id}/reserve`);
    check("the buyer reserves the item", res.status === 200 && res.body?.data?.status === "reserved", String(res.status));
    const seen = await call(buyer, "GET", `/products/${setup.product_id}`);
    check("the buyer can still open what they reserved (was 403)", seen.status === 200 && seen.body?.data?.reservedByMe === true, String(seen.status));
    const other = await call(third, "GET", `/products/${setup.product_id}`);
    check("a neighbour sees it reserved, without who reserved it", other.status === 200 && other.body?.data?.reservedByMe === false && !other.body?.data?.reservedByName, String(other.status));
    const thirdReserve = await call(third, "POST", `/products/${setup.product_id}/reserve`);
    check("a second neighbour cannot reserve it", thirdReserve.status === 400 || thirdReserve.status === 409, String(thirdReserve.status));
    const sold = await call(seller, "POST", `/products/${setup.product_id}/mark-sold`);
    check("the seller marks it handed over", sold.status === 200 && sold.body?.data?.status === "sold", String(sold.status));
    const after = await call(buyer, "GET", `/products/${setup.product_id}`);
    check("the buyer is invited to rate the exchange", after.body?.data?.canReview === true);
    const thirdReview = await call(third, "POST", "/reviews", { productId: setup.product_id, rating: 1, comment: "x" });
    check("someone who did not buy cannot review", thirdReview.status === 403, String(thirdReview.status));
    const review = await call(buyer, "POST", "/reviews", { productId: setup.product_id, rating: 5, comment: "Échange parfait (test)" });
    testReviewId = review.body?.data?.id ?? null;
    check("the buyer rates the exchange", review.status === 201 || review.status === 200, `${review.status} ${JSON.stringify(review.body).slice(0, 80)}`);
    const again = await call(buyer, "POST", "/reviews", { productId: setup.product_id, rating: 4 });
    check("only one review per exchange", again.status === 409, String(again.status));
  } finally {
    // Restore the listing and remove the review this run created (by id only).
    if (testReviewId) await db.delete(reviewsTable).where(and(eq(reviewsTable.id, testReviewId), eq(reviewsTable.productId, setup.product_id)));
    await db
      .update(productsTable)
      .set({ status: before.status, reservedBy: before.reservedBy, reservedByName: before.reservedByName, reservedAt: before.reservedAt, soldAt: before.soldAt, stock: before.stock })
      .where(eq(productsTable.id, setup.product_id));
    const [restored] = await db.select({ status: productsTable.status }).from(productsTable).where(eq(productsTable.id, setup.product_id));
    check("listing restored", restored.status === before.status);
  }

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} marketplace scenario checks passed`);
  await pool.end();
  if (failed) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
