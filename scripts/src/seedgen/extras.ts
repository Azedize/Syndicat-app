/**
 * Phase 5 of a condominium: the tables the first phases leave empty, filled
 * from the records already saved and with the API's own rules:
 *
 *   terms_acceptances            CGU accepted in the app (document "cgu", the
 *                                version the app shows — app/cgu.tsx)
 *   announcement_acknowledgements « lu et compris » on important / urgent
 *                                announcements, by users of the audience
 *   conversation_archives        a participant archives a conversation
 *   blocked_users                a resident blocks another resident
 *   chat_reports                 the syndic reports an off-topic message
 *                                (pending: there is no review route)
 *   product_reports              « mauvaise_info » report on an approved ad,
 *                                one per ad (below the escalation threshold)
 *   cart_items                   approved ads in a neighbour's cart
 *   parking_violations           open / resolved / dismissed, with a photo
 *   election_proxies             used (receipt cast by the proxy holder),
 *                                active and revoked; at most 2 per holder
 *   documents in Arabic          notice, council minutes, house rules (RTL)
 *   allocation_keys (+versions,  lift key checked by the engine's
 *   shares)                      validateKey(); a second version from next year
 *   appel_adjustments            through the project's adjustObligation()
 *
 * It draws from its own random stream (seed of the run, offset): the data of
 * the earlier phases — and the test accounts the regression suites use — stay
 * exactly what they were for the same seed. Content is benign: no abusive
 * message or ad is invented; reports point at ordinary content.
 */
import { db, pool } from "@workspace/db";
import { apiLib } from "../api-lib.js";
import { Batch, flush, type Row, type Tx } from "./db.js";
import { fileStats } from "./documents.js";
import { makePng, renderPdf, writeUpload, type PdfSpec, type StoredFile } from "./files.js";
import type { Ctx } from "./generate.js";
import { syndicOrg } from "./pdfdocs.js";
import { addDays, Rng, ymd } from "./rng.js";

/** The CGU version the app asks users to accept (artifacts/mobile/app/cgu.tsx, onboarding.tsx). */
export const CGU_VERSION = "2026-10-21";
/** MAX_PROXIES_PER_GRANTEE of the API (modules/elections/elections.service.ts). */
const MAX_PROXIES_PER_GRANTEE = 2;

export interface ExtrasEnv {
  rng: Rng;
  now: Date;
  order: string[];
  counts: Map<string, number>;
  /** users already handled (a syndic administrator can manage several condominiums) */
  usersDone: Set<string>;
}

