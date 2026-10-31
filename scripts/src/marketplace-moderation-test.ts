/**
 * Moderation of the residence market by the syndic (2026-10-24), on the
 * isolated test base:
 *
 *   pnpm --filter @workspace/scripts run marketplace-moderation:test
 *
 * - a new listing waits (pending_review) and is invisible to neighbours;
 * - the syndic of the residence sees it in the queue; another residence's
 *   syndic does not, and cannot act on it (404); a co-owner cannot moderate;
 * - only real transitions: changes requested (reason required) → the seller
 *   edits → back in the queue → published; publishing twice, or touching a
 *   reserved listing, is refused (409); promotion stays with the platform;
 * - every decision is in the listing's history (seller and moderator only).
 * The listing it creates is removed at the end.
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
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
};
let productId: string | null = null;

async function main() {
  const [{ d }] = await q<{ d: string }>("SELECT current_database() AS d");
  if (d !== "syndycat_test") throw new Error(`Base de test attendue (syndycat_test), pas ${d}`);
  const pick = (sid: string, role: string, desc = false) =>
    q<{ email: string }>(`SELECT u.email FROM users u JOIN members m ON m.syndicate_id = u.syndicate_id AND lower(m.email) = lower(u.email) AND m.status = 'active'
      WHERE u.syndicate_id = $1 AND u.role = $2 AND u.status = 'active' AND u.email LIKE $3 ORDER BY u.email ${desc ? "DESC" : ""} LIMIT 1`, [sid, role, TEST_EMAIL_LIKE]);
  const residences = await q<{ id: string }>(`SELECT s.id FROM syndicates s
      WHERE s.status = 'active' AND s.creation_key LIKE 'seedgen:%' AND ${writableSubscriptionSql("s")}
        AND EXISTS (SELECT 1 FROM users u WHERE u.syndicate_id = s.id AND u.role = 'syndicate_admin' AND u.status = 'active')
      ORDER BY s.id LIMIT 2`);
  const [home, away] = residences;
  const [{ email: sellerEmail }] = await pick(home.id, "member");
  const [{ email: neighbourEmail }] = await pick(home.id, "member", true);
  const [syndicRow] = await q<{ email: string }>(`SELECT email FROM users WHERE syndicate_id = $1 AND role = 'syndicate_admin' AND status = 'active' AND email LIKE $2 LIMIT 1`, [home.id, TEST_EMAIL_LIKE]);
  const [awayRow] = await q<{ email: string }>(`SELECT email FROM users WHERE syndicate_id = $1 AND role = 'syndicate_admin' AND status = 'active' AND email LIKE $2 LIMIT 1`, [away.id, TEST_EMAIL_LIKE]);
  const seller = await login(sellerEmail);
  const neighbour = await login(neighbourEmail);
  const syndic = await login(syndicRow.email);
  const awaySyndic = await login(awayRow.email);

  const created = await call(seller, "POST", "/products", { name: `Lampe de bureau (modération test ${Date.now().toString(36)})`, description: "Annonce de test", price: 150, category: "Autre", condition: "bon" });
  productId = created.json?.data?.id ?? null;
  check("a new listing waits for validation", created.status === 201 && created.json?.data?.status === "pending_review", `${created.status} ${created.json?.data?.status}`);
  check("…and does not exist for a neighbour yet (404)", (await call(neighbour, "GET", `/products/${productId}`)).status === 404);
  const visible = await call(neighbour, "GET", `/products?search=${encodeURIComponent("modération test")}`);
  check("…nor in the residence's catalogue", visible.status === 200 && !(visible.json?.data ?? []).some((p: any) => p.id === productId));

  const queue = await call(syndic, "GET", "/products/moderation-queue?limit=50");
  check("the residence's syndic sees it in the queue", (queue.json?.data ?? []).some((p: any) => p.id === productId) && (queue.json?.data ?? []).every((p: any) => p.syndicateId === home.id), `${queue.status}`);
  const awayQueue = await call(awaySyndic, "GET", "/products/moderation-queue?limit=50");
  check("another residence's syndic does not", awayQueue.status === 200 && !(awayQueue.json?.data ?? []).some((p: any) => p.id === productId));
  check("…and cannot act on it (404)", (await call(awaySyndic, "POST", `/products/${productId}/moderate`, { action: "approve" })).status === 404);
  check("a co-owner cannot moderate (403)", (await call(neighbour, "POST", `/products/${productId}/moderate`, { action: "approve" })).status === 403);
  check("a co-owner has no queue (403)", (await call(neighbour, "GET", "/products/moderation-queue")).status === 403);

  check("refusal without a reason: 400", (await call(syndic, "POST", `/products/${productId}/moderate`, { action: "reject" })).status === 400);
  const changes = await call(syndic, "POST", `/products/${productId}/moderate`, { action: "request_modification", reason: "Ajoutez une photo de la lampe allumée" });
  check("the syndic asks for changes, with a reason", changes.status === 200 && changes.json?.data?.status === "modification_requested", String(changes.status));
  check("publishing it now is not a valid transition (409)", (await call(syndic, "POST", `/products/${productId}/moderate`, { action: "approve" })).status === 409);
  const edit = await call(seller, "PUT", `/products/${productId}`, { description: "Annonce de test — photo ajoutée" });
  check("the seller edits it: back in the queue", edit.status === 200 && edit.json?.data?.status === "pending_review", `${edit.status} ${edit.json?.data?.status}`);
  const publish = await call(syndic, "POST", `/products/${productId}/moderate`, { action: "approve" });
  check("the syndic publishes it", publish.status === 200 && publish.json?.data?.status === "approved", String(publish.status));
  check("it now exists for the neighbour", (await call(neighbour, "GET", `/products/${productId}`)).status === 200);
  check("publishing twice: 409", (await call(syndic, "POST", `/products/${productId}/moderate`, { action: "approve" })).status === 409);
  check("promotion stays with the platform (403)", (await call(syndic, "POST", `/products/${productId}/moderate`, { action: "feature" })).status === 403);

  const reserve = await call(neighbour, "POST", `/products/${productId}/reserve`);
  check("a neighbour reserves it", reserve.status === 200, String(reserve.status));
  check("a reserved listing is not withdrawn by moderation (409)", (await call(syndic, "POST", `/products/${productId}/moderate`, { action: "reject", reason: "Retrait test" })).status === 409);
  check("…nor republished (409)", (await call(syndic, "POST", `/products/${productId}/moderate`, { action: "approve" })).status === 409);
  const [{ status: after }] = await q<{ status: string }>(`SELECT status FROM products WHERE id = $1`, [productId]);
  check("the reservation is intact", after === "reserved", after);

  const hist = await call(seller, "GET", `/products/${productId}/moderation-history`);
  const lines: string[] = (hist.json?.data ?? []).map((h: any) => h.details ?? "");
  check("the seller reads every decision, with its reason", hist.status === 200 && lines.length >= 2 && lines.some((l) => l.includes("Ajoutez une photo")) && lines.some((l) => l.startsWith("approve")), `${lines.length} entries`);
  check("a neighbour cannot read the history (404)", (await call(neighbour, "GET", `/products/${productId}/moderation-history`)).status === 404);
}

main()
  .catch((e) => { console.error(e); checks.push({ name: "run", ok: false }); })
  .finally(async () => {
    if (productId) {
      await q(`DELETE FROM products WHERE id = $1`, [productId]);
      console.log("cleanup: test listing removed");
    }
    const failed = checks.filter((c) => !c.ok).length;
    console.log(`\n${checks.length - failed}/${checks.length} marketplace moderation checks passed`);
    await pool.end();
    if (failed) process.exit(1);
  });
