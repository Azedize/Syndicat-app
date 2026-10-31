/**
 * Rate-limit profile (2026-10-24). The relaxed « test » thresholds exist only
 * for the isolated test database; everything else keeps the production
 * limits. Also checks, through each running API, the limit it announces on
 * the login route — one request each. The header shown is the API-wide
 * limiter's (applied last): 500/min in production, 20000/min in test.
 *
 *   API_BASE_URL       API on the working base   (expected: 500)
 *   TEST_API_BASE_URL  API on syndycat_test with RATE_LIMIT_PROFILE=test (expected: 20000), optional
 */
import { pathToFileURL } from "node:url";
import path from "node:path";

const checks: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function announced(base: string) {
  const r = await fetch(`${base.replace(/\/$/, "")}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "nobody@rate-limit.invalid", password: "x" }) });
  await r.arrayBuffer();
  const policy = r.headers.get("ratelimit-policy") ?? r.headers.get("ratelimit-limit") ?? "";
  return Number(policy.split(/[;,]/)[0]);
}

async function main() {
  const { rateLimitProfile } = await import(pathToFileURL(path.resolve("../artifacts/api-server/src/lib/rate-limit-profile.ts")).href);
  const local = (db: string) => `postgresql://u:p@localhost:5432/${db}`;
  check("default: production limits", rateLimitProfile({ DATABASE_URL: local("syndycat_test") }).name === "production");
  check("test flag on the working base: production limits", rateLimitProfile({ RATE_LIMIT_PROFILE: "test", DATABASE_URL: local("syndycat_global_cps") }).name === "production");
  check("test flag with NODE_ENV=production: production limits", rateLimitProfile({ RATE_LIMIT_PROFILE: "test", NODE_ENV: "production", DATABASE_URL: local("syndycat_test") }).name === "production");
  check("test flag on a remote host: production limits", rateLimitProfile({ RATE_LIMIT_PROFILE: "test", DATABASE_URL: "postgresql://u:p@db.example.com:5432/syndycat_test" }).name === "production");
  check("test flag without a database URL: production limits", rateLimitProfile({ RATE_LIMIT_PROFILE: "test" }).name === "production");
  const t = rateLimitProfile({ RATE_LIMIT_PROFILE: "test", DATABASE_URL: local("syndycat_test") });
  check("test flag on local syndycat_test: relaxed but still limited", t.name === "test" && t.loginPerAccount > 10 && Number.isFinite(t.credentialPerIp));
  const p = rateLimitProfile({});
  check("production thresholds unchanged (60 / 10 / 500)", p.credentialPerIp === 60 && p.loginPerAccount === 10 && p.apiPerMinute === 500);

  if (process.env.API_BASE_URL) {
    const n = await announced(process.env.API_BASE_URL);
    check("running API on the working base announces the production limit (API limiter: 500/min)", n === 500, `RateLimit ${n}`);
  }
  if (process.env.TEST_API_BASE_URL) {
    const n = await announced(process.env.TEST_API_BASE_URL);
    check("running API on syndycat_test announces the test limit (API limiter: 20000/min)", n === 20000, `RateLimit ${n}`);
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} rate-limit profile checks passed`);
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
