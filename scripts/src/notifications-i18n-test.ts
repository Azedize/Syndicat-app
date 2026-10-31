/**
 * Notifications in the reader's language, with a link only for roles allowed
 * on the screen (2026-10-31) — isolated test base only:
 *   pnpm --filter @workspace/scripts run notifications-i18n:test
 *
 *  - a real action (a support ticket) stores a template notification;
 *  - GET /alerts renders it in fr / en / ar / es;
 *  - a finance link reaches the treasurer, not a resident (who never sees an
 *    admin alert anyway) nor a secretary;
 *  - alerts written before templates keep their stored text.
 * Rows created by the test are deleted at the end.
 */
import { pool } from "@workspace/db";
import { writableSubscriptionSql } from "./test-domain.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5056/api").replace(/\/$/, "");
if (!/syndycat_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("notifications-i18n: run it against the isolated test base (testdb exec).");
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
async function login(email: string) {
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "MizanTest#2026" }) });
  const j = (await r.json()) as any;
  if (!j?.data?.token) throw new Error(`login ${email} ${r.status}`);
  return j.data.token as string;
}

async function main() {
  const [S] = await pool.unsafe(`
    SELECT s.id FROM syndicates s WHERE s.status = 'active' AND ${writableSubscriptionSql("s")}
      AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = s.organization_id AND o.status = 'suspended')
      ${["syndicate_admin", "treasurer", "secretary", "member"].map((r) => `AND EXISTS (SELECT 1 FROM users u WHERE u.syndicate_id = s.id AND u.role = '${r}' AND u.status = 'active' AND u.email LIKE '%.seedgen.mizan.test')`).join(" ")}
    ORDER BY s.id LIMIT 1`);
  const who = async (role: string) => (await pool`SELECT email FROM users WHERE syndicate_id = ${S.id} AND role = ${role} AND status = 'active' AND email LIKE '%.seedgen.mizan.test' ORDER BY email LIMIT 1`)[0].email;
  const syndic = await login(await who("syndicate_admin"));
  const treasurer = await login(await who("treasurer"));
  const secretary = await login(await who("secretary"));
  const member = await login(await who("member"));
  const startedAt = new Date().toISOString();
  const created: string[] = [];

  try {
    // 1. A real action stores a template notification.
    const title = `Fuite d'eau test ${Date.now()}`;
    const ticket = await call(member, "POST", "/support", { title, description: "Test des notifications", priority: "high" });
    check("a resident opens a support ticket", ticket.status === 201 || ticket.status === 200, String(ticket.status));
    await new Promise((r) => setTimeout(r, 400));
    const [row] = await pool`SELECT id, key, params, title, link FROM alerts WHERE syndicate_id = ${S.id} AND created_at >= ${startedAt} AND key = 'ticket.new' ORDER BY created_at DESC LIMIT 1`;
    if (row) created.push(row.id);
    check("the alert is stored with its template and values", !!row && row.params?.title === title, row ? `${row.key} ${JSON.stringify(row.params).slice(0, 60)}` : "none");
    check("its French copy is stored for old clients", !!row && row.title === "Nouveau ticket support");

    // 2. Rendered in the reader's language.
    const find = (b: any, id: string | undefined = row?.id) => (b?.data ?? []).find((a: any) => a.id === id);
    const fr = find((await call(syndic, "GET", "/alerts?lang=fr&limit=50")).body);
    const en = find((await call(syndic, "GET", "/alerts?lang=en&limit=50")).body);
    const ar = find((await call(syndic, "GET", "/alerts?lang=ar&limit=50")).body);
    const es = find((await call(syndic, "GET", "/alerts?lang=es&limit=50")).body);
    check("French", fr?.title === "Nouveau ticket support" && fr?.message.includes(title), fr?.title);
    check("English", en?.title === "New support ticket" && en?.message.includes(title), en?.title);
    check("Arabic", ar?.title === "تذكرة دعم جديدة" && ar?.message.includes(title), ar?.title);
    check("Spanish", es?.title === "Nuevo ticket de soporte", es?.title);
    check("the syndic gets the link to the ticket screen", fr?.link === "/support", String(fr?.link));
    const fromHeader = await fetch(`${BASE}/alerts?limit=50`, { headers: { Authorization: `Bearer ${syndic}`, "Accept-Language": "en-GB,en;q=0.9" } }).then((r) => r.json() as any);
    check("without ?lang, the Accept-Language header is used", find(fromHeader)?.title === "New support ticket");

    // 3. A finance link only for finance roles.
    const [fin] = await pool`INSERT INTO alerts (title, message, type, date, syndicate_id, target, key, params)
      VALUES ('Paiement à valider', 'test', 'info', to_char(now(), 'YYYY-MM-DD'), ${S.id}, 'admin', 'payment.toValidate', ${JSON.stringify({ amount: "1 250,00", period: "2026-10" })}::jsonb) RETURNING id`;
    created.push(fin.id);
    const tr = find((await call(treasurer, "GET", "/alerts?lang=ar&limit=50")).body, fin.id);
    check("the treasurer gets the payment link", tr?.link === "/paiements", String(tr?.link));
    check("in Arabic, the amount keeps its order", !!tr && tr.message.includes("⁨1 250,00⁩"), tr?.message);
    const sec = find((await call(secretary, "GET", "/alerts?limit=50")).body, fin.id);
    check("a secretary sees the alert but without a link (no access to payments)", !!sec && sec.link === null, String(sec?.link));
    const mem = find((await call(member, "GET", "/alerts?limit=50")).body, fin.id);
    check("a resident does not see a team alert at all", mem === undefined);

    // 4. Old alerts keep their text.
    const [old] = await pool`INSERT INTO alerts (title, message, type, date, syndicate_id, target)
      VALUES ('Ancienne alerte test', 'Texte enregistré', 'info', to_char(now(), 'YYYY-MM-DD'), ${S.id}, 'all') RETURNING id`;
    created.push(old.id);
    const o = find((await call(member, "GET", "/alerts?lang=en&limit=50")).body, old.id);
    check("an alert without template is shown with its stored text", o?.title === "Ancienne alerte test" && o?.link === null, o?.title);

    // 5. The language of push notifications is saved with the profile.
    const lang = await call(member, "PUT", "/profile", { language: "ar" });
    const [saved] = await pool`SELECT language FROM users WHERE email = ${await who("member")}`;
    check("the push language is saved (ar)", lang.status === 200 && saved.language === "ar", `${lang.status} ${saved.language}`);
    const bad = await call(member, "PUT", "/profile", { language: "de" });
    check("an unsupported language is refused", bad.status === 400, String(bad.status));
    await pool`UPDATE users SET language = NULL WHERE email = ${await who("member")}`;
  } finally {
    for (const id of created) await pool`DELETE FROM alerts WHERE id = ${id}`;
    await pool`DELETE FROM alerts WHERE syndicate_id = ${S.id} AND created_at >= ${startedAt} AND key IN ('ticket.new', 'ticket.platformNew')`;
    await pool`DELETE FROM support_tickets WHERE syndicate_id = ${S.id} AND created_at >= ${startedAt} AND description = 'Test des notifications'`.catch(() => {});
  }

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} notification language checks passed`);
  await pool.end();
  if (failed) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
