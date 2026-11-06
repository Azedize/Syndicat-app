/**
 * The application really uses the generated data: the running API is called
 * with tokens of generated users (each role) and its answers are compared
 * with the database — totals, amounts, permissions, isolation between two
 * condominiums, pagination and response times.
 *
 * Usage: API_BASE_URL=http://localhost:5055/api pnpm --filter @workspace/scripts run seedgen:api -- [--seed N]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import { pool } from "@workspace/db";
import { runDomain } from "./generate.js";
import { inspectPdf, inspectPng, uploadPath } from "./files.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5055/api").replace(/\/$/, "");
const SECRET = process.env.JWT_SECRET!;
const args = process.argv.slice(2);
const seed = Number(args[args.indexOf("--seed") + 1] || "20261019");
const domain = runDomain(seed);
const results: { name: string; pass: boolean; detail: string; ms?: number }[] = [];
const step = (name: string, pass: boolean, detail = "", ms?: number) => {
  results.push({ name, pass, detail, ms });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}${ms !== undefined ? ` (${ms} ms)` : ""}`);
};
type U = { id: string; email: string; role: string; syndicate_id: string | null; name: string };
const token = (u: U) => jwt.sign({ userId: u.id, email: u.email, role: u.role, syndicateId: u.syndicate_id ?? undefined, name: u.name }, SECRET, { expiresIn: "15m" });
async function get(u: U, p: string) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${token(u)}` } });
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, json, ms: Date.now() - t0 };
}
const totalOf = (j: any) => Number(j?.total ?? j?.pagination?.total ?? (Array.isArray(j?.data) ? j.data.length : Array.isArray(j) ? j.length : NaN));
const one = async <T>(q: string, params: unknown[] = []) => ((await pool.unsafe(q, params as any[])) as unknown as T[])[0];

async function main() {
  // the busiest generated condominium, and another one for isolation
  const [A, B] = (await pool.unsafe(
    `SELECT s.id, s.name, COUNT(l.id)::int AS lots FROM syndicates s JOIN buildings b ON b.syndicate_id = s.id JOIN lots l ON l.building_id = b.id
     WHERE s.creation_key LIKE $1 AND s.status = 'active' GROUP BY s.id ORDER BY lots DESC LIMIT 2`,
    [`seedgen:s${seed}:%`],
  )) as unknown as { id: string; name: string; lots: number }[];
  if (!A || !B) throw new Error(`Aucune copropriété générée pour la graine ${seed} : lancez d'abord « seedgen generate ».`);
  const userOf = (role: string, sid: string | null) =>
    one<U>(`SELECT id, email, role, syndicate_id, name FROM users WHERE role = $1 AND status = 'active' AND email LIKE $2 ${sid ? "AND syndicate_id = $3" : ""} LIMIT 1`, sid ? [role, `%@${domain}`, sid] : [role, `%@${domain}`]);
  const admin = { ...(await one<U>(
    `SELECT u.id, u.email, u.role, u.syndicate_id, u.name FROM users u WHERE u.role = 'syndicate_admin' AND u.status = 'active'
       AND (u.syndicate_id = $1 OR EXISTS (SELECT 1 FROM syndicate_memberships m WHERE m.user_id = u.id AND m.syndicate_id = $1 AND m.status = 'active')) LIMIT 1`, [A.id])), syndicate_id: A.id };
  const treasurer = await userOf("treasurer", A.id);
  const member = await one<U>(
    `SELECT u.id, u.email, u.role, u.syndicate_id, u.name FROM users u JOIN members m ON lower(m.email) = lower(u.email) AND m.syndicate_id = u.syndicate_id
     WHERE u.role = 'member' AND u.status = 'active' AND u.syndicate_id = $1 AND EXISTS (SELECT 1 FROM appels_de_fonds a WHERE m.id = ANY(a.debtor_member_ids)) LIMIT 1`, [A.id]);
  const tenant = await userOf("tenant", A.id);
  const superAdmin = await userOf("super_admin", null);
  // B's syndic may be a shared administrator (membership): token scoped to B, like a context switch
  const adminB = { ...(await one<U>(
    `SELECT u.id, u.email, u.role, u.syndicate_id, u.name FROM users u WHERE u.role = 'syndicate_admin' AND u.status = 'active'
       AND (u.syndicate_id = $1 OR EXISTS (SELECT 1 FROM syndicate_memberships m WHERE m.user_id = u.id AND m.syndicate_id = $1 AND m.status = 'active')) LIMIT 1`, [B.id])), syndicate_id: B.id };
  console.log(`Copropriété testée : ${A.name} (${A.lots} lots) ; isolation avec : ${B.name}`);

  // ── Platform administration ──
  let r = await get(superAdmin, "/syndicates?limit=200");
  const dbSyn = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM syndicates`);
  step("super admin : liste des copropriétés de la plateforme", r.status === 200 && totalOf(r.json) >= Math.min(dbSyn.n, 60), `${totalOf(r.json)} / ${dbSyn.n} en base`, r.ms);
  r = await get(superAdmin, "/users?limit=50");
  const dbUsers = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM users`);
  step("super admin : utilisateurs paginés (≈ 1 000)", r.status === 200 && totalOf(r.json) >= 900, `total ${totalOf(r.json)} / ${dbUsers.n} en base, page de ${(r.json?.data ?? []).length}`, r.ms);

  // ── Syndic of condominium A ──
  r = await get(admin, "/members?limit=20&page=1");
  const dbMembers = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM members WHERE syndicate_id = $1`, [A.id]);
  step("syndic : copropriétaires de SA copropriété uniquement (paginé)", r.status === 200 && totalOf(r.json) === dbMembers.n && (r.json?.data ?? []).length <= 20, `${totalOf(r.json)} / ${dbMembers.n}`, r.ms);
  r = await get(admin, "/lots?limit=50");
  const dbLots = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM lots l JOIN buildings b ON b.id = l.building_id WHERE b.syndicate_id = $1 AND l.archived_at IS NULL`, [A.id]);
  step("syndic : lots de la copropriété", r.status === 200 && totalOf(r.json) === dbLots.n, `${totalOf(r.json)} / ${dbLots.n}`, r.ms);
  r = await get(admin, "/buildings");
  const dbB = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM buildings WHERE syndicate_id = $1`, [A.id]);
  step("syndic : immeubles", r.status === 200 && totalOf(r.json) === dbB.n, `${totalOf(r.json)} / ${dbB.n}`, r.ms);
  r = await get(admin, "/appels-de-fonds?limit=50");
  const dbCalls = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM appels_de_fonds a JOIN buildings b ON b.id = a.building_id WHERE b.syndicate_id = $1`, [A.id]);
  step("syndic : appels de fonds (paginés)", r.status === 200 && totalOf(r.json) === dbCalls.n, `${totalOf(r.json)} / ${dbCalls.n}`, r.ms);
  r = await get(treasurer, "/treasury/summary");
  const recv = await one<{ s: string }>(`SELECT COALESCE(SUM(a.amount - a.amount_paid), 0)::text AS s FROM appels_de_fonds a JOIN buildings b ON b.id = a.building_id WHERE b.syndicate_id = $1 AND a.status NOT IN ('paid','cancelled')`, [A.id]);
  const cash = await one<{ s: string }>(`SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)::text AS s FROM ledger_entries WHERE syndicate_id = $1 AND entry_date <= current_date`, [A.id]);
  const ov = r.json?.data?.overview;
  step("trésorier : reste dû du tableau de bord = base", r.status === 200 && Number(ov?.receivables?.amount) === Number(recv.s), `${ov?.receivables?.amount} / ${recv.s}`, r.ms);
  step("trésorier : trésorerie du tableau de bord = journal", Number((ov?.cashBalance ?? []).find((m: any) => m.currency === "MAD")?.amount ?? 0) === Number(cash.s), `${JSON.stringify(ov?.cashBalance)} / ${cash.s}`);
  step("trésorier : paiements à valider = déclarations en attente", r.json?.data?.pendingPayments?.count === (await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM appel_payments WHERE syndicate_id = $1 AND status = 'pending'`, [A.id])).n, String(r.json?.data?.pendingPayments?.count));
  r = await get(admin, "/claims?limit=50");
  const dbClaims = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM claims WHERE syndicate_id = $1`, [A.id]);
  step("syndic : réclamations (tableau Kanban)", r.status === 200 && totalOf(r.json) === dbClaims.n, `${totalOf(r.json)} / ${dbClaims.n}`, r.ms);
  r = await get(admin, "/expenses?limit=50");
  step("syndic : dépenses", r.status === 200 && totalOf(r.json) > 0, `${totalOf(r.json)}`, r.ms);
  r = await get(admin, "/documents?limit=30");
  const dbDocs = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM documents WHERE syndicate_id = $1 AND NOT is_deleted AND status IS DISTINCT FROM 'archived'`, [A.id]);
  step("syndic : bibliothèque (tous les documents non archivés)", r.status === 200 && totalOf(r.json) === dbDocs.n, `${totalOf(r.json)} / ${dbDocs.n}`, r.ms);
  r = await get(admin, "/meetings");
  step("syndic : assemblées et réunions", r.status === 200 && totalOf(r.json) > 0, `${totalOf(r.json)}`, r.ms);
  r = await get(admin, "/announcements");
  step("syndic : annonces", r.status === 200 && totalOf(r.json) > 0, `${totalOf(r.json)}`, r.ms);
  r = await get(admin, "/prestataires");
  step("syndic : prestataires", r.status === 200 && totalOf(r.json) > 0, `${totalOf(r.json)}`, r.ms);
  r = await get(admin, "/travaux");
  step("syndic : travaux", r.status === 200 && totalOf(r.json) > 0, `${totalOf(r.json)}`, r.ms);

  // ── Resident (co-owner) ──
  r = await get(member, "/appels-de-fonds?limit=100");
  const mine = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM appels_de_fonds a JOIN members m ON m.id = ANY(a.debtor_member_ids) WHERE lower(m.email) = lower($1)`, [member.email]);
  step("copropriétaire : uniquement SES appels de fonds", r.status === 200 && totalOf(r.json) === mine.n && totalOf(r.json) < dbCalls.n, `${totalOf(r.json)} (siens : ${mine.n}, copropriété : ${dbCalls.n})`, r.ms);
  r = await get(member, "/members?limit=5");
  step("copropriétaire : pas d'accès à la liste des copropriétaires", r.status === 403, String(r.status));
  r = await get(member, "/documents?limit=100");
  const leaked = (r.json?.data ?? []).filter((d: any) => ["syndic", "council"].includes(d.visibility) || d.status !== "published");
  step("copropriétaire : bibliothèque filtrée (ni conseil, ni syndic, ni brouillon)", r.status === 200 && leaked.length === 0 && totalOf(r.json) < dbDocs.n, `${totalOf(r.json)} visibles / ${dbDocs.n}`, r.ms);
  r = await get(member, "/alerts");
  const foreignAlerts = (Array.isArray(r.json?.data) ? r.json.data : []).filter((a: any) => a.recipientUserId && a.recipientUserId !== member.id);
  step("copropriétaire : notifications qui lui sont destinées uniquement", r.status === 200 && foreignAlerts.length === 0, `${(r.json?.data ?? []).length} notifications`, r.ms);
  if (tenant) {
    r = await get(tenant, "/appels-de-fonds");
    step("locataire : aucun appel de fonds de copropriétaire", r.status === 403 || totalOf(r.json) === 0, `${r.status} ${totalOf(r.json)}`);
  }

  // ── Documents and files: real bytes through the API, permissions ──
  const fileVia = async (u: U, docId: string) => {
    const link = await get(u, `/documents/${docId}/download-url`);
    if (link.status !== 200 || !link.json?.url) return { status: link.status, buf: Buffer.alloc(0) };
    const res = await fetch(link.json.url);
    return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
  };
  const storageVia = async (u: U, objectPath: string) => {
    const res = await fetch(`${BASE}/storage${objectPath}`, { headers: { Authorization: `Bearer ${token(u)}` } });
    return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
  };
  const sameAsDisk = (buf: Buffer, objectPath: string) => {
    const p = uploadPath(objectPath);
    return !!p && existsSync(p) && readFileSync(p).equals(buf);
  };
  const memberRow = await one<{ id: string }>(`SELECT id FROM members WHERE lower(email) = lower($1) AND syndicate_id = $2`, [member.email, A.id]);
  const ownNotice = await one<{ id: string; file_url: string }>(
    `SELECT d.id, d.file_url FROM documents d JOIN lot_ownerships o ON o.lot_id = d.lot_id AND o.end_date IS NULL WHERE d.syndicate_id = $1 AND d.visibility = 'unit' AND o.member_id = $2 LIMIT 1`, [A.id, memberRow?.id ?? "-"]);
  const otherNotice = await one<{ id: string }>(
    `SELECT d.id FROM documents d WHERE d.syndicate_id = $1 AND d.visibility = 'unit' AND d.lot_id NOT IN (SELECT lot_id FROM lot_ownerships WHERE member_id = $2) LIMIT 1`, [A.id, memberRow?.id ?? "-"]);
  if (ownNotice) {
    const f = await fileVia(member, ownNotice.id);
    step("copropriétaire : télécharge l'avis d'appel de fonds de SON lot (PDF identique au fichier)", f.status === 200 && inspectPdf(f.buf).ok && sameAsDisk(f.buf, ownNotice.file_url), `${f.status}, ${f.buf.length} o, ${inspectPdf(f.buf).detail}`);
  } else step("copropriétaire : avis d'appel de fonds de son lot présent", false, "aucun avis trouvé");
  if (otherNotice) step("copropriétaire : avis d'un autre lot refusé", (await fileVia(member, otherNotice.id)).status === 404, "404 attendu");
  const ownReceipt = await one<{ id: string; file_url: string }>(`SELECT id, file_url FROM documents WHERE syndicate_id = $1 AND visibility = 'personal' AND subject_user_id = $2 LIMIT 1`, [A.id, member.id]);
  const otherReceipt = await one<{ id: string }>(`SELECT id FROM documents WHERE syndicate_id = $1 AND visibility = 'personal' AND subject_user_id <> $2 LIMIT 1`, [A.id, member.id]);
  if (ownReceipt) {
    const f = await fileVia(member, ownReceipt.id);
    step("copropriétaire : télécharge SON reçu de paiement", f.status === 200 && inspectPdf(f.buf).ok && sameAsDisk(f.buf, ownReceipt.file_url), `${f.status}, ${inspectPdf(f.buf).detail}`);
  }
  if (otherReceipt) step("copropriétaire : reçu d'une autre personne refusé", (await fileVia(member, otherReceipt.id)).status === 404, "404 attendu");
  if (ownNotice) step("isolation : document de A refusé au syndic de B", (await fileVia(adminB, ownNotice.id)).status === 404, "404 attendu");
  const invoice = await one<{ proof_url: string }>(`SELECT proof_url FROM invoices WHERE syndicate_id = $1 AND proof_url IS NOT NULL LIMIT 1`, [A.id]);
  if (invoice) {
    const f = await storageVia(treasurer, invoice.proof_url);
    step("trésorier : facture fournisseur téléchargeable (PDF valide)", f.status === 200 && inspectPdf(f.buf).ok && sameAsDisk(f.buf, invoice.proof_url), `${f.status}, ${inspectPdf(f.buf).detail}`);
    const asMember = (await storageVia(member, invoice.proof_url)).status;
    step("copropriétaire : facture fournisseur non accessible", asMember === 403 || asMember === 404, String(asMember));
    const asB = (await storageVia(adminB, invoice.proof_url)).status;
    step("isolation : facture de A refusée au syndic de B", asB === 403 || asB === 404, String(asB));
  }
  const work = await one<{ report_url: string; photo_urls: string }>(`SELECT w.report_url, w.photo_urls FROM travaux w JOIN buildings b ON b.id = w.building_id WHERE b.syndicate_id = $1 AND w.report_url IS NOT NULL LIMIT 1`, [A.id]);
  if (work) {
    const f = await storageVia(admin, work.report_url);
    step("syndic : rapport d'intervention téléchargeable (PDF valide)", f.status === 200 && inspectPdf(f.buf).ok, `${f.status}, ${inspectPdf(f.buf).detail}`);
    const photo = (JSON.parse(work.photo_urls) as string[])[0];
    const p = await storageVia(admin, photo);
    step("syndic : photo d'intervention téléchargeable (PNG décodable)", p.status === 200 && inspectPng(p.buf).ok, `${p.status}, ${inspectPng(p.buf).detail}`);
  }
  r = await get(admin, `/documents?q=${encodeURIComponent("Reçu")}&limit=20`);
  const dbReceipts = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM documents WHERE syndicate_id = $1 AND NOT is_deleted AND title ILIKE '%Reçu%' AND status IS DISTINCT FROM 'archived'`, [A.id]);
  step("syndic : recherche « Reçu » dans la bibliothèque", r.status === 200 && totalOf(r.json) === dbReceipts.n, `${totalOf(r.json)} / ${dbReceipts.n}`, r.ms);
  r = await get(admin, `/documents?category=financier&visibility=unit&limit=20&page=2`);
  const dbUnit = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM documents WHERE syndicate_id = $1 AND NOT is_deleted AND category = 'financier' AND visibility = 'unit' AND status IS DISTINCT FROM 'archived'`, [A.id]);
  step("syndic : filtre catégorie + audience, page 2", r.status === 200 && totalOf(r.json) === dbUnit.n && (r.json?.data ?? []).length <= 20, `${totalOf(r.json)} / ${dbUnit.n}, page de ${(r.json?.data ?? []).length}`, r.ms);

  // ── Data of the « extras » phase, read back through the API ──
  r = await get(admin, "/allocation-keys");
  const dbKeys = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM allocation_keys WHERE syndicate_id = $1`, [A.id]);
  step("syndic : clés de répartition de la copropriété", r.status === 200 && (r.json?.data ?? []).length === dbKeys.n, `${(r.json?.data ?? []).length} / ${dbKeys.n}`, r.ms);
  const key = (r.json?.data ?? [])[0];
  if (key) {
    const k = await get(admin, `/allocation-keys/${key.id}`);
    step("syndic : clé valide pour le moteur (lots de l'immeuble, exclusions motivées)", k.status === 200 && (k.json?.data?.validation?.errors ?? [1]).length === 0, `${key.code} v${k.json?.data?.versions?.[0]?.version}, ${k.json?.data?.validation?.errors?.length ?? "?"} erreur(s)`, k.ms);
  }
  r = await get(member, "/allocation-keys");
  step("copropriétaire : clés de répartition réservées à l'équipe", r.status === 403, String(r.status));
  r = await get(member, "/me/terms-acceptances");
  const dbTerms = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM terms_acceptances WHERE user_id = $1`, [member.id]);
  step("copropriétaire : SES acceptations des CGU", r.status === 200 && (r.json?.data ?? []).length === dbTerms.n, `${(r.json?.data ?? []).length} / ${dbTerms.n}`, r.ms);
  r = await get(admin, "/announcements?limit=100");
  const anns = (r.json?.data ?? []) as { id: string; acknowledgementCount?: number }[];
  const dbAcks = anns.length ? await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM announcement_acknowledgements WHERE announcement_id = ANY($1)`, [anns.map((a) => a.id)]) : { n: 0 };
  const apiAcks = anns.reduce((s, a) => s + (a.acknowledgementCount ?? 0), 0);
  step("syndic : « lu et compris » comptés par annonce = base", r.status === 200 && apiAcks === dbAcks.n, `${apiAcks} / ${dbAcks.n} sur ${anns.length} annonces`, r.ms);
  r = await get(member, "/announcements?limit=100");
  const seen = (r.json?.data ?? []) as { id: string; acknowledged?: boolean; acknowledgementCount?: number }[];
  const dbMine = seen.length ? await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM announcement_acknowledgements WHERE user_id = $1 AND announcement_id = ANY($2)`, [member.id, seen.map((a) => a.id)]) : { n: 0 };
  step("copropriétaire : SES « lu et compris », sans le compte de l'équipe", r.status === 200 && seen.filter((a) => a.acknowledged).length === dbMine.n && seen.every((a) => a.acknowledgementCount === undefined), `${seen.filter((a) => a.acknowledged).length} / ${dbMine.n}`, r.ms);
  r = await get(admin, "/parking/violations");
  const dbViol = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM parking_violations v JOIN buildings b ON b.id = v.building_id WHERE b.syndicate_id = $1`, [A.id]);
  step("syndic : infractions de stationnement des immeubles", r.status === 200 && (r.json?.data ?? []).length === dbViol.n, `${(r.json?.data ?? []).length} / ${dbViol.n}`, r.ms);
  r = await get(member, "/parking/violations");
  const foreignViol = (r.json?.data ?? []).filter((v: any) => v.reportedById !== member.id);
  step("copropriétaire : uniquement les infractions qu'il a signalées", r.status === 200 && foreignViol.length === 0, `${(r.json?.data ?? []).length} visibles`, r.ms);
  const shopper = await one<U>(`SELECT u.id, u.email, u.role, u.syndicate_id, u.name FROM users u WHERE u.syndicate_id = $1 AND u.status = 'active' AND EXISTS (SELECT 1 FROM cart_items c WHERE c.user_id = u.id) LIMIT 1`, [A.id]);
  if (shopper) {
    r = await get(shopper, "/cart");
    const dbCart = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM cart_items WHERE user_id = $1`, [shopper.id]);
    step("résident : SON panier", r.status === 200 && (r.json?.data ?? []).length === dbCart.n && (r.json?.data ?? []).every((c: any) => c.userId === shopper.id), `${(r.json?.data ?? []).length} / ${dbCart.n}`, r.ms);
  }

  // ── Isolation between condominiums ──
  const lotB =await one<{ id: string }>(`SELECT l.id FROM lots l JOIN buildings b ON b.id = l.building_id WHERE b.syndicate_id = $1 LIMIT 1`, [B.id]);
  r = await get(admin, `/lots/${lotB.id}`);
  step("isolation : le syndic de A ne lit pas un lot de B", r.status === 404 || r.status === 403, String(r.status));
  r = await get(adminB, "/members?limit=500");
  const crossed = (r.json?.data ?? []).filter((m: any) => m.syndicateId && m.syndicateId !== B.id);
  step("isolation : la liste du syndic de B ne contient aucun membre de A", r.status === 200 && crossed.length === 0, `${totalOf(r.json)} membres`);
  const docA = await one<{ id: string }>(`SELECT id FROM documents WHERE syndicate_id = $1 AND visibility = 'residents' AND status = 'published' LIMIT 1`, [A.id]);
  if (docA) {
    r = await get(adminB, `/documents/${docA.id}`);
    step("isolation : un document de A est introuvable depuis B", r.status === 404, String(r.status));
  }

  const timed = results.filter((x) => x.ms !== undefined);
  const slow = timed.filter((x) => (x.ms ?? 0) > 1000);
  step("performance : réponses des listes principales < 1 s", slow.length === 0, `max ${Math.max(...timed.map((x) => x.ms ?? 0))} ms`);

  const failed = results.filter((x) => !x.pass);
  console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies`);
  writeFileSync(path.resolve(process.cwd(), ".seedgen", `api-check-s${seed}.json`), JSON.stringify({ at: new Date().toISOString(), condominium: A.name, results }, null, 1));
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
