/**
 * Subscription access matrix (2026-10-25) — run against the isolated test base:
 *   pnpm --filter @workspace/scripts run subscriptions-access:test
 *
 * The subscription belongs to the condominium (syndicate), not to each
 * resident. Being a member of a condominium does not grant billing rights:
 *  - residents and the treasurer read the status (for the read-only notice)
 *    but not the payments or the invoices of the subscription;
 *  - only the syndic (and the platform, under supervision) subscribes,
 *    changes, cancels or retries; only the platform confirms, refunds,
 *    marks an invoice paid, creates plans or grants a trial;
 *  - one condominium never sees or touches another's billing;
 *  - an expired or suspended subscription turns writes into 402
 *    SUBSCRIPTION_REQUIRED, while reads and billing recovery stay open.
 *
 * Every request that should be refused is sent with a body the server would
 * otherwise accept or reject on validation, so a 403 proves the permission
 * check and nothing is written. The one allowed write probe (syndic's own
 * subscribe) uses an unknown plan, so it stops at validation.
 */
import { pool } from "@workspace/db";
import { writableSubscriptionSql } from "./test-domain.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5056/api").replace(/\/$/, "");
if (!/syndycat_test/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("subscriptions-access: run it against the isolated test base (testdb exec).");
}
const PASSWORD = "MizanTest#2026";
const checks: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
async function login(email: string) {
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  const j = (await r.json().catch(() => null)) as any;
  if (!j?.data?.token) throw new Error(`login ${email}: ${r.status}`);
  return j.data.token as string;
}
async function call(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}
const denied = (s: number) => s === 403 || s === 404;

/** A condominium with an active subscription and the given roles (generated accounts). */
async function condo(statuses: string[], roles: string[], writable = false) {
  const rows = await pool.unsafe(
    `SELECT s.id FROM syndicates s
       JOIN LATERAL (SELECT status FROM syndicate_subscriptions ss WHERE ss.syndicate_id = s.id ORDER BY created_at DESC LIMIT 1) last ON true
      WHERE last.status = ANY($1) AND s.status = 'active'
        ${writable ? `AND ${writableSubscriptionSql("s")}` : ""}
        -- A suspended company makes its condominiums read-only (423) whatever the subscription.
        AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = s.organization_id AND o.status = 'suspended')
        AND ${roles.map((_, i) => `EXISTS (SELECT 1 FROM users u WHERE u.syndicate_id = s.id AND u.role = $${i + 2} AND u.status = 'active' AND u.email LIKE '%.test')`).join(" AND ")}
      ORDER BY s.id LIMIT 2`,
    [statuses, ...roles],
  );
  return rows.map((r: any) => r.id as string);
}
const userOf = async (sid: string, role: string) =>
  (await pool`SELECT email FROM users WHERE syndicate_id = ${sid} AND role = ${role} AND status = 'active' AND email LIKE '%.test' ORDER BY email LIMIT 1`)[0]?.email as string | undefined;

