/**
 * No server error on a plain read (2026-10-24). Every parameter-free GET
 * route of the API is called by one account of each role, with and without
 * the super-admin supervision flag. A refusal must be a 4xx with its reason;
 * a 500 means a refusal or a bad input was turned into a crash (as /publications
 * did for the super admin). Read only.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pool } from "@workspace/db";
import { TEST_EMAIL_LIKE } from "./test-domain.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
// Every file of the API source: routes live in routes/ and in modules/<domain>/.
const API_SRC = path.resolve("../artifacts/api-server/src");
// Coverage floor: fewer GET routes found means a scan or a move went wrong.
const MIN_ROUTES = 128;
const SKIP = new Set(["/health", "/auth/me/export", "/storage/public-objects", "/stripe/config"]);

function getRoutes(): string[] {
  const out = new Set<string>();
  for (const f of readdirSync(API_SRC, { recursive: true }).map(String).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(path.join(API_SRC, f), "utf8");
    for (const m of src.matchAll(/router\.get\(\s*"([^"]+)"/g)) {
      const p = m[1];
      if (!p.includes(":") && !p.includes("*") && !SKIP.has(p)) out.add(p);
    }
  }
  return [...out].sort();
}

async function login(email: string, password: string) {
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return ((await r.json().catch(() => null)) as any)?.data?.token as string | undefined;
}

async function main() {
  const accounts = (await (pool as any).unsafe(`
    SELECT DISTINCT ON (u.role) u.role, u.email FROM users u
    JOIN syndicates s ON s.id = u.syndicate_id AND s.status = 'active'
    JOIN syndicate_subscriptions ss ON ss.syndicate_id = s.id AND ss.status IN ('active','trial')
    WHERE u.status = 'active' AND u.email LIKE $1 ORDER BY u.role, u.email DESC`, [TEST_EMAIL_LIKE])) as { role: string; email: string }[];
  const tokens: [string, string, string][] = [];
  for (const a of accounts) {
    const t = await login(a.email, "MizanTest#2026");
    if (t) tokens.push([a.role, t, ""]);
    else console.log(`SKIP ${a.role}: login refused (${a.email})`);
  }
  const [sa] = (await (pool as any).unsafe(`SELECT email FROM users WHERE role = 'super_admin' AND status = 'active' AND email LIKE $1 ORDER BY email LIMIT 1`, [TEST_EMAIL_LIKE])) as { email: string }[];
  const [someSyndicate] = (await (pool as any).unsafe(`SELECT id FROM syndicates WHERE status = 'active' ORDER BY id LIMIT 1`)) as { id: string }[];
  const saToken = sa ? await login(sa.email, "MizanTest#2026") : undefined;
  if (saToken) {
    tokens.push(["super_admin", saToken, ""]);
    tokens.push(["super_admin+supervision", saToken, `supervision=true&syndicateId=${someSyndicate.id}`]);
  } else console.log("SKIP super_admin: login refused");

  const routes = getRoutes();
  const failures: string[] = [];
  if (routes.length < MIN_ROUTES) failures.push(`only ${routes.length} GET routes found in the API source (expected at least ${MIN_ROUTES})`);
  let calls = 0;
  for (const [role, token, qs] of tokens) {
    for (const r of routes) {
      const res = await fetch(`${BASE}${r}${qs ? `?${qs}` : ""}`, { headers: { Authorization: `Bearer ${token}` } });
      calls++;
      if (res.status >= 500) failures.push(`${res.status} GET ${r} as ${role}`);
      await res.arrayBuffer().catch(() => null);
    }
  }
  for (const f of failures) console.log(`FAIL ${f}`);
  console.log(`\n${calls - failures.length}/${calls} reads answered without a server error (${routes.length} routes × ${tokens.length} profiles)`);
  await pool.end();
  if (failures.length) process.exit(1);
}

main().catch(async (e) => { console.error(e); await pool.end().catch(() => {}); process.exit(1); });
