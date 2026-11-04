/**
 * Mobile actions repaired on 2026-11-04, end to end on the isolated test base:
 *   pnpm --filter @workspace/scripts run mobile-actions:test
 *
 * Suspending a condominium, marking an invoice as sent, and the QR code of a document.
 */
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5056/api").replace(/\/$/, "");
if (!/syndycat_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("mobile-actions: run it against the isolated test base.");
const PASSWORD = "Actions#2026x";
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

async function main() {
  const syndicateId = `test-act-syn-${randomUUID()}`;
  const otherSyndicateId = `test-act-syn-${randomUUID()}`;
  await pool`INSERT INTO syndicates (id, name, status) VALUES (${syndicateId}, 'Copropriété essai', 'active'), (${otherSyndicateId}, 'Autre copropriété', 'active')`;
  const hash = await bcrypt.hash(PASSWORD, 8);
  const ids: string[] = [];
  const make = async (role: string, syndicate: string | null) => {
    const id = `test-act-${randomUUID()}`;
    const email = `action.${role}.${Date.now()}.${ids.length}@s20261019.seedgen.mizan.test`;
    await pool`INSERT INTO users (id, name, email, password_hash, role, status, syndicate_id) VALUES (${id}, 'Personne Essai', ${email}, ${hash}, ${role}, 'active', ${syndicate})`;
    ids.push(id);
    return (await call("POST", "/auth/login", { email, password: PASSWORD })).body?.data?.token as string;
  };
  // Writes need a live subscription (402 otherwise): the invoice checks run in seeded condominiums that have one.
  const live = (await pool`
    SELECT s.id FROM syndicates s JOIN syndicate_subscriptions ss ON ss.syndicate_id = s.id AND ss.status IN ('active','trial')
     WHERE s.status = 'active' ORDER BY s.id LIMIT 2`) as any[];
  if (live.length < 2) throw new Error("mobile-actions: two condominiums with a subscription are needed");
  const liveSyndic = await make("syndicate_admin", live[0].id);
  const liveMember = await make("member", live[0].id);
  const liveOutsider = await make("syndicate_admin", live[1].id);
  const superAdmin = await make("super_admin", null);
  const syndic = await make("syndicate_admin", syndicateId);
  const member = await make("member", syndicateId);
  const outsider = await make("syndicate_admin", otherSyndicateId);
  const statusOf = async () => ((await pool`SELECT status FROM syndicates WHERE id = ${syndicateId}`) as any[])[0].status;
  const documentId = randomUUID();
  const verificationToken = randomUUID();
  let invoiceId: string | undefined;

  try {
    // Condominium status: same call as the Members tab.
    const noReason = await call("POST", `/condominiums/${syndicateId}/status`, { status: "suspended" }, superAdmin);
    check("suspending without a reason is refused and changes nothing", noReason.status === 400 && (await statusOf()) === "active", String(noReason.status));
    check("a syndic cannot suspend a condominium", (await call("POST", `/condominiums/${syndicateId}/status`, { status: "suspended", reason: "Essai" }, syndic)).status === 403);
    const suspended = await call("POST", `/condominiums/${syndicateId}/status`, { status: "suspended", reason: "Essai de suspension" }, superAdmin);
    check("the platform administrator suspends with a reason", suspended.status === 200 && (await statusOf()) === "suspended", String(suspended.status));
    const reactivated = await call("POST", `/condominiums/${syndicateId}/status`, { status: "active" }, superAdmin);
    check("reactivation is saved", reactivated.status === 200 && (await statusOf()) === "active", String(reactivated.status));
    await pool`DELETE FROM audit_logs WHERE entity_id = ${syndicateId}`;

    // Platform list: the real number of active members, and an administrator's name.
    const list = await call("GET", "/syndicates", undefined, superAdmin);
    const liveRow = (list.body?.data ?? []).find((s: any) => s.id === live[0].id);
    const [{ n: realMembers }] = (await pool`SELECT count(*)::int AS n FROM members WHERE syndicate_id = ${live[0].id} AND status = 'active'`) as any[];
    check("the platform list shows the real number of active members", liveRow?.membersCount === realMembers, `${liveRow?.membersCount} / ${realMembers}`);
    check("the platform list names an administrator", Boolean(liveRow?.adminName));
    const syndicList = await call("GET", "/syndicates", undefined, liveSyndic);
    check("a syndic sees only their own condominium, without the platform's list", syndicList.body?.data?.length === 1 && syndicList.body.data[0].adminName === undefined);

    // Charges: the totals describe the account, whichever status filter the list shows.
    const allCharges = await call("GET", "/appels-de-fonds", undefined, liveSyndic);
    const paidCharges = await call("GET", "/appels-de-fonds?status=paid", undefined, liveSyndic);
    check("a status filter narrows the list", allCharges.status === 200 && paidCharges.status === 200 && (paidCharges.body?.data ?? []).every((a: any) => a.status === "paid"));
    check("a status filter does not change the totals", JSON.stringify(allCharges.body?.stats) === JSON.stringify(paidCharges.body?.stats), JSON.stringify(paidCharges.body?.stats));

    // A call awaiting validation shows what was declared, which a partial payment makes lower than the call.
    const awaiting = await call("GET", "/appels-de-fonds?status=pending_validation", undefined, liveSyndic);
    const firstAwaiting = (awaiting.body?.data ?? [])[0];
    if (firstAwaiting) {
      const [pendingPayment] = (await pool`SELECT amount FROM appel_payments WHERE appel_id = ${firstAwaiting.id} AND status = 'pending' ORDER BY created_at DESC LIMIT 1`) as any[];
      check("a call awaiting validation carries the declared amount", firstAwaiting.declaredAmount === pendingPayment?.amount, `${firstAwaiting.declaredAmount} / ${pendingPayment?.amount}`);
    } else {
      check("a call awaiting validation carries the declared amount", false, "no such call in the seeded condominium");
    }
    const notAwaiting = (paidCharges.body?.data ?? [])[0];
    check("other calls carry no declared amount", !notAwaiting || notAwaiting.declaredAmount === null);

    // Budgets: each one names its building, the screen offers them all.
    const budgets = await call("GET", "/budgets", undefined, liveSyndic);
    check("each budget names its building", budgets.status === 200 && (budgets.body?.data ?? []).length > 0 && budgets.body.data.every((b: any) => typeof b.buildingName === "string"), String(budgets.body?.data?.length));

    // Invoice: same call as the « send » button.
    const [invoice] = (await pool`
      INSERT INTO invoices (id, syndicate_id, reference, type, recipient, amount, status, date, due_date)
      VALUES (${randomUUID()}, ${live[0].id}, ${`TEST-${Date.now()}`}, 'facture', 'Client essai', '10.00', 'draft', '2026-11-04', '2026-12-04')
      RETURNING id`) as any[];
    invoiceId = invoice.id;
    const invoiceStatus = async () => ((await pool`SELECT status FROM invoices WHERE id = ${invoiceId!}`) as any[])[0].status;
    const memberSend = await call("PUT", `/invoices/${invoiceId}/status`, { status: "sent" }, liveMember);
    check("a member cannot mark an invoice as sent", memberSend.status === 403 && (await invoiceStatus()) === "draft", String(memberSend.status));
    const outsiderSend = await call("PUT", `/invoices/${invoiceId}/status`, { status: "sent" }, liveOutsider);
    check("another condominium cannot reach the invoice", outsiderSend.status === 404 && (await invoiceStatus()) === "draft", String(outsiderSend.status));
    const syndicSend = await call("PUT", `/invoices/${invoiceId}/status`, { status: "sent" }, liveSyndic);
    check("the syndic records the invoice as sent", syndicSend.status === 200 && (await invoiceStatus()) === "sent", String(syndicSend.status));

    // Document QR code.
    await pool`INSERT INTO documents (id, syndicate_id, title, category, status, verification_token)
               VALUES (${documentId}, ${syndicateId}, 'Document essai', 'other', 'published', ${verificationToken})`;
    const qr = await call("GET", `/documents/${documentId}/qr`, undefined, syndic);
    if (process.env.PUBLIC_APP_URL) {
      check("the QR code points to the public verification page", qr.status === 200 && String(qr.body?.verifyUrl).endsWith(verificationToken) && /^data:image\/png/.test(qr.body?.qrDataUrl ?? ""), String(qr.status));
    } else {
      check("without a public address the QR code is refused, not invented", qr.status === 409 && qr.body?.code === "QR_UNAVAILABLE", String(qr.status));
    }
    check("no session: QR code refused", (await call("GET", `/documents/${documentId}/qr`)).status === 401);
    check("another condominium does not learn that the document exists", (await call("GET", `/documents/${documentId}/qr`, undefined, outsider)).status === 404);
    check("unknown document: 404", (await call("GET", `/documents/${randomUUID()}/qr`, undefined, syndic)).status === 404);
  } finally {
    await pool`DELETE FROM documents WHERE id = ${documentId}`;
    if (invoiceId) await pool`DELETE FROM invoices WHERE id = ${invoiceId}`;
    await pool`DELETE FROM refresh_tokens WHERE user_id IN ${pool(ids)}`;
    await pool`DELETE FROM audit_logs WHERE user_id IN ${pool(ids)} OR entity_id = ${syndicateId}`;
    await pool`DELETE FROM users WHERE id IN ${pool(ids)}`;
    await pool`DELETE FROM syndicates WHERE id IN ${pool([syndicateId, otherSyndicateId])}`;
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} mobile action checks passed`);
  await pool.end();
  process.exit(failed ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await pool.end().catch(() => {}); process.exit(1); });
