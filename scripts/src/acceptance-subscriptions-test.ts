/**
 * Real-world acceptance — subscription lifecycle (2026-11-08), isolated test base only:
 *   pnpm --filter @workspace/scripts run acceptance-subscriptions:test
 *
 * A disposable condominium with no subscription goes through the official
 * simulation (manual bank transfer, confirmed or refused by the platform):
 *   subscribe → payment pending → refused → retried → confirmed → active,
 * then a plan change and a cancellation. At every step the suite checks what
 * the condominium may do: a pending or failed payment never opens writes.
 * No real money moves (no external provider is called). Everything is removed.
 */
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5056/api").replace(/\/$/, "");
if (!/syndycat_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("acceptance-subscriptions: run it against the isolated test base.");
const SECRET = process.env.SESSION_SECRET ?? process.env.JWT_SECRET;
if (!SECRET) throw new Error("JWT secret missing");
const RUN = Date.now().toString(36);
const SID = randomUUID();
const ORG = randomUUID();

const checks: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
async function call(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}
const subRow = async () => (await pool`SELECT id, status, plan_id, current_period_end FROM syndicate_subscriptions WHERE syndicate_id = ${SID} ORDER BY created_at DESC LIMIT 1`)[0];
const sup = `?supervision=true&syndicateId=${SID}`;

async function main() {
  await pool`INSERT INTO organizations (id, name) VALUES (${ORG}, ${`Syndic Abonnement ${RUN}`})`;
  await pool`INSERT INTO syndicates (id, name, status, organization_id) VALUES (${SID}, ${`Résidence Abonnement ${RUN}`}, 'active', ${ORG})`;
  const [admin] = await pool`INSERT INTO users (name, email, password_hash, role, status, syndicate_id)
    VALUES ('Syndic Abonnement', ${`sub-admin-${RUN}@example.invalid`}, 'x', 'syndicate_admin', 'active', ${SID}) RETURNING id, email`;
  const [platformUser] = await pool`SELECT id, email, name FROM users WHERE role = 'super_admin' AND status = 'active' ORDER BY email LIMIT 1`;
  const syndic = jwt.sign({ userId: admin.id, email: admin.email, role: "syndicate_admin", syndicateId: SID, name: "Syndic Abonnement" }, SECRET, { expiresIn: "15m" });
  const platform = jwt.sign({ userId: platformUser.id, email: platformUser.email, role: "super_admin", name: platformUser.name }, SECRET, { expiresIn: "15m" });
  const write = () => call(syndic, "POST", "/announcements", { title: `Annonce ${RUN}`, body: "Test d'abonnement", priority: "info" });

  try {
    // 0. No subscription at all.
    const w0 = await write();
    check("without a subscription, writes are refused (402)", w0.status === 402, `${w0.status} ${w0.body?.code ?? ""}`);
    const r0 = await call(syndic, "GET", "/announcements");
    check("reads stay open", r0.status === 200, String(r0.status));

    // 1. Subscribe by bank transfer: pending.
    const plans = await call(syndic, "GET", "/subscriptions/plans");
    const planIds = ((plans.body?.data ?? []) as any[]).map((p) => p.id);
    check("the plans are listed", plans.status === 200 && planIds.includes("plan_basic"), planIds.join(","));
    const key = `acc-sub-${RUN}`;
    const sub = await call(syndic, "POST", "/subscriptions", { planId: "plan_basic", billingInterval: "monthly", paymentMethod: "bank_transfer", idempotencyKey: key });
    const paymentId = (sub.body?.data?.subscriptionId ? sub.body.data.id : sub.body?.data?.payment?.id) as string | undefined;
    check("subscribing creates a pending payment", (sub.status === 201 || sub.status === 200) && !!paymentId, `${sub.status} ${JSON.stringify(sub.body).slice(0, 160)}`);
    const again = await call(syndic, "POST", "/subscriptions", { planId: "plan_basic", billingInterval: "monthly", paymentMethod: "bank_transfer", idempotencyKey: key });
    const nPending = (await pool`SELECT count(*)::int AS n FROM subscription_payments WHERE syndicate_id = ${SID}`)[0].n;
    check("the same request sent twice creates one payment", (again.status === 200 || again.status === 201) && nPending === 1, `${again.status} payments=${nPending}`);
    check("the subscription waits for payment", (await subRow())?.status === "pending_payment", (await subRow())?.status);
    const w1 = await write();
    check("a pending payment does not open writes", w1.status === 402, String(w1.status));

    // 2. The syndic cannot confirm their own payment.
    const selfConfirm = await call(syndic, "POST", `/subscriptions/payments/${paymentId}/confirm`);
    check("the syndic cannot confirm their own payment", selfConfirm.status === 403, String(selfConfirm.status));

    // 3. Refused by the platform.
    const fail = await call(platform, "POST", `/subscriptions/payments/${paymentId}/fail${sup}`, { reason: "Virement non reçu" });
    check("the platform refuses the transfer", fail.status === 200, `${fail.status} ${fail.body?.code ?? ""}`);
    const afterFail = await subRow();
    check("a failed payment does not activate the subscription", afterFail?.status !== "active" && afterFail?.status !== "trial", afterFail?.status);
    const w2 = await write();
    check("writes still refused after a failed payment", w2.status === 402, String(w2.status));
    const confirmFailed = await call(platform, "POST", `/subscriptions/payments/${paymentId}/confirm${sup}`);
    check("a failed payment cannot be confirmed afterwards", confirmFailed.status >= 400 && confirmFailed.status < 500, String(confirmFailed.status));

    // 4. Retried, then confirmed.
    const retry = await call(syndic, "POST", `/subscriptions/payments/${paymentId}/retry`, { idempotencyKey: `${key}-retry` });
    const retryId = (retry.body?.data?.payment?.id ?? retry.body?.data?.id) as string | undefined;
    check("the syndic retries the payment", (retry.status === 201 || retry.status === 200) && !!retryId && retryId !== paymentId, `${retry.status} ${JSON.stringify(retry.body).slice(0, 160)}`);
    const w3 = await write();
    check("still refused while the new payment is pending", w3.status === 402, String(w3.status));
    const ok = await call(platform, "POST", `/subscriptions/payments/${retryId}/confirm${sup}`);
    check("the platform confirms the transfer", ok.status === 200, `${ok.status} ${ok.body?.code ?? ""}`);
    const active = await subRow();
    check("the subscription is active, with a period end", active?.status === "active" && !!active?.current_period_end, `${active?.status} ${active?.current_period_end}`);
    const w4 = await write();
    check("writes are open once paid", w4.status === 201, String(w4.status));
    const end1 = String(active?.current_period_end);
    const twice = await call(platform, "POST", `/subscriptions/payments/${retryId}/confirm${sup}`);
    const end2 = String((await subRow())?.current_period_end);
    check("confirming twice does not extend the period", end1 === end2, `${twice.status} ${end1} → ${end2}`);
    const inv = await call(syndic, "GET", "/subscriptions/invoices");
    check("the syndic reads the invoices", inv.status === 200, String(inv.status));

    // 5. Plan change and cancellation (observed behaviour).
    const syndicChange = await call(syndic, "PUT", `/subscriptions/${active.id}`, { planId: "plan_pro" });
    check("the syndic cannot change plan alone (platform only)", syndicChange.status === 403, String(syndicChange.status));
    const change = await call(platform, "PUT", `/subscriptions/${active.id}${sup}`, { planId: "plan_pro" });
    const changed = await subRow();
    console.log(`  plan change → HTTP ${change.status}, plan ${changed?.plan_id}, status ${changed?.status}, ${JSON.stringify(change.body).slice(0, 200)}`);
    check("changing plan never gives a server error", change.status < 500, String(change.status));
    check("a plan change does not leave the condominium without access", (await write()).status === 201);
    const cancel = await call(syndic, "PUT", `/subscriptions/${active.id}`, { status: "cancelled" });
    const cancelled = await subRow();
    console.log(`  cancellation → HTTP ${cancel.status}, status ${cancelled?.status}, ${JSON.stringify(cancel.body).slice(0, 200)}`);
    check("cancelling never gives a server error", cancel.status < 500, String(cancel.status));
    const afterCancel = await write();
    console.log(`  write after cancelling a paid period → HTTP ${afterCancel.status}`);
  } finally {
    await pool.begin(async (tx) => {
      await tx`SET LOCAL mizan.ledger_maintenance = 'on'`;
      for (const t of ["billing_invoices", "subscription_payments", "syndicate_subscriptions", "announcements", "audit_logs", "alerts", "email_logs", "document_sequences"]) {
        await tx.unsafe(`DELETE FROM ${t} WHERE syndicate_id = $1`, [SID]).catch(() => {});
      }
      await tx`DELETE FROM users WHERE syndicate_id = ${SID}`;
      await tx`DELETE FROM syndicates WHERE id = ${SID}`;
      await tx`DELETE FROM organizations WHERE id = ${ORG}`;
    });
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} subscription acceptance checks passed`);
  await pool.end();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
