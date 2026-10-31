/**
 * Condominium bank details (2026-10-25) — isolated test base only:
 *   pnpm --filter @workspace/scripts run bank-details:test
 *
 *  - the syndic edits the condominium's bank details; a RIB must have its
 *    24 digits and a correct key, an IBAN its check digits (a Moroccan IBAN
 *    must contain a valid RIB), a BIC 8 or 11 characters;
 *  - residents and the treasurer cannot change them; no syndic touches
 *    another condominium's;
 *  - every change leaves an audit entry with the account masked, never the
 *    full number.
 * The original values are restored and the test's audit rows removed.
 */
import { pool } from "@workspace/db";
import { writableSubscriptionSql } from "./test-domain.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5056/api").replace(/\/$/, "");
if (!/syndycat_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("bank-details: run it against the isolated test base (testdb exec).");
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
async function login(email: string) {
  const r = await call(null, "POST", "/auth/login", { email, password: "MizanTest#2026" });
  if (!r.body?.data?.token) throw new Error(`login ${email} ${r.status}`);
  return r.body.data.token as string;
}
/** A RIB with a correct key: the 22 first digits, then 97 − (n × 100 mod 97). */
function rib(prefix22: string) {
  const key = 97n - ((BigInt(prefix22) * 100n) % 97n);
  return prefix22 + key.toString().padStart(2, "0");
}
function ibanMA(r: string) {
  const num = (r + "MA00").replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  const check = 98n - (BigInt(num) % 97n);
  return "MA" + check.toString().padStart(2, "0") + r;
}

async function main() {
  const [A, B] = await pool.unsafe(`
    SELECT s.id FROM syndicates s
     WHERE s.status = 'active'
       AND ${writableSubscriptionSql("s")}
       AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = s.organization_id AND o.status = 'suspended')
       AND EXISTS (SELECT 1 FROM users u WHERE u.syndicate_id = s.id AND u.role = 'syndicate_admin' AND u.status = 'active' AND u.email LIKE '%.seedgen.mizan.test')
       AND EXISTS (SELECT 1 FROM users u WHERE u.syndicate_id = s.id AND u.role = 'treasurer' AND u.status = 'active' AND u.email LIKE '%.seedgen.mizan.test')
       AND EXISTS (SELECT 1 FROM users u WHERE u.syndicate_id = s.id AND u.role = 'member' AND u.status = 'active' AND u.email LIKE '%.seedgen.mizan.test')
     ORDER BY s.id LIMIT 2`);
  const who = async (sid: string, role: string) => (await pool`SELECT email FROM users WHERE syndicate_id = ${sid} AND role = ${role} AND status = 'active' AND email LIKE '%.seedgen.mizan.test' ORDER BY email LIMIT 1`)[0].email;
  const syndic = await login(await who(A.id, "syndicate_admin"));
  const treasurer = await login(await who(A.id, "treasurer"));
  const member = await login(await who(A.id, "member"));
  const [orig] = await pool`SELECT bank_name, bank_iban, bank_bic, email FROM syndicates WHERE id = ${A.id}`;
  const [origB] = await pool`SELECT bank_iban FROM syndicates WHERE id = ${B.id}`;
  const startedAt = new Date().toISOString();
  const goodRib = rib("0117800000012345678901");
  const bank = async () => (await pool`SELECT bank_name, bank_iban, bank_bic FROM syndicates WHERE id = ${A.id}`)[0];

  try {
    // 1. Validation
    const badKey = await call(syndic, "PUT", "/team/syndicate", { bankIban: goodRib.slice(0, 22) + (goodRib.endsWith("00") ? "01" : "00") });
    check("a RIB with a wrong key is refused (INVALID_RIB)", badKey.status === 400 && badKey.body?.code === "INVALID_RIB", `${badKey.status} ${badKey.body?.code}`);
    const short = await call(syndic, "PUT", "/team/syndicate", { bankIban: "123456" });
    check("a RIB that is not 24 digits is refused", short.status === 400, String(short.status));
    const badIban = await call(syndic, "PUT", "/team/syndicate", { bankIban: "MA00" + goodRib });
    check("an IBAN with wrong check digits is refused (INVALID_IBAN)", badIban.status === 400 && badIban.body?.code === "INVALID_IBAN", `${badIban.status} ${badIban.body?.code}`);
    const badBic = await call(syndic, "PUT", "/team/syndicate", { bankBic: "XX" });
    check("an invalid BIC is refused", badBic.status === 400 && badBic.body?.code === "INVALID_BIC", `${badBic.status} ${badBic.body?.code}`);
    const badMail = await call(syndic, "PUT", "/team/syndicate", { email: "pas-un-email" });
    check("an invalid contact e-mail is refused", badMail.status === 400, String(badMail.status));
    const noObj = await call(syndic, "PUT", "/team/syndicate", { bankName: { $ne: 1 } });
    check("a non-text value is refused", noObj.status === 400, String(noObj.status));
    const unchanged = await bank();
    check("refused requests changed nothing", unchanged.bank_iban === orig.bank_iban && unchanged.bank_bic === orig.bank_bic && unchanged.bank_name === orig.bank_name);

    // 2. A valid change, normalised and audited (masked)
    const spaced = goodRib.replace(/(\d{3})(\d{3})(\d{16})(\d{2})/, "$1 $2 $3 $4");
    const ok = await call(syndic, "PUT", "/team/syndicate", { bankName: "  Banque   Test  ", bankIban: spaced, bankBic: "bcmamamc" });
    const saved = await bank();
    check("the syndic saves valid bank details", ok.status === 200, `${ok.status} ${ok.body?.error ?? ""}`);
    check("the RIB is stored without spaces", saved.bank_iban === goodRib, saved.bank_iban);
    check("the bank name is cleaned and the BIC upper-cased", saved.bank_name === "Banque Test" && saved.bank_bic === "BCMAMAMC", `${saved.bank_name} ${saved.bank_bic}`);
    const [audit] = await pool`SELECT details, user_id FROM audit_logs WHERE action = 'BANK_DETAILS_UPDATED' AND entity_id = ${A.id} AND created_at >= ${startedAt} ORDER BY created_at DESC LIMIT 1`;
    check("the change is recorded in the audit trail", !!audit, audit?.details?.slice(0, 80));
    check("the audit entry never contains the full RIB", !!audit && !String(audit.details).includes(goodRib) && String(audit.details).includes(goodRib.slice(-4)));
    const iban = ibanMA(goodRib);
    const okIban = await call(syndic, "PUT", "/team/syndicate", { bankIban: iban.toLowerCase() });
    check("a valid Moroccan IBAN is accepted (stored upper-case)", okIban.status === 200 && (await bank()).bank_iban === iban, `${okIban.status} ${(await bank()).bank_iban}`);
    const clear = await call(syndic, "PUT", "/team/syndicate", { bankBic: "" });
    check("an empty value clears a field", clear.status === 200 && (await bank()).bank_bic === null, String(clear.status));

    // 3. Who may change them
    const byMember = await call(member, "PUT", "/team/syndicate", { bankIban: goodRib });
    check("a resident cannot change the bank details", byMember.status === 403, String(byMember.status));
    const byTreasurer = await call(treasurer, "PUT", "/team/syndicate", { bankIban: goodRib });
    check("the treasurer cannot change the condominium's bank details", byTreasurer.status === 403, String(byTreasurer.status));
    const other = await call(syndic, "PUT", `/syndicates/${B.id}`, { bankIban: goodRib });
    check("a syndic cannot change another condominium's bank details", other.status === 403 && (await pool`SELECT bank_iban FROM syndicates WHERE id = ${B.id}`)[0].bank_iban === origB.bank_iban, String(other.status));
    const viaSyndicates = await call(syndic, "PUT", `/syndicates/${A.id}`, { bankIban: "999" });
    check("the other update route validates the RIB too", viaSyndicates.status === 400, String(viaSyndicates.status));
    const anon = await call(null, "PUT", "/team/syndicate", { bankIban: goodRib });
    check("without a session: 401", anon.status === 401, String(anon.status));

    // 4. Treasury accounts stay finance-only and masked
    const resAcc = await call(member, "GET", "/treasury/accounts");
    check("a resident cannot list the treasury accounts", resAcc.status === 403, String(resAcc.status));
    const trAcc = await call(treasurer, "GET", "/treasury/accounts");
    check("the treasurer's account list never contains a full RIB", trAcc.status === 200 && (trAcc.body?.data ?? []).every((a: any) => !a.rib), String(trAcc.status));
  } finally {
    await pool`UPDATE syndicates SET bank_name = ${orig.bank_name}, bank_iban = ${orig.bank_iban}, bank_bic = ${orig.bank_bic}, email = ${orig.email} WHERE id = ${A.id}`;
    await pool`DELETE FROM audit_logs WHERE entity_id = ${A.id} AND created_at >= ${startedAt} AND action IN ('BANK_DETAILS_UPDATED', 'UPDATE')`;
    const back = await bank();
    check("original bank details restored", back.bank_iban === orig.bank_iban && back.bank_name === orig.bank_name && back.bank_bic === orig.bank_bic);
  }

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} bank details checks passed`);
  await pool.end();
  if (failed) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