async function main() {
  const [A, B] = await condo(["active", "trial"], ["member", "treasurer", "syndicate_admin"], true);
  if (!A || !B) throw new Error("fixture: two condominiums with a writable subscription, a member, a treasurer and a syndic");
  const member = await login((await userOf(A, "member"))!);
  const treasurer = await login((await userOf(A, "treasurer"))!);
  const syndic = await login((await userOf(A, "syndicate_admin"))!);
  const syndicB = await login((await userOf(B, "syndicate_admin"))!);
  const superEmail = (await pool`SELECT email FROM users WHERE role = 'super_admin' AND status = 'active' ORDER BY email LIMIT 1`)[0]?.email;
  const superAdmin = superEmail ? await login(superEmail) : null;

  const [subA] = await pool`SELECT id FROM syndicate_subscriptions WHERE syndicate_id = ${A} ORDER BY created_at DESC LIMIT 1`;
  const [payB] = await pool`SELECT id FROM subscription_payments WHERE syndicate_id = ${B} ORDER BY created_at DESC LIMIT 1`;
  const [invA] = await pool`SELECT id FROM billing_invoices WHERE syndicate_id = ${A} ORDER BY created_at DESC LIMIT 1`;
  const [planRow] = await pool`SELECT id FROM subscription_plans WHERE is_active IS DISTINCT FROM false ORDER BY id LIMIT 1`;
  const before = {
    subs: (await pool`SELECT count(*)::int AS n FROM syndicate_subscriptions`)[0].n,
    pays: (await pool`SELECT count(*)::int AS n FROM subscription_payments`)[0].n,
  };

  // ── 1. Reading ──
  for (const [label, tk] of [["member", member], ["treasurer", treasurer], ["syndic", syndic]] as const) {
    const st = await call(tk, "GET", "/subscriptions/status");
    check(`${label} reads the subscription status (read-only notice)`, st.status === 200, String(st.status));
  }
  for (const [label, tk] of [["member", member], ["treasurer", treasurer]] as const) {
    const p = await call(tk, "GET", "/subscriptions/payments");
    check(`${label} cannot list the subscription payments`, p.status === 403, String(p.status));
    const inv = await call(tk, "GET", "/subscriptions/invoices");
    check(`${label} cannot list the subscription invoices (was 200)`, inv.status === 403, String(inv.status));
  }
  const synInv = await call(syndic, "GET", "/subscriptions/invoices");
  check("the syndic lists their own invoices", synInv.status === 200 && Array.isArray(synInv.body?.data), String(synInv.status));
  const synPays = await call(syndic, "GET", "/subscriptions/payments");
  check("the syndic's payments are their condominium's only", synPays.status === 200 && (synPays.body?.data ?? []).every((p: any) => !p.syndicateId || p.syndicateId === A), String(synPays.status));
  const all = await call(syndic, "GET", "/subscriptions");
  check("the syndic cannot list every condominium's subscription", all.status === 403, String(all.status));

  // ── 2. Writing: residents and treasurer ──
  for (const [label, tk] of [["member", member], ["treasurer", treasurer]] as const) {
    const sub = await call(tk, "POST", "/subscriptions", { planId: planRow?.id, billingInterval: "monthly", paymentMethod: "virement" });
    check(`${label} cannot subscribe or change plan`, sub.status === 403, String(sub.status));
    const put = await call(tk, "PUT", `/subscriptions/${subA.id}`, { autoRenew: false });
    check(`${label} cannot modify the subscription`, put.status === 403, String(put.status));
  }

  // ── 3. Platform-only operations, refused to the syndic ──
  if (payB) {
    const conf = await call(syndic, "POST", `/subscriptions/payments/${payB.id}/confirm`, {});
    check("a syndic cannot confirm a payment (platform only)", conf.status === 403, String(conf.status));
    const ref = await call(syndic, "POST", `/subscriptions/payments/${payB.id}/refund`, {});
    check("a syndic cannot refund a payment", ref.status === 403, String(ref.status));
  }
  const plan = await call(syndic, "POST", "/subscriptions/plans", { name: "x" });
  check("a syndic cannot create a plan", plan.status === 403, String(plan.status));
  const trial = await call(syndic, "POST", `/subscriptions/trial`, {});
  check("a syndic cannot grant a trial", trial.status === 403, String(trial.status));
  if (invA) {
    const paid = await call(syndic, "PUT", `/subscriptions/invoices/${invA.id}/pay`, {});
    check("a syndic cannot mark their own invoice paid", paid.status === 403, String(paid.status));
  }

  // ── 4. Isolation between condominiums ──
  if (payB) {
    const read = await call(syndic, "GET", `/subscriptions/payments/${payB.id}`);
    check("a syndic cannot read another condominium's payment", denied(read.status), String(read.status));
    const cancel = await call(syndic, "POST", `/subscriptions/payments/${payB.id}/cancel`, {});
    check("a syndic cannot cancel another condominium's payment", denied(cancel.status), String(cancel.status));
    const retry = await call(syndic, "POST", `/subscriptions/payments/${payB.id}/retry`, {});
    check("a syndic cannot retry another condominium's payment", denied(retry.status), String(retry.status));
  }
  const putOther = await call(syndicB, "PUT", `/subscriptions/${subA.id}`, { autoRenew: false });
  check("a syndic cannot modify another condominium's subscription", denied(putOther.status), String(putOther.status));
  const otherTarget = await call(syndic, "POST", "/subscriptions", { syndicateId: B, planId: "unknown-plan", billingInterval: "monthly", paymentMethod: "virement" });
  check("a syndic cannot subscribe for another condominium", otherTarget.status === 403 || otherTarget.status === 400, String(otherTarget.status));

  // ── 5. The syndic's own write reaches validation (permission granted) ──
  const own = await call(syndic, "POST", "/subscriptions", { planId: "unknown-plan-for-test", billingInterval: "monthly", paymentMethod: "virement" });
  check("the syndic may subscribe (stops at validation: unknown plan)", own.status === 400 || own.status === 404, `${own.status} ${own.body?.code ?? ""}`);

  // ── 6. Platform: supervision is explicit ──
  if (superAdmin) {
    const list = await call(superAdmin, "GET", "/subscriptions");
    check("the platform lists every subscription", list.status === 200, String(list.status));
    const inv = await call(superAdmin, "GET", "/subscriptions/invoices");
    check("the platform reads a condominium's invoices only under supervision", inv.status === 403 && inv.body?.code === "SUPERVISION_REQUIRED", `${inv.status} ${inv.body?.code}`);
  }

  // ── 7. Expired or suspended subscription: read-only ──
  const [X] = await condo(["expired", "suspended", "cancelled", "pending_payment"], ["syndicate_admin"]);
  if (!X) {
    check("fixture: a condominium whose subscription is not writable", false, "none in the test base");
  } else {
    const ro = await login((await userOf(X, "syndicate_admin"))!);
    // Empty body: if the read-only gate failed, validation would still refuse it.
    const write = await call(ro, "POST", "/ideas", {});
    check("expired subscription: a write is refused with 402 SUBSCRIPTION_REQUIRED", write.status === 402 && write.body?.code === "SUBSCRIPTION_REQUIRED", `${write.status} ${write.body?.code}`);
    const read = await call(ro, "GET", "/subscriptions/status");
    check("expired subscription: reading still works", read.status === 200, String(read.status));
    const recover = await call(ro, "POST", "/subscriptions", { planId: "unknown-plan-for-test", billingInterval: "monthly", paymentMethod: "virement" });
    check("expired subscription: billing recovery is not blocked by the read-only mode", recover.status !== 402, String(recover.status));
  }

  // Nothing was written.
  const after = {
    subs: (await pool`SELECT count(*)::int AS n FROM syndicate_subscriptions`)[0].n,
    pays: (await pool`SELECT count(*)::int AS n FROM subscription_payments`)[0].n,
  };
  check("no subscription or payment was created by the probes", after.subs === before.subs && after.pays === before.pays, JSON.stringify({ before, after }));

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} subscription access checks passed`);
  await pool.end();
  if (failed) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
