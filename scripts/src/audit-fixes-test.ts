/**
 * Regression tests of the 2026-10-21 audit fixes, through the running API with
 * generated users (seedgen). Every row created here is removed at the end.
 *
 *   marketplace      a listing's private seller data follows the seller's
 *                    contact preferences; moderation internals stay private
 *   announcements    "lu et compris" is recorded once, counted for the team,
 *                    refused for another condominium's announcement
 *   delivery notes   number allocated by the server (BL-<year>-<n>, per
 *                    condominium, sequential), client number ignored, exact total
 *   governance       a vacant mandate can be filled, an occupied one cannot,
 *                    another condominium's mandate is not found
 *
 * Usage: API_BASE_URL=http://localhost:5055/api pnpm --filter @workspace/scripts run audit-fixes:test
 */
import jwt from "jsonwebtoken";
import { pool } from "@workspace/db";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5055/api").replace(/\/$/, "");
type U = { id: string; email: string; role: string; syndicate_id: string | null; name: string };
const token = (u: U) => jwt.sign({ userId: u.id, email: u.email, role: u.role, syndicateId: u.syndicate_id ?? undefined, name: u.name }, process.env.JWT_SECRET!, { expiresIn: "15m" });
const one = async <T>(q: string, p: unknown[] = []) => ((await pool.unsafe(q, p as any[])) as unknown as T[])[0];
let pass = 0;
let fail = 0;
const step = (name: string, ok: boolean, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
async function api(u: U, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token(u)}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

const cleanup: (() => Promise<unknown>)[] = [];

async function main() {
  const [A, B] = (await pool.unsafe(`SELECT s.id FROM syndicates s WHERE s.creation_key LIKE 'seedgen:%' AND s.status = 'active'
       AND EXISTS (SELECT 1 FROM syndicate_subscriptions x WHERE x.syndicate_id = s.id AND x.status = 'active' AND (x.current_period_end IS NULL OR x.current_period_end > now()))
     ORDER BY s.id LIMIT 2`)) as unknown as { id: string }[];
  if (!A || !B) throw new Error("Données générées absentes : lancez « seedgen run ».");
  const adminOf = async (sid: string): Promise<U> => ({
    ...(await one<U>(
      `SELECT u.id, u.email, u.role, u.syndicate_id, u.name FROM users u WHERE u.role = 'syndicate_admin' AND u.status = 'active'
         AND (u.syndicate_id = $1 OR EXISTS (SELECT 1 FROM syndicate_memberships m WHERE m.user_id = u.id AND m.syndicate_id = $1 AND m.status = 'active')) LIMIT 1`, [sid])),
    syndicate_id: sid,
  });
  const memberOf = (sid: string) => one<U>(`SELECT id, email, role, syndicate_id, name FROM users WHERE role = 'member' AND status = 'active' AND syndicate_id = $1 ORDER BY id LIMIT 1`, [sid]);
  const adminA = await adminOf(A.id);
  const adminB = await adminOf(B.id);
  const memberA = await memberOf(A.id);
  const memberB = await memberOf(B.id);
  // A neighbour of memberA: listings are scoped to the residence, so the
  // privacy of the seller's contact is checked from inside it.
  const neighbourA = await one<U>(`SELECT id, email, role, syndicate_id, name FROM users WHERE role = 'member' AND status = 'active' AND syndicate_id = $1 AND id <> $2 ORDER BY id LIMIT 1`, [A.id, memberA.id]);
  const superAdmin = await one<U>(`SELECT id, email, role, syndicate_id, name FROM users WHERE role = 'super_admin' AND status = 'active' LIMIT 1`);

  // ── Marketplace: private seller data ──
  const created = await api(memberA, "POST", "/products", {
    name: "Test audit — chaise",
    description: "Annonce créée par audit-fixes-test",
    price: 120,
    category: "Meubles",
    condition: "bon",
    contactPreferences: ["chat"],
    sellerPhone: "+212600000000",
    sellerEmail: "vendeur.audit@example.test",
  });
  const productId = created.json?.data?.id as string | undefined;
  step("marketplace : annonce créée par un copropriétaire", created.status === 201 && !!productId, String(created.status));
  if (productId) {
    cleanup.push(() => pool.unsafe(`DELETE FROM products WHERE id = $1`, [productId]));
    await pool.unsafe(`UPDATE products SET status = 'approved', moderation_note = 'note interne', moderated_by = $2 WHERE id = $1`, [productId, superAdmin.id]);
    const elsewhere = await api(memberB, "GET", `/products/${productId}`);
    // Another residence sees it (« all residences »), without any direct contact.
    step("marketplace : une autre résidence voit l'annonce sans contact direct", (elsewhere.status === 200 && elsewhere.json?.data?.sellerPhone === null && elsewhere.json?.data?.sellerEmail === null && elsewhere.json?.data?.building === null) || elsewhere.status === 404, String(elsewhere.status));
    const seen = await api(neighbourA, "GET", `/products/${productId}`);
    const d = seen.json?.data ?? {};
    step("marketplace : téléphone masqué (vendeur : contact par messagerie seulement)", seen.status === 200 && d.sellerPhone === null, String(d.sellerPhone));
    step("marketplace : e-mail masqué", d.sellerEmail === null, String(d.sellerEmail));
    step("marketplace : note de modération et modérateur non exposés", d.moderationNote === undefined && d.moderatedBy === undefined);
    const list = await api(neighbourA, "GET", `/products?limit=50`);
    const inList = (list.json?.data ?? []).find((p: any) => p.id === productId);
    step("marketplace : liste également filtrée", !inList || (inList.sellerPhone === null && inList.moderationNote === undefined), inList ? "présente" : "absente de la page");
    await pool.unsafe(`UPDATE products SET contact_preferences = '["chat","phone"]' WHERE id = $1`, [productId]);
    const withPhone = await api(neighbourA, "GET", `/products/${productId}`);
    step("marketplace : téléphone affiché quand le vendeur l'a choisi", withPhone.json?.data?.sellerPhone === "+212600000000");
    const own = await api(memberA, "GET", `/products/${productId}`);
    step("marketplace : le vendeur voit toutes ses données", own.json?.data?.sellerEmail === "vendeur.audit@example.test");
  }

  // ── Announcements: "lu et compris" ──
  const ann = await api(adminA, "POST", "/announcements", { title: "Test audit — coupure d'eau", body: "Annonce créée par audit-fixes-test", priority: "urgent" });
  const annId = ann.json?.data?.id as string | undefined;
  step("annonce créée par le syndic", ann.status === 201 && !!annId, String(ann.status));
  if (annId) {
    cleanup.push(() => pool.unsafe(`DELETE FROM announcements WHERE id = $1`, [annId]));
    const a1 = await api(memberA, "POST", `/announcements/${annId}/acknowledge`);
    const a2 = await api(memberA, "POST", `/announcements/${annId}/acknowledge`);
    const n = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM announcement_acknowledgements WHERE announcement_id = $1`, [annId]);
    step("accusé de réception enregistré une seule fois (idempotent)", a1.status === 201 && a2.status === 200 && a2.json?.duplicate === true && n.n === 1, `${a1.status}/${a2.status}, ${n.n} ligne`);
    const listM = await api(memberA, "GET", "/announcements?limit=50");
    const mine = (listM.json?.data ?? []).find((x: any) => x.id === annId);
    step("le copropriétaire voit son accusé dans la liste", mine?.acknowledged === true && mine?.acknowledgementCount === undefined);
    const listA = await api(adminA, "GET", "/announcements?limit=50");
    const forTeam = (listA.json?.data ?? []).find((x: any) => x.id === annId);
    step("le syndic voit le nombre d'accusés", forTeam?.acknowledgementCount === 1, String(forTeam?.acknowledgementCount));
    const cross = await api(memberB, "POST", `/announcements/${annId}/acknowledge`);
    step("annonce d'une autre copropriété : 404", cross.status === 404, String(cross.status));
  }

  // ── Delivery notes: server numbering, exact total ──
  const year = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.APP_TIMEZONE || "Africa/Casablanca", year: "numeric" }).format(new Date());
  const bon = (ref: string) => api(adminA, "POST", "/bons-livraison", { reference: ref, recipient: "Test audit", date: `${year}-01-15`, type: "sortie", items: [{ label: "Article", quantity: 3, unitPrice: 0.1 }] });
  const b1 = await bon("BL-2026-001");
  const b2 = await bon("BL-2026-001");
  const r1 = b1.json?.data?.reference as string | undefined;
  const r2 = b2.json?.data?.reference as string | undefined;
  for (const b of [b1, b2]) if (b.json?.data?.id) cleanup.push(() => pool.unsafe(`DELETE FROM bons_livraison WHERE id = $1`, [b.json.data.id]));
  const seq = (r?: string) => Number(r?.split("-").pop());
  step("bon de livraison : numéro attribué par le serveur (BL-année-n)", b1.status === 201 && new RegExp(`^BL-${year}-\\d{4}$`).test(r1 ?? ""), r1);
  step("bon de livraison : numéro client ignoré, numéros successifs", !!r1 && !!r2 && r1 !== r2 && seq(r2) === seq(r1) + 1, `${r1} → ${r2}`);
  step("bon de livraison : total exact (3 × 0,10 = 0,30)", String(b1.json?.data?.total) === "0.30", String(b1.json?.data?.total));
  const items = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM bon_items WHERE bon_id = $1`, [b1.json?.data?.id ?? "-"]);
  step("bon de livraison : lignes enregistrées avec le bon", items.n === 1, String(items.n));

  // ── Governance: vacant mandate ──
  const vacant = await one<{ id: string }>(`INSERT INTO conseil_syndical (syndicate_id, name, role, status) VALUES ($1, '', 'treasurer', 'active') RETURNING id`, [A.id]);
  cleanup.push(() => pool.unsafe(`DELETE FROM conseil_syndical WHERE id = $1`, [vacant.id]));
  const crossNom = await api(adminB, "PUT", `/governance/conseil/${vacant.id}/holder`, { name: "Intrus" });
  step("mandat d'une autre copropriété : 404", crossNom.status === 404, String(crossNom.status));
  const byMember = await api(memberA, "PUT", `/governance/conseil/${vacant.id}/holder`, { name: "Moi" });
  step("nomination refusée à un copropriétaire", byMember.status === 403, String(byMember.status));
  const nom = await api(adminA, "PUT", `/governance/conseil/${vacant.id}/holder`, { name: "Nadia Test" });
  const saved = await one<{ name: string; mandate_start: string | null }>(`SELECT name, mandate_start FROM conseil_syndical WHERE id = $1`, [vacant.id]);
  step("mandat vacant pourvu et enregistré", nom.status === 200 && saved.name === "Nadia Test" && !!saved.mandate_start, `${nom.status}, ${saved.name}`);
  const again = await api(adminA, "PUT", `/governance/conseil/${vacant.id}/holder`, { name: "Autre" });
  step("mandat déjà pourvu : 409, titulaire inchangé", again.status === 409 && (await one<{ name: string }>(`SELECT name FROM conseil_syndical WHERE id = $1`, [vacant.id])).name === "Nadia Test", String(again.status));
}

main()
  .catch((e) => {
    console.error(e);
    fail++;
  })
  .finally(async () => {
    for (const c of cleanup.reverse()) await c().catch((e) => console.error("nettoyage :", e.message));
    console.log(`\n${pass}/${pass + fail} vérifications réussies`);
    if (fail) process.exitCode = 1;
    await pool.end();
  });
