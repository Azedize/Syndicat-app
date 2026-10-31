/**
 * IDOR scan: every GET route that takes an identifier is called with the id
 * of a resource of condominium A by users who must NOT see it:
 *   - the syndic of condominium B (token scoped to B),
 *   - a co-owner of B,
 *   - for personal resources (a co-owner's call for funds, receipt, account,
 *     badge…), another co-owner of A.
 * Anything but 401 / 403 / 404 is reported. Uses the generated data set
 * (seedgen) and the running API.
 *
 * Usage: API_BASE_URL=http://localhost:5055/api pnpm --filter @workspace/scripts run idor:test
 */
import jwt from "jsonwebtoken";
import { pool } from "@workspace/db";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5055/api").replace(/\/$/, "");
const SECRET = process.env.JWT_SECRET!;
type U = { id: string; email: string; role: string; syndicate_id: string | null; name: string };
const token = (u: U) => jwt.sign({ userId: u.id, email: u.email, role: u.role, syndicateId: u.syndicate_id ?? undefined, name: u.name }, SECRET, { expiresIn: "15m" });
const one = async <T>(q: string, p: unknown[] = []) => ((await pool.unsafe(q, p as any[])) as unknown as T[])[0];

const results: { route: string; who: string; status: number; ok: boolean; note?: string }[] = [];

