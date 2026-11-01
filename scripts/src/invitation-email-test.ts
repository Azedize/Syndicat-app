/**
 * Invitation e-mails report what really happened (2026-11-01) — isolated test base only:
 *   pnpm --filter @workspace/scripts run invitation-email:test
 *
 * The test API runs with OUTBOUND_DELIVERY=off, so no invitation can leave: the
 * answer must say so (invitationEmail "not_sent") and never claim it was sent.
 * Everything created here is removed at the end.
 */
import { pool } from "@workspace/db";
import { writableSubscriptionSql } from "./test-domain.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5056/api").replace(/\/$/, "");
if (!/syndycat_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("invitation-email: run it against the isolated test base (testdb exec).");
const checks: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
async function call(token: string | null, method: string, path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}

async function main() {
  const [admin] = (await pool.unsafe(`
    SELECT u.email, u.syndicate_id FROM users u JOIN syndicates s ON s.id = u.syndicate_id AND s.status = 'active'
     WHERE u.role = 'syndicate_admin' AND u.status = 'active' AND u.email LIKE '%.seedgen.mizan.test'
       AND ${writableSubscriptionSql("s")}
       AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = s.organization_id AND o.status = 'suspended')
     ORDER BY u.email LIMIT 1`)) as any[];
  if (!admin) throw new Error("no syndic with a writable subscription");
  const token = (await call(null, "POST", "/auth/login", { email: admin.email, password: "MizanTest#2026" })).body?.data?.token;
  if (!token) throw new Error("syndic login failed");
  const email = `invitation.${Date.now()}@s20261019.seedgen.mizan.test`;
  let memberId: string | undefined;
  try {
    const r = await call(token, "POST", "/members", {
      name: "Invité Test Courriel", email, phone: "", profession: "Test", joinDate: new Date().toISOString().slice(0, 10), inviteToApp: true,
    });
    memberId = r.body?.data?.id;
    check("member created with an app account", r.status === 201 && r.body?.invited === true, `${r.status}`);
    check("the answer says the invitation e-mail did not leave", r.body?.invitationEmail === "not_sent", r.body?.invitationEmail);
    check("the message does not claim the e-mail was sent", !/invitation envoyée/i.test(r.body?.message ?? ""), r.body?.message);
    check("the message points to « Mot de passe oublié »", /Mot de passe oublié/.test(r.body?.message ?? ""));
    const [log] = (await pool`SELECT status FROM email_logs WHERE recipient = ${email} AND template = 'welcome' ORDER BY created_at DESC LIMIT 1`) as any[];
    check("the e-mail log records why it did not leave", !!log && log.status !== "sent", log?.status);
    const [acct] = (await pool`SELECT must_change_password FROM users WHERE email = ${email}`) as any[];
    check("the temporary password must be changed at first sign-in", acct?.must_change_password === true);
  } finally {
    await pool`DELETE FROM users WHERE email = ${email}`;
    if (memberId) {
      await pool`DELETE FROM members WHERE id = ${memberId}`;
      await pool`UPDATE syndicates SET members_count = GREATEST(members_count - 1, 0) WHERE id = ${admin.syndicate_id}`;
    }
    await pool`DELETE FROM email_logs WHERE recipient = ${email}`;
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} invitation e-mail checks passed`);
  await pool.end();
  process.exit(failed ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await pool.end().catch(() => {}); process.exit(1); });
