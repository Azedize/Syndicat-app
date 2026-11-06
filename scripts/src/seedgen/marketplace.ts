/**
 * Marketplace catalogue for a generated run (additive, idempotent).
 *
 * The main generator gives each condominium 1–6 listings: enough to see the
 * screen, not to test it. Listings are scoped to the residence, so search,
 * combined filters, sorting and pagination need ONE residence with a large
 * catalogue. This step adds it to the generated residence that has the most
 * active residents:
 *
 *   - ~200 listings in every category, all statuses the API supports
 *     (approved, reserved, sold, pending_review, rejected), featured ones,
 *     discounts, negotiable prices, edge prices (5 MAD … 25 000 MAD);
 *   - French, Arabic, Spanish and English titles, very long titles and descriptions;
 *   - 0 to 4 real PNG pictures each, in square / portrait / landscape / small
 *     sizes, some with very long file names, registered in storage_objects;
 *   - favourites and public questions from neighbours.
 *
 * Ids are `mkt-s<seed>-NNNN`: a second run adds nothing. Every row hangs off a
 * generated seller (users of `@s<seed>.<TEST_EMAIL_ROOT>`), so the existing
 * cleanup of the run removes it with its files.
 */
import { pool } from "@workspace/db";
import { insertRows, type Row } from "./db.js";
import { makePng, writeUpload } from "./files.js";
import { Rng } from "./rng.js";
import { runDomain } from "./generate.js";

type Lang = "fr" | "ar" | "en" | "es";
const ITEMS: Record<string, { brands: string[]; names: Record<Lang, string[]>; min: number; max: number }> = {
  Meubles: { brands: ["IKEA", "Kitea", "Mobilia", ""], min: 150, max: 9000, names: {
    fr: ["Canapé d'angle gris", "Table basse en noyer", "Armoire 3 portes", "Chaises de salle à manger (lot de 4)", "Bibliothèque blanche", "Lit 140 avec sommier"],
    ar: ["أريكة زاوية رمادية", "طاولة صغيرة من خشب الجوز", "خزانة بثلاثة أبواب", "كراسي طعام (4 قطع)"],
    en: ["Corner sofa", "Walnut coffee table", "Three-door wardrobe", "Bookshelf"],
    es: ["Sofá rinconera gris", "Mesa de centro de nogal", "Armario de tres puertas"] } },
  "Électroménager": { brands: ["Samsung", "LG", "Bosch", "Beko", "Whirlpool"], min: 200, max: 12000, names: {
    fr: ["Machine à laver 8 kg", "Réfrigérateur combiné", "Four micro-ondes", "Aspirateur sans sac", "Climatiseur mobile", "Lave-vaisselle 12 couverts"],
    ar: ["غسالة ملابس 8 كغ", "ثلاجة بمجمد", "فرن ميكروويف", "مكنسة كهربائية"],
    en: ["Washing machine 8 kg", "Fridge freezer", "Microwave oven", "Air conditioner"],
    es: ["Lavadora 8 kg", "Frigorífico combi", "Horno microondas"] } },
  "Électronique": { brands: ["Apple", "Samsung", "Sony", "Lenovo", "HP", "Xiaomi"], min: 80, max: 18000, names: {
    fr: ["Téléviseur 55 pouces", "Ordinateur portable 15\"", "Smartphone reconditionné", "Console de jeux", "Casque à réduction de bruit", "Tablette 10 pouces"],
    ar: ["تلفاز 55 بوصة", "حاسوب محمول", "هاتف ذكي مُجدَّد", "جهاز ألعاب"],
    en: ["55-inch TV", "Laptop", "Refurbished phone", "Games console", "Noise-cancelling headphones"],
    es: ["Televisor de 55 pulgadas", "Portátil", "Consola de videojuegos"] } },
  Sport: { brands: ["Decathlon", "Btwin", "Domyos", "Nike", ""], min: 40, max: 6000, names: {
    fr: ["Vélo de ville", "Tapis de course", "Haltères 2 × 10 kg", "Raquettes de padel", "Trottinette électrique", "Banc de musculation"],
    ar: ["دراجة مدينة", "جهاز المشي", "أثقال 2 × 10 كغ", "مضارب بادل"],
    en: ["City bike", "Treadmill", "Dumbbells 2 × 10 kg", "Electric scooter"],
    es: ["Bicicleta de ciudad", "Cinta de correr", "Mancuernas 2 × 10 kg"] } },
  Livres: { brands: [""], min: 5, max: 600, names: {
    fr: ["Lot de romans policiers", "Manuels scolaires 3e année collège", "Encyclopédie illustrée", "Bandes dessinées (lot de 12)", "Dictionnaire français-arabe"],
    ar: ["مجموعة روايات", "كتب مدرسية للسنة الثالثة إعدادي", "قاموس فرنسي-عربي", "قصص أطفال"],
    en: ["Crime novels bundle", "School textbooks", "Illustrated encyclopedia", "Comics (12)"],
    es: ["Lote de novelas policiacas", "Libros de texto", "Diccionario francés-árabe"] } },
  "Vêtements": { brands: ["Zara", "Mango", "H&M", "LC Waikiki", ""], min: 20, max: 2500, names: {
    fr: ["Caftan brodé taille M", "Manteau d'hiver homme", "Djellaba en laine", "Chaussures de sport pointure 42", "Robe de soirée"],
    ar: ["قفطان مطرّز مقاس M", "جلابة صوف", "معطف شتوي رجالي", "حذاء رياضي مقاس 42"],
    en: ["Embroidered kaftan size M", "Men's winter coat", "Running shoes size 42"],
    es: ["Caftán bordado talla M", "Abrigo de invierno", "Zapatillas talla 42"] } },
  Enfants: { brands: ["Chicco", "Bébé Confort", "Lego", "Fisher-Price", ""], min: 30, max: 4000, names: {
    fr: ["Poussette double", "Siège auto groupe 1", "Lit parapluie", "Boîte de Lego", "Vélo enfant 16 pouces", "Chaise haute"],
    ar: ["عربة أطفال مزدوجة", "مقعد سيارة للأطفال", "سرير أطفال قابل للطي", "دراجة أطفال"],
    en: ["Double stroller", "Car seat", "Travel cot", "Lego set", "Kids' bike 16\""],
    es: ["Carrito doble", "Silla de coche infantil", "Cuna de viaje"] } },
  Autre: { brands: [""], min: 10, max: 5000, names: {
    fr: ["Plantes d'intérieur", "Outils de bricolage", "Valise cabine", "Tapis berbère 2 × 3 m", "Machine à café"],
    ar: ["نباتات داخلية", "أدوات إصلاح", "حقيبة سفر", "زربية أمازيغية 2 × 3 م"],
    en: ["Indoor plants", "DIY tool kit", "Cabin suitcase", "Berber rug 2 × 3 m"],
    es: ["Plantas de interior", "Caja de herramientas", "Alfombra bereber 2 × 3 m"] } },
};
// The conditions the API accepts (products.condition), nothing else.
const CONDITIONS = ["neuf", "bon", "acceptable", "mauvais"] as const;
const DESCR: Record<Lang, string[]> = {
  fr: ["Très peu servi, à récupérer dans la résidence.", "Bon état général, quelques traces d'usage.", "Vendu cause déménagement.", "Facture d'achat disponible."],
  ar: ["استعمال خفيف، الاستلام داخل الإقامة.", "حالة جيدة مع آثار استعمال بسيطة.", "للبيع بسبب الانتقال."],
  en: ["Barely used, pick up in the residence.", "Good overall condition, light wear.", "Selling because I am moving."],
  es: ["Muy poco usado, recogida en la residencia.", "Buen estado general, ligeras marcas de uso.", "Se vende por mudanza."],
};
const SIZES: [number, number][] = [[600, 600], [480, 720], [800, 450], [160, 120], [1024, 768]];
const LONG_NAME = "Ensemble de jardin complet en résine tressée : table extensible, six fauteuils avec coussins déhoussables, parasol déporté et housse de protection — très bon état";
const LONG_DESC = Array.from({ length: 12 }, (_, i) => `Paragraphe ${i + 1} : description détaillée de l'objet, de son état, de ses dimensions et des conditions de remise en main propre dans la résidence. وصف مفصّل للحالة والأبعاد. Detailed description.`).join("\n\n");

