/**
 * Real-world acceptance — roles and sessions (2026-11-08), isolated test base only:
 *   pnpm --filter @workspace/scripts run acceptance-roles:test
 *
 * 1. Rights that change during a session take effect on the very next request
 *    (enforceSessionContext): a syndic demoted to co-owner, a suspended then
 *    reactivated account, a person moved out of the condominium, a company
 *    administrator removed from the company, a platform administrator demoted.
 * 2. Observed role matrix: what each of the 8 roles may read on the main
 *    management screens of its own condominium. Printed for the report, and
 *    checked against the rules that are written down (residents never read the
 *    treasury, the audit journal or the team's claim board; tenants do not see
 *    the syndicate's finances).
 * 3. One real login, to prove the real session path, then tokens signed like
 *    the API's (the login endpoint is limited to 20 calls / 15 min).
 * Every account created here is removed at the end.
 */
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "@workspace/db";
import { writableSubscriptionSql } from "./test-domain.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5056/api").replace(/\/$/, "");
if (!/syndycat_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("acceptance-roles: run it against the isolated test base.");
const SECRET = process.env.SESSION_SECRET ?? process.env.JWT_SECRET;
if (!SECRET) throw new Error("SESSION_SECRET / JWT_SECRET missing");
const RUN = Date.now().toString(36);
const PASSWORD = "AccRoles#2026";

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
type U = { id: string; email: string; role: string; syndicateId: string | null; name: string };
const sign = (u: U) => jwt.sign({ userId: u.id, email: u.email, role: u.role, syndicateId: u.syndicateId ?? undefined, name: u.name }, SECRET, { expiresIn: "15m" });

const created: string[] = [];
async function makeUser(role: string, syndicateId: string | null, label: string): Promise<U> {
  const email = `acc-${label}-${RUN}@example.invalid`;
  const hash = await bcrypt.hash(PASSWORD, 10);
  const [row] = await pool`INSERT INTO users (name, email, password_hash, role, status, syndicate_id)
    VALUES (${`Acceptance ${label}`}, ${email}, ${hash}, ${role}, 'active', ${syndicateId}) RETURNING id`;
  created.push(row.id);
  return { id: row.id, email, role, syndicateId, name: `Acceptance ${label}` };
}

async function main() {
  const [condo] = await pool.unsafe(`
    SELECT s.id, s.organization_id FROM syndicates s
     WHERE s.status = 'active' AND s.organization_id IS NOT NULL AND ${writableSubscriptionSql("s")}
       AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = s.organization_id AND o.status = 'active')
       AND EXISTS (SELECT 1 FROM users u WHERE u.syndicate_id = s.id AND u.email LIKE '%.seedgen.mizan.test')
     ORDER BY s.name LIMIT 1`);
  const [other] = await pool.unsafe(`SELECT id FROM syndicates WHERE status = 'active' AND id <> $1 ORDER BY name LIMIT 1`, [condo.id]);
  const createdMemberships: string[] = [];
  const createdOrgMembers: string[] = [];

  try {
    // ── 0. A real login: the session the app gets.
    const syndic = await makeUser("syndicate_admin", condo.id, "syndic");
    const login = await call(null, "POST", "/auth/login", { email: syndic.email, password: PASSWORD });
    const realToken = login.body?.data?.token as string | undefined;
    check("a real login opens a session", login.status === 200 && !!realToken, String(login.status));
    const before = await call(realToken!, "GET", "/treasury/accounts");
    check("the syndic reads the treasury", before.status === 200, String(before.status));

    // ── 1a. Syndic demoted to co-owner during the session.
    await pool`UPDATE users SET role = 'member' WHERE id = ${syndic.id}`;
    const demoted = await call(realToken!, "GET", "/treasury/accounts");
    check("demoted syndic: the open session is closed at the next request", demoted.status === 401 && demoted.body?.code === "SESSION_CONTEXT_REVOKED", `${demoted.status} ${demoted.body?.code}`);
    const relog = await call(null, "POST", "/auth/login", { email: syndic.email, password: PASSWORD });
    const memberToken = relog.body?.data?.token as string | undefined;
    const asMember = await call(memberToken!, "GET", "/treasury/accounts");
    check("after logging in again, the co-owner no longer reads the treasury", relog.status === 200 && asMember.status === 403, `${relog.status} ${asMember.status}`);

    // ── 1b. Account suspended, then reactivated.
    const resident = await makeUser("member", condo.id, "resident");
    const rt = sign(resident);
    check("a co-owner reads the announcements", (await call(rt, "GET", "/announcements")).status === 200);
    await pool`UPDATE users SET status = 'suspended' WHERE id = ${resident.id}`;
    const susp = await call(rt, "GET", "/announcements");
    check("suspended account: refused at once with ACCOUNT_DISABLED", susp.status === 401 && susp.body?.code === "ACCOUNT_DISABLED", `${susp.status} ${susp.body?.code}`);
    const suspLogin = await call(null, "POST", "/auth/login", { email: resident.email, password: PASSWORD });
    check("a suspended account cannot log in", suspLogin.status >= 400 && !suspLogin.body?.data?.token, String(suspLogin.status));
    await pool`UPDATE users SET status = 'active' WHERE id = ${resident.id}`;
    const back = await call(sign(resident), "GET", "/announcements");
    check("reactivated: access is back", back.status === 200, String(back.status));
    await pool`UPDATE users SET status = 'pending' WHERE id = ${resident.id}`;
    const pend = await call(sign(resident), "GET", "/announcements");
    check("an account still pending is refused", pend.status === 401, String(pend.status));
    await pool`UPDATE users SET status = 'active' WHERE id = ${resident.id}`;

    // ── 1c. Moved out of the condominium.
    const mover = await makeUser("member", condo.id, "mover");
    const mt = sign(mover);
    await pool`UPDATE users SET syndicate_id = ${other.id} WHERE id = ${mover.id}`;
    const moved = await call(mt, "GET", "/announcements");
    check("moved out: the old condominium's token is refused", moved.status === 401 && moved.body?.code === "SESSION_CONTEXT_REVOKED", `${moved.status} ${moved.body?.code}`);
    const forged = await call(sign({ ...mover, syndicateId: condo.id }), "GET", "/announcements");
    check("a new token claiming the old condominium is refused too", forged.status === 401, String(forged.status));

    // ── 1d. Company administrator removed from the company.
    const companyAdmin = await makeUser("syndicate_admin", null, "orgadmin");
    const [om] = await pool`INSERT INTO organization_members (organization_id, user_id, role, status) VALUES (${condo.organization_id}, ${companyAdmin.id}, 'org_admin', 'active') RETURNING id`;
    createdOrgMembers.push(om.id);
    const ct = sign({ ...companyAdmin, syndicateId: condo.id });
    const viaOrg = await call(ct, "GET", "/treasury/accounts");
    check("a company administrator opens a condominium of the company", viaOrg.status === 200, String(viaOrg.status));
    await pool`UPDATE organization_members SET status = 'revoked' WHERE id = ${om.id}`;
    const removed = await call(ct, "GET", "/treasury/accounts");
    check("removed from the company: refused at the next request", removed.status === 401 && removed.body?.code === "SESSION_CONTEXT_REVOKED", `${removed.status} ${removed.body?.code}`);
    const otherOrg = await call(sign({ ...companyAdmin, syndicateId: other.id }), "GET", "/treasury/accounts");
    check("a company administrator never opens another company's condominium", otherOrg.status === 401 || otherOrg.status === 403, String(otherOrg.status));

    // ── 1e. Platform administrator demoted.
    const platform = await makeUser("super_admin", null, "platform");
    const pt = sign(platform);
    const plat = await call(pt, "GET", "/syndicates");
    check("a platform administrator reads the condominiums", plat.status === 200, String(plat.status));
    await pool`UPDATE users SET role = 'member', syndicate_id = ${condo.id} WHERE id = ${platform.id}`;
    const platRevoked = await call(pt, "GET", "/syndicates");
    check("demoted platform administrator: the platform session is closed", platRevoked.status === 401 && platRevoked.body?.code === "SESSION_CONTEXT_REVOKED", `${platRevoked.status} ${platRevoked.body?.code}`);

    // ── 1f. A second condominium granted then withdrawn (membership).
    const multi = await makeUser("member", condo.id, "multi");
    const [ms] = await pool`INSERT INTO syndicate_memberships (user_id, syndicate_id, role, status) VALUES (${multi.id}, ${other.id}, 'treasurer', 'active') RETURNING id`;
    createdMemberships.push(ms.id);
    const contexts = await call(sign(multi), "GET", "/me/contexts");
    const list = (contexts.body?.data ?? contexts.body?.contexts ?? []) as any[];
    check("both condominiums are offered to switch", contexts.status === 200 && list.length >= 2, `${contexts.status} ${list.length}`);
    const otherToken = sign({ ...multi, role: "treasurer", syndicateId: other.id });
    check("the treasurer role works in the second condominium", (await call(otherToken, "GET", "/treasury/accounts")).status === 200);
    await pool`UPDATE syndicate_memberships SET status = 'revoked' WHERE id = ${ms.id}`;
    const msGone = await call(otherToken, "GET", "/treasury/accounts");
    check("membership withdrawn: the second condominium is closed at once", msGone.status === 401, String(msGone.status));
    check("the home condominium still works", (await call(sign(multi), "GET", "/announcements")).status === 200);

    // ── 1g. Property-management companies: portfolio isolation.
    const orgs = await pool.unsafe(`
      SELECT o.id, array_agg(s.id ORDER BY s.name) AS condos FROM organizations o JOIN syndicates s ON s.organization_id = o.id
       WHERE o.status = 'active' AND s.status = 'active' GROUP BY o.id HAVING count(*) >= 2 ORDER BY o.name LIMIT 2`);
    const [orgA, orgB] = orgs as { id: string; condos: string[] }[];
    const aAdmin = await makeUser("syndicate_admin", null, "a-admin");
    const aStaff = await makeUser("syndicate_admin", null, "a-staff");
    for (const [u, role] of [[aAdmin, "org_admin"], [aStaff, "org_staff"]] as const) {
      const [row] = await pool`INSERT INTO organization_members (organization_id, user_id, role, status) VALUES (${orgA.id}, ${u.id}, ${role}, 'active') RETURNING id`;
      createdOrgMembers.push(row.id);
    }
    const [staffMs] = await pool`INSERT INTO syndicate_memberships (user_id, syndicate_id, role, status) VALUES (${aStaff.id}, ${orgA.condos[0]}, 'syndicate_admin', 'active') RETURNING id`;
    createdMemberships.push(staffMs.id);
    const adminT = sign(aAdmin);
    const staffT = sign(aStaff);
    const ids = (r: any) => ((r.body?.data?.condominiums ?? r.body?.data ?? r.body?.rows ?? []) as any[]).map((c) => c.id ?? c.syndicateId);
    const adminPf = await call(adminT, "GET", `/organizations/${orgA.id}/portfolio`);
    const adminIds = ids(adminPf);
    check("company admin: the portfolio lists every condominium of the company", adminPf.status === 200 && orgA.condos.every((c) => adminIds.includes(c)), `${adminPf.status} ${adminIds.length}/${orgA.condos.length}`);
    check("company admin: no condominium of another company in the portfolio", !orgB.condos.some((c) => adminIds.includes(c)));
    const staffPf = await call(staffT, "GET", `/organizations/${orgA.id}/portfolio`);
    const staffIds = ids(staffPf);
    check("company staff: the portfolio lists only the condominium entrusted", staffPf.status === 200 && staffIds.length === 1 && staffIds[0] === orgA.condos[0], `${staffPf.status} ${JSON.stringify(staffIds)}`);
    const staffOther = await call(staffT, "GET", `/organizations/${orgA.id}/portfolio/${orgA.condos[1]}/outstanding`);
    check("company staff: another condominium of the company is refused", staffOther.status === 404 || staffOther.status === 403, String(staffOther.status));
    const staffAdd = await call(staffT, "POST", `/organizations/${orgA.id}/members`, { email: `x-${RUN}@example.invalid`, role: "org_staff" });
    check("company staff: cannot add a company member", staffAdd.status === 403, String(staffAdd.status));
    const crossPf = await call(adminT, "GET", `/organizations/${orgB.id}/portfolio`);
    check("company admin: another company's portfolio is refused", crossPf.status === 404 || crossPf.status === 403, String(crossPf.status));
    const crossDrill = await call(adminT, "GET", `/organizations/${orgA.id}/portfolio/${orgB.condos[0]}/outstanding`);
    check("company admin: another company's condominium through one's own company is refused", crossDrill.status === 404 || crossDrill.status === 403, String(crossDrill.status));
    const crossMembers = await call(adminT, "GET", `/organizations/${orgB.id}/members`);
    check("company admin: another company's members are refused", crossMembers.status === 404 || crossMembers.status === 403, String(crossMembers.status));

    // ── 2. Observed role matrix (own condominium).
    const ROLES = ["syndicate_admin", "president", "treasurer", "secretary", "committee_member", "member", "tenant"];
    const READS: [string, string][] = [
      ["treasury", "/treasury/accounts"],
      ["expenses", "/expenses"],
      ["budgets", "/budgets"],
      ["audit", "/audit"],
      ["claims board", "/claims/board"],
      ["claim metrics", "/claims/metrics"],
      ["calls for funds", "/appels-de-fonds"],
      ["lots", "/lots"],
      ["meetings", "/meetings"],
      ["AG meetings", "/ag-meetings"],
      ["elections", "/elections"],
      ["documents", "/documents"],
    ];
    const matrix: Record<string, Record<string, number>> = {};
    for (const role of ROLES) {
      const u = await makeUser(role, condo.id, `m-${role}`);
      const t = sign(u);
      matrix[role] = {};
      for (const [label, path] of READS) matrix[role][label] = (await call(t, "GET", path)).status;
    }
    console.log("\nObserved matrix (HTTP status per role):");
    console.log(["read".padEnd(16), ...ROLES.map((r) => r.slice(0, 10).padEnd(11))].join(""));
    for (const [label] of READS) console.log([label.padEnd(16), ...ROLES.map((r) => String(matrix[r][label]).padEnd(11))].join(""));
    console.log("");
    const ok200 = (role: string, label: string) => matrix[role][label] === 200;
    const refused = (role: string, label: string) => matrix[role][label] === 403 || matrix[role][label] === 404;
    for (const r of ["member", "tenant"]) {
      check(`${r}: no treasury`, refused(r, "treasury"), String(matrix[r].treasury));
      check(`${r}: no audit journal`, refused(r, "audit"), String(matrix[r].audit));
      check(`${r}: no team claim board`, refused(r, "claims board"), String(matrix[r]["claims board"]));
      check(`${r}: no budgets`, refused(r, "budgets"), String(matrix[r].budgets));
    }
    check("tenant: no general-assembly list (co-owners' right, law 18-00)", refused("tenant", "AG meetings"), String(matrix.tenant["AG meetings"]));
    check("syndic reads every management screen", READS.every(([l]) => ok200("syndicate_admin", l)), JSON.stringify(matrix.syndicate_admin));
    check("treasurer reads the treasury", ok200("treasurer", "treasury"), String(matrix.treasurer.treasury));
    check("no role gets a server error", ROLES.every((r) => Object.values(matrix[r]).every((s) => s < 500)));

    // Writes a resident must never make.
    const res = sign(await makeUser("member", condo.id, "w-member"));
    const ten = sign(await makeUser("tenant", condo.id, "w-tenant"));
    for (const [who, t] of [["member", res], ["tenant", ten]] as const) {
      const ann = await call(t, "POST", "/announcements", { title: "x", body: "x", priority: "info" });
      check(`${who} cannot publish an announcement`, ann.status === 403, String(ann.status));
      const meet = await call(t, "POST", "/meetings", { title: "x", date: "2026-12-01", time: "18:00", location: "x", type: "board" });
      check(`${who} cannot create a meeting`, meet.status === 403, String(meet.status));
      const exp = await call(t, "POST", "/expenses", { label: "x", amount: 10 });
      check(`${who} cannot create an expense`, exp.status === 403, String(exp.status));
      const inv = await call(t, "POST", "/team/invite", { email: `x-${RUN}@example.invalid`, name: "x", role: "secretary" });
      check(`${who} cannot invite a team member`, inv.status === 403, String(inv.status));
    }
  } finally {
    if (createdMemberships.length) await pool`DELETE FROM syndicate_memberships WHERE id = ANY(${createdMemberships})`;
    if (createdOrgMembers.length) await pool`DELETE FROM organization_members WHERE id = ANY(${createdOrgMembers})`;
    if (created.length) {
      await pool`DELETE FROM refresh_tokens WHERE user_id = ANY(${created})`.catch(() => {});
      await pool`DELETE FROM user_sessions WHERE user_id = ANY(${created})`.catch(() => {});
      await pool`DELETE FROM audit_logs WHERE user_id = ANY(${created})`.catch(() => {});
      await pool`DELETE FROM users WHERE id = ANY(${created})`;
    }
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} acceptance role checks passed`);
  await pool.end();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
