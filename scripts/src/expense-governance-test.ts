/**
 * Expenses as co-owners see them, and the consultative opinion on a
 * challenged justification (2026-10-24). Runs on the isolated test base:
 *
 *   pnpm --filter @workspace/scripts run expense-governance:test
 *
 * - a co-owner reads an approved / paid expense of their condominium: what,
 *   supplier, budget line, steps, invoice — never bank details or names;
 * - drafts, other condominiums' expenses: 404; tenants: 403;
 * - opinion on a challenged justification: one per person (even on a double
 *   tap), changes kept in the audit trail, nothing after closing, closing once;
 *   another condominium cannot take part.
 * Rows it creates are removed at the end.
 */
import { pool } from "@workspace/db";
import { TEST_EMAIL_LIKE, writableSubscriptionSql } from "./test-domain.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5056/api").replace(/\/$/, "");
const PASSWORD = "MizanTest#2026";
const checks: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const q = <T = any>(text: string, params: unknown[] = []) => (pool as any).unsafe(text, params) as Promise<T[]>;
async function login(email: string) {
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  const t = ((await r.json()) as any)?.data?.token;
  if (!t) throw new Error(`login ${email}: ${r.status}`);
  return t as string;
}
const call = async (token: string, method: string, p: string, body?: unknown) => {
  const r = await fetch(`${BASE}${p}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const type = r.headers.get("content-type") ?? "";
  const raw = Buffer.from(await r.arrayBuffer());
  let json: any = null;
  if (type.includes("json")) try { json = JSON.parse(raw.toString("utf8")); } catch { /* */ }
  return { status: r.status, json, raw, type };
};
const created: string[] = [];

async function main() {
  const [{ d }] = await q<{ d: string }>("SELECT current_database() AS d");
  if (d !== "syndycat_test") throw new Error(`Base de test attendue (syndycat_test), pas ${d}`);
  const [fx] = await q(`
    SELECT e.id AS expense_id, e.syndicate_id,
      (SELECT u.email FROM users u JOIN members m ON m.syndicate_id = u.syndicate_id AND lower(m.email) = lower(u.email) AND m.status = 'active'
        WHERE u.syndicate_id = e.syndicate_id AND u.role = 'member' AND u.status = 'active' AND u.email LIKE $1 ORDER BY u.email LIMIT 1) AS member,
      (SELECT u.email FROM users u JOIN members m ON m.syndicate_id = u.syndicate_id AND lower(m.email) = lower(u.email) AND m.status = 'active'
        WHERE u.syndicate_id = e.syndicate_id AND u.role = 'member' AND u.status = 'active' AND u.email LIKE $1 ORDER BY u.email DESC LIMIT 1) AS member2,
      (SELECT u.email FROM users u WHERE u.syndicate_id = e.syndicate_id AND u.role = 'tenant' AND u.status = 'active' AND u.email LIKE $1 LIMIT 1) AS tenant,
      (SELECT u.email FROM users u WHERE u.syndicate_id = e.syndicate_id AND u.role = 'syndicate_admin' AND u.status = 'active' AND u.email LIKE $1 LIMIT 1) AS syndic,
      (SELECT x.id FROM expenses x WHERE x.syndicate_id = e.syndicate_id AND x.status NOT IN ('approved','paid') LIMIT 1) AS draft_id
    FROM expenses e
    JOIN syndicates s ON s.id = e.syndicate_id AND s.status = 'active'
    JOIN LATERAL (SELECT 1) ss ON ${writableSubscriptionSql("s")}
    JOIN storage_objects so ON so.object_path = e.proof_url AND so.content_type = 'application/pdf'
    WHERE e.status = 'paid' AND e.budget_line_id IS NOT NULL
    ORDER BY e.id LIMIT 1`, [TEST_EMAIL_LIKE]);
  if (!fx?.member || !fx.syndic || !fx.tenant || fx.member === fx.member2) throw new Error("fixture incomplete");
  const [other] = await q(`SELECT e.id AS expense_id, (SELECT u.email FROM users u WHERE u.syndicate_id = e.syndicate_id AND u.role = 'member' AND u.status = 'active' AND u.email LIKE $2 LIMIT 1) AS member
    FROM expenses e JOIN syndicates s ON s.id = e.syndicate_id AND s.status = 'active' JOIN LATERAL (SELECT 1) ss ON ${writableSubscriptionSql("s")}
    WHERE e.status IN ('approved','paid') AND e.syndicate_id <> $1 LIMIT 1`, [fx.syndicate_id, TEST_EMAIL_LIKE]);

  const member = await login(fx.member);
  const member2 = await login(fx.member2);
  const tenant = await login(fx.tenant);
  const syndic = await login(fx.syndic);
  const outsider = await login(other.member);

  // ── Reading an expense ──
  const det = await call(member, "GET", `/transparency/expenses/${fx.expense_id}`);
  const e = det.json?.data;
  check("a co-owner reads a paid expense of the residence", det.status === 200 && !!e?.label && !!e?.amount && e?.currency === "MAD", String(det.status));
  check("with its budget line and its steps", !!e?.budget?.lineLabel && Array.isArray(e?.history) && e.history.some((h: any) => h.step === "paid"));
  const leaked = ["accountId", "ledgerEntryId", "paymentReference", "approvedBy", "paidBy", "createdBy", "proofUrl", "idempotencyKey"].filter((k) => e && k in e);
  check("no bank details, references or names of the people who handled it", leaked.length === 0, leaked.join(", ") || "none");
  const proof = await call(member, "GET", `/transparency/expenses/${fx.expense_id}/proof`);
  check("the invoice opens (a real PDF)", proof.status === 200 && proof.type.includes("application/pdf") && proof.raw.subarray(0, 5).toString() === "%PDF-", `${proof.status} ${proof.type}`);
  const ticket = (await call(member, "POST", "/auth/file-ticket")).json?.data?.ticket;
  const viaTicket = await fetch(`${BASE}/transparency/expenses/${fx.expense_id}/proof?token=${encodeURIComponent(ticket)}`);
  check("the invoice opens with a short-lived download ticket (for the viewer)", viaTicket.status === 200, String(viaTicket.status));
  await viaTicket.arrayBuffer();
  if (fx.draft_id) check("an expense not yet approved does not exist for co-owners (404)", (await call(member, "GET", `/transparency/expenses/${fx.draft_id}`)).status === 404);
  check("another residence's expense does not exist (404)", (await call(member, "GET", `/transparency/expenses/${other.expense_id}`)).status === 404);
  check("…nor its invoice (404)", (await call(member, "GET", `/transparency/expenses/${other.expense_id}/proof`)).status === 404);
  check("a tenant is not a co-owner (403)", (await call(tenant, "GET", `/transparency/expenses/${fx.expense_id}`)).status === 403);

  // ── Consultative opinion on a challenged justification ──
  check("justification with an invalid amount refused", (await call(syndic, "POST", "/expense-justifications", { title: "Test", amount: "abc" })).status === 400);
  check("justification with a negative amount refused", (await call(syndic, "POST", "/expense-justifications", { title: "Test", amount: "-5" })).status === 400);
  const j = await call(syndic, "POST", "/expense-justifications", { title: "Test gouvernance — remplacement pompe", description: "Justificatif de test", amount: "1250.50", category: "entretien" });
  const jid = j.json?.data?.id;
  if (jid) created.push(jid);
  check("the syndic publishes a justification (amount kept to the cent)", j.status === 201 && j.json?.data?.amount === "1250.50", `${j.status} ${j.json?.data?.amount}`);
  check("no opinion before a challenge", (await call(member, "POST", `/expense-justifications/${jid}/vote`, { vote: "for" })).status === 400);
  check("a co-owner challenges it", (await call(member, "POST", `/expense-justifications/${jid}/challenge`, { reason: "Montant élevé (test)" })).status === 200);
  const [a1, a2] = await Promise.all([
    call(member2, "POST", `/expense-justifications/${jid}/vote`, { vote: "for" }),
    call(member2, "POST", `/expense-justifications/${jid}/vote`, { vote: "for" }),
  ]);
  const [{ n: votes }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM expense_votes WHERE justification_id = $1`, [jid]);
  check("a double tap records one opinion", [a1.status, a2.status].sort().join("/") === "200/409" && votes === 1, `${a1.status}/${a2.status}, ${votes} row(s)`);
  const change = await call(member2, "POST", `/expense-justifications/${jid}/vote`, { vote: "against" });
  const [{ n: audited }] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM audit_logs WHERE entity = 'expense_justification_vote' AND entity_id = $1`, [jid]);
  check("a change of opinion is kept in the audit trail", change.status === 200 && audited >= 2, `${change.status}, ${audited} audit row(s)`);
  check("a tenant gives no opinion (403)", (await call(tenant, "POST", `/expense-justifications/${jid}/vote`, { vote: "for" })).status === 403);
  check("another residence cannot take part (404)", (await call(outsider, "POST", `/expense-justifications/${jid}/vote`, { vote: "for" })).status === 404);
  check("a co-owner cannot close it (403)", (await call(member, "PUT", `/expense-justifications/${jid}/resolve`, { status: "approved" })).status === 403);
  const close = await call(syndic, "PUT", `/expense-justifications/${jid}/resolve`, { status: "approved", resolutionNote: "Devis comparés (test)" });
  check("the syndic closes it", close.status === 200, String(close.status));
  check("closed: cannot be closed again or changed (409)", (await call(syndic, "PUT", `/expense-justifications/${jid}/resolve`, { status: "rejected" })).status === 409);
  check("closed: no more opinions", (await call(member, "POST", `/expense-justifications/${jid}/vote`, { vote: "against" })).status === 400);
}

main()
  .catch((e) => { console.error(e); checks.push({ name: "run", ok: false }); })
  .finally(async () => {
    if (created.length) {
      await q(`DELETE FROM expense_votes WHERE justification_id = ANY($1)`, [created]);
      await q(`DELETE FROM expense_justifications WHERE id = ANY($1)`, [created]);
      console.log(`cleanup: ${created.length} test justification(s) removed`);
    }
    const failed = checks.filter((c) => !c.ok).length;
    console.log(`\n${checks.length - failed}/${checks.length} expense governance checks passed`);
    await pool.end();
    if (failed) process.exit(1);
  });
