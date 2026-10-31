/**
 * E-mail addresses of accounts (2026-10-24) — run against the isolated test
 * base and its API (OUTBOUND_DELIVERY=off):
 *
 *   pnpm --filter @workspace/scripts run testdb -- exec env API_BASE_URL=http://localhost:5056/api node --import=tsx src/email-accounts-test.ts
 *
 * Covers syntax, uniqueness (case-insensitive), reserved test domains,
 * unverified / verified / undeliverable accounts, sign-up and password
 * recovery without any real mailbox, the absence of any real send, and
 * compatibility with existing accounts. Prints the address report.
 * Every row it creates is removed, every changed row restored.
 */
import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { pool } from "@workspace/db";
import { TEST_EMAIL_LIKE, TEST_EMAIL_ROOT, testEmailRoot } from "./test-domain.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5056/api").replace(/\/$/, "");
const PASSWORD = "MizanTest#2026";
const checks: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const q = <T = any>(text: string, params: unknown[] = []) => (pool as any).unsafe(text, params) as Promise<T[]>;
const post = async (p: string, body: unknown) => {
  const r = await fetch(`${BASE}${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
};

async function main() {
  const [{ d }] = await q<{ d: string }>("SELECT current_database() AS d");
  if (d !== "syndycat_test") throw new Error(`Ce test modifie des comptes : il ne tourne que sur syndycat_test (base actuelle : ${d}).`);

  // ── Report ──
  const [r] = await q(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE email LIKE $1)::int AS generated,
      count(*) FILTER (WHERE email ~* '\\.(test|invalid|example|localhost|local)$' OR email ~* '@example\\.(com|net|org)$')::int AS reserved,
      count(*) FILTER (WHERE email !~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$')::int AS bad_syntax,
      count(*) FILTER (WHERE email <> lower(email))::int AS not_lowercase,
      count(*) FILTER (WHERE email_status = 'verified')::int AS verified,
      count(*) FILTER (WHERE email_status = 'unverified')::int AS unverified,
      count(*) FILTER (WHERE email_status = 'undeliverable')::int AS undeliverable
    FROM users`, [TEST_EMAIL_LIKE]);
  const [dup] = await q(`SELECT count(*)::int AS n FROM (SELECT lower(email) FROM users GROUP BY 1 HAVING count(*) > 1) x`);
  console.log(`Rapport — comptes ${r.total} · générés (${TEST_EMAIL_ROOT}) ${r.generated} · domaines réservés ${r.reserved} · syntaxe invalide ${r.bad_syntax} · majuscules ${r.not_lowercase} · doublons (casse ignorée) ${dup.n}`);
  console.log(`         statuts : vérifiés ${r.verified} · non vérifiés ${r.unverified} · non délivrables ${r.undeliverable}`);
  check("no address with an invalid syntax", r.bad_syntax === 0);
  check("no duplicate address, case ignored", dup.n === 0);
  check("every reserved-domain address is marked undeliverable", r.reserved === r.undeliverable || (await q(`SELECT 1 FROM users WHERE (email ~* '\\.(test|invalid|example|localhost|local)$') AND email_status <> 'undeliverable' LIMIT 1`)).length === 0);

  // ── Configuration of the test domain ──
  const saved = process.env.TEST_EMAIL_ROOT;
  process.env.TEST_EMAIL_ROOT = "mizan-tests.ma";
  let refusedReal = false;
  try { testEmailRoot(); } catch { refusedReal = true; }
  process.env.TEST_EMAIL_ROOT = "qa.mizan.invalid";
  let acceptedReserved = false;
  try { acceptedReserved = testEmailRoot() === "qa.mizan.invalid"; } catch { /* */ }
  if (saved === undefined) delete process.env.TEST_EMAIL_ROOT; else process.env.TEST_EMAIL_ROOT = saved;
  check("the generator refuses a non-reserved test domain (could reach someone)", refusedReal);
  check("the generator accepts another reserved domain from configuration", acceptedReserved);

  // ── Rules of the API ──
  const { isReservedEmail, initialEmailStatus } = await import(pathToFileURL(path.resolve("../artifacts/api-server/src/lib/email/deliverability.ts")).href);
  check("a generated address is reserved: syntactically valid, not a mailbox", isReservedEmail(`a.b.1@s1.${TEST_EMAIL_ROOT}`) && initialEmailStatus(`a.b.1@s1.${TEST_EMAIL_ROOT}`, true) === "undeliverable");
  check("a real-looking address starts unverified, verified only after a code", initialEmailStatus("x@andalous.ma") === "unverified" && initialEmailStatus("x@andalous.ma", true) === "verified");

  // ── Sign-up ──
  for (const bad of ["pas-une-adresse", "a@b", "nom prénom@x.test", "@x.test", "x@"]) {
    const res = await post("/auth/register", { name: "Test Syntaxe", email: bad, password: "Abcdef12!" });
    check(`sign-up refuses « ${bad} » (400)`, res.status === 400, String(res.status));
  }
  const [existing] = await q<{ email: string }>(`SELECT email FROM users WHERE email LIKE $1 AND status = 'active' ORDER BY email LIMIT 1`, [TEST_EMAIL_LIKE]);
  const dupRes = await post("/auth/register", { name: "Doublon", email: existing.email.toUpperCase(), password: "Abcdef12!" });
  check("sign-up with an existing address in other case: 409", dupRes.status === 409, String(dupRes.status));
  const fresh = `nouveau.${Date.now()}@signup.${TEST_EMAIL_ROOT}`;
  const noCode = await post("/auth/register", { name: "Sans code", email: fresh, password: "Abcdef12!" });
  check("sign-up without a verified code creates nothing (403)", noCode.status === 403 && noCode.body?.code === "EMAIL_VERIFICATION_REQUIRED" && (await q(`SELECT 1 FROM users WHERE email = $1`, [fresh])).length === 0, String(noCode.status));
  const otp = await post("/auth/otp/send", { email: fresh });
  check("no verification code is sent to a reserved address", otp.status === 400 && otp.body?.code === "EMAIL_UNDELIVERABLE", String(otp.status));

  // ── Password recovery, without a mailbox ──
  const [subject] = await q<{ id: string; email: string; password_hash: string }>(
    `SELECT id, email, password_hash FROM users WHERE email LIKE $1 AND status = 'active' AND role = 'member' ORDER BY email DESC LIMIT 1`, [TEST_EMAIL_LIKE]);
  const logsBefore = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM email_logs`))[0].n;
  const forgot = await post("/auth/forgot-password", { email: subject.email });
  const unknown = await post("/auth/forgot-password", { email: `inconnu@nowhere.${TEST_EMAIL_ROOT}` });
  check("forgot-password: same answer for an existing and an unknown address", forgot.status === 200 && unknown.status === 200 && forgot.body?.message === unknown.body?.message);
  const [log] = await q<any>(`SELECT status, error_message, body_html FROM email_logs WHERE recipient = $1 AND template = 'password_reset' ORDER BY created_at DESC LIMIT 1`, [subject.email]);
  check("the reset message to a test address is not attempted (skipped)", log?.status === "skipped", `${log?.status} ${log?.error_message ?? ""}`);
  check("the reset link is not kept in the e-mail log", log && log.body_html === null);
  // The link only travels by e-mail: the test issues its own token the same way.
  const raw = randomBytes(32).toString("hex");
  await q(`INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, now() + interval '10 minutes')`, [subject.id, createHash("sha256").update(raw).digest("hex")]);
  try {
    const reset = await post("/auth/reset-password", { token: raw, newPassword: "Nouveau#2026x" });
    const loginNew = await post("/auth/login", { email: subject.email, password: "Nouveau#2026x" });
    const loginOld = await post("/auth/login", { email: subject.email, password: PASSWORD });
    check("reset with a valid token: new password works, old one no longer", reset.status === 200 && loginNew.status === 200 && loginOld.status === 401, `${reset.status}/${loginNew.status}/${loginOld.status}`);
    const reuse = await post("/auth/reset-password", { token: raw, newPassword: "Encore#2026x" });
    check("a reset token works once", reuse.status === 400, String(reuse.status));
  } finally {
    await q(`UPDATE users SET password_hash = $2 WHERE id = $1`, [subject.id, subject.password_hash]);
  }
  check("test account restored", (await post("/auth/login", { email: subject.email, password: PASSWORD })).status === 200);

  // ── Nothing real left the machine ──
  const [sent] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM email_logs WHERE status = 'sent'`);
  check("no e-mail recorded as sent on the test base", sent.n === 0, String(sent.n));
  const newLogs = (await q<{ n: number }>(`SELECT count(*)::int AS n FROM email_logs`))[0].n - logsBefore;
  check("each attempt is logged (none hidden)", newLogs >= 1, `${newLogs} new log(s)`);

  // ── Existing accounts ──
  const demo = await post("/auth/login", { email: "syndic@andalous.test", password: "password123" });
  check("demo accounts (reserved domains) still sign in", demo.status === 200, String(demo.status));
}

main()
  .catch((e) => { console.error(e); checks.push({ name: "run", ok: false }); })
  .finally(async () => {
    const failed = checks.filter((c) => !c.ok).length;
    console.log(`\n${checks.length - failed}/${checks.length} e-mail account checks passed`);
    await pool.end();
    if (failed) process.exit(1);
  });
