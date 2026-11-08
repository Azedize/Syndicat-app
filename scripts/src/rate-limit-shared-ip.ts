/**
 * Shared public IP study (mission 4, 2026-11-08) — local API with PRODUCTION
 * rate limits on the isolated test database only.
 *
 *   API_BASE_URL=http://127.0.0.1:5058/api node --env-file=../.env --import=tsx src/rate-limit-shared-ip.ts [devices] [seconds]
 *
 * Simulates N phones behind one carrier IP (CGNAT): each is a different real
 * account and only does what the app does while open and untouched — the
 * conversations list every 5 s and the notifications every 30 s
 * (context/DataContext.tsx). Reports how many requests and how many accounts
 * got 429. Then measures the shared credential limiter: distinct accounts
 * signing in from the same IP. Never point it at production.
 */
import jwt from "jsonwebtoken";
import { pool } from "@workspace/db";

const BASE = (process.env.API_BASE_URL ?? "http://127.0.0.1:5058/api").replace(/\/$/, "");
if (!/syndycat_test/.test(process.env.DATABASE_URL ?? "") || !/127\.0\.0\.1|localhost/.test(BASE)) throw new Error("rate-limit-shared-ip: local API and syndycat_test only");
const SECRET = process.env.SESSION_SECRET ?? process.env.JWT_SECRET!;
const DEVICES = Number(process.argv[2] ?? 40);
const SECONDS = Number(process.argv[3] ?? 65);

async function main() {
  const users = (await pool.unsafe(`
    SELECT u.id, u.email, u.role, u.syndicate_id, u.name FROM users u JOIN syndicates s ON s.id = u.syndicate_id
     WHERE u.status = 'active' AND s.status = 'active' AND u.role = 'member' AND u.email LIKE '%.seedgen.mizan.test'
     ORDER BY u.email LIMIT $1`, [DEVICES])) as any[];
  const tokens = users.map((u) => jwt.sign({ userId: u.id, email: u.email, role: u.role, syndicateId: u.syndicate_id, name: u.name }, SECRET, { expiresIn: "30m" }));

  // ── 1. Idle phones behind one IP ──
  const perAccount429 = new Set<number>();
  const counts = { ok: 0, limited: 0, other: 0 };
  let firstLimitedAt = 0;
  const started = Date.now();
  const stop = started + SECONDS * 1000;
  const hit = async (i: number, path: string) => {
    const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${tokens[i]}` } });
    await r.arrayBuffer();
    if (r.status === 429) { counts.limited++; perAccount429.add(i); if (!firstLimitedAt) firstLimitedAt = Date.now() - started; }
    else if (r.status < 400) counts.ok++;
    else counts.other++;
  };
  await Promise.all(tokens.map(async (_t, i) => {
    await new Promise((r) => setTimeout(r, (i * 5000) / tokens.length)); // phones are not in sync
    let tick = 0;
    while (Date.now() < stop) {
      await hit(i, "/conversations");
      if (tick % 6 === 0) await hit(i, "/alerts?lang=fr");
      tick++;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }));
  console.log(`idle phones: ${tokens.length} accounts, ${SECONDS} s | ok ${counts.ok}, 429 ${counts.limited}, other ${counts.other} | accounts blocked ${perAccount429.size}/${tokens.length}${firstLimitedAt ? ` | first 429 after ${(firstLimitedAt / 1000).toFixed(0)} s` : ""}`);

  // ── 2. Sign-ins of different people from the same IP (wrong password: no session created) ──
  let n = 0, first429 = 0;
  for (const u of users.concat(users).slice(0, 70)) {
    n++;
    const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: u.email, password: "not-the-password" }) });
    await r.arrayBuffer();
    if (r.status === 429 && !first429) first429 = n;
  }
  console.log(`sign-ins from one IP: ${n} attempts by ${Math.min(n, users.length)} accounts | first 429 at attempt ${first429 || "none"}`);
  await pool.end();
}
main().catch(async (e) => { console.error(e); await pool.end().catch(() => {}); process.exit(1); });
