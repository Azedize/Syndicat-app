/**
 * Notification token of a phone (2026-11-02) — isolated test base only:
 *   pnpm --filter @workspace/scripts run push-token:test
 *
 * A phone receives the notifications of the account signed in on it, and of no other.
 */
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5056/api").replace(/\/$/, "");
if (!/syndycat_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("push-token: run it against the isolated test base.");
const PASSWORD = "Notification#2026";
const checks: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
async function call(method: string, p: string, body?: unknown, token?: string) {
  const r = await fetch(`${BASE}${p}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}
const tokenOf = async (id: string) => ((await pool`SELECT push_token FROM users WHERE id = ${id}`) as any[])[0].push_token as string | null;

async function main() {
  const [syndic] = (await pool`
    SELECT u.syndicate_id FROM users u JOIN syndicates s ON s.id = u.syndicate_id AND s.status = 'active'
      JOIN syndicate_subscriptions ss ON ss.syndicate_id = s.id AND ss.status IN ('active','trial')
     WHERE u.role = 'syndicate_admin' AND u.status = 'active' AND u.email LIKE '%.seedgen.mizan.test' LIMIT 1`) as any[];
  const suspended = `test-push-syn-${randomUUID()}`;
  await pool`INSERT INTO syndicates (id, name, status) VALUES (${suspended}, 'Copropriété suspendue', 'suspended')`;
  const hash = await bcrypt.hash(PASSWORD, 8);
  const make = async (tag: string, syndicateId: string) => {
    const id = `test-push-${randomUUID()}`;
    const email = `push.${tag}.${Date.now()}@s20261019.seedgen.mizan.test`;
    await pool`INSERT INTO users (id, name, email, password_hash, role, status, syndicate_id)
               VALUES (${id}, 'Personne Notification', ${email}, ${hash}, 'member', 'active', ${syndicateId})`;
    const login = await call("POST", "/auth/login", { email, password: PASSWORD });
    return { id, token: login.body?.data?.token as string };
  };
  const a = await make("a", syndic.syndicate_id);
  const b = await make("b", syndic.syndicate_id);
  const c = await make("c", suspended);
  const phone = `ExponentPushToken[test-${randomUUID()}]`;
  const newerPhone = `ExponentPushToken[test-${randomUUID()}]`;

  try {
    check("no session: token refused (401)", (await call("PUT", "/users/push-token", { pushToken: phone })).status === 401);
    check("no session: removal refused (401)", (await call("DELETE", "/users/push-token", { pushToken: phone })).status === 401);
    check("an empty token is refused (400)", (await call("PUT", "/users/push-token", { pushToken: "" }, a.token)).status === 400);
    check("removal without a token is refused (400)", (await call("DELETE", "/users/push-token", {}, a.token)).status === 400);

    check("A registers the phone", (await call("PUT", "/users/push-token", { pushToken: phone }, a.token)).status === 200 && (await tokenOf(a.id)) === phone);

    await call("PUT", "/users/push-token", { pushToken: phone }, b.token);
    check("B signs in on the same phone: B receives", (await tokenOf(b.id)) === phone);
    check("B signs in on the same phone: A no longer receives on it", (await tokenOf(a.id)) === null);

    await call("PUT", "/users/push-token", { pushToken: newerPhone }, b.token);
    check("A's sign-out with another phone's token changes nothing for B", (await call("DELETE", "/users/push-token", { pushToken: newerPhone }, a.token)).status === 200 && (await tokenOf(b.id)) === newerPhone);

    await call("DELETE", "/users/push-token", { pushToken: phone }, b.token);
    check("signing out of an old phone keeps the newer one", (await tokenOf(b.id)) === newerPhone);

    await call("DELETE", "/users/push-token", { pushToken: newerPhone }, b.token);
    check("signing out removes this phone's token", (await tokenOf(b.id)) === null);

    await pool`UPDATE users SET push_token = ${phone} WHERE id = ${c.id}`;
    const del = await call("DELETE", "/users/push-token", { pushToken: phone }, c.token);
    check("in a suspended condominium, signing out still removes the token", del.status === 200 && (await tokenOf(c.id)) === null, String(del.status));
  } finally {
    const ids = [a.id, b.id, c.id];
    await pool`DELETE FROM refresh_tokens WHERE user_id IN ${pool(ids)}`;
    await pool`DELETE FROM audit_logs WHERE user_id IN ${pool(ids)}`;
    await pool`DELETE FROM users WHERE id IN ${pool(ids)}`;
    await pool`DELETE FROM syndicates WHERE id = ${suspended}`;
  }
  const failed = checks.filter((x) => !x.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} push token checks passed`);
  await pool.end();
  process.exit(failed ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await pool.end().catch(() => {}); process.exit(1); });
