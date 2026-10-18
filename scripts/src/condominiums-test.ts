/**
 * Syndic company & multi-condominium management — real sessions over HTTP.
 *
 * A syndic (Nora) founds her company with condominium A, then creates B and
 * C, assigns a colleague (Omar) with a different role per condominium,
 * switches context, suspends, archives, revokes — and an outside syndic
 * (Atlas) attacks the company's records directly.
 *
 * Usage (API running with SMTP disabled):
 *   API_BASE_URL=http://localhost:5055/api pnpm --filter @workspace/scripts run condominiums:test
 */
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { purgeAllocationsOfSyndicates } from "./test-cleanup.js";
import { otpTokensTable, syndicatesTable, usersTable } from "@workspace/db/schema";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const JWT_SECRET = process.env.JWT_SECRET!;
const RUN = Date.now();
const results: { name: string; pass: boolean; detail: string }[] = [];
function step(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

class Session {
  token = "";
  refreshToken = "";
  constructor(public email: string, public password: string) {}
  async login() {
    const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: this.email, password: this.password }) });
    const j: any = await r.json().catch(() => null);
    if (r.ok) {
      this.token = j.data.token;
      this.refreshToken = j.data.refreshToken;
    }
    return { status: r.status, json: j };
  }
  async api(p: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
    const r = await fetch(`${BASE}${p}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const type = r.headers.get("content-type") ?? "";
    const json: any = type.includes("json") ? await r.json().catch(() => null) : (await r.arrayBuffer(), null);
    return { status: r.status, json };
  }
  async switchTo(syndicateId: string) {
    const r = await this.api("/auth/context", "POST", { syndicateId, refreshToken: this.refreshToken });
    if (r.status === 200) {
      this.token = r.json.data.token;
      this.refreshToken = r.json.data.refreshToken;
    }
    return r;
  }
  async refresh() {
    const r = await fetch(`${BASE}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: this.refreshToken }) });
    const j: any = await r.json().catch(() => null);
    if (r.ok) {
      this.token = j.data.token;
      this.refreshToken = j.data.refreshToken;
    }
    return r.status;
  }
  claims(): any {
    return jwt.decode(this.token);
  }
}

