import { sql, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { productsTable, syndicatesTable, storageObjectsTable } from "@workspace/db/schema";

/**
 * Listing categories: the stored value is the French label; listings created
 * before the catalogue was fixed used lower-case or older names. Filtering on
 * a category matches all of them (the mobile catalogue shows them together).
 */
export const CATEGORY_VARIANTS: Record<string, string[]> = {
  Meubles: ["Meubles", "meubles", "mobilier", "literie"],
  "Électroménager": ["Électroménager", "électroménager", "electromenager"],
  "Électronique": ["Électronique", "électronique", "electronique"],
  Sport: ["Sport", "sport", "loisirs"],
  Livres: ["Livres", "livres"],
  "Vêtements": ["Vêtements", "vêtements", "vetements"],
  Enfants: ["Enfants", "enfants"],
  Autre: ["Autre", "autre"],
};

export const PUBLIC_PRODUCT_STATUSES = new Set(["approved", "reserved", "sold", "sold_out"]);

export type ProductRow = typeof productsTable.$inferSelect;

export const PRIVATE_OBJECT_PATH = /^\/objects\/(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;

// ─── Auto-scan: prohibited words + spam detection ─────────────────────────────
export const PROHIBITED_WORDS = [
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

export const SPAM_PATTERNS = [
  /(.)\1{6,}/i,               // 7+ repeated chars
  /https?:\/\//gi,            // URLs in title
  /\d{10,}/,                  // Long digit strings (phone spam)
  /whatsapp|telegram|signal/i, // External contact channels
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function parsePage(q: Record<string, string>) {
  const page = Math.max(1, parseInt(q.page ?? "1") || 1);
  const limit = Math.min(50, Math.max(1, parseInt(q.limit ?? "20") || 20));
  return { page, limit, offset: (page - 1) * limit };
}

export function categoryVariants(category: string): string[] {
  return CATEGORY_VARIANTS[category] ?? [category];
}

export function canModerate(user: { role: string; syndicateId?: string | null }, product: { syndicateId: string | null }): boolean {
  if (user.role === "super_admin") return true;
  return user.role === "syndicate_admin" && !!user.syndicateId && product.syndicateId === user.syndicateId;
}

export function isAdmin(role: string) {
  // Only the platform super_admin has marketplace admin privileges.
  // syndicate_admin has NO moderation rights — they see the public catalogue only.
  return role === "super_admin";
}

/**
 * The marketplace is the residence's: listings are seen by the neighbours of
 * the same condominium only. Shared platform-wide, a listing told strangers in
 * other cities who sells what and in which building (law 09-08, safety), and
 * "neighbour" trust meant nothing. The platform moderator sees everything.
 */
export function residenceScope(user: { role: string; syndicateId?: string | null }) {
  if (isAdmin(user.role)) return undefined;
  return eq(productsTable.syndicateId, user.syndicateId ?? "__no_residence__");
}

/**
 * Catalogue space (2026-10-31): « my residence » by default; « all
 * residences » on request, limited to open condominiums, optionally to a city
 * or a region. A listing from another residence is shown with its city only
 * (no building, no flat, no direct contact): see forViewer.
 */
export function catalogueScope(user: { role: string; syndicateId?: string | null }, q: Record<string, string>) {
  if (isAdmin(user.role)) return undefined;
  if (q.scope !== "all") return residenceScope(user);
  const city = typeof q.city === "string" ? q.city.trim() : "";
  const region = typeof q.region === "string" ? q.region.trim() : "";
  return sql`${productsTable.syndicateId} IN (SELECT s.id FROM syndicates s WHERE s.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = s.organization_id AND o.status = 'suspended')
    ${city ? sql`AND lower(s.city) = lower(${city})` : sql``}
    ${region ? sql`AND lower(s.region) = lower(${region})` : sql``})` as unknown as ReturnType<typeof eq>;
}

/** May this user open this listing? Own residence, or any open condominium. */
export async function listingOpenTo(user: { role: string; userId: string; syndicateId?: string | null }, product: { sellerId: string | null; syndicateId: string | null }) {
  if (isAdmin(user.role) || product.sellerId === user.userId) return true;
  if (!product.syndicateId) return false;
  if (product.syndicateId === user.syndicateId) return true;
  const rows = (await db.execute(sql`SELECT 1 FROM syndicates s WHERE s.id = ${product.syndicateId} AND s.status = 'active'
    AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = s.organization_id AND o.status = 'suspended')`)) as unknown as { rows?: unknown[] } & unknown[];
  return ((rows.rows ?? rows) as unknown[]).length > 0;
}

/** City (and region) of each listing's residence, for listings from elsewhere. */
export async function residenceCities(syndicateIds: (string | null)[]): Promise<Map<string, { city: string | null; region: string | null; name: string | null }>> {
  const ids = [...new Set(syndicateIds.filter((x): x is string => !!x))];
  if (!ids.length) return new Map();
  const rows = await db.select({ id: syndicatesTable.id, city: syndicatesTable.city, region: syndicatesTable.region, name: syndicatesTable.name }).from(syndicatesTable).where(inArray(syndicatesTable.id, ids));
  return new Map(rows.map((r) => [r.id, { city: r.city, region: r.region, name: r.name }]));
}

/**
 * Sellers who are current residents of the listing's condominium (active
 * account attached to it): the fact behind the « Voisin vérifié » badge.
 */
export async function verifiedResidents(products: { sellerId: string | null; syndicateId: string | null }[]): Promise<Set<string>> {
  const pairs = products.filter((p) => p.sellerId && p.syndicateId);
  if (!pairs.length) return new Set();
  const sellerIds = [...new Set(pairs.map((p) => p.sellerId as string))];
  const rows = (await db.execute(sql`
    SELECT u.id AS seller_id, u.syndicate_id AS syndicate_id FROM users u
    WHERE u.id IN (${sql.join(sellerIds.map((id) => sql`${id}`), sql`, `)}) AND u.status = 'active' AND u.syndicate_id IS NOT NULL
    UNION
    SELECT sm.user_id, sm.syndicate_id FROM syndicate_memberships sm
    JOIN users u ON u.id = sm.user_id AND u.status = 'active'
    WHERE sm.status = 'active' AND sm.user_id IN (${sql.join(sellerIds.map((id) => sql`${id}`), sql`, `)})
  `)) as unknown as { rows?: { seller_id: string; syndicate_id: string }[] } & { seller_id: string; syndicate_id: string }[];
  const list = (rows.rows ?? rows) as { seller_id: string; syndicate_id: string }[];
  return new Set(list.map((r) => `${r.seller_id}:${r.syndicate_id}`));
}

/** Rows as a viewer may see them, with the verified-resident flag. */
export async function forViewerList(products: ProductRow[], viewer: { userId: string; role: string; syndicateId?: string | null }) {
  const [verified, cities] = await Promise.all([verifiedResidents(products), residenceCities(products.map((p) => p.syndicateId))]);
  return products.map((p) => ({
    ...forViewer(p, viewer, cities.get(p.syndicateId ?? "")),
    sellerVerifiedResident: verified.has(`${p.sellerId}:${p.syndicateId}`),
  }));
}

/**
 * What another user may see of a listing. The catalogue is shared across the
 * platform: the seller's phone and e-mail are shown only when the seller
 * chose that contact channel, and moderation internals (note, moderator,
 * rejection reason) and the reserving user stay private. The seller and the
 * platform moderator see everything (law 09-08: data minimisation).
 */
export function forViewer(
  product: ProductRow,
  viewer: { userId: string; role: string; syndicateId?: string | null },
  residence?: { city: string | null; region: string | null; name: string | null },
) {
  if (isAdmin(viewer.role) || product.sellerId === viewer.userId) return { ...product, otherResidence: false, residenceCity: residence?.city ?? null, residenceRegion: residence?.region ?? null };
  const elsewhere = !!product.syndicateId && product.syndicateId !== viewer.syndicateId;
  let prefs: string[] = ["chat"];
  try {
    const parsed = JSON.parse(product.contactPreferences ?? "[]");
    if (Array.isArray(parsed)) prefs = parsed.map(String);
  } catch {
    /* malformed: chat only */
  }
  const { moderationNote: _n, moderatedBy: _m, moderatedAt: _a, rejectionReason: _r, reservedBy, ...rest } = product;
  // Another residence: the city, never the building; first name and initial;
  // no direct contact (questions go through the listing).
  const shortName = (n: string | null) => {
    if (!n) return n;
    const [first, ...others] = n.trim().split(/\s+/);
    return others.length ? `${first} ${others[others.length - 1][0]}.` : first;
  };
  return {
    ...rest,
    // The floor would point to the seller's flat: kept for the seller only.
    floor: null,
    building: elsewhere ? null : rest.building,
    block: elsewhere ? null : (rest as { block?: string | null }).block ?? null,
    location: elsewhere ? residence?.city ?? null : rest.location,
    sellerName: elsewhere ? shortName(rest.sellerName) : rest.sellerName,
    sellerPhone: !elsewhere && prefs.includes("phone") ? product.sellerPhone : null,
    sellerEmail: !elsewhere && prefs.includes("email") ? product.sellerEmail : null,
    otherResidence: elsewhere,
    residenceCity: residence?.city ?? null,
    residenceRegion: residence?.region ?? null,
    // the reserving buyer knows it is them; others only see that it is reserved
    reservedByName: reservedBy === viewer.userId ? product.reservedByName : null,
    reservedByMe: reservedBy === viewer.userId,
  };
}

export async function areOwnedMediaPaths(
  ownerId: string,
  paths: string[],
): Promise<boolean> {
  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.some((value) => !PRIVATE_OBJECT_PATH.test(value))) return false;
  if (uniquePaths.length === 0) return true;
  const rows = await db
    .select({
      objectPath: storageObjectsTable.objectPath,
      ownerId: storageObjectsTable.ownerId,
    })
    .from(storageObjectsTable)
    .where(inArray(storageObjectsTable.objectPath, uniquePaths));
  return (
    rows.length === uniquePaths.length &&
    rows.every((row) => row.ownerId === ownerId)
  );
}

export function autoScan(title: string, description: string): { flagged: boolean; reason?: string } {
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

/**
 * Listing moderation (2026-10-24).
 *  - Who: the platform (super_admin, every residence) and the syndic of the
 *    residence (syndicate_admin, its own listings only).
 *  - What: the transitions below, nothing else. A reserved or sold listing is
 *    never put back on sale by a moderation action.
 *  - Why: a refusal or a request for changes always carries a reason the
 *    seller reads; every decision is kept in the audit trail.
 *  - Promotion (feature / boost) stays a platform decision.
 */
export const MODERATION_TRANSITIONS: Record<"approve" | "reject" | "request_modification", { from: string[]; to: string }> = {
  approve: { from: ["pending_review"], to: "approved" },
  request_modification: { from: ["pending_review"], to: "modification_requested" },
  // A published listing can also be withdrawn (with a reason).
  reject: { from: ["pending_review", "modification_requested", "approved"], to: "rejected" },
};

export async function getVisibleProductForUser(productId: string, user: NonNullable<Express.Request["user"]>) {
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId))
    .limit(1);

  if (!product) return null;
  if (isAdmin(user.role) || product.sellerId === user.userId) return product;
  if (!(await listingOpenTo(user, product))) return null;
  return PUBLIC_PRODUCT_STATUSES.has(product.status ?? "") ? product : null;
}
