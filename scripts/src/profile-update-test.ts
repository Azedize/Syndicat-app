/**
 * Profile update, end to end (2026-10-25) — isolated test base only:
 *   pnpm --filter @workspace/scripts run profile-update:test
 *
 * PUT /profile writes the name and phone to PostgreSQL (the phone in E.164),
 * refuses invalid values without writing anything, and never lets a user
 * change their role, condominium, status or e-mail through it.
 */
import { pool } from "@workspace/db";
import { writableSubscriptionSql } from "./test-domain.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5056/api").replace(/\/$/, "");
if (!/syndycat_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("profile-update: run it against the isolated test base (testdb exec).");
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
const row = async (id: string) => (await pool`SELECT name, phone, role, status, syndicate_id, email FROM users WHERE id = ${id}`)[0];

async function main() {
  const [u] = await pool.unsafe(`
    SELECT u.id, u.email FROM users u JOIN syndicates s ON s.id = u.syndicate_id AND s.status = 'active'
     WHERE u.role = 'member' AND u.status = 'active' AND u.email LIKE '%.seedgen.mizan.test'
       AND ${writableSubscriptionSql("s")}
       AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = s.organization_id AND o.status = 'suspended')
     ORDER BY u.email DESC LIMIT 1`);
  const original = await row(u.id);
  const login = await call(null, "POST", "/auth/login", { email: u.email, password: "MizanTest#2026" });
  const token = login.body?.data?.token as string;
  if (!token) throw new Error(`login ${login.status}`);

  try {
    // 1. A real save, written to the database, phone normalised.
    const ok = await call(token, "PUT", "/profile", { name: "  Résident   Test Profil  ", phone: "06 12 34 56 78" });
    const saved = await row(u.id);
    check("a valid update is accepted", ok.status === 200, String(ok.status));
    check("the name is stored cleaned (spaces collapsed)", saved.name === "Résident Test Profil", saved.name);
    check("the phone is stored in E.164 (+212…)", saved.phone === "+212612345678", saved.phone);
    check("the response returns what was stored", ok.body?.data?.name === saved.name && ok.body?.data?.phone === saved.phone);
    const me = await call(token, "GET", "/auth/me");
    const meData = me.body?.data?.user ?? me.body?.data ?? {};
    check("reloading the profile shows the saved values", me.status === 200 && meData.name === saved.name, `${me.status} ${meData.name}`);

    // 2. Invalid values: refused, nothing written.
    const badPhone = await call(token, "PUT", "/profile", { phone: "12ab" });
    check("an invalid phone is refused with PHONE_INVALID", badPhone.status === 400 && badPhone.body?.code === "PHONE_INVALID" && badPhone.body?.field === "phone", `${badPhone.status} ${badPhone.body?.code}`);
    const blank = await call(token, "PUT", "/profile", { name: "   " });
    check("a blank name is refused", blank.status === 400 && blank.body?.field === "name", `${blank.status} ${blank.body?.field}`);
    const ctrl = await call(token, "PUT", "/profile", { name: "Nom\u0007" });
    check("control characters are refused", ctrl.status === 400, String(ctrl.status));
    const after = await row(u.id);
    check("refused requests changed nothing", after.name === saved.name && after.phone === saved.phone);

    // 3. Protected fields are ignored.
    const priv = await call(token, "PUT", "/profile", { name: "Résident Test Profil", role: "super_admin", status: "suspended", syndicateId: "other", email: "pirate@example.test", passwordHash: "x" });
    const p = await row(u.id);
    check("role, status, condominium and e-mail cannot be changed here", priv.status === 200 && p.role === original.role && p.status === original.status && p.syndicate_id === original.syndicate_id && p.email === original.email, `${priv.status} ${p.role} ${p.status}`);
    check("the response never contains the password hash", priv.body?.data && !("passwordHash" in priv.body.data));

    // 4. Clearing the phone, and an empty request.
    const clear = await call(token, "PUT", "/profile", { phone: "" });
    check("an empty phone clears the number", clear.status === 200 && (await row(u.id)).phone === null, String(clear.status));
    const empty = await call(token, "PUT", "/profile", {});
    check("an empty request is refused", empty.status === 400, String(empty.status));

    // 5. Authentication.
    const anon = await call(null, "PUT", "/profile", { name: "Anonyme" });
    check("without a session: 401", anon.status === 401, String(anon.status));
  } finally {
    await pool`UPDATE users SET name = ${original.name}, phone = ${original.phone} WHERE id = ${u.id}`;
    const back = await row(u.id);
    check("original values restored", back.name === original.name && back.phone === original.phone);
  }

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} profile update checks passed`);
  await pool.end();
  if (failed) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
