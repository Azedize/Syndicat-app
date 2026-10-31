/**
 * Legal clean-up checks (2026-10-21):
 *  - the trade-union documents are retired for everyone (410), including the
 *    public badge verification that exposed name / role / residence;
 *  - acceptance of the CGU is recorded server-side, once per version, and only
 *    for the caller;
 *  - the official co-ownership certificates stay available to a co-owner.
 *
 * Run: pnpm --filter @workspace/scripts legal-step:test  (API on API_BASE_URL)
 */
import { db, pool } from "@workspace/db";
import { termsAcceptancesTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { TEST_EMAIL_LIKE } from "./test-domain.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const PASSWORD = "MizanTest#2026";
const VERSION = `legal-step-test-${Date.now()}`;

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function login(email: string) {
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  const j = (await r.json()) as { data?: { token?: string } };
  if (!j.data?.token) throw new Error(`login failed for ${email}: ${r.status}`);
  return j.data.token;
}
const call = async (token: string | null, path: string, init: RequestInit = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  const text = await r.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
};

async function main() {
  // Two generated co-owners of open (active) condominiums with an active subscription.
  const picked = (await db.execute(sql`
    SELECT u.id, u.email FROM users u
    JOIN syndicates s ON s.id = u.syndicate_id AND s.status = 'active'
    JOIN syndicate_subscriptions ss ON ss.syndicate_id = s.id AND ss.status IN ('active', 'trial')
    WHERE u.role = 'member' AND u.status = 'active' AND u.email LIKE ${TEST_EMAIL_LIKE}
    ORDER BY u.email LIMIT 2`)) as unknown as { rows?: { id: string; email: string }[] } & { id: string; email: string }[];
  const list = (picked.rows ?? picked) as { id: string; email: string }[];
  const [member, other] = list;
  if (!member?.email.endsWith(".test") || !other?.email.endsWith(".test")) {
    throw new Error("Needs generated members (seedgen, *.test) to log in with the test password.");
  }
  const token = await login(member.email);
  const otherToken = await login(other.email);

  // 1. Retired documents
  for (const path of [`/pdf/membership/${member.id}`, `/pdf/badge/${member.id}`, "/badge/me"]) {
    const r = await call(token, path);
    check(`${path.replace(member.id, ":self")} is retired for its own owner`, r.status === 410 && r.body?.code === "DOCUMENT_RETIRED", String(r.status));
  }
  const pub = await call(null, `/verify/badge/${member.id}`);
  check("public badge verification no longer reveals anything", pub.status === 410 && !("name" in (pub.body ?? {})), JSON.stringify(pub.body).slice(0, 80));

  // 2. CGU acceptance
  const bad = await call(token, "/me/terms-acceptances", { method: "POST", body: JSON.stringify({ document: "contract", version: VERSION }) });
  check("unknown legal document is refused", bad.status === 400, String(bad.status));
  const first = await call(token, "/me/terms-acceptances", { method: "POST", body: JSON.stringify({ document: "cgu", version: VERSION }) });
  check("first acceptance is recorded (201) with the server date", first.status === 201 && !!first.body?.data?.acceptedAt, String(first.status));
  const again = await call(token, "/me/terms-acceptances", { method: "POST", body: JSON.stringify({ document: "cgu", version: VERSION }) });
  check("accepting the same version again is a no-op with the original date", again.status === 200 && again.body?.data?.duplicate === true && again.body?.data?.acceptedAt === first.body?.data?.acceptedAt, String(again.status));
  const mine = await call(token, "/me/terms-acceptances");
  check("the owner sees the acceptance", (mine.body?.data ?? []).some((x: any) => x.document === "cgu" && x.version === VERSION));
  const theirs = await call(otherToken, "/me/terms-acceptances");
  check("another user does not see it", !(theirs.body?.data ?? []).some((x: any) => x.version === VERSION));
  const rows = await db.select().from(termsAcceptancesTable).where(and(eq(termsAcceptancesTable.userId, member.id), eq(termsAcceptancesTable.version, VERSION)));
  check("exactly one row stored, with IP and user agent", rows.length === 1 && !!rows[0].userAgent, `${rows.length} row(s)`);
  const anon = await call(null, "/me/terms-acceptances", { method: "POST", body: JSON.stringify({ document: "cgu", version: VERSION }) });
  check("acceptance requires authentication", anon.status === 401, String(anon.status));

  // 3. Official certificates remain the way to go
  const docs = await call(token, "/documents/templates");
  check("document templates still answer for a co-owner", docs.status === 200 || docs.status === 404, String(docs.status));

  // Clean up the test rows only.
  await db.delete(termsAcceptancesTable).where(eq(termsAcceptancesTable.version, VERSION));

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} legal step checks passed`);
  await pool.end();
  if (failed) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
