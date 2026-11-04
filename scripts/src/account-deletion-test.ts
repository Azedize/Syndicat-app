/**
 * Account deletion, in the app and on the public page (2026-11-02) — isolated test base only:
 *   pnpm --filter @workspace/scripts run account-deletion:test
 *
 * Disposable accounts with real rows in each category: what must disappear does,
 * what the condominium must keep stays, and refusals change nothing.
 */
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pool } from "@workspace/db";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5056/api").replace(/\/$/, "");
if (!/syndycat_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("account-deletion: run it against the isolated test base (testdb exec).");
const UPLOADS = process.env.LOCAL_UPLOADS_DIR;
if (!UPLOADS) throw new Error("LOCAL_UPLOADS_DIR is not set (testdb exec sets it).");
const PASSWORD = "Suppression#2026";
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
async function web(body: Record<string, string>, query = "") {
  const r = await fetch(`${BASE}/account-deletion${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  return { status: r.status, html: await r.text() };
}
const count = async (q: Promise<any>) => Number(((await q) as any[])[0].n);

/** A member with an account in the given condominium, and data in each category. */
async function makeAccount(syndicateId: string, tag: string) {
  const id = `test-del-${randomUUID()}`;
  const email = `suppression.${tag}.${Date.now()}@s20261019.seedgen.mizan.test`;
  const hash = await bcrypt.hash(PASSWORD, 8);
  await pool`INSERT INTO users (id, name, email, password_hash, role, status, syndicate_id, phone, cin, profession)
             VALUES (${id}, 'Personne Asupprimer', ${email}, ${hash}, 'member', 'active', ${syndicateId}, '+212600000000', 'AB123456', 'Testeur')`;
  return { id, email };
}

async function main() {
  const [syndic] = (await pool`
    SELECT u.id, u.email, u.syndicate_id FROM users u JOIN syndicates s ON s.id = u.syndicate_id AND s.status = 'active'
     WHERE u.role = 'syndicate_admin' AND u.status = 'active' AND u.email LIKE '%.seedgen.mizan.test'
     ORDER BY u.email LIMIT 1`) as any[];
  const [superAdmin] = (await pool`SELECT email FROM users WHERE role = 'super_admin' AND status = 'active' AND email LIKE '%.seedgen.mizan.test' LIMIT 1`) as any[];
  const sid = syndic.syndicate_id as string;

  const a = await makeAccount(sid, "app");
  const b = await makeAccount(sid, "web");
  const soleAdmin = { id: `test-del-${randomUUID()}`, email: `seul.admin.${Date.now()}@s20261019.seedgen.mizan.test`, syndicate: `test-del-syn-${randomUUID()}` };
  const memberId = `test-del-m-${randomUUID()}`;
  const productLive = `test-del-p-${randomUUID()}`, productSold = `test-del-p-${randomUUID()}`, productOther = `test-del-p-${randomUUID()}`;
  const convId = `test-del-c-${randomUUID()}`, msgId = `test-del-msg-${randomUUID()}`;
  mkdirSync(UPLOADS!, { recursive: true });
  const avatarName = `test-del-${randomUUID()}.jpg`, attachName = `test-del-${randomUUID()}.pdf`, liveName = `test-del-${randomUUID()}.jpg`, soldName = `test-del-${randomUUID()}.jpg`;
  for (const n of [avatarName, attachName, liveName, soldName]) writeFileSync(path.join(UPLOADS!, n), "test");
  let orderId: string | undefined;
  const suspendedSyndicate = `test-del-syn-${randomUUID()}`;
  const disposable: { id: string; email: string }[] = [];

  try {
    // Data of account A.
    await pool`UPDATE users SET avatar = ${`/objects/uploads/${avatarName}`} WHERE id = ${a.id}`;
    await pool`INSERT INTO members (id, name, email, syndicate_id, status) VALUES (${memberId}, 'Personne Asupprimer', ${a.email}, ${sid}, 'active')`;
    await pool`INSERT INTO vehicles (id, user_id, plate_number) VALUES (${`test-del-v-${randomUUID()}`}, ${a.id}, 'TEST-1-A')`;
    await pool`INSERT INTO products (id, name, price, category, seller_id, seller_name, seller_email, seller_phone, status, image_urls)
               VALUES (${productLive}, 'Annonce en cours', 10, 'autre', ${a.id}, 'Personne Asupprimer', ${a.email}, '+212600000000', 'approved', ${JSON.stringify([`/objects/uploads/${liveName}`])})`;
    await pool`INSERT INTO products (id, name, price, category, seller_id, seller_name, seller_email, seller_phone, status, image_urls)
               VALUES (${productSold}, 'Annonce vendue', 10, 'autre', ${a.id}, 'Personne Asupprimer', ${a.email}, '+212600000000', 'sold', ${JSON.stringify([`/objects/uploads/${soldName}`])})`;
    await pool`INSERT INTO products (id, name, price, category, seller_id, seller_name, status) VALUES (${productOther}, 'Annonce du syndic', 10, 'autre', ${syndic.id}, 'Syndic', 'approved')`;
    await pool`INSERT INTO product_favorites (product_id, user_id) VALUES (${productOther}, ${a.id})`;
    orderId = `test-del-o-${randomUUID()}`;
    await pool`INSERT INTO orders (id, product_id, product_name, buyer_id, buyer_name, seller_id, seller_name, status)
               VALUES (${orderId}, ${productSold}, 'Annonce vendue', ${syndic.id}, 'Syndic', ${a.id}, 'Personne Asupprimer', 'completed')`;
    await pool`INSERT INTO conversations (id, syndicate_id, participant1_id, participant2_id, created_by) VALUES (${convId}, ${sid}, ${a.id}, ${syndic.id}, ${a.id})`;
    await pool`INSERT INTO messages (id, conversation_id, sender_id, sender_name, text, attachment_url, attachment_name)
               VALUES (${msgId}, ${convId}, ${a.id}, 'Personne Asupprimer', 'Message privé', ${`/objects/uploads/${attachName}`}, 'piece.pdf')`;
    await pool`INSERT INTO email_logs (recipient, subject, template, status, body_html) VALUES (${a.email}, 'Ancien message', 'generic', 'sent', '<p>corps</p>')`;

    const login = await call("POST", "/auth/login", { email: a.email, password: PASSWORD });
    const token = login.body?.data?.token as string, refreshToken = login.body?.data?.refreshToken as string;
    if (!token) throw new Error(`login ${login.status}: ${JSON.stringify(login.body)}`);
    check("the account can sign in before deletion", (await call("GET", "/auth/me", undefined, token)).status === 200);

    // Refusals change nothing.
    check("no password: refused", (await call("POST", "/me/account/delete", {}, token)).status === 400);
    const wrong = await call("POST", "/me/account/delete", { password: "mauvais-mot-de-passe" }, token);
    check("wrong password: refused", wrong.status === 401 && wrong.body?.code === "ACCOUNT_DELETE_BAD_CREDENTIALS", `${wrong.status} ${wrong.body?.code}`);
    check("not signed in: refused", (await call("POST", "/me/account/delete", { password: PASSWORD })).status === 401);
    const [still] = (await pool`SELECT email, status FROM users WHERE id = ${a.id}`) as any[];
    check("after refusals the account is untouched", still.email === a.email && still.status === "active");

    // Deletion in the app.
    const done = await call("POST", "/me/account/delete", { password: PASSWORD }, token);
    check("deletion succeeds with the right password", done.status === 200, `${done.status} ${done.body?.error ?? ""}`);

    const [u] = (await pool`SELECT * FROM users WHERE id = ${a.id}`) as any[];
    check("the account row stays, anonymised (votes and accounting refer to it)", !!u && u.name === "Compte supprimé" && u.status === "inactive");
    check("address, phone, CIN, profession, photo and push token are erased", u.email !== a.email && /@deleted\.invalid$/.test(u.email) && !u.phone && !u.cin && !u.profession && !u.avatar && !u.push_token);
    check("the former password no longer signs in", (await call("POST", "/auth/login", { email: a.email, password: PASSWORD })).status === 401);
    const me = await call("GET", "/auth/me", undefined, token);
    check("the access token already issued is refused at once", me.status === 401 && me.body?.code === "ACCOUNT_DISABLED", `${me.status} ${me.body?.code}`);
    check("the refresh token is refused", (await call("POST", "/auth/refresh", { refreshToken })).status === 401);

    check("vehicles are deleted", (await count(pool`SELECT count(*) n FROM vehicles WHERE user_id = ${a.id}`)) === 0);
    check("favorites are deleted", (await count(pool`SELECT count(*) n FROM product_favorites WHERE user_id = ${a.id}`)) === 0);
    check("the active listing is deleted", (await count(pool`SELECT count(*) n FROM products WHERE id = ${productLive}`)) === 0);
    const [sold] = (await pool`SELECT seller_name, seller_email, seller_phone, status FROM products WHERE id = ${productSold}`) as any[];
    check("a sold listing stays, without the seller's identity", sold?.status === "sold" && sold.seller_name === "Compte supprimé" && !sold.seller_email && !sold.seller_phone);
    const [order] = (await pool`SELECT seller_name, buyer_name FROM orders WHERE id = ${orderId}`) as any[];
    check("the buyer's order stays, seller anonymised", order?.seller_name === "Compte supprimé" && order.buyer_name === "Syndic");
    const [msg] = (await pool`SELECT text, sender_name, attachment_url, is_deleted_for_everyone FROM messages WHERE id = ${msgId}`) as any[];
    check("messages are emptied, the thread stays for the other person", msg?.text === "" && msg.sender_name === "Compte supprimé" && !msg.attachment_url && msg.is_deleted_for_everyone === true);
    const [mem] = (await pool`SELECT email, name FROM members WHERE id = ${memberId}`) as any[];
    check("the co-owner record held by the syndic is kept", mem?.email === a.email);
    check("the e-mail history no longer holds the address or the body", (await count(pool`SELECT count(*) n FROM email_logs WHERE recipient = ${a.email} AND template <> 'account_deleted'`)) === 0);
    check("the deletion is in the audit log", (await count(pool`SELECT count(*) n FROM audit_logs WHERE entity_id = ${a.id} AND action = 'ACCOUNT_DELETED'`)) === 1);
    const exists = (n: string) => existsSync(path.join(UPLOADS!, n));
    check("the photo file is erased from the disk", !exists(avatarName));
    check("the message attachment is erased from the disk", !exists(attachName));
    check("the deleted listing's image is erased from the disk", !exists(liveName));
    check("the sold listing's image is kept (an order refers to it)", exists(soldName));
    const reuse = await pool`SELECT count(*)::int n FROM users WHERE email = ${a.email}`;
    check("the address is free for a future account", (reuse as any)[0].n === 0);

    // Guards.
    const superLogin = await call("POST", "/auth/login", { email: superAdmin.email, password: "MizanTest#2026" });
    const refused = await call("POST", "/me/account/delete", { password: "MizanTest#2026" }, superLogin.body?.data?.token);
    check("a platform administrator is refused", refused.status === 403 && refused.body?.code === "ACCOUNT_DELETE_PLATFORM_ADMIN", `${refused.status} ${refused.body?.code}`);
    await pool`INSERT INTO syndicates (id, name, status) VALUES (${soleAdmin.syndicate}, 'Copropriété de test', 'active')`;
    await pool`INSERT INTO users (id, name, email, password_hash, role, status, syndicate_id) VALUES (${soleAdmin.id}, 'Seul Admin', ${soleAdmin.email}, ${await bcrypt.hash(PASSWORD, 8)}, 'syndicate_admin', 'active', ${soleAdmin.syndicate})`;
    const last = await web({ email: soleAdmin.email, password: PASSWORD, confirm: "yes" }, "?lang=fr");
    check("the last administrator of a condominium is refused", last.status === 409 && /seul administrateur/.test(last.html), String(last.status));
    const [admin] = (await pool`SELECT status FROM users WHERE id = ${soleAdmin.id}`) as any[];
    check("the refused administrator is untouched", admin.status === "active");

    // Deleting never depends on the condominium: suspended, and without any subscription.
    await pool`INSERT INTO syndicates (id, name, status) VALUES (${suspendedSyndicate}, 'Copropriété suspendue', 'suspended')`;
    const c = await makeAccount(suspendedSyndicate, "suspendu");
    disposable.push(c);
    const cLogin = await call("POST", "/auth/login", { email: c.email, password: PASSWORD });
    const cWrite = await call("PUT", "/profile", { name: "Essai" }, cLogin.body?.data?.token);
    check("in a suspended condominium, ordinary writes are refused", cWrite.status === 423 || cWrite.status === 402, String(cWrite.status));
    const cDel = await call("POST", "/me/account/delete", { password: PASSWORD }, cLogin.body?.data?.token);
    check("in a suspended condominium, the account can still be deleted", cDel.status === 200, `${cDel.status} ${cDel.body?.code ?? ""}`);

    // Public privacy page: no session, the app's own text, nothing left to substitute.
    const privacyRes = await fetch(`${BASE}/legal/privacy`);
    const privacyHtml = await privacyRes.text();
    check("the privacy page is public", privacyRes.status === 200 && /text\/html/.test(privacyRes.headers.get("content-type") ?? ""), String(privacyRes.status));
    check("the privacy page has the sections of the app's screen", /1\. Responsable du traitement/.test(privacyHtml) && /11\. Modifications de la politique/.test(privacyHtml));
    check("the privacy page keeps its emphasis and leaves no placeholder", /<strong>Droit d'accès<\/strong>/.test(privacyHtml) && !/\{\{|CONTACT\./.test(privacyHtml));

    // Public page.
    const pageFr = await fetch(`${BASE}/account-deletion?lang=fr`);
    const htmlFr = await pageFr.text();
    check("the public page opens without signing in", pageFr.status === 200 && /Supprimer mon compte MIZAN/.test(htmlFr));
    check("the page says what is deleted and what is kept", /Ce qui est supprimé/.test(htmlFr) && /Ce qui reste conservé/.test(htmlFr));
    const htmlAr = await (await fetch(`${BASE}/account-deletion?lang=ar`)).text();
    check("the page exists in Arabic, right to left", /dir="rtl"/.test(htmlAr) && /حذف حسابي/.test(htmlAr));
    const noConfirm = await web({ email: b.email, password: PASSWORD });
    check("without the confirmation box: refused", noConfirm.status === 400);
    const ghost = await web({ email: "personne.inconnue@s20261019.seedgen.mizan.test", password: PASSWORD, confirm: "yes" }, "?lang=fr");
    const badPw = await web({ email: b.email, password: "mauvais-mot-de-passe", confirm: "yes" }, "?lang=fr");
    check("unknown address and wrong password get the same page (no enumeration)", ghost.status === 401 && badPw.status === 401 && ghost.html === badPw.html);
    const okWeb = await web({ email: b.email.toUpperCase(), password: PASSWORD, confirm: "yes" }, "?lang=fr");
    check("the page deletes the account with the right password", okWeb.status === 200 && /Votre compte a été supprimé/.test(okWeb.html), String(okWeb.status));
    const [ub] = (await pool`SELECT name, status FROM users WHERE id = ${b.id}`) as any[];
    check("the account deleted from the page is anonymised", ub.name === "Compte supprimé" && ub.status === "inactive");
    // The e-mail leaves after the response: wait for its log entry.
    let logged: any;
    for (let i = 0; i < 50 && !logged; i++) {
      [logged] = (await pool`SELECT body_html, status FROM email_logs WHERE recipient = ${b.email} AND template = 'account_deleted' ORDER BY created_at DESC LIMIT 1`) as any[];
      if (!logged) await new Promise((r) => setTimeout(r, 100));
    }
    check("the confirmation e-mail is attempted and its body not stored", !!logged && logged.body_html === null, logged?.status);
    const expired = await call("POST", "/me/account/delete", { password: "x" });
    check("the subscription gate does not hide the route (auth answers first)", expired.status === 401);
  } finally {
    // Disposable data only (isolated base).
    const ids = [a.id, b.id, soleAdmin.id, ...disposable.map((d) => d.id)];
    await pool`DELETE FROM messages WHERE id = ${msgId}`;
    await pool`DELETE FROM conversations WHERE id = ${convId}`;
    if (orderId) await pool`DELETE FROM orders WHERE id = ${orderId}`;
    await pool`DELETE FROM products WHERE id IN ${pool([productLive, productSold, productOther])}`;
    await pool`DELETE FROM members WHERE id = ${memberId}`;
    await pool`DELETE FROM audit_logs WHERE entity_id IN ${pool(ids)}`;
    await pool`DELETE FROM email_logs WHERE recipient IN ${pool([a.email, b.email, soleAdmin.email, `deleted-${a.id}@deleted.invalid`, `deleted-${b.id}@deleted.invalid`, ...disposable.flatMap((d) => [d.email, `deleted-${d.id}@deleted.invalid`])])}`;
    await pool`DELETE FROM users WHERE id IN ${pool(ids)}`;
    await pool`DELETE FROM syndicates WHERE id IN ${pool([soleAdmin.syndicate, suspendedSyndicate])}`;
    const { rmSync } = await import("node:fs");
    for (const n of [avatarName, attachName, liveName, soldName]) rmSync(path.join(UPLOADS!, n), { force: true });
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} account deletion checks passed`);
  await pool.end();
  process.exit(failed ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await pool.end().catch(() => {}); process.exit(1); });