export const MARKET_PREFIX = (seed: number) => `mkt-s${seed}-`;

export async function seedMarketplace(seed: number, log: (s: string) => void, opts: { listings?: number } = {}) {
  const domain = `@${runDomain(seed)}`;
  const prefix = MARKET_PREFIX(seed);
  const [target] = (await pool.unsafe(
    `SELECT s.id, s.name, count(u.id)::int AS residents
       FROM syndicates s
       JOIN syndicate_subscriptions ss ON ss.syndicate_id = s.id AND ss.status IN ('active','trial')
       JOIN users u ON u.syndicate_id = s.id AND u.status = 'active' AND u.role = 'member' AND u.email LIKE $1
      WHERE s.status = 'active' AND s.creation_key LIKE $2
        -- a writable condominium: its syndic company is not suspended (read only otherwise)
        AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = s.organization_id AND o.status = 'suspended')
      GROUP BY s.id, s.name ORDER BY residents DESC, s.id LIMIT 1`,
    [`%${domain}`, `seedgen:s${seed}:%`],
  )) as unknown as { id: string; name: string; residents: number }[];
  if (!target) throw new Error(`Aucune copropriété générée active pour la graine ${seed} : lancez d'abord « generate ».`);
  const residents = (await pool.unsafe(
    `SELECT id, name, email FROM users WHERE syndicate_id = $1 AND status = 'active' AND role = 'member' AND email LIKE $2 ORDER BY email`,
    [target.id, `%${domain}`],
  )) as unknown as { id: string; name: string; email: string }[];
  const buildings = ((await pool.unsafe(`SELECT name FROM buildings WHERE syndicate_id = $1 ORDER BY name`, [target.id])) as unknown as { name: string }[]).map((b) => b.name);
  const existing = new Set(((await pool.unsafe(`SELECT id FROM products WHERE id LIKE $1`, [`${prefix}%`])) as unknown as { id: string }[]).map((r) => r.id));

  const total = opts.listings ?? 200;
  const r = new Rng(seed ^ 0x6d6b7431); // own stream: does not shift the main generator's data
  const sellers = residents.slice(0, Math.max(2, Math.min(14, residents.length - 3)));
  const buyers = residents.slice(sellers.length);
  const now = Date.now();
  const products: Row[] = [];
  const storage: Row[] = [];
  const favourites: Row[] = [];
  const comments: Row[] = [];
  let pictures = 0;

  for (let i = 1; i <= total; i++) {
    const id = `${prefix}${String(i).padStart(4, "0")}`;
    const category = Object.keys(ITEMS)[i % 8];
    const item = ITEMS[category];
    const lang: Lang = r.weighted([["fr", 55], ["ar", 25], ["es", 10], ["en", 10]] as const);
    // Draw every value even for listings already present: the stream stays aligned.
    const baseName = r.pick(item.names[lang]);
    const status = r.weighted([["approved", 78], ["reserved", 7], ["sold", 6], ["pending_review", 5], ["rejected", 4]] as const);
    const seller = r.pick(sellers);
    const price = i === 1 ? "5.00" : i === 2 ? "25000.00" : r.money(item.min, item.max, 5);
    const discounted = r.chance(0.15);
    const nImages = i % 17 === 0 ? 0 : r.int(1, 4);
    const created = new Date(now - r.int(1, 240) * 86_400_000 - r.int(0, 86_399_999));
    const buyer = buyers.length ? r.pick(buyers) : null;
    const desc = i % 23 === 0 ? LONG_DESC : r.pick(DESCR[lang]);
    const brand = r.pick(item.brands);
    const condition = r.pick(CONDITIONS);
    const negotiable = r.chance(0.45);
    const featured = status === "approved" && i % 29 === 0;
    const views = r.int(0, 400);
    if (existing.has(id)) continue;

    const imgs: string[] = [];
    for (let k = 0; k < nImages; k++) {
      const [w, h] = SIZES[(i + k) % SIZES.length];
      const longName = i % 19 === 0;
      const fileName = longName
        ? `photo-annonce-${id}-${"vue-detaillee-de-l-objet-".repeat(4)}${k + 1}.png`
        : `photo-${id}-${k + 1}.png`;
      const f = await writeUpload(`${id}-img${k + 1}`, makePng(seed * 1000 + i * 10 + k, w, h), ".png", fileName);
      storage.push({ object_path: f.objectPath, owner_id: seller.id, syndicate_id: target.id, original_name: f.fileName, content_type: f.mime, size: f.size });
      imgs.push(f.objectPath);
      pictures++;
    }
    products.push({
      id,
      name: i === 3 ? LONG_NAME : `${baseName} (test ${i})`,
      description: `${desc}\n\n(Annonce de test — données fictives.)`,
      price,
      original_price: discounted ? (Number(price) * 1.3).toFixed(2) : null,
      category,
      condition,
      brand: brand || null,
      negotiable,
      contact_preferences: JSON.stringify(["chat"]),
      location: buildings.length ? r.pick(buildings) : target.name,
      building: buildings[0] ?? null,
      image_urls: JSON.stringify(imgs),
      stock: 1,
      syndicate_id: target.id,
      seller_id: seller.id,
      seller_name: seller.name,
      seller_email: seller.email,
      status,
      rejection_reason: status === "rejected" ? "Photos insuffisantes (test)" : null,
      featured,
      view_count: views,
      reserved_by: status === "reserved" || status === "sold" ? buyer?.id ?? null : null,
      reserved_by_name: status === "reserved" || status === "sold" ? buyer?.name ?? null : null,
      reserved_at: status === "reserved" || status === "sold" ? new Date(created.getTime() + 86_400_000) : null,
      sold_at: status === "sold" ? new Date(created.getTime() + 3 * 86_400_000) : null,
      created_at: created,
    });
    if (buyer && status === "approved" && i % 5 === 0) favourites.push({ product_id: id, user_id: buyer.id });
    if (buyer && status === "approved" && i % 9 === 0) comments.push({ product_id: id, user_id: buyer.id, user_name: buyer.name, content: lang === "ar" ? "هل ما زال متوفرًا؟" : lang === "en" ? "Is it still available?" : lang === "es" ? "¿Sigue disponible?" : "Toujours disponible ?" });
  }

  await pool.begin(async (tx: any) => {
    await insertRows(tx, "storage_objects", storage);
    await insertRows(tx, "products", products);
    await insertRows(tx, "product_favorites", favourites);
    await insertRows(tx, "product_comments", comments);
  });
  log(`Marché « ${target.name} » (${target.id}) : ${products.length} annonce(s) ajoutée(s), ${existing.size} déjà présente(s), ${pictures} image(s), ${favourites.length} favori(s), ${comments.length} question(s)`);
  return { syndicateId: target.id, added: products.length, already: existing.size, pictures };
}
