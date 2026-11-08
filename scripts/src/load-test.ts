/**
 * Progressive load test (2026-11-08) — local test API and `syndycat_test` only.
 *
 *   node --env-file=../.env --import=tsx src/load-test.ts [users…]   (default: 100 300 700)
 *
 * Each virtual user is a real account of the generated data (members and
 * syndics of many condominiums), with its own session token signed like the
 * API's. It loops over the reads of a normal visit (home data, announcements,
 * meetings, claims, calls for funds, documents) for STAGE_SECONDS. Reports
 * latency percentiles, errors by status, throughput, peak PostgreSQL
 * connections and API memory. Never point it at production.
 */
import jwt from "jsonwebtoken";
import { pool } from "@workspace/db";

const BASE = (process.env.API_BASE_URL ?? "http://127.0.0.1:5056/api").replace(/\/$/, "");
if (!/syndycat_test/.test(process.env.DATABASE_URL ?? "") || !/127\.0\.0\.1|localhost/.test(BASE)) throw new Error("load-test: local test API and syndycat_test only");
const SECRET = process.env.SESSION_SECRET ?? process.env.JWT_SECRET!;
const STAGE_SECONDS = Number(process.env.STAGE_SECONDS ?? 30);
const STAGES = process.argv.slice(2).map(Number).filter(Boolean);
const PATHS = ["/auth/me", "/announcements", "/meetings", "/claims", "/appels-de-fonds", "/documents?limit=20"];

const pct = (a: number[], p: number) => (a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : 0);

async function main() {
  const users = (await pool.unsafe(`
    SELECT u.id, u.email, u.role, u.syndicate_id, u.name FROM users u JOIN syndicates s ON s.id = u.syndicate_id
     WHERE u.status = 'active' AND s.status = 'active' AND u.role IN ('member', 'syndicate_admin', 'treasurer')
       AND u.email LIKE '%.seedgen.mizan.test' ORDER BY u.email LIMIT 700`)) as any[];
  const tokens = users.map((u) => jwt.sign({ userId: u.id, email: u.email, role: u.role, syndicateId: u.syndicate_id, name: u.name }, SECRET, { expiresIn: "30m" }));
  console.log(`${users.length} accounts from ${new Set(users.map((u) => u.syndicate_id)).size} condominiums`);
  const results: string[] = [];
  for (const n of STAGES.length ? STAGES : [100, 300, 700]) {
    const lat: number[] = [];
    const status = new Map<string, number>();
    let peakConn = 0;
    const stop = Date.now() + STAGE_SECONDS * 1000;
    const monitor = setInterval(async () => {
      const [r] = await pool`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = 'syndycat_test'`;
      peakConn = Math.max(peakConn, r.n);
    }, 1000);
    const vu = async (i: number) => {
      const token = tokens[i % tokens.length];
      let k = i;
      while (Date.now() < stop) {
        const path = PATHS[k++ % PATHS.length];
        const t0 = performance.now();
        try {
          const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
          await r.arrayBuffer();
          lat.push(performance.now() - t0);
          const key = r.status >= 500 ? "5xx" : r.status === 429 ? "429" : r.status >= 400 ? "4xx" : "2xx";
          status.set(key, (status.get(key) ?? 0) + 1);
        } catch {
          status.set("network", (status.get("network") ?? 0) + 1);
        }
      }
    };
    const started = Date.now();
    await Promise.all(Array.from({ length: n }, (_, i) => vu(i)));
    clearInterval(monitor);
    const secs = (Date.now() - started) / 1000;
    lat.sort((a, b) => a - b);
    const line = `${String(n).padStart(4)} users | ${lat.length} req in ${secs.toFixed(0)} s = ${(lat.length / secs).toFixed(0)} req/s | p50 ${pct(lat, 50).toFixed(0)} ms p95 ${pct(lat, 95).toFixed(0)} ms p99 ${pct(lat, 99).toFixed(0)} ms max ${(lat.at(-1) ?? 0).toFixed(0)} ms | ${[...status].map(([k, v]) => `${k}:${v}`).join(" ")} | peak PG connections ${peakConn}`;
    console.log(line);
    results.push(line);
    await new Promise((r) => setTimeout(r, 5000));
  }
  await pool.end();
}
main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
