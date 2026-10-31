/**
 * Finances open to co-owners, read-only (2026-10-21):
 *  - a co-owner reads the condominium's aggregated finances;
 *  - nothing personal leaks: no full RIB, no neighbour's payment, no salary line;
 *  - a tenant is refused (charges are the owners');
 *  - the execution of a budget adopted in general meeting is readable, a draft is not;
 *  - another condominium's budget stays out of reach.
 */
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import { TEST_EMAIL_LIKE } from "./test-domain.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const PASSWORD = "MizanTest#2026";
const checks: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const rows = <T>(r: unknown) => ((r as { rows?: T[] }).rows ?? (r as T[]));
async function login(email: string) {
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  const j = (await r.json()) as any;
  if (!j?.data?.token) throw new Error(`login ${email}: ${r.status}`);
  return j.data.token as string;
}
async function get(token: string, path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, body: (await r.json().catch(() => null)) as any, text: "" };
}
const ACTIVE = sql`JOIN syndicates s ON s.id = u.syndicate_id AND s.status = 'active'
  JOIN syndicate_subscriptions ss ON ss.syndicate_id = s.id AND ss.status IN ('active','trial')`;

async function main() {
  // A condominium with an adopted budget and a draft one.
  const [condo] = rows<{ syndicate_id: string; approved: string; draft: string | null }>(await db.execute(sql`
    SELECT b.syndicate_id,
           (SELECT bu.id FROM budgets bu WHERE bu.building_id = b.id AND bu.status = 'approved' LIMIT 1) AS approved,
           (SELECT bu.id FROM budgets bu JOIN buildings b2 ON b2.id = bu.building_id WHERE b2.syndicate_id = b.syndicate_id AND bu.status = 'draft' LIMIT 1) AS draft
    FROM buildings b JOIN syndicates s ON s.id = b.syndicate_id AND s.status = 'active'
    JOIN syndicate_subscriptions ss ON ss.syndicate_id = s.id AND ss.status IN ('active','trial')
    WHERE EXISTS (SELECT 1 FROM budgets bu WHERE bu.building_id = b.id AND bu.status = 'approved')
      AND EXISTS (SELECT 1 FROM users u WHERE u.syndicate_id = b.syndicate_id AND u.role = 'member' AND u.status = 'active' AND u.email LIKE ${TEST_EMAIL_LIKE}
                  AND EXISTS (SELECT 1 FROM members m WHERE m.syndicate_id = u.syndicate_id AND lower(m.email) = lower(u.email) AND m.status = 'active'))
    ORDER BY (SELECT count(*) FROM budgets bu JOIN buildings b2 ON b2.id = bu.building_id WHERE b2.syndicate_id = b.syndicate_id AND bu.status = 'draft') DESC
    LIMIT 1`));
  const [member] = rows<{ email: string }>(await db.execute(sql`
    SELECT u.email FROM users u ${ACTIVE}
    JOIN members m ON m.syndicate_id = u.syndicate_id AND lower(m.email) = lower(u.email) AND m.status = 'active'
    WHERE u.syndicate_id = ${condo.syndicate_id} AND u.role = 'member' AND u.status = 'active' AND u.email LIKE ${TEST_EMAIL_LIKE} LIMIT 1`));
  const [tenant] = rows<{ email: string }>(await db.execute(sql`
    SELECT u.email FROM users u ${ACTIVE} WHERE u.role = 'tenant' AND u.status = 'active' AND u.email LIKE ${TEST_EMAIL_LIKE} LIMIT 1`));
  const [outsider] = rows<{ email: string }>(await db.execute(sql`
    SELECT u.email FROM users u ${ACTIVE}
    JOIN members m ON m.syndicate_id = u.syndicate_id AND lower(m.email) = lower(u.email) AND m.status = 'active'
    WHERE u.syndicate_id <> ${condo.syndicate_id} AND u.role = 'member' AND u.status = 'active' AND u.email LIKE ${TEST_EMAIL_LIKE} LIMIT 1`));

  const mt = await login(member.email);
  const fin = await get(mt, "/transparency/finances");
  const d = fin.body?.data;
  check("a co-owner reads the condominium's finances", fin.status === 200 && Array.isArray(d?.accounts) && Array.isArray(d?.expenses), String(fin.status));
  check("only budgets adopted in general meeting are listed", (d?.budgets ?? []).length > 0 && d.budgets.every((b: any) => ["approved", "closed"].includes(b.status)), `${d?.budgets?.length} budget(s)`);
  const raw = JSON.stringify(d ?? {});
  check("no full bank account number is exposed", !/\d{24}/.test(raw));
  check("no personal fields (owner, email, phone, lot owner) in the payload", !/"(email|phone|ownerId|ownerName|memberId|debtorMemberIds)"/.test(raw));
  check("collection is aggregated (called / collected / rate)", typeof d?.collection?.called === "string" && "rate" in (d?.collection ?? {}));

  const ok = await get(mt, `/budgets/${condo.approved}/execution`);
  check("the execution of an adopted budget is readable by a co-owner", ok.status === 200 && Array.isArray(ok.body?.data?.lines), String(ok.status));
  if (condo.draft) {
    const draft = await get(mt, `/budgets/${condo.draft}/execution`);
    check("a draft budget is not visible to a co-owner", draft.status === 404, String(draft.status));
  }

  if (tenant) {
    const tt = await login(tenant.email);
    const tf = await get(tt, "/transparency/finances");
    check("a tenant is refused", tf.status === 403, String(tf.status));
  }
  if (outsider) {
    const ot = await login(outsider.email);
    const cross = await get(ot, `/budgets/${condo.approved}/execution`);
    check("another condominium's co-owner cannot read this budget", cross.status === 404 || cross.status === 403, String(cross.status));
  }

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} finance transparency checks passed`);
  await pool.end();
  if (failed) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