const bump = (k: string) => fileStats.set(k, (fileStats.get(k) ?? 0) + 1);
const between = (r: Rng, from: Date, to: Date) => new Date(from.getTime() + Math.floor(r.next() * Math.max(0, to.getTime() - from.getTime())));
const ISO = pool.unsafe(`to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);
const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

export async function extrasPhase(env: ExtrasEnv, c: Ctx) {
  // Recent activity only where the API lets users in: an archived, suspended or
  // draft condominium is closed to its residents (CONDOMINIUM_ARCHIVED…).
  if (c.status !== "active") return;
  // a suspended syndic company makes its condominiums read only (423)
  const [org] = (await pool`SELECT o.status FROM organizations o JOIN syndicates s ON s.organization_id = o.id WHERE s.id = ${c.sid}`) as { status: string }[];
  if (org?.status === "suspended") return;
  await rowsPhase(env, c);
  await keysPhase(env, c);
  await adjustmentsPhase(env, c);
}

async function rowsPhase(env: ExtrasEnv, c: Ctx) {
  const r = env.rng;
  const now = env.now;
  const b = new Batch();
  await pool.begin(async (tx: Tx) => {
    // timestamps read as ISO text (drizzle replaces the client's date parsers)
    const users = ((await tx`
      SELECT id, name, role, status, ${ISO} AS created_at FROM users WHERE syndicate_id = ${c.sid}
      UNION SELECT id, name, role, status, ${ISO} AS created_at FROM users WHERE id = ${c.admin.id}`) as { id: string; name: string; role: string; status: string; created_at: string }[]).map((u) => ({ ...u, created_at: new Date(u.created_at) }));
    const active = users.filter((u) => u.status === "active");
    const residents = active.filter((u) => ["member", "tenant"].includes(u.role));
    const byId = new Map(users.map((u) => [u.id, u]));

    // ── CGU accepted in the app (version published on CGU_VERSION) ──
    const published = new Date(`${CGU_VERSION}T08:00:00Z`);
    if (now > published) {
      for (const u of active) {
        if (env.usersDone.has(u.id) || !r.chance(0.8)) continue;
        env.usersDone.add(u.id);
        const from = u.created_at > published ? u.created_at : published;
        b.add("terms_acceptances", { user_id: u.id, document: "cgu", version: CGU_VERSION, accepted_at: between(r, from, new Date(now.getTime() - 3_600_000)) });
      }
    }

    // ── « Lu et compris » on important and urgent announcements ──
    const anns = ((await tx`SELECT id, audience, ${ISO} AS created_at FROM announcements WHERE syndicate_id = ${c.sid} AND priority IN ('important', 'urgent')`) as { id: string; audience: string; created_at: string }[]).map((a) => ({ ...a, created_at: new Date(a.created_at) }));
    for (const a of anns) {
      const audience = active.filter((u) => u.created_at <= a.created_at && (a.audience !== "Copropriétaires" || u.role !== "tenant"));
      for (const u of r.sample(audience, Math.round(audience.length * r.int(20, 70) / 100))) {
        b.add("announcement_acknowledgements", { announcement_id: a.id, user_id: u.id, syndicate_id: c.sid, acknowledged_at: between(r, a.created_at, addDays(a.created_at, 6) < now ? addDays(a.created_at, 6) : now) });
      }
    }

    // ── Conversations: archived by a participant, an off-topic report ──
    const convs = (await tx`SELECT id, participant1_id, participant2_id FROM conversations WHERE syndicate_id = ${c.sid}`) as { id: string; participant1_id: string; participant2_id: string }[];
    for (const cv of convs) if (r.chance(0.15)) b.add("conversation_archives", { conversation_id: cv.id, user_id: r.chance(0.6) ? cv.participant1_id : cv.participant2_id, created_at: r.chance(0.5) ? addDays(now, -r.int(1, 30)) : now });
    if (convs.length && r.chance(0.15)) {
      const cv = r.pick(convs);
      const [m] = (await tx`SELECT id, sender_id FROM messages WHERE conversation_id = ${cv.id} AND sender_id <> ${c.admin.id} ORDER BY created_at LIMIT 1`) as { id: string; sender_id: string }[];
      if (m) b.add("chat_reports", { reporter_id: c.admin.id, reported_user_id: m.sender_id, conversation_id: cv.id, message_id: m.id, reason: "Message hors sujet (signalement de test)", status: "pending", created_at: addDays(now, -r.int(0, 20)) });
    }

    // ── A resident blocks another resident ──
    if (residents.length >= 2 && r.chance(0.3)) {
      const [x, y] = r.sample(residents, 2);
      b.add("blocked_users", { blocker_id: x.id, blocked_id: y.id, created_at: addDays(now, -r.int(1, 90)) });
    }

    // ── Marketplace: carts and one « wrong information » report per ad ──
    const ads = (await tx`SELECT id, name, price, seller_id, seller_name FROM products WHERE syndicate_id = ${c.sid} AND status = 'approved'`) as { id: string; name: string; price: string; seller_id: string; seller_name: string }[];
    for (const p of ads) {
      const others = residents.filter((u) => u.id !== p.seller_id);
      if (!others.length) continue;
      for (const u of r.sample(others, r.int(0, Math.min(2, others.length)))) {
        b.add("cart_items", { user_id: u.id, product_id: p.id, product_name: p.name, price: p.price, seller_name: p.seller_name, quantity: 1, created_at: addDays(now, -r.int(0, 15)) });
      }
      if (r.chance(0.12)) {
        const u = r.pick(others);
        b.add("product_reports", { product_id: p.id, reporter_id: u.id, reporter_name: u.name, reason: "mauvaise_info", details: "Le prix ou la description semble incorrect (signalement de test).", status: "pending", created_at: addDays(now, -r.int(0, 20)) });
      }
    }

    // ── Parking violations (with a photo for some) ──
    const spots = (await tx`SELECT s.id, s.building_id FROM parking_spots s JOIN buildings bd ON bd.id = s.building_id WHERE bd.syndicate_id = ${c.sid}`) as { id: string; building_id: string }[];
    const plates = ((await tx`SELECT v.plate_number FROM vehicles v JOIN users u ON u.id = v.user_id WHERE u.syndicate_id = ${c.sid}`) as { plate_number: string }[]).map((v) => v.plate_number);
    const team = [c.admin, ...c.team].filter((u) => byId.get(u.id)?.status === "active");
    for (const bld of c.buildings) {
      const own = spots.filter((s) => s.building_id === bld.id);
      if (!own.length || !team.length) continue;
      for (let n = 0; n < r.int(0, 3); n++) {
        const reporter = r.pick(team);
        const at = addDays(now, -r.int(0, 120));
        const status = r.weighted([["open", 40], ["resolved", 45], ["dismissed", 15]] as const);
        let photo: StoredFile | null = null;
        if (r.chance(0.5)) {
          photo = await writeUpload(r.uuid(), makePng(r.int(1, 2 ** 31)), ".png", "infraction-stationnement.png");
          c.files.push(photo.objectPath);
          bump("Photos d'infractions de stationnement");
          b.add("storage_objects", { object_path: photo.objectPath, owner_id: reporter.id, syndicate_id: c.sid, original_name: photo.fileName, content_type: photo.mime, size: photo.size });
        }
        b.add("parking_violations", {
          spot_id: r.pick(own).id, building_id: bld.id, plate_number: plates.length && r.chance(0.5) ? r.pick(plates) : `${r.int(10000, 99999)}-${r.pick(["A", "B", "D", "H", "W"])}-${r.int(1, 89)}`.toUpperCase(),
          reported_by_id: reporter.id, reported_by_name: reporter.name, photo_url: photo?.objectPath ?? null, notes: r.pick(["Véhicule sur une place réservée", "Stationnement devant l'entrée", "Place visiteur occupée plus de 24 h"]),
          status, resolved_by_id: status === "open" ? null : c.admin.id, resolved_at: status === "open" ? null : between(r, at, now), reported_at: at, created_at: at,
        });
      }
    }

    // ── Election proxies: used, active, revoked ──
    const elections = (await tx`SELECT id, status FROM elections WHERE syndicate_id = ${c.sid}`) as { id: string; status: string }[];
    const voters = active.filter((u) => !["tenant", "syndicate_admin"].includes(u.role) && byId.get(u.id) && u.id !== c.admin.id);
    const receiptUpdates: { election: string; voter: string; proxy: string }[] = [];
    for (const e of elections) {
      const voted = new Set(((await tx`SELECT voter_id FROM vote_receipts WHERE election_id = ${e.id}`) as { voter_id: string }[]).map((x) => x.voter_id));
      const held = new Map<string, number>();
      const grant = (grantor: (typeof voters)[number], status: "used" | "active" | "revoked") => {
        const holders = voters.filter((u) => u.id !== grantor.id && (held.get(u.id) ?? 0) < MAX_PROXIES_PER_GRANTEE);
        if (!holders.length) return;
        const g = r.pick(holders);
        if (status !== "revoked") held.set(g.id, (held.get(g.id) ?? 0) + 1);
        b.add("election_proxies", { election_id: e.id, syndicate_id: c.sid, grantor_id: grantor.id, grantor_name: grantor.name, grantee_id: g.id, grantee_name: g.name, status, created_at: addDays(now, -r.int(1, 10)) });
        if (status === "used") receiptUpdates.push({ election: e.id, voter: grantor.id, proxy: g.id });
      };
      const votedVoters = voters.filter((u) => voted.has(u.id));
      const notVoted = voters.filter((u) => !voted.has(u.id));
      // a ballot already cast was cast by the proxy holder
      for (const u of r.sample(votedVoters, r.int(0, Math.min(2, votedVoters.length)))) grant(u, "used");
      if (e.status === "open") {
        const grantors = r.sample(notVoted, Math.min(notVoted.length, r.int(0, 3)));
        grantors.forEach((u, n) => grant(u, n === 2 ? "revoked" : "active"));
      }
    }

    // ── Documents written in Arabic (right to left) ──
    const [syn] = (await tx`SELECT default_language FROM syndicates WHERE id = ${c.sid}`) as { default_language: string }[];
    if (syn?.default_language === "ar" || r.chance(0.35)) {
      for (const spec of r.sample(arabicDocuments(c, now), r.int(1, 3))) {
        const id = r.uuid();
        const f = await writeUpload(id, await renderPdf(spec.pdf), ".pdf", spec.fileName);
        c.files.push(f.objectPath);
        bump("Documents en arabe");
        const at = addDays(now, -r.int(1, 200));
        b.add("storage_objects", { object_path: f.objectPath, owner_id: c.admin.id, syndicate_id: c.sid, original_name: f.fileName, content_type: f.mime, size: f.size });
        b.add("documents", {
          id: r.uuid(), title: `${spec.pdf.title} — ${c.name}`, category: spec.category, status: "published", syndicate_id: c.sid, size: String(f.size), created_by: c.admin.id, file_url: f.objectPath, version: 1,
          published_at: at, is_deleted: false, language: "ar", source: "upload", visibility: spec.visibility, file_name: f.fileName, mime_type: f.mime, size_bytes: f.size, checksum: f.checksum, created_at: at,
        });
      }
    }

    await flush(tx, b, env.order, env.counts);
    for (const u of receiptUpdates) await tx`UPDATE vote_receipts SET cast_by_proxy_id = ${u.proxy} WHERE election_id = ${u.election} AND voter_id = ${u.voter}`;
  });
}

/** Three one-page documents in Arabic; each paragraph fits on one line (see PdfSpec.rtl). */
function arabicDocuments(c: Ctx, now: Date): { pdf: PdfSpec; category: string; visibility: string; fileName: string }[] {
  const issuer = syndicOrg(c);
  const date = ymd(now).split("-").reverse().join("/");
  return [
    {
      category: "avis",
      visibility: "residents",
      fileName: "ilan-lilsukkan.pdf",
      pdf: {
        rtl: true, kind: "إعلان", title: "إعلان للسكان", date, issuer,
        keyValues: [["الإقامة", c.name], ["التاريخ", date], ["التوقيت", "09:00 - 13:00"]],
        sections: [{ heading: "انقطاع مؤقت للماء", paragraphs: ["يخبر وكيل الاتحاد جميع السكان بانقطاع مؤقت للماء.", "سيتم الانقطاع بسبب أشغال صيانة القناة الرئيسية.", "نرجو من الجميع اتخاذ الاحتياطات اللازمة.", "شكرا على تفهمكم وتعاونكم."] }],
        signature: "وكيل الاتحاد",
      },
    },
    {
      category: "proces_verbal",
      visibility: "council",
      fileName: "mahdar-ijtima-al-majlis.pdf",
      pdf: {
        rtl: true, kind: "محضر", title: "محضر اجتماع المجلس النقابي", date, issuer,
        keyValues: [["الإقامة", c.name], ["التاريخ", date]],
        sections: [
          { heading: "سير الاجتماع", paragraphs: ["اجتمع أعضاء المجلس النقابي بقاعة الاجتماعات.", "تمت مناقشة ميزانية السنة وأشغال الصيانة.", "وافق المجلس على تجديد عقد تنظيف الأجزاء المشتركة.", "رفعت الجلسة بعد استنفاد جدول الأعمال."] },
          { heading: "جدول الأعمال", bullets: ["المصادقة على الحسابات", "ميزانية السنة المقبلة", "أشغال الصيانة", "مسائل مختلفة"] },
        ],
        signature: "كاتب المجلس",
      },
    },
    {
      category: "reglement",
      visibility: "residents",
      fileName: "annidam-addakhili.pdf",
      pdf: {
        rtl: true, kind: "نظام داخلي", title: "النظام الداخلي للعمارة", date, issuer,
        keyValues: [["الإقامة", c.name]],
        sections: [{ heading: "قواعد العيش المشترك", bullets: ["يمنع رمي النفايات في الأجزاء المشتركة.", "يجب احترام أوقات الراحة بعد العاشرة ليلا.", "يمنع ركن السيارات أمام مدخل العمارة.", "يجب إغلاق باب العمارة بعد الدخول والخروج."] }],
        signature: "وكيل الاتحاد",
      },
    },
  ];
}

/**
 * Lift key on some buildings: lots above the ground floor weighted by their
 * tantièmes, ground floor, parkings and cellars excluded with the reason. It
 * covers the « ascenseur » budget category only, so it never contradicts the
 * calls already issued (they use the tantièmes of the whole budget). Checked
 * by the engine's validateKey() before it is written.
 */
async function keysPhase(env: ExtrasEnv, c: Ctx) {
  const r = env.rng;
  const { validateKey, buildingLots } = await apiLib("lib/allocation.ts");
  const year = env.now.getUTCFullYear();
  const rows: Record<string, Row[]> = { allocation_keys: [], allocation_key_versions: [], allocation_key_shares: [], audit_logs: [] };
  for (const bld of c.buildings) {
    const lots = c.lots.filter((l) => l.buildingId === bld.id);
    if (!lots.some((l) => l.floor >= 1) || !r.chance(0.5)) continue;
    const share = (l: (typeof lots)[number], excludeShops: boolean) =>
      l.floor >= 1 && l.tantiemes > 0 && !(excludeShops && ["commerce", "bureau", "local"].includes(l.type))
        ? { lotId: l.id, coefficient: String(l.tantiemes), excluded: false, exclusionReason: null }
        : { lotId: l.id, coefficient: null, excluded: true, exclusionReason: l.floor >= 1 && l.tantiemes > 0 ? "Local commercial sans usage de l'ascenseur" : "Lot sans usage de l'ascenseur (rez-de-chaussée, parking ou cave)" };
    const keyId = r.uuid();
    const created = new Date(`${year - 1}-12-15T10:00:00Z`);
    const versions = [{ version: 1, from: `${year}-01-01`, shares: lots.map((l) => share(l, false)), reason: null as string | null, createdAt: created }];
    if (r.chance(0.3)) versions.push({ version: 2, from: `${year + 1}-01-01`, shares: lots.map((l) => share(l, true)), reason: "Décision de l'assemblée générale (données de test)", createdAt: addDays(env.now, -r.int(1, 30)) });
    const lotRefs = await buildingLots(bld.id);
    rows.allocation_keys.push({ id: keyId, syndicate_id: c.sid, building_id: bld.id, code: "ASC", name: "Ascenseur", purpose: "Charges de maintenance de l'ascenseur", status: "active", created_by: c.admin.id, created_at: new Date(`${year - 1}-12-15T10:00:00Z`) });
    versions.forEach((v, n) => {
      const check = validateKey({ keyId, code: "ASC", name: "Ascenseur", versionId: null, version: v.version, method: "shares", categories: ["ascenseur"], effectiveFrom: v.from, effectiveTo: null, sourceReference: "x", shares: v.shares }, lotRefs);
      if (check.errors.length) throw new Error(`Clé ASC invalide (${bld.name}) : ${check.errors[0].message}`);
      const versionId = r.uuid();
      const next = versions[n + 1];
      rows.allocation_key_versions.push({ id: versionId, key_id: keyId, version: v.version, method: "shares", categories: ["ascenseur"], effective_from: v.from, effective_to: next ? dayBefore(next.from) : null, source_reference: "Règlement de copropriété — charges d'ascenseur (données de test)", change_reason: v.reason, created_by: c.admin.id, created_at: v.createdAt });
      for (const s of v.shares) rows.allocation_key_shares.push({ version_id: versionId, lot_id: s.lotId, coefficient: s.coefficient, excluded: s.excluded, exclusion_reason: s.exclusionReason });
      rows.audit_logs.push({ user_id: c.admin.id, user_name: c.admin.name, actor_role: "syndicate_admin", syndicate_id: c.sid, is_supervision: false, action: v.version === 1 ? "ALLOCATION_KEY_CREATED" : "ALLOCATION_KEY_VERSION_CREATED", entity: "allocation_key", entity_id: keyId, details: `ASC v${v.version} — shares — ascenseur — dès ${v.from}`, created_at: v.createdAt });
    });
  }
  const b = new Batch();
  for (const [t, list] of Object.entries(rows)) for (const row of list) b.add(t, row);
  await pool.begin((tx: Tx) => flush(tx, b, env.order, env.counts));
}

/** A few controlled corrections of an obligation's amount, through adjustObligation(). */
async function adjustmentsPhase(env: ExtrasEnv, c: Ctx) {
  const r = env.rng;
  const { adjustObligation } = await apiLib("lib/funds-calls.ts");
  const open = (await pool`
    SELECT a.id, a.amount, a.amount_paid FROM appels_de_fonds a JOIN buildings bd ON bd.id = a.building_id
    WHERE bd.syndicate_id = ${c.sid} AND a.status IN ('pending', 'overdue', 'partially_paid') ORDER BY a.id`) as { id: string; amount: string; amount_paid: string }[];
  for (const a of r.sample(open, Math.min(open.length, r.int(0, 3)))) {
    const amount = Math.round(Number(a.amount) * 100);
    const paid = Math.round(Number(a.amount_paid) * 100);
    const next = Math.round(amount * (100 - r.int(2, 10)) / 100);
    if (next <= paid || next <= 0 || next === amount) continue;
    await db.transaction((tx: any) =>
      adjustObligation(tx, { syndicateId: c.sid, appelId: a.id, newAmount: (next / 100).toFixed(2), reason: r.pick(["Correction de la surface du lot après vérification du titre foncier", "Rectification d'une erreur de saisie des tantièmes du lot"]), userId: c.admin.id }),
    );
    env.counts.set("appel_adjustments", (env.counts.get("appel_adjustments") ?? 0) + 1);
  }
}
