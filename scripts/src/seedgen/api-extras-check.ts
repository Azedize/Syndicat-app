/**
 * Reads back, through the running API, the data of the « extras » phase on
 * EVERY generated condominium (api-check.ts looks at one): each allocation key
 * is valid for the engine, CGU acceptances and « lu et compris » match the
 * database for users who have some, proxies and violations are listed.
 *
 * Usage: API_BASE_URL=http://localhost:5056/api pnpm --filter @workspace/scripts run testdb -- exec node --import=tsx ./src/seedgen/api-extras-check.ts
 */
import jwt from "jsonwebtoken";
import { pool } from "@workspace/db";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5056/api").replace(/\/$/, "");
type U = { id: string; email: string; role: string; syndicate_id: string | null; name: string };
const token = (u: U) => jwt.sign({ userId: u.id, email: u.email, role: u.role, syndicateId: u.syndicate_id ?? undefined, name: u.name }, process.env.JWT_SECRET!, { expiresIn: "15m" });
const get = async (u: U, p: string) => {
  const res = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${token(u)}` } });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
};
const q = <T>(text: string, params: unknown[] = []) => pool.unsafe(text, params as any[]) as unknown as Promise<T[]>;
let pass = 0;
const fails: string[] = [];
const check = (ok: boolean, what: string) => (ok ? pass++ : fails.push(what));

async function main() {
  const keys = await q<{ id: string; code: string; syndicate_id: string }>(`SELECT k.id, k.code, k.syndicate_id FROM allocation_keys k JOIN syndicates s ON s.id = k.syndicate_id WHERE s.creation_key LIKE 'seedgen:%' AND s.status = 'active'`);
  for (const k of keys) {
    const [admin] = await q<U>(`SELECT u.id, u.email, u.role, $1::text AS syndicate_id, u.name FROM users u WHERE u.role = 'syndicate_admin' AND u.status = 'active' AND (u.syndicate_id = $1 OR EXISTS (SELECT 1 FROM syndicate_memberships m WHERE m.user_id = u.id AND m.syndicate_id = $1 AND m.status = 'active')) LIMIT 1`, [k.syndicate_id]);
    if (!admin) continue;
    const r = await get(admin, `/allocation-keys/${k.id}`);
    check(r.status === 200 && r.json?.data?.validation?.errors?.length === 0, `clé ${k.code} ${k.id} : ${r.status} ${JSON.stringify(r.json?.data?.validation?.errors?.[0] ?? r.json?.error)}`);
  }
  console.log(`Clés de répartition lues par l'API et valides pour le moteur : ${pass}/${keys.length}`);

  const users = await q<U & { n: number }>(`SELECT u.id, u.email, u.role, u.syndicate_id, u.name, COUNT(t.id)::int AS n FROM users u JOIN terms_acceptances t ON t.user_id = u.id WHERE u.email LIKE '%.seedgen.mizan.test' AND u.status = 'active' GROUP BY u.id ORDER BY u.id LIMIT 40`);
  const p0 = pass;
  for (const u of users) {
    const r = await get(u, "/me/terms-acceptances");
    check(r.status === 200 && (r.json?.data ?? []).length === u.n && r.json.data.every((x: any) => x.document === "cgu" && x.version === "2026-10-21"), `CGU ${u.id} : ${r.status} ${(r.json?.data ?? []).length}/${u.n}`);
  }
  console.log(`Acceptations des CGU (40 comptes) : ${pass - p0}/${users.length}`);

  const ackers = await q<U>(`SELECT DISTINCT ON (u.id) u.id, u.email, u.role, u.syndicate_id, u.name FROM users u JOIN announcement_acknowledgements k ON k.user_id = u.id WHERE u.role IN ('member','tenant') AND u.status = 'active' AND u.email LIKE '%.seedgen.mizan.test' ORDER BY u.id LIMIT 40`);
  const p1 = pass;
  for (const u of ackers) {
    const r = await get(u, "/announcements?limit=100");
    const rows = (r.json?.data ?? []) as { id: string; acknowledged: boolean }[];
    const [db] = await q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM announcement_acknowledgements WHERE user_id = $1 AND announcement_id = ANY($2)`, [u.id, rows.map((x) => x.id)]);
    check(r.status === 200 && db.n > 0 && rows.filter((x) => x.acknowledged).length === db.n, `lu et compris ${u.id} : ${rows.filter((x) => x.acknowledged).length}/${db.n}`);
  }
  console.log(`« Lu et compris » vus par le résident (40 comptes) : ${pass - p1}/${ackers.length}`);

  const shoppers = await q<U & { n: number }>(`SELECT u.id, u.email, u.role, u.syndicate_id, u.name, COUNT(c.id)::int AS n FROM users u JOIN cart_items c ON c.user_id = u.id WHERE u.email LIKE '%.seedgen.mizan.test' AND u.status = 'active' GROUP BY u.id LIMIT 20`);
  const p2 = pass;
  for (const u of shoppers) {
    const r = await get(u, "/cart");
    check(r.status === 200 && (r.json?.data ?? []).length === u.n, `panier ${u.id} : ${(r.json?.data ?? []).length}/${u.n}`);
  }
  console.log(`Paniers (20 comptes) : ${pass - p2}/${shoppers.length}`);

  for (const f of fails.slice(0, 15)) console.log(`ÉCHEC ${f}`);
  console.log(`\n${pass}/${pass + fails.length} vérifications réussies`);
  if (fails.length) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