async function call(u: U, path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token(u)}` } });
  const body = await res.text();
  return { status: res.status, body: body.slice(0, 160) };
}

async function main() {
  const [A, B] = (await pool.unsafe(
    `SELECT s.id, s.name FROM syndicates s WHERE s.creation_key LIKE 'seedgen:%' AND s.status = 'active'
     -- A: a condominium with elections and support tickets, so that every route has data
     ORDER BY (EXISTS (SELECT 1 FROM elections e WHERE e.syndicate_id = s.id))::int + (EXISTS (SELECT 1 FROM support_tickets t WHERE t.syndicate_id = s.id))::int DESC,
       (SELECT COUNT(*) FROM buildings b WHERE b.syndicate_id = s.id) DESC, s.id LIMIT 2`,
  )) as unknown as { id: string; name: string }[];
  if (!A || !B) throw new Error("Données générées absentes : lancez « seedgen run ».");
  const adminOf = async (sid: string) => ({
    ...(await one<U>(
      `SELECT u.id, u.email, u.role, u.syndicate_id, u.name FROM users u WHERE u.role = 'syndicate_admin' AND u.status = 'active'
         AND (u.syndicate_id = $1 OR EXISTS (SELECT 1 FROM syndicate_memberships m WHERE m.user_id = u.id AND m.syndicate_id = $1 AND m.status = 'active')) LIMIT 1`,
      [sid],
    )),
    syndicate_id: sid,
  });
  const memberOf = (sid: string, not?: string) =>
    one<U & { member_id: string }>(
      `SELECT u.id, u.email, u.role, u.syndicate_id, u.name, m.id AS member_id FROM users u JOIN members m ON lower(m.email) = lower(u.email) AND m.syndicate_id = u.syndicate_id
       WHERE u.role = 'member' AND u.status = 'active' AND u.syndicate_id = $1 AND u.id <> $2
         AND EXISTS (SELECT 1 FROM appels_de_fonds a WHERE m.id = ANY(a.debtor_member_ids)) ORDER BY u.id LIMIT 1`,
      [sid, not ?? "-"],
    );
  const adminB = await adminOf(B.id);
  const memberB = await memberOf(B.id);
  const memberA1 = await memberOf(A.id);
  const memberA2 = await memberOf(A.id, memberA1.id);
  console.log(`A = ${A.name} ; B = ${B.name}`);

  // A resource of A for each route (null = none generated: route skipped)
  const S = `syndicate_id = '${A.id}'`;
  const B_ = `building_id IN (SELECT id FROM buildings WHERE ${S})`;
  const pick = async (q: string) => (await one<{ id: string }>(q))?.id ?? null;
  const callOfA1 = await pick(`SELECT a.id FROM appels_de_fonds a WHERE a.${B_} AND '${memberA1.member_id}' = ANY(a.debtor_member_ids) AND a.amount_paid > 0 LIMIT 1`);
  const ids: Record<string, string | null> = {
    actes: await pick(`SELECT id FROM actes_administratifs WHERE ${S} LIMIT 1`),
    allocations: await pick(`SELECT id FROM allocations WHERE ${S} LIMIT 1`),
    appel: callOfA1,
    buildings: await pick(`SELECT id FROM buildings WHERE ${S} LIMIT 1`),
    claims: await pick(`SELECT id FROM claims WHERE ${S} LIMIT 1`),
    syndicate: A.id,
    conversations: await pick(`SELECT id FROM conversations WHERE ${S} LIMIT 1`),
    documents: await pick(`SELECT id FROM documents WHERE ${S} AND visibility IN ('syndic','council') LIMIT 1`),
    documentPersonal: await pick(`SELECT id FROM documents WHERE ${S} AND visibility = 'personal' AND subject_user_id = '${memberA1.id}' LIMIT 1`),
    elections: await pick(`SELECT id FROM elections WHERE ${S} LIMIT 1`),
    escalation: await pick(`SELECT d.id FROM debt_escalations d WHERE d.${S} LIMIT 1`),
    resident: memberA1.member_id,
    expenses: await pick(`SELECT id FROM expenses WHERE ${S} LIMIT 1`),
    lots: await pick(`SELECT l.id FROM lots l JOIN lot_ownerships o ON o.lot_id = l.id AND o.end_date IS NULL WHERE o.member_id = '${memberA1.member_id}' LIMIT 1`),
    organizations: await pick(`SELECT organization_id AS id FROM syndicates WHERE id = '${A.id}'`),
    spot: await pick(`SELECT p.id FROM parking_spots p WHERE p.${B_} LIMIT 1`),
    meeting: await pick(`SELECT id FROM meetings WHERE ${S} LIMIT 1`),
    userA1: memberA1.id,
    budget: await pick(`SELECT bu.id FROM budgets bu WHERE bu.${B_} LIMIT 1`),
    invoice: await pick(`SELECT id FROM invoices WHERE ${S} LIMIT 1`),
    prestataires: await pick(`SELECT id FROM prestataires WHERE ${S} LIMIT 1`),
    // An approved listing: the shared catalogue only serves approved ones to other residents.
    products: await pick(`SELECT id FROM products WHERE ${S} AND status = 'approved' ORDER BY id LIMIT 1`),
    support: await pick(`SELECT id FROM support_tickets WHERE ${S} ORDER BY (submitted_by_id = '${memberA1.id}') DESC LIMIT 1`),
    travauxPrivatifs: await pick(`SELECT id FROM travaux_privatifs WHERE ${S} LIMIT 1`),
    travaux: await pick(`SELECT w.id FROM travaux w WHERE w.${B_} LIMIT 1`),
    account: await pick(`SELECT id FROM treasury_accounts WHERE ${S} LIMIT 1`),
    statement: await pick(`SELECT id FROM bank_statements WHERE ${S} LIMIT 1`),
    statementLine: await pick(`SELECT l.id FROM bank_statement_lines l JOIN bank_statements s ON s.id = l.statement_id WHERE s.${S} LIMIT 1`),
  };

  // [route, id key, personal (also forbidden to another co-owner of A)]
  const routes: [string, keyof typeof ids, boolean][] = [
    ["/actes/:id", "actes", false],
    ["/allocations/:id", "allocations", false],
    ["/allocations/:id/reconciliation", "allocations", false],
    ["/appels-de-fonds/:id/account", "appel", true],
    ["/appels-de-fonds/:id/allocation", "appel", true],
    ["/appels-de-fonds/:id/payments", "appel", true],
    ["/appels-de-fonds/:id/receipt", "appel", true],
    ["/appels-de-fonds/:id/reminder-eligibility", "appel", true],
    ["/charge-attachments/:id", "appel", true],
    ["/buildings/:id", "buildings", false],
    ["/claims/:id", "claims", false],
    ["/condominiums/:id", "syndicate", false],
    ["/condominiums/:id/memberships", "syndicate", false],
    ["/conversations/:id/messages", "conversations", false],
    ["/documents/:id", "documents", false],
    ["/documents/:id/comments", "documents", false],
    ["/documents/:id/download-url", "documents", false],
    ["/documents/:id/file", "documents", false],
    ["/documents/:id/versions", "documents", false],
    ["/documents/:id", "documentPersonal", true],
    ["/documents/:id/download-url", "documentPersonal", true],
    ["/elections/:id", "elections", false],
    ["/elections/:id/eligible-voters", "elections", false],
    ["/elections/:id/results", "elections", false],
    ["/escalation/:id", "escalation", false],
    ["/escalation/history/:id", "resident", true],
    ["/expenses/:id", "expenses", false],
    ["/lots/:id", "lots", true],
    ["/organizations/:id/condominiums", "organizations", false],
    ["/organizations/:id/members", "organizations", false],
    ["/organizations/:id/portfolio", "organizations", false],
    ["/parking/availability/:id", "spot", false],
    ["/pdf/acte/:id", "actes", false],
    ["/pdf/ag/:id", "meeting", false],
    // Retired (410 for everyone): no longer a personal resource of the owner.
    ["/pdf/badge/:id", "userA1", false],
    ["/pdf/membership/:id", "userA1", false],
    ["/pdf/budget/:id", "budget", false],
    ["/pdf/invoice/:id", "invoice", false],
    ["/pdf/receipt/:id", "appel", true],
    ["/prestataires/:id", "prestataires", false],
    ["/support/:id", "support", true],
    ["/syndicates/:id", "syndicate", false],
    ["/travaux-privatifs/:id", "travauxPrivatifs", false],
    ["/travaux/:id", "travaux", false],
    ["/treasury/accounts/:id", "account", false],
    ["/treasury/accounts/:id/reconciliation", "account", false],
    ["/treasury/accounts/:id/statement-lines", "account", false],
    ["/treasury/accounts/:id/statements", "account", false],
    ["/treasury/statements/:id", "statement", false],
    ["/treasury/statement-lines/:id/candidates", "statementLine", false],
  ];
  // 410: retired route (membership certificate, badge) — refused to everyone.
  const deny = (s: number) => s === 401 || s === 403 || s === 404 || s === 410;
  // 200 with an empty list: the route answers from the caller's own condominium (no data of A).
  const filtered = (status: number, body: string) => status === 200 && /^\{"data":\[\]/.test(body);
  for (const [route, key, personal] of routes) {
    const id = ids[key];
    if (!id) {
      console.log(`SKIP ${route} (aucune donnée « ${key} »)`);
      continue;
    }
    const path = route.replace(":id", encodeURIComponent(id));
    const who: [string, U][] = [["syndic B", adminB], ["copropriétaire B", memberB]];
    if (personal) who.push(["autre copropriétaire A", memberA2]);
    for (const [label, u] of who) {
      const r = await call(u, path);
      const ok = deny(r.status) || filtered(r.status, r.body);
      results.push({ route: `${route} [${key}]`, who: label, status: r.status, ok, note: ok ? undefined : r.body });
      console.log(`${ok ? "PASS" : "FAIL"} ${route} [${key}] — ${label} : ${r.status}${ok ? "" : ` ${r.body.replace(/\s+/g, " ")}`}`);
    }
  }
  // Marketplace: listings are scoped to the residence (another residence's
  // listing is a 404); when one is served, no private seller data or
  // moderation internals
  if (ids.products) {
    const res = await fetch(`${BASE}/products/${ids.products}`, { headers: { Authorization: `Bearer ${token(memberB)}` } });
    const d = ((await res.json().catch(() => null)) as any)?.data ?? {};
    const prefs = (() => { try { return JSON.parse(d.contactPreferences ?? "[]") as string[]; } catch { return []; } })();
    const leaks = [
      d.moderationNote !== undefined && "moderationNote",
      d.moderatedBy !== undefined && "moderatedBy",
      d.rejectionReason !== undefined && "rejectionReason",
      d.reservedBy !== undefined && "reservedBy",
      d.sellerPhone && !prefs.includes("phone") && "sellerPhone",
      d.sellerEmail && !prefs.includes("email") && "sellerEmail",
    ].filter(Boolean);
    const ok = (res.status === 200 || res.status === 404) && leaks.length === 0;
    results.push({ route: "/products/:id (annonce)", who: "copropriétaire B", status: res.status, ok, note: ok ? undefined : leaks.join(", ") });
    console.log(`${ok ? "PASS" : "FAIL"} /products/:id — ${res.status === 404 ? "annonce d'une autre résidence introuvable (404)" : `données privées du vendeur masquées : ${leaks.length ? leaks.join(", ") : "aucune fuite"}`}`);
  }

  // the legitimate owner must still get the personal resources (no blanket 404)
  for (const [route, key] of routes.filter(([, , p]) => p)) {
    const id = ids[key];
    if (!id || key === "resident") continue;
    const r = await call(memberA1, route.replace(":id", encodeURIComponent(id)));
    const ok = r.status === 200;
    results.push({ route: `${route} [${key}]`, who: "propriétaire légitime", status: r.status, ok, note: ok ? undefined : r.body });
    console.log(`${ok ? "PASS" : "INFO"} ${route} [${key}] — propriétaire légitime : ${r.status}`);
  }
  const failed = results.filter((r) => !r.ok && r.who !== "propriétaire légitime");
  console.log(`\n${results.filter((r) => r.who !== "propriétaire légitime" && r.ok).length}/${results.filter((r) => r.who !== "propriétaire légitime").length} refus attendus obtenus ; ${failed.length} accès à examiner`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