async function main() {
  const createdSyndicates: string[] = [];
  const createdOrgs: string[] = [];
  const emails = { nora: `nora.syndic.${RUN}@example.invalid`, omar: `omar.staff.${RUN}@example.invalid` };
  const phoneLocal = "0663" + String(RUN).slice(-6);
  try {
    // ═══ 0. Nora founds her company (real onboarding) ════════════════════
    await db.insert(otpTokensTable).values({ email: emails.nora, purpose: "email_verification", codeHash: await bcrypt.hash("246810", 8), expiresAt: new Date(Date.now() + 600_000) });
    await fetch(`${BASE}/auth/otp/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: emails.nora, code: "246810" }) });
    const password = `Nora-Pass-${RUN % 10000}!`;
    const reg = await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Nora Syndic", email: emails.nora, phone: phoneLocal, password }) });
    step("syndic account created", reg.status === 201, `status=${reg.status}`);
    const nora = new Session(emails.nora, password);
    await nora.login();
    await db.insert(otpTokensTable).values({ email: "+212" + phoneLocal.slice(1), purpose: "phone_verification", codeHash: sha256("135791"), expiresAt: new Date(Date.now() + 300_000) });
    await nora.api("/auth/sms/verify", "POST", { phone: phoneLocal, code: "135791" });
    const a = await nora.api("/syndicates", "POST", { name: `Résidence Andalous ${RUN}`, sector: "copropriete", phone: phoneLocal, city: "Rabat" });
    const A = a.json?.data?.id as string;
    createdSyndicates.push(A);
    const orgId = a.json?.data?.organizationId as string;
    if (orgId) createdOrgs.push(orgId);
    step("first condominium A created with its syndic company", a.status === 201 && !!orgId, `status=${a.status}`);
    await nora.login();
    const mine = await nora.api("/organizations/mine");
    step("the founder administers the company", (mine.json?.data ?? []).some((o: any) => o.id === orgId && o.role === "org_admin"));

    // ═══ 1. Creating B and C: validation, retry, duplicates ══════════════
    const missing = await nora.api(`/organizations/${orgId}/condominiums`, "POST", { name: "Sans adresse" });
    step("required fields are validated (clear field error)", missing.status === 400 && missing.json?.field === "address", `field=${missing.json?.field}`);
    const key = `create-b-${RUN}`;
    const bodyB = { name: `Résidence Hadika ${RUN}`, address: "4 Rue des Roses", city: "Casablanca", fiscalYearStartMonth: 1, defaultLanguage: "fr" };
    const [b1, b2] = await Promise.all([
      nora.api(`/organizations/${orgId}/condominiums`, "POST", bodyB, { "Idempotency-Key": key }),
      nora.api(`/organizations/${orgId}/condominiums`, "POST", bodyB, { "Idempotency-Key": key }),
    ]);
    const B = (b1.json?.data?.id ?? b2.json?.data?.id) as string;
    createdSyndicates.push(B);
    step("a retried creation (same key) yields one condominium", [b1.status, b2.status].includes(201) && [b1.status, b2.status].every((s) => [200, 201, 409].includes(s)), `${b1.status}/${b2.status}`);
    const retry = await nora.api(`/organizations/${orgId}/condominiums`, "POST", bodyB, { "Idempotency-Key": key });
    step("replaying the request returns the same condominium", retry.status === 200 && retry.json?.data?.id === B && retry.json?.replayed === true);
    const dupName = await nora.api(`/organizations/${orgId}/condominiums`, "POST", { ...bodyB, name: bodyB.name.toUpperCase() });
    step("two live condominiums of a company cannot share a name", dupName.status === 409 && dupName.json?.code === "CONDOMINIUM_EXISTS");
    const [{ n: countB }] = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM syndicates WHERE organization_id = ${orgId} AND lower(name) = lower(${bodyB.name})`)) as unknown as { n: number }[];
    step("DB: exactly one row for B", countB === 1);
    step("a new condominium starts as draft", b1.json?.data?.status === "draft" || b2.json?.data?.status === "draft");
    const c = await nora.api(`/organizations/${orgId}/condominiums`, "POST", { name: `Résidence Cèdres ${RUN}`, address: "9 Av. Atlas", city: "Fès" }, { "Idempotency-Key": `create-c-${RUN}` });
    const C = c.json?.data?.id as string;
    createdSyndicates.push(C);
    const early = await nora.api(`/condominiums/${C}/status`, "POST", { status: "active" });
    step("a condominium cannot open without a building", early.status === 409 && early.json?.code === "NOT_CONFIGURED");

    // ═══ 2. Context switching & isolation ════════════════════════════════
    const ctxs = await nora.api("/me/contexts");
    step("the syndic can switch to A, B and C", [A, B, C].every((id) => (ctxs.json?.data ?? []).some((x: any) => x.syndicateId === id)));
    const oldRefresh = nora.refreshToken;
    const sw = await nora.switchTo(B);
    step("switch to B: token scoped to B with the role decided by the server", sw.status === 200 && nora.claims().syndicateId === B && nora.claims().role === "syndicate_admin");
    const bldB = await nora.api("/buildings", "POST", { name: "Hadika — Bloc 1", address: "4 Rue des Roses", city: "Casablanca" });
    const buildingB = bldB.json?.data?.id ?? bldB.json?.id;
    const lotB = await nora.api("/lots", "POST", { number: "B-1", type: "appartement", floor: 1, tantiemes: 100, buildingId: buildingB });
    step("B is configured: building and lot created in B", bldB.status === 201 && lotB.status === 201, `${bldB.status}/${lotB.status}`);
    const actB = await nora.api(`/condominiums/${B}/status`, "POST", { status: "active" });
    step("B is opened (draft → active)", actB.status === 200 && actB.json?.data?.status === "active");
    const reused = await fetch(`${BASE}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: oldRefresh }) });
    step("the pre-switch session cannot be resumed", reused.status === 401);
    const swC = await nora.switchTo(C);
    step("switch to C", swC.status === 200 && nora.claims().syndicateId === C);
    const lotsInC = await nora.api("/lots");
    step("C's lists show nothing of B", (lotsInC.json?.data ?? []).length === 0 && !JSON.stringify(lotsInC.json).includes("B-1"));
    step("a B lot id is not found from C", (await nora.api(`/lots/${lotB.json?.id}`)).status === 404);
    step("a ?syndicateId=B parameter is ignored in C", !JSON.stringify((await nora.api(`/lots?syndicateId=${B}`)).json).includes("B-1"));
    step("creating in B's building from C is refused", (await nora.api("/lots", "POST", { number: "X", type: "cave", tantiemes: 1, buildingId: buildingB })).status === 404);
    step("refresh keeps the selected context (C)", (await nora.refresh()) === 200 && nora.claims().syndicateId === C);
    step("/auth/me reflects the current context", (await nora.api("/auth/me")).json?.data?.syndicateId === C);

    // ═══ 3. Staff: different role per condominium, revocation ════════════
    await nora.switchTo(A);
    const invite = await nora.api("/team/invite", "POST", { name: "Omar Staff", email: emails.omar, role: "treasurer" });
    step("Omar is invited in A as treasurer", invite.status === 201 || invite.status === 200, `status=${invite.status} ${invite.json?.error ?? ""}`);
    await db.update(usersTable).set({ passwordHash: await bcrypt.hash("Omar-Temp-1", 10), mustChangePassword: false }).where(eq(usersTable.email, emails.omar));
    const assign = await nora.api(`/condominiums/${B}/memberships`, "POST", { email: emails.omar, role: "committee_member" });
    step("Omar is assigned to B as committee member", assign.status === 201, `status=${assign.status} ${assign.json?.error ?? ""}`);
    step("assigning him twice is refused", (await nora.api(`/condominiums/${B}/memberships`, "POST", { email: emails.omar, role: "treasurer" })).status === 409);
    const omar = new Session(emails.omar, "Omar-Temp-1");
    await omar.login();
    const omarCtx = await omar.api("/me/contexts");
    const roles = Object.fromEntries((omarCtx.json?.data ?? []).map((x: any) => [x.syndicateId, x.role]));
    step("Omar sees A (treasurer) and B (committee member), not C", roles[A] === "treasurer" && roles[B] === "committee_member" && !roles[C]);
    step("in A, Omar manages finances (creates an account)", (await omar.api("/treasury/accounts", "POST", { kind: "cash", label: `Caisse ${RUN}` })).status === 201);
    await omar.switchTo(B);
    step("in B, the same person may read the treasury…", (await omar.api("/treasury/accounts")).status === 200);
    step("…but not record movements", (await omar.api("/treasury/accounts", "POST", { kind: "cash", label: "Caisse B" })).status === 403);
    step("Omar cannot switch to C", (await omar.switchTo(C)).status === 403);
    const up = new FormData();
    up.append("file", new Blob([new Uint8Array(Buffer.from("%PDF-1.4\n%%EOF\n"))], { type: "application/pdf" }), "pv.pdf");
    const upRes = await fetch(`${BASE}/storage/uploads`, { method: "POST", headers: { Authorization: `Bearer ${omar.token}` }, body: up });
    const objectPath = ((await upRes.json().catch(() => ({}))) as any).objectPath;
    const ticket = (await omar.api("/auth/file-ticket", "POST")).json?.data?.ticket;
    step("before revocation, his download link works", (await fetch(`${BASE}/storage${objectPath}?token=${ticket}`)).status === 200);
    const memberships = await nora.api(`/condominiums/${B}/memberships`);
    const omarAssignment = (memberships.json?.data?.assignments ?? []).find((m: any) => m.email === emails.omar && m.status === "active");
    const revoke = await nora.api(`/condominiums/${B}/memberships/${omarAssignment?.id}`, "DELETE", { reason: "Fin de mission" });
    step("the syndic revokes Omar's access to B", revoke.status === 200);
    const after = await omar.api("/treasury/accounts");
    step("his still-valid B token is refused on the very next request", after.status === 401 && after.json?.code === "SESSION_CONTEXT_REVOKED", `status=${after.status}`);
    step("his download link stops working too", (await fetch(`${BASE}/storage${objectPath}?token=${ticket}`)).status === 401);
    step("his B session cannot be refreshed", (await omar.refresh()) === 401);
    await omar.login();
    step("on next sign-in he lands in A, where he keeps his role", omar.claims().syndicateId === A && omar.claims().role === "treasurer");
    const history = (await nora.api(`/condominiums/${B}/memberships`)).json?.data?.assignments ?? [];
    step("the revoked assignment stays in the history", history.some((m: any) => m.email === emails.omar && m.status === "revoked"));

    // ═══ 4. Suspension & archival ════════════════════════════════════════
    await nora.switchTo(B);
    const noReason = await nora.api(`/condominiums/${B}/status`, "POST", { status: "suspended" });
    step("suspending needs a reason", noReason.status === 400);
    await nora.api(`/condominiums/${B}/status`, "POST", { status: "suspended", reason: "Impayé de l'abonnement" });
    step("suspended: reading still works", (await nora.api("/lots")).status === 200);
    const write = await nora.api("/lots", "POST", { number: "B-2", type: "cave", tantiemes: 1, buildingId: buildingB });
    step("suspended: writes are refused", write.status === 423 && write.json?.code === "CONDOMINIUM_SUSPENDED", `status=${write.status}`);
    await nora.api(`/condominiums/${B}/status`, "POST", { status: "active" });
    step("reactivated: writes work again", (await nora.api("/lots", "POST", { number: "B-2", type: "cave", tantiemes: 1, buildingId: buildingB })).status === 201);
    await nora.switchTo(C);
    await nora.api("/buildings", "POST", { name: "Cèdres", address: "9 Av. Atlas", city: "Fès" });
    const arch = await nora.api(`/condominiums/${C}/status`, "POST", { status: "archived", reason: "Mandat terminé" });
    step("C is archived", arch.status === 200 && !!arch.json?.data?.archivedAt);
    step("archived: the company admin may still read its history", (await nora.api("/buildings")).status === 200);
    step("archived: nothing can be written", (await nora.api("/buildings", "POST", { name: "X", address: "Y" })).status === 423);
    step("archived: no transition back", (await nora.api(`/condominiums/${C}/status`, "POST", { status: "active" })).status === 409);
    const [cRow] = await db.select().from(syndicatesTable).where(eq(syndicatesTable.id, C));
    step("DB: archived condominium and its buildings are kept", cRow?.status === "archived" && ((await db.execute(sql`SELECT COUNT(*)::int AS n FROM buildings WHERE syndicate_id = ${C}`)) as any)[0].n === 1);

    // ═══ 5. Portfolio ════════════════════════════════════════════════════
    // The same person owns a lot in A and in B: counted once in the total.
    await nora.switchTo(A);
    const bldA = await nora.api("/buildings", "POST", { name: "Andalous — A", address: "1 Rue A", city: "Rabat" });
    const buildingA = bldA.json?.data?.id ?? bldA.json?.id;
    const ownerA = await nora.api("/members", "POST", { name: "Salma Double", email: `salma.${RUN}@example.invalid`, inviteToApp: false });
    await nora.api("/lots", "POST", { number: "A-1", type: "appartement", floor: 0, tantiemes: 100, buildingId: buildingA, ownerId: ownerA.json?.data?.id });
    await nora.switchTo(B);
    const ownerB = await nora.api("/members", "POST", { name: "Salma Double", email: `salma.${RUN}@example.invalid`, inviteToApp: false });
    step("the same person can be a co-owner in two condominiums", ownerB.status === 201, `status=${ownerB.status} ${ownerB.json?.error ?? ""}`);
    await nora.api("/lots", "POST", { number: "B-3", type: "appartement", floor: 2, tantiemes: 100, buildingId: buildingB, ownerId: ownerB.json?.data?.id });
    const pf = await nora.api(`/organizations/${orgId}/portfolio`);
    const t = pf.json?.data?.totals;
    const byId = Object.fromEntries((pf.json?.data?.condominiums ?? []).map((x: any) => [x.id, x]));
    const [{ n: unitsDb }] = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM lots l JOIN buildings b ON b.id = l.building_id WHERE b.syndicate_id IN (${A}, ${B}, ${C}) AND l.archived_at IS NULL`)) as unknown as { n: number }[];
    step("portfolio lists the company's 3 condominiums, 2 active", t?.condominiums === 3 && t?.activeCondominiums === 2, JSON.stringify({ c: t?.condominiums, a: t?.activeCondominiums }));
    step("portfolio unit total equals the database", t?.units === unitsDb && byId[B]?.units === 3, `api=${t?.units} db=${unitsDb}`);
    step("a person co-owning in two condominiums is counted once in the total", byId[A]?.coOwners === 1 && byId[B]?.coOwners === 1 && t?.coOwners === 1);
    step("each metric comes with its definition", typeof pf.json?.data?.definitions?.outstanding === "string");
    const drill = await nora.api(`/organizations/${orgId}/portfolio/${B}/incidents`);
    step("drill-down returns the records behind a figure", drill.status === 200 && Array.isArray(drill.json?.data));

    // ═══ 6. Direct attacks ═══════════════════════════════════════════════
    const [atlas] = await db.select().from(usersTable).where(eq(usersTable.id, "user_admin_atlas"));
    const atlasToken = jwt.sign({ userId: atlas.id, email: atlas.email, role: atlas.role, syndicateId: atlas.syndicateId, name: atlas.name }, JWT_SECRET, { expiresIn: "15m" });
    const as = async (p: string, method = "GET", body?: unknown, token = atlasToken) =>
      (await fetch(`${BASE}${p}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined })).status;
    step("another syndic cannot read the company portfolio", (await as(`/organizations/${orgId}/portfolio`)) === 404);
    step("…nor its drill-down", (await as(`/organizations/${orgId}/portfolio/${B}/outstanding`)) === 404);
    step("…nor create a condominium in it", (await as(`/organizations/${orgId}/condominiums`, "POST", { name: "Pirate", address: "x x x", city: "Rabat" })) === 404);
    step("…nor assign himself to B", (await as(`/condominiums/${B}/memberships`, "POST", { email: atlas.email, role: "syndicate_admin" })) === 404);
    step("…nor change B's status", (await as(`/condominiums/${B}/status`, "POST", { status: "suspended", reason: "attaque" })) === 404);
    const sw2 = await fetch(`${BASE}/auth/context`, { method: "POST", headers: { Authorization: `Bearer ${atlasToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ syndicateId: B, refreshToken: "x" }) });
    step("…nor switch into B", sw2.status === 403);
    const forged = jwt.sign({ userId: atlas.id, email: atlas.email, role: "syndicate_admin", syndicateId: B, name: atlas.name }, JWT_SECRET, { expiresIn: "15m" });
    step("a token forged for B (valid signature, no grant) is refused", (await as("/lots", "GET", undefined, forged)) === 401);
    step("the last company administrator cannot be removed", await (async () => {
      const members = (await nora.api(`/organizations/${orgId}/members`)).json?.data ?? [];
      const me = members.find((m: any) => m.email === emails.nora);
      return (await nora.api(`/organizations/${orgId}/members/${me?.id}`, "DELETE")).status === 409;
    })());
    await nora.switchTo(A);
    await nora.api("/treasury/accounts", "POST", { kind: "cash", label: `Caisse fonds ${RUN}`, openingBalance: 100 });
    const cur = await nora.api(`/condominiums/${A}/settings`, "PATCH", { currency: "EUR" });
    step("currency cannot change once money was recorded", cur.status === 409 && cur.json?.code === "CURRENCY_LOCKED");
    step("other settings can be edited", (await nora.api(`/condominiums/${A}/settings`, "PATCH", { defaultLanguage: "ar", fiscalYearStartMonth: 7 })).status === 200);
  } finally {
    await purge(createdSyndicates, createdOrgs, Object.values(emails), RUN);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} condominium checks passed`);
  if (failed.length) process.exitCode = 1;
}

async function purge(ids: string[], orgs: string[], emails: string[], run: number) {
  const sids = ids.filter(Boolean);
  if (sids.length) {
    const list = sql.join(sids.map((s) => sql`${s}`), sql`, `);
    await purgeAllocationsOfSyndicates(sids);
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL mizan.ledger_maintenance = 'on'`);
      for (const q of [
        sql`DELETE FROM reconciliation_matches WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM bank_statement_lines WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM bank_statements WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM transactions WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM appel_payments WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM expenses WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM ledger_entries WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM treasury_accounts WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM lot_ownerships WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM syndicate_memberships WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM appels_de_fonds WHERE building_id IN (SELECT id FROM buildings WHERE syndicate_id IN (${list}))`,
        sql`DELETE FROM subscription_payments WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM billing_invoices WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM syndicate_subscriptions WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM cotisations WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM audit_logs WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM alerts WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM email_logs WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM documents WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM document_sequences WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM storage_objects WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM users WHERE syndicate_id IN (${list})`,
        sql`DELETE FROM syndicates WHERE id IN (${list})`,
      ]) {
        await tx.execute(q);
      }
    });
  }
  await db.delete(usersTable).where(inArray(usersTable.email, emails));
  if (orgs.length) {
    const ol = sql.join(orgs.map((o) => sql`${o}`), sql`, `);
    await db.execute(sql`DELETE FROM organization_members WHERE organization_id IN (${ol})`);
    await db.execute(sql`DELETE FROM organizations WHERE id IN (${ol})`);
  }
  await db.delete(otpTokensTable).where(inArray(otpTokensTable.email, emails));
  await db.execute(sql`DELETE FROM otp_tokens WHERE email LIKE ${"%" + String(run).slice(-6)}`);
}

main()
  .catch((err) => {
    console.error("Condominium suite failed to run:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
