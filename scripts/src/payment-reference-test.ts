/**
 * Guided bank transfer (2026-10-21):
 *  - every call for funds carries a unique, readable payment reference;
 *  - the co-owner gets the syndicate's own RIB and that reference;
 *  - a bank statement line whose motive contains the reference puts the
 *    matching validated payment first among the reconciliation candidates,
 *    even when another entry has a closer amount or date.
 *
 * Read-only on business data: the statement line it creates is removed.
 */
import { db, pool } from "@workspace/db";
import { bankStatementLinesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { TEST_EMAIL_LIKE, writableSubscriptionSql } from "./test-domain.js";

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
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}

async function main() {
  // 1. References
  const [stat] = rows<{ total: number; missing: number; distinct_refs: number; bad: number }>(await db.execute(sql`
    SELECT count(*)::int total, count(*) FILTER (WHERE payment_reference IS NULL)::int missing,
           count(DISTINCT payment_reference)::int distinct_refs,
           count(*) FILTER (WHERE payment_reference !~ '^[A-Z0-9]{1,8}-[0-9A-Z]{4,8}-[A-Z]{2}-[0-9A-F]{6}$')::int bad
    FROM appels_de_fonds`));
  check("every call for funds has a payment reference", stat.missing === 0, `${stat.total - stat.missing}/${stat.total}`);
  check("references are unique", stat.distinct_refs === stat.total - stat.missing);
  check("references follow LOT-PERIOD-TYPE-CHECK (bank-safe characters, ≤ 25)", stat.bad === 0, `${stat.bad} malformed`);

  // 2. What the co-owner sees
  const [owner] = rows<{ email: string; appel_id: string; reference: string }>(await db.execute(sql`
    SELECT u.email, a.id AS appel_id, a.payment_reference AS reference
    FROM users u
    JOIN syndicates s ON s.id = u.syndicate_id AND s.status = 'active'
    JOIN LATERAL (SELECT 1) ss ON ${sql.raw(writableSubscriptionSql("s"))}
    JOIN members m ON m.syndicate_id = u.syndicate_id AND lower(m.email) = lower(u.email)
    JOIN lot_ownerships o ON o.member_id = m.id AND o.end_date IS NULL
    JOIN appels_de_fonds a ON a.lot_id = o.lot_id AND a.status IN ('pending','overdue','partially_paid')
    WHERE u.role = 'member' AND u.status = 'active' AND u.email LIKE ${TEST_EMAIL_LIKE}
      AND a.amount > a.amount_paid
    ORDER BY u.email LIMIT 1`));
  const ownerToken = await login(owner.email);
  const acc = await get(ownerToken, `/appels-de-fonds/${owner.appel_id}/account`);
  const opts = acc.body?.data?.paymentOptions;
  check("the co-owner gets the call's reference to write in the transfer", acc.status === 200 && opts?.reference === owner.reference, opts?.reference);
  check("…and the syndicate's own bank account (RIB, 24 digits)", /^\d{24}$/.test(opts?.bankAccount?.rib ?? ""), opts?.bankAccount?.rib);
  check("no online card payment is offered", opts?.online === false);

  // 3. Reconciliation ranking
  const [target] = rows<{ syndicate_id: string; account_id: string; entry_id: string; amount: string; entry_date: string; reference: string }>(await db.execute(sql`
    SELECT le.syndicate_id, le.account_id, le.id AS entry_id, le.amount, le.entry_date::text AS entry_date, a.payment_reference AS reference
    FROM ledger_entries le
    JOIN treasury_accounts ta ON ta.id = le.account_id AND ta.kind = 'bank'
    JOIN syndicates sy ON sy.id = le.syndicate_id AND sy.status = 'active' AND ${sql.raw(writableSubscriptionSql("sy"))}
    JOIN appel_payments ap ON le.source_type = 'appel_payment' AND ap.id = le.source_id
    JOIN appels_de_fonds a ON a.id = ap.appel_id
    LEFT JOIN (SELECT ledger_entry_id, SUM(amount) matched FROM reconciliation_matches GROUP BY ledger_entry_id) m ON m.ledger_entry_id = le.id
    WHERE le.direction = 'in' AND le.amount - COALESCE(m.matched, 0) > 0
      AND EXISTS (SELECT 1 FROM ledger_entries o LEFT JOIN (SELECT ledger_entry_id, SUM(amount) matched FROM reconciliation_matches GROUP BY ledger_entry_id) om ON om.ledger_entry_id = o.id
                  WHERE o.account_id = le.account_id AND o.id <> le.id AND o.direction = 'in' AND o.amount - COALESCE(om.matched, 0) > 0)
    ORDER BY le.created_at DESC LIMIT 1`));
  const [treasurer] = rows<{ email: string }>(await db.execute(sql`
    SELECT email FROM users WHERE syndicate_id = ${target.syndicate_id} AND role IN ('treasurer','syndicate_admin') AND status = 'active' AND email LIKE ${TEST_EMAIL_LIKE} ORDER BY role DESC LIMIT 1`));
  const tToken = await login(treasurer.email);
  // The bank prints the motive in its own way (spaces, lower case, prefix):
  // the amount differs on purpose so only the reference can explain a first rank.
  const motive = `VIR RECU ${target.reference.toLowerCase().replace(/-/g, " ")} M. TEST`;
  const imp = await fetch(`${BASE}/treasury/accounts/${target.account_id}/statement-lines`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ lines: [{ valueDate: target.entry_date, amount: (Number(target.amount) + 7.5).toFixed(2), label: motive }] }),
  });
  const impBody = (await imp.json().catch(() => null)) as any;
  const [line] = await db
    .select({ id: bankStatementLinesTable.id })
    .from(bankStatementLinesTable)
    .where(sql`${bankStatementLinesTable.accountId} = ${target.account_id} AND ${bankStatementLinesTable.label} = ${motive}`);
  check("statement line imported", (imp.status === 200 || imp.status === 201) && !!line, `${imp.status} ${JSON.stringify(impBody).slice(0, 80)}`);
  if (line) {
    const cand = await get(tToken, `/treasury/statement-lines/${line.id}/candidates`);
    const first = cand.body?.data?.[0];
    check("the payment whose reference is in the motive comes first", first?.id === target.entry_id && first?.reference_match === true, `${first?.entry_number} match=${first?.reference_match}`);
    check("other candidates are not flagged as reference matches", (cand.body?.data ?? []).slice(1).every((c: any) => c.reference_match !== true));
    await db.delete(bankStatementLinesTable).where(eq(bankStatementLinesTable.id, line.id));
  }

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} payment reference checks passed`);
  await pool.end();
  if (failed) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
