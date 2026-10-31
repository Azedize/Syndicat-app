/**
 * Marketplace catalogue (2026-10-23): search, filters, sort and pagination
 * on the large generated catalogue (`seedgen -- marketplace`). Every answer of
 * the API is compared with an independent SQL count on the same residence.
 * Read only: nothing is created or changed.
 */
import { pool } from "@workspace/db";
import { TEST_EMAIL_LIKE } from "./test-domain.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const PASSWORD = "MizanTest#2026";
const SEED = process.env.SEEDGEN_SEED ?? "20261019";
const checks: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const q = <T = any>(text: string, params: unknown[] = []) => (pool as any).unsafe(text, params) as Promise<T[]>;
const VARIANTS: Record<string, string[]> = { Meubles: ["Meubles", "meubles", "mobilier", "literie"], Sport: ["Sport", "sport", "loisirs"] };

async function login(email: string) {
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  const token = ((await r.json()) as any)?.data?.token;
  if (!token) throw new Error(`login ${email}: ${r.status}`);
  return token as string;
}

async function main() {
  const [target] = await q(`SELECT syndicate_id FROM products WHERE id LIKE $1 LIMIT 1`, [`mkt-s${SEED}-%`]);
  if (!target) throw new Error("fixture: run « seedgen -- marketplace » first");
  const sid = target.syndicate_id as string;
  const [member] = await q(`SELECT email FROM users WHERE syndicate_id = $1 AND role = 'member' AND status = 'active' AND email LIKE '${TEST_EMAIL_LIKE}' ORDER BY email DESC LIMIT 1`, [sid]);
  const token = await login(member.email);
  const list = async (params: Record<string, string>) => {
    const r = await fetch(`${BASE}/products?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, body: (await r.json().catch(() => null)) as any };
  };
  const all = async (params: Record<string, string>) => {
    const out: any[] = [];
    for (let page = 1; page < 50; page++) {
      const r = await list({ ...params, limit: "50", page: String(page) });
      out.push(...(r.body?.data ?? []));
      if (page >= (r.body?.pagination?.pages ?? 0)) return { rows: out, total: r.body?.pagination?.total as number };
    }
    return { rows: out, total: -1 };
  };
  const dbCount = async (where: string, params: unknown[] = []) =>
    Number((await q(`SELECT count(*)::int AS n FROM products WHERE syndicate_id = $1 AND ${where}`, [sid, ...params]))[0].n);

  // Volume and pagination
  const approved = await dbCount(`status = 'approved'`);
  const walk = await all({});
  const ids = walk.rows.map((p) => p.id);
  check("a large catalogue to test with", approved >= 150, `${approved} visible listings`);
  check("total = SQL count", walk.total === approved, `${walk.total} / ${approved}`);
  check("walking every page returns each listing exactly once", ids.length === approved && new Set(ids).size === ids.length, `${ids.length} rows, ${new Set(ids).size} distinct`);
  const capped = await list({ limit: "500" });
  check("page size is capped by the server", capped.body?.data?.length === 50 && capped.body?.pagination?.limit === 50);
  check("only what can be reserved, by default", walk.rows.every((p) => p.status === "approved"));

  // Sort
  for (const [sort, cmp] of [["price_asc", (a: number, b: number) => a <= b], ["price_desc", (a: number, b: number) => a >= b]] as const) {
    const s = await all({ sort });
    const prices = s.rows.map((p) => Number(p.price));
    check(`sort ${sort} holds across pages`, s.rows.length === approved && prices.every((v, i) => i === 0 || cmp(prices[i - 1], v)), `${s.rows.length} rows`);
  }

  // Price filters
  const bounded = await all({ minPrice: "200", maxPrice: "1000" });
  check("price range: every listing inside the bounds", bounded.rows.every((p) => Number(p.price) >= 200 && Number(p.price) <= 1000));
  check("price range: count = SQL", bounded.total === (await dbCount(`status = 'approved' AND price BETWEEN 200 AND 1000`)), String(bounded.total));
  check("invalid price filter: 400", (await list({ minPrice: "abc" })).status === 400);

  // Category (with older spellings) and combined filters
  for (const cat of ["Meubles", "Sport"]) {
    const c = await all({ category: cat });
    check(`category ${cat} includes older spellings`, c.total === (await dbCount(`status = 'approved' AND category = ANY($2)`, [VARIANTS[cat]])), String(c.total));
  }
  const combo = await all({ category: "Électroménager", maxPrice: "5000", sort: "price_desc" });
  const comboDb = await dbCount(`status = 'approved' AND category = 'Électroménager' AND price <= 5000`);
  check("category + price + sort combined", combo.total === comboDb && combo.rows.every((p) => p.category === "Électroménager" && Number(p.price) <= 5000), `${combo.total} / ${comboDb}`);

  // Availability
  const withReserved = await all({ availability: "all" });
  const reservedDb = await dbCount(`status = 'reserved'`);
  check("« include reserved » adds the reserved listings", withReserved.total === approved + reservedDb && withReserved.rows.some((p) => p.status === "reserved"), `${withReserved.total} = ${approved} + ${reservedDb}`);
  check("sold / pending / rejected never listed", withReserved.rows.every((p) => p.status === "approved" || p.status === "reserved"));

  // Search
  check("search: % is not a wildcard", (await list({ search: "%" })).body?.pagination?.total === 0);
  const arabic = await list({ search: "غسالة" });
  check("search in Arabic", (arabic.body?.pagination?.total ?? 0) === (await dbCount(`status = 'approved' AND name ILIKE '%غسالة%'`)) && arabic.body?.pagination?.total > 0, String(arabic.body?.pagination?.total));
  const brand = await list({ search: "Samsung" });
  check("search covers the brand", (brand.body?.pagination?.total ?? 0) >= (await dbCount(`status = 'approved' AND brand ILIKE 'Samsung'`)) && brand.body?.pagination?.total > 0);
  check("no result: empty list, not an error", (await list({ search: "zzqxw-introuvable" })).body?.pagination?.total === 0);

  // Another residence
  const [empty] = await q(`SELECT u.email FROM users u JOIN syndicates s ON s.id = u.syndicate_id AND s.status = 'active' AND s.creation_key LIKE 'seedgen:%'
      JOIN syndicate_subscriptions ss ON ss.syndicate_id = s.id AND ss.status IN ('active','trial')
      WHERE u.role = 'member' AND u.status = 'active' AND u.email LIKE '${TEST_EMAIL_LIKE}'
        AND NOT EXISTS (SELECT 1 FROM products p WHERE p.syndicate_id = s.id AND p.status = 'approved') LIMIT 1`);
  if (empty) {
    const t2 = await login(empty.email);
    const r = await fetch(`${BASE}/products`, { headers: { Authorization: `Bearer ${t2}` } });
    const b = (await r.json()) as any;
    check("a residence without listings sees an empty market (not the others')", r.status === 200 && b.pagination?.total === 0);
  }
}

main()
  .catch((e) => { console.error(e); checks.push({ name: "run", ok: false }); })
  .finally(async () => {
    const failed = checks.filter((c) => !c.ok).length;
    console.log(`\n${checks.length - failed}/${checks.length} marketplace catalogue checks passed`);
    await pool.end();
    if (failed) process.exit(1);
  });
