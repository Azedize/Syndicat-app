/**
 * Real-user journeys — two syndicates built from scratch through the API.
 *
 *   Résidence Hayat   — syndic Samira, co-owner Ahmed (lot A-12), neighbour Leila
 *   Résidence Hadika  — syndic Ali, co-owner Karim (lot H-3)
 *
 * Every step goes through the HTTP API with real sessions (login, access
 * token, refresh token), exactly like the Android / iOS app. The only things
 * the suite does "by hand" are what a human would read outside the app: the
 * email / SMS verification codes and the invitation password sent by email.
 *
 * Usage (API running with SMTP disabled, see LOCAL_RUN_COMMANDS.md):
 *   API_BASE_URL=http://localhost:5055/api pnpm --filter @workspace/scripts run journeys:test
 *   KEEP_FIXTURES=1 …  keeps Hayat / Hadika and prints the credentials, to
 *                      replay the journeys by hand on a phone.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import {
  appelPaymentsTable,
  appelsDeFondsTable,
  ledgerEntriesTable,
  otpTokensTable,
  storageObjectsTable,
  syndicatesTable,
  usersTable,
} from "@workspace/db/schema";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const KEEP = process.env.KEEP_FIXTURES === "1";
const RUN = Date.now();
const UPLOADS_DIR = path.resolve(
  process.env.LOCAL_UPLOADS_DIR ?? path.join(import.meta.dirname, "../../artifacts/api-server/uploads"),
);
const PERIOD = "2026-10";
const YEAR = 2026;

const results: { name: string; pass: boolean; detail: string }[] = [];
function step(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** A valid Moroccan RIB (24 digits, key = 97 − (base × 100 mod 97)). */
function makeRib(seed: number): string {
  const base = `007780${String(seed).padStart(16, "0").slice(-16)}`;
  const key = 97n - ((BigInt(base) * 100n) % 97n);
  return base + String(key).padStart(2, "0");
}

// ─── Sessions: behave like the mobile client ─────────────────────────────────

class Session {
  token = "";
  refreshToken = "";
  user: any = null;
  constructor(public email: string, public password: string) {}

  async login(): Promise<number> {
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    const json: any = await res.json().catch(() => null);
    if (res.ok) {
      this.token = json.data.token;
      this.refreshToken = json.data.refreshToken;
      this.user = json.data.user;
    }
    return res.status;
  }

  /** Mobile behaviour: on 401, refresh the session once and retry. */
  async api(p: string, method = "GET", body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: any }> {
    const send = () =>
      fetch(`${BASE}${p}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    let res = await send();
    if (res.status === 401 && this.refreshToken) {
      const r = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });
      if (r.ok) {
        const j: any = await r.json();
        this.token = j.data.token;
        this.refreshToken = j.data.refreshToken ?? this.refreshToken;
        res = await send();
      }
    }
    const type = res.headers.get("content-type") ?? "";
    const json = type.includes("json") ? await res.json().catch(() => null) : (await res.arrayBuffer(), null);
    return { status: res.status, json };
  }

  async upload(name: string, type: string, bytes: Uint8Array): Promise<string | null> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type }), name);
    const res = await fetch(`${BASE}/storage/uploads`, { method: "POST", headers: { Authorization: `Bearer ${this.token}` }, body: form });
    const json: any = await res.json().catch(() => null);
    return res.ok ? (json?.objectPath ?? null) : null;
  }

  async alerts(): Promise<any[]> {
    return (await this.api("/alerts?limit=200")).json?.data ?? [];
  }

  async waitForAlert(part: string, tries = 20): Promise<any | null> {
    for (let i = 0; i < tries; i++) {
      const hit = (await this.alerts()).find((a) => String(a.title).includes(part) || String(a.message).includes(part));
      if (hit) return hit;
      await sleep(250);
    }
    return null;
  }
}

const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));
const PDF = new Uint8Array(Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"));

// ─── Onboarding helpers (real API flows) ─────────────────────────────────────

/** Syndic self-onboarding: email check → account → SMS check → syndicate. */
async function onboardSyndic(label: string, name: string, email: string, phoneLocal: string, syndicateName: string) {
  const emailCode = "731905";
  await db.insert(otpTokensTable).values({
    email,
    purpose: "email_verification",
    codeHash: await bcrypt.hash(emailCode, 8),
    expiresAt: new Date(Date.now() + 600_000),
  });
  const verify = await fetch(`${BASE}/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code: emailCode }),
  });
  step(`${label}: verifies their email with the code received`, verify.status === 200, `status=${verify.status}`);

  const password = `${label}-Pass-${RUN % 10000}!`;
  const reg = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, phone: phoneLocal, password }),
  });
  step(`${label}: creates their syndic account`, reg.status === 201, `status=${reg.status}`);

  const s = new Session(email, password);
  await s.login();
  const phoneE164 = "+212" + phoneLocal.slice(1);
  await db.insert(otpTokensTable).values({
    email: phoneE164,
    purpose: "phone_verification",
    codeHash: sha256("584210"),
    expiresAt: new Date(Date.now() + 300_000),
  });
  const sms = await s.api("/auth/sms/verify", "POST", { phone: phoneLocal, code: "584210" });
  step(`${label}: verifies the syndicate phone by SMS`, sms.status === 200, `status=${sms.status}`);

  const created = await s.api("/syndicates", "POST", { name: syndicateName, sector: "copropriete", phone: phoneLocal, city: "Casablanca" });
  step(`${label}: creates "${syndicateName}"`, created.status === 201, `status=${created.status}`);
  const relog = await s.login();
  step(`${label}: new session is scoped to the syndicate`, relog === 200 && s.user?.syndicateId === created.json?.data?.id);
  return { session: s, syndicateId: created.json?.data?.id as string };
}

/** Syndic adds a co-owner with an app invitation; the co-owner signs in the first time. */
async function inviteCoOwner(syndic: Session, label: string, name: string, email: string) {
  const add = await syndic.api("/members", "POST", { name, email, phone: "0612" + String(RUN).slice(-6), inviteToApp: true });
  step(`${label}: added and invited by the syndic`, add.status === 201 && add.json?.invited === true, `status=${add.status}`);
  const memberId = add.json?.data?.id as string;
  // The temporary password arrives by email; the co-owner reads it there.
  const temp = `Temp-${label}-${RUN % 10000}`;
  await db.update(usersTable).set({ passwordHash: await bcrypt.hash(temp, 10) }).where(eq(usersTable.email, email));
  const s = new Session(email, temp);
  const first = await s.login();
  step(`${label}: first sign-in with the emailed password`, first === 200 && s.user?.mustChangePassword === true);
  const locked = await s.api("/appels-de-fonds");
  step(`${label}: app locked until the password is changed`, locked.status === 403, `status=${locked.status}`);
  const newPass = `${label}-Own-${RUN % 10000}!`;
  const changed = await s.api("/auth/change-password", "POST", { currentPassword: temp, newPassword: newPass });
  step(`${label}: sets their own password`, changed.status === 200, `status=${changed.status}`);
  s.password = newPass;
  const relog = await s.login();
  step(`${label}: signs in with the new password`, relog === 200 && !s.user?.mustChangePassword);
  return { session: s, memberId };
}

async function setUpResidence(syndic: Session, label: string, lots: { number: string; ownerId?: string; tantiemes: number }[], chargesAmount: number) {
  const building = await syndic.api("/buildings", "POST", { name: `${label} — Immeuble principal`, address: "12 Rue des Orangers", city: "Casablanca" });
  step(`${label}: syndic creates the building`, building.status === 201, `status=${building.status}`);
  const buildingId = building.json?.data?.id ?? building.json?.id;
  const lotIds: string[] = [];
  for (const l of lots) {
    const r = await syndic.api("/lots", "POST", { number: l.number, buildingId, tantiemes: l.tantiemes, ownerId: l.ownerId });
    lotIds.push(r.json?.id ?? r.json?.data?.id);
  }
  step(`${label}: syndic creates and assigns the lots`, lotIds.every(Boolean));

  const bank = await syndic.api("/treasury/accounts", "POST", {
    kind: "bank",
    label: "Compte principal",
    bankName: "Banque Populaire",
    accountHolder: `Syndicat ${label}`,
    rib: makeRib(RUN + label.length),
    openingDate: `${YEAR}-01-01`,
  });
  step(`${label}: syndic registers the syndicate bank account (RIB checked)`, bank.status === 201 && bank.json?.data?.isDefault === true, `status=${bank.status} ${bank.json?.error ?? ""}`);
  const cash = await syndic.api("/treasury/accounts", "POST", { kind: "cash", label: "Caisse", openingDate: `${YEAR}-01-01` });
  step(`${label}: syndic opens the cash box`, cash.status === 201, `status=${cash.status}`);

  const budget = await syndic.api("/budgets", "POST", { year: YEAR, buildingId, chargesAmount, fondsReserve: 0 });
  const budgetId = budget.json?.id ?? budget.json?.data?.id;
  step(`${label}: syndic drafts the ${YEAR} budget`, budget.status === 201 && !!budgetId, `status=${budget.status}`);
  const early = await syndic.api(`/budgets/${budgetId}/generate-appels`, "POST", { period: PERIOD });
  step(`${label}: no call for funds on a budget not voted in AG`, early.status === 409 && early.json?.code === "BUDGET_NOT_APPROVED", `status=${early.status}`);
  const meeting = await syndic.api("/meetings", "POST", { title: `AG ordinaire ${YEAR}`, date: `${YEAR}-03-15`, time: "18:00", location: "Salle commune", type: "general" });
  const meetingId = meeting.json?.data?.id ?? meeting.json?.id;
  const approve = await syndic.api(`/budgets/${budgetId}`, "PUT", { status: "approved", meetingId });
  step(`${label}: budget approved by the general assembly`, approve.status === 200, `status=${approve.status}`);
  const gen = await syndic.api(`/budgets/${budgetId}/generate-appels`, "POST", { period: PERIOD });
  step(`${label}: syndic issues the ${PERIOD} calls for funds`, gen.status === 201 && gen.json?.count === lots.length, `status=${gen.status} count=${gen.json?.count}`);
  const again = await syndic.api(`/budgets/${budgetId}/generate-appels`, "POST", { period: PERIOD });
  step(`${label}: issuing the same period twice is refused`, again.status === 409, `status=${again.status}`);
  return { buildingId, lotIds, budgetId, bankId: bank.json?.data?.id as string, cashId: cash.json?.data?.id as string };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const createdSyndicates: string[] = [];
  const emails = {
    samira: `samira.hayat.${RUN}@example.invalid`,
    ahmed: `ahmed.hayat.${RUN}@example.invalid`,
    leila: `leila.hayat.${RUN}@example.invalid`,
    ali: `ali.hadika.${RUN}@example.invalid`,
    karim: `karim.hadika.${RUN}@example.invalid`,
  };
  const credentials: string[] = [];
  try {
    // ═══ 0. Two residences, built like real customers would ═══════════════
    const hayat = await onboardSyndic("Samira", "Samira Bennani", emails.samira, "0661" + String(RUN).slice(-6), "Résidence Hayat");
    const hadika = await onboardSyndic("Ali", "Ali Benjelloun", emails.ali, "0662" + String(RUN).slice(-6), "Résidence Hadika");
    createdSyndicates.push(hayat.syndicateId, hadika.syndicateId);
    const samira = hayat.session;
    const ali = hadika.session;

    const ahmedInv = await inviteCoOwner(samira, "Ahmed", "Ahmed Alami", emails.ahmed);
    const leilaInv = await inviteCoOwner(samira, "Leila", "Leila Idrissi", emails.leila);
    const karimInv = await inviteCoOwner(ali, "Karim", "Karim Tazi", emails.karim);
    const ahmed = ahmedInv.session;
    const leila = leilaInv.session;
    const karim = karimInv.session;

    const hayatSetup = await setUpResidence(samira, "Hayat", [
      { number: "A-12", ownerId: ahmedInv.memberId, tantiemes: 600 },
      { number: "A-14", ownerId: leilaInv.memberId, tantiemes: 400 },
    ], 12000);
    const hadikaSetup = await setUpResidence(ali, "Hadika", [
      { number: "H-3", ownerId: karimInv.memberId, tantiemes: 1000 },
    ], 6000);

    // ═══ 1. Ahmed — co-owner in Résidence Hayat ══════════════════════════
    const me = await ahmed.api("/auth/me");
    step("Ahmed: sees his residence", me.status === 200 && me.json?.data?.syndicateId === hayat.syndicateId);
    const myLot = await ahmed.api("/lots/my-lot");
    step("Ahmed: sees his apartment A-12", myLot.status === 200 && JSON.stringify(myLot.json).includes("A-12"), `status=${myLot.status}`);
    const charges = await ahmed.api("/appels-de-fonds");
    const myCall = (charges.json?.data ?? [])[0];
    step(
      "Ahmed: sees only his call for funds, with lot number and amount due",
      (charges.json?.data ?? []).length === 1 && myCall?.lotNumber === "A-12" && myCall?.remaining === "600.00" && myCall?.ownerName == null,
      `n=${charges.json?.data?.length} lot=${myCall?.lotNumber} remaining=${myCall?.remaining}`,
    );
    step("Ahmed: notified of the new call for funds", !!(await ahmed.waitForAlert("Nouvel appel de fonds")));

    const noProof = await ahmed.api(`/appels-de-fonds/${myCall.id}/pay`, "PUT", { paymentMethod: "virement", amount: 300 });
    step("Ahmed: a payment without proof is refused (it could never be validated)", noProof.status === 400, `status=${noProof.status}`);
    const proof1 = await ahmed.upload("virement-1.png", "image/png", PNG);
    step("Ahmed: uploads his transfer receipt", !!proof1);
    const tooMuch = await ahmed.api(`/appels-de-fonds/${myCall.id}/pay`, "PUT", { paymentMethod: "virement", amount: 900, proofUrl: proof1 });
    step("Ahmed: cannot declare more than the amount due", tooMuch.status === 400 && tooMuch.json?.code === "AMOUNT_EXCEEDS_BALANCE", `status=${tooMuch.status}`);
    const [p1, p1dup] = await Promise.all([
      ahmed.api(`/appels-de-fonds/${myCall.id}/pay`, "PUT", { paymentMethod: "virement", amount: 300, reference: "VIR-8841", proofUrl: proof1 }),
      ahmed.api(`/appels-de-fonds/${myCall.id}/pay`, "PUT", { paymentMethod: "virement", amount: 300, reference: "VIR-8841", proofUrl: proof1 }),
    ]);
    step("Ahmed: double tap on 'declare' creates one payment", [p1.status, p1dup.status].sort().join() === "200,409", `${p1.status}/${p1dup.status}`);
    const pendingRows = await db.select().from(appelPaymentsTable).where(eq(appelPaymentsTable.appelId, myCall.id));
    step("DB: one pending payment of 300 recorded", pendingRows.length === 1 && pendingRows[0].status === "pending" && pendingRows[0].amount === "300.00");

    step("Samira: notified that a payment awaits validation", !!(await samira.waitForAlert("Paiement à valider")));
    const panel = await samira.api("/statistics/finance/pending");
    step(
      "Samira: the payment appears in her dashboard action panel",
      (panel.json?.data?.items ?? []).some((i: any) => i.id === myCall.id && i.status === "pending_validation" && i.amount === 300),
      `status=${panel.status}`,
    );
    step("Samira: can open Ahmed's proof", (await samira.api(`/storage${proof1}`)).status === 200);
    step("Leila (neighbour): cannot open Ahmed's bank proof", (await leila.api(`/storage${proof1}`)).status === 403);
    step("Ali (other syndicate): cannot open Ahmed's proof", (await ali.api(`/storage${proof1}`)).status === 403);

    const v1 = await samira.api(`/appels-de-fonds/${myCall.id}/validate`, "PUT", { approve: true });
    step("Samira: validates the partial payment", v1.status === 200 && v1.json?.data?.status === "partially_paid", `status=${v1.status} ${v1.json?.error ?? ""}`);
    const [entry1] = await db.select().from(ledgerEntriesTable).where(eq(ledgerEntriesTable.sourceId, pendingRows[0].id));
    step(
      "DB: journal entry of 300 on Hayat's bank account",
      entry1?.amount === "300.00" && entry1?.direction === "in" && entry1?.accountId === hayatSetup.bankId && entry1?.syndicateId === hayat.syndicateId,
    );
    const partialAlert = await ahmed.waitForAlert("Reste à payer");
    step("Ahmed: notified, with the remaining balance", !!partialAlert && String(partialAlert.message).includes("300.00"));
    const afterPartial = (await ahmed.api("/appels-de-fonds")).json?.data?.[0];
    step("Ahmed: sees 'partially paid' and 300 still due", afterPartial?.status === "partially_paid" && afterPartial?.remaining === "300.00");

    const receipt1 = await ahmed.api(`/appels-de-fonds/${myCall.id}/receipt`);
    step("Ahmed: downloads the receipt of his payment", receipt1.status === 200, `status=${receipt1.status}`);

    const proof2 = await ahmed.upload("virement-2.png", "image/png", PNG);
    const p2 = await ahmed.api(`/appels-de-fonds/${myCall.id}/pay`, "PUT", { paymentMethod: "cheque", reference: "CHQ-00112", proofUrl: proof2 });
    step("Ahmed: declares the balance (defaults to the 300 due)", p2.status === 200 && p2.json?.payment?.amount === "300.00", `status=${p2.status}`);
    const noReason = await samira.api(`/appels-de-fonds/${myCall.id}/validate`, "PUT", { approve: false });
    step("Samira: a rejection needs a reason", noReason.status === 400);
    const rej = await samira.api(`/appels-de-fonds/${myCall.id}/validate`, "PUT", { approve: false, rejectionReason: "Chèque non signé" });
    step("Samira: rejects the cheque with a reason", rej.status === 200 && rej.json?.data?.status === "partially_paid", `status=${rej.status} st=${rej.json?.data?.status}`);
    step("Ahmed: notified of the rejection and its reason", !!(await ahmed.waitForAlert("Chèque non signé")));

    const proof3 = await ahmed.upload("virement-3.png", "image/png", PNG);
    await ahmed.api(`/appels-de-fonds/${myCall.id}/pay`, "PUT", { paymentMethod: "virement", reference: "VIR-9002", proofUrl: proof3 });
    const [a1, a2] = await Promise.all([
      samira.api(`/appels-de-fonds/${myCall.id}/validate`, "PUT", { approve: true }),
      samira.api(`/appels-de-fonds/${myCall.id}/validate`, "PUT", { approve: true }),
    ]);
    step("Samira: double tap on 'validate' is processed once", [a1.status, a2.status].sort().join() === "200,409", `${a1.status}/${a2.status}`);
    const settled = (await ahmed.api("/appels-de-fonds")).json?.data?.[0];
    step("Ahmed: sees the call fully paid", settled?.status === "paid" && settled?.amountPaid === "600.00" && settled?.remaining === "0.00");
    const history = await ahmed.api(`/appels-de-fonds/${myCall.id}/payments`);
    step(
      "Ahmed: sees his payment history (validated, rejected, validated)",
      (history.json?.data ?? []).map((p: any) => p.status).sort().join() === "rejected,validated,validated",
    );
    const journalSum = await db
      .select({ total: sql<string>`SUM(${ledgerEntriesTable.amount})` })
      .from(ledgerEntriesTable)
      .where(eq(ledgerEntriesTable.syndicateId, hayat.syndicateId));
    step("DB: Hayat journal holds exactly the 600 received", journalSum[0]?.total === "600.00", `total=${journalSum[0]?.total}`);
    const summary = await samira.api("/treasury/summary");
    step("Samira: treasury balance is 600 MAD", summary.json?.data?.balances?.[0]?.balance === "600.00", JSON.stringify(summary.json?.data?.balances));

    // Ticket
    const ticket = await ahmed.api("/support", "POST", { title: "Interphone en panne", description: "L'interphone du hall A ne sonne plus.", priority: "medium", category: "maintenance" });
    const ticketId = ticket.json?.data?.id;
    step("Ahmed: opens a ticket", ticket.status === 201 && !!ticketId);
    step("Samira: notified of the ticket", !!(await samira.waitForAlert("Interphone en panne")));
    step("Leila: cannot read Ahmed's ticket", [403, 404].includes((await leila.api(`/support/${ticketId}`)).status));
    await samira.api(`/support/${ticketId}/replies`, "POST", { text: "Le technicien passe jeudi." });
    step("Ahmed: notified of Samira's reply", !!(await ahmed.waitForAlert("Réponse à votre ticket")));
    await samira.api(`/support/${ticketId}/resolve`, "PUT");
    const finalTicket = await ahmed.api(`/support/${ticketId}`);
    step("Ahmed: sees the reply and the resolved status", finalTicket.json?.data?.status === "resolved" && (finalTicket.json?.data?.replies ?? []).length === 1);

    // Personal document
    const doc = await samira.api("/documents", "POST", {
      title: "Attestation de propriété — Ahmed Alami",
      category: "attestation",
      templateId: "attestation_propriete",
      lotId: hayatSetup.lotIds[0],
    });
    const docId = doc.json?.data?.id;
    step("Samira: generates an ownership attestation for Ahmed", doc.status === 201 && !!docId, `status=${doc.status}`);
    for (const status of ["validated", "published"]) await samira.api(`/documents/${docId}`, "PUT", { status });
    step("Ahmed: notified that his document is available", !!(await ahmed.waitForAlert("Votre document est disponible")));
    step("Ahmed: sees it in his documents", ((await ahmed.api("/documents")).json?.data ?? []).some((d: any) => d.id === docId));
    step("Leila: does not see it", !((await leila.api("/documents")).json?.data ?? []).some((d: any) => d.id === docId));
    step("Leila: cannot open it by ID", (await leila.api(`/documents/${docId}`)).status === 403);

    // Profile, password, logout, refresh, restart
    const prof = await ahmed.api("/profile", "PUT", { phone: "0677000111", profession: "Ingénieur" });
    step("Ahmed: updates his profile", prof.status === 200 && prof.json?.data?.profession === "Ingénieur", `status=${prof.status}`);
    const cantEscalate = await ahmed.api("/profile", "PUT", { role: "syndicate_admin", syndicateId: hadika.syndicateId });
    const [ahmedRow] = await db.select().from(usersTable).where(eq(usersTable.email, emails.ahmed));
    step("Ahmed: cannot change his own role or syndicate", ahmedRow.role === "member" && ahmedRow.syndicateId === hayat.syndicateId, `status=${cantEscalate.status}`);
    const oldRefresh = ahmed.refreshToken;
    ahmed.token = "expired.token.value";
    const autoRefreshed = await ahmed.api("/appels-de-fonds");
    step("Ahmed: expired session renews itself with the refresh token", autoRefreshed.status === 200);
    const replay = await fetch(`${BASE}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: oldRefresh }) });
    await sleep(11_000); // past the 10 s grace window of refresh rotation
    const replayLate = await fetch(`${BASE}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: oldRefresh }) });
    step("Security: a used refresh token is refused after the grace window", replayLate.status === 401, `early=${replay.status} late=${replayLate.status}`);
    const loggedIn = await ahmed.login();
    const logout = await ahmed.api("/auth/logout", "POST", { refreshToken: ahmed.refreshToken });
    const afterLogout = await fetch(`${BASE}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: ahmed.refreshToken }) });
    step("Ahmed: logs out; the session cannot be renewed", loggedIn === 200 && logout.status === 200 && afterLogout.status === 401, `refresh=${afterLogout.status}`);
    const back = await ahmed.login();
    const again = (await ahmed.api("/appels-de-fonds")).json?.data?.[0];
    step("Ahmed: signs in again and finds the same state", back === 200 && again?.status === "paid");

    // ═══ 2. Ali — syndic of Résidence Hadika ═════════════════════════════
    const members = await ali.api("/members");
    const memberNames = (members.json?.data ?? []).map((m: any) => m.name);
    step("Ali: sees only Hadika's co-owners", memberNames.includes("Karim Tazi") && !memberNames.includes("Ahmed Alami"), memberNames.join(","));
    const lotsList = await ali.api("/lots");
    step("Ali: sees only Hadika's lots", JSON.stringify(lotsList.json).includes("H-3") && !JSON.stringify(lotsList.json).includes("A-12"));
    const karimCall = (await karim.api("/appels-de-fonds")).json?.data?.[0];
    const kProof = await karim.upload("cheque.png", "image/png", PNG);
    await karim.api(`/appels-de-fonds/${karimCall.id}/pay`, "PUT", { paymentMethod: "especes", proofUrl: kProof });
    const kRej = await ali.api(`/appels-de-fonds/${karimCall.id}/validate`, "PUT", { approve: false, rejectionReason: "Reçu de caisse illisible" });
    step("Ali: rejects Karim's payment", kRej.status === 200 && kRej.json?.data?.status === "rejected");
    const kProof2 = await karim.upload("recu.png", "image/png", PNG);
    await karim.api(`/appels-de-fonds/${karimCall.id}/pay`, "PUT", { paymentMethod: "especes", proofUrl: kProof2 });
    const kVal = await ali.api(`/appels-de-fonds/${karimCall.id}/validate`, "PUT", { approve: true });
    step("Ali: validates the cash payment → credited to the cash box", kVal.status === 200 && kVal.json?.ledgerEntry?.accountId === hadikaSetup.cashId, `status=${kVal.status} acct=${kVal.json?.ledgerEntry?.accountId}`);
    step("Karim: notified that his payment is validated", !!(await karim.waitForAlert("Paiement validé")));

    // Cash deposited at the bank (internal transfer, idempotent)
    const key = `deposit-${RUN}`;
    const [t1, t2] = await Promise.all([
      ali.api("/treasury/transfers", "POST", { fromAccountId: hadikaSetup.cashId, toAccountId: hadikaSetup.bankId, amount: 500, label: "Dépôt espèces" }, { "Idempotency-Key": key }),
      ali.api("/treasury/transfers", "POST", { fromAccountId: hadikaSetup.cashId, toAccountId: hadikaSetup.bankId, amount: 500, label: "Dépôt espèces" }, { "Idempotency-Key": key }),
    ]);
    step("Ali: deposits cash at the bank once, even on retry", [t1.status, t2.status].includes(201) && [t1.status, t2.status].every((s) => [200, 201, 409].includes(s)), `${t1.status}/${t2.status}`);
    const overdraw = await ali.api("/treasury/transfers", "POST", { fromAccountId: hadikaSetup.cashId, toAccountId: hadikaSetup.bankId, amount: 5000 });
    step("Ali: cannot take more cash than the cash box holds", overdraw.status === 409 && overdraw.json?.code === "INSUFFICIENT_CASH");

    // Expense workflow
    const invoice = await ali.upload("facture-ascenseur.pdf", "application/pdf", PDF);
    const expense = await ali.api("/expenses", "POST", { label: "Maintenance ascenseur octobre", category: "ascenseur", amount: 350, supplierName: "Ascenseurs Maroc", invoiceNumber: "F-2026-118", proofUrl: invoice }, { "Idempotency-Key": `exp-${RUN}` });
    const expenseRetry = await ali.api("/expenses", "POST", { label: "Maintenance ascenseur octobre", category: "ascenseur", amount: 350, supplierName: "Ascenseurs Maroc", invoiceNumber: "F-2026-118", proofUrl: invoice }, { "Idempotency-Key": `exp-${RUN}` });
    step("Ali: records a supplier invoice (retry does not duplicate it)", expense.status === 201 && expenseRetry.status === 200 && expenseRetry.json?.data?.id === expense.json?.data?.id);
    const expenseId = expense.json?.data?.id;
    const earlyPay = await ali.api(`/expenses/${expenseId}/pay`, "POST", { paymentMethod: "virement", paymentReference: "VIR-OUT-1" });
    step("Ali: an expense cannot be paid before approval", earlyPay.status === 409);
    await ali.api(`/expenses/${expenseId}/approve`, "POST");
    const [e1, e2] = await Promise.all([
      ali.api(`/expenses/${expenseId}/pay`, "POST", { paymentMethod: "virement", paymentReference: "VIR-OUT-1" }),
      ali.api(`/expenses/${expenseId}/pay`, "POST", { paymentMethod: "virement", paymentReference: "VIR-OUT-1" }),
    ]);
    step("Ali: pays the approved expense once (double tap)", [e1.status, e2.status].sort().join() === "200,409", `${e1.status}/${e2.status}`);
    const journal = await ali.api("/treasury/journal");
    step("Ali: journal shows receipts, transfer and expense", (journal.json?.data ?? []).length === 4 && journal.json?.totals?.inflow === "1000.00" && journal.json?.totals?.outflow === "850.00", JSON.stringify(journal.json?.totals));

    // Bank reconciliation
    const lines = [
      { valueDate: new Date().toISOString().slice(0, 10), amount: 500, label: "VERSEMENT ESPECES" },
      { valueDate: new Date().toISOString().slice(0, 10), amount: -350, label: "VIR ASCENSEURS MAROC", reference: "VIR-OUT-1" },
      { valueDate: new Date().toISOString().slice(0, 10), amount: -12, label: "FRAIS TENUE DE COMPTE" },
    ];
    const imp = await ali.api(`/treasury/accounts/${hadikaSetup.bankId}/statement-lines`, "POST", { lines });
    const reimp = await ali.api(`/treasury/accounts/${hadikaSetup.bankId}/statement-lines`, "POST", { lines });
    step("Ali: imports the bank statement; re-importing adds nothing", imp.json?.data?.inserted === 3 && reimp.json?.data?.inserted === 0 && reimp.json?.data?.duplicates === 3);
    const stmt = (await ali.api(`/treasury/accounts/${hadikaSetup.bankId}/statement-lines`)).json?.data ?? [];
    const lineOut = stmt.find((l: any) => l.amount === "-350.00");
    const cands = await ali.api(`/treasury/statement-lines/${lineOut.id}/candidates`);
    const candidate = (cands.json?.data ?? [])[0];
    step("Ali: the expense payment is suggested for the -350 line", candidate?.amount === "350.00");
    const m1 = await ali.api("/treasury/reconciliation/matches", "POST", { statementLineId: lineOut.id, ledgerEntryId: candidate.id });
    const m2 = await ali.api("/treasury/reconciliation/matches", "POST", { statementLineId: lineOut.id, ledgerEntryId: candidate.id });
    step("Ali: reconciles it once", m1.status === 201 && m2.status === 409);
    const feeLine = stmt.find((l: any) => l.amount === "-12.00");
    await ali.api("/treasury/entries", "POST", { accountId: hadikaSetup.bankId, direction: "out", amount: 12, category: "frais_bancaires", label: "Frais de tenue de compte" });
    const flagged = await ali.api(`/treasury/statement-lines/${feeLine.id}/status`, "POST", { status: "anomaly" });
    step("Ali: an anomaly must be described", flagged.status === 400);
    const recon = await ali.api(`/treasury/accounts/${hadikaSetup.bankId}/reconciliation`);
    step("Ali: reconciliation view lists what is left to match", recon.status === 200 && recon.json?.data?.lines?.matched === 1 && recon.json?.data?.lines?.unmatched === 2);

    // Reversals: corrections are new entries, never deletions
    const cashReversal = await ali.api(`/treasury/entries/${kVal.json?.ledgerEntry?.id}/reverse`, "POST", { reason: "Espèces non remises" });
    step(
      "Ali: reversing a cash receipt already deposited at the bank is refused (cash box would go negative)",
      cashReversal.status === 409 && cashReversal.json?.code === "INSUFFICIENT_CASH",
      `status=${cashReversal.status} code=${cashReversal.json?.code}`,
    );
    const feeEntry = ((await ali.api("/treasury/journal?category=frais_bancaires")).json?.data ?? [])[0];
    const rev1 = await ali.api(`/treasury/entries/${feeEntry?.id}/reverse`, "POST", { reason: "Frais remboursés par la banque" });
    const rev2 = await ali.api(`/treasury/entries/${feeEntry?.id}/reverse`, "POST", { reason: "Frais remboursés par la banque" });
    step("Ali: reverses a wrong entry once; the original stays in the journal", rev1.status === 200 && rev2.status === 409 && rev2.json?.code === "ALREADY_REVERSED", `${rev1.status}/${rev2.status}`);
    const tamper = await pool.unsafe(`UPDATE ledger_entries SET amount = 1 WHERE id = '${feeEntry?.id}'`).then(() => "updated", (e: any) => String(e?.message ?? e));
    step("DB: the journal refuses in-place edits (append-only trigger)", tamper.includes("append-only"), tamper.slice(0, 80));

    // ═══ 3. Isolation between the two residences ═════════════════════════
    const aliOnHayat = [
      ["validate a Hayat payment", await ali.api(`/appels-de-fonds/${myCall.id}/validate`, "PUT", { approve: true })],
      ["read a Hayat payment history", await ali.api(`/appels-de-fonds/${myCall.id}/payments`)],
      ["cancel a Hayat call", await ali.api(`/appels-de-fonds/${myCall.id}/cancel`, "POST", { reason: "test test" })],
      ["open Hayat's bank account", await ali.api(`/treasury/accounts/${hayatSetup.bankId}`)],
      ["read Hayat's journal", await ali.api(`/treasury/journal?accountId=${hayatSetup.bankId}`)],
      ["reverse a Hayat journal entry", await ali.api(`/treasury/entries/${entry1.id}/reverse`, "POST", { reason: "attaque" })],
      ["post on Hayat's account", await ali.api("/treasury/entries", "POST", { accountId: hayatSetup.bankId, direction: "out", amount: 1, category: "frais_bancaires", label: "Frais pirates" })],
      ["open Ahmed's document", await ali.api(`/documents/${docId}`)],
      ["open Ahmed's ticket", await ali.api(`/support/${ticketId}`)],
      ["open a Hayat lot", await ali.api(`/lots/${hayatSetup.lotIds[0]}`)],
      ["open Hayat's building dashboard", await ali.api(`/finance/building/${hayatSetup.buildingId}`)],
      ["read Ahmed's receipt", await ali.api(`/appels-de-fonds/${myCall.id}/receipt`)],
    ] as const;
    for (const [what, r] of aliOnHayat) {
      // 403/404 = refused; the journal filter simply returns nothing from Hayat.
      const denied = r.status === 403 || r.status === 404 || (what === "read Hayat's journal" && r.status === 200 && (r.json?.data ?? []).length === 0);
      step(`Isolation: Ali cannot ${what}`, denied, `status=${r.status}`);
    }
    const forged = await ali.api("/expenses", "POST", { label: "Dépense pirate", category: "autre", amount: 10, supplierName: "Fournisseur", proofUrl: invoice, buildingId: hayatSetup.buildingId });
    step("Isolation: Ali cannot attach an expense to a Hayat building", forged.status === 400 && forged.json?.code === "FOREIGN_REFERENCE");
    const forgedSid = await ali.api("/treasury/accounts", "POST", { kind: "cash", label: "Pirate", syndicateId: hayat.syndicateId });
    step("Isolation: a forged syndicateId is rejected", forgedSid.status === 400);
    const ahmedOnHadika = [
      ["declare a payment on Karim's call", await ahmed.api(`/appels-de-fonds/${karimCall.id}/pay`, "PUT", { paymentMethod: "virement", proofUrl: proof1 })],
      ["read Karim's payment history", await ahmed.api(`/appels-de-fonds/${karimCall.id}/payments`)],
      ["open Karim's receipt", await ahmed.api(`/appels-de-fonds/${karimCall.id}/receipt`)],
      ["open Karim's proof", await ahmed.api(`/storage${kProof2}`)],
      ["open a Hadika lot", await ahmed.api(`/lots/${hadikaSetup.lotIds[0]}`)],
      ["open Hadika's treasury", await ahmed.api("/treasury/accounts")],
      ["read Hadika's expenses", await ahmed.api(`/expenses/${expenseId}`)],
    ] as const;
    for (const [what, r] of ahmedOnHadika) {
      step(`Isolation: Ahmed cannot ${what}`, r.status === 403 || r.status === 404, `status=${r.status}`);
    }
    const ahmedCharges = await ahmed.api("/appels-de-fonds");
    step("Isolation: Ahmed's lists never contain Hadika data", !JSON.stringify(ahmedCharges.json).includes(karimCall.id));
    step("Residents have no access to the treasury", (await ahmed.api("/treasury/summary")).status === 403);

    if (KEEP) {
      credentials.push(
        `Samira (syndic Hayat)   ${emails.samira}  /  ${samira.password}`,
        `Ahmed  (A-12, Hayat)    ${emails.ahmed}  /  ${ahmed.password}`,
        `Leila  (A-14, Hayat)    ${emails.leila}  /  ${leila.password}`,
        `Ali    (syndic Hadika)  ${emails.ali}  /  ${ali.password}`,
        `Karim  (H-3, Hadika)    ${emails.karim}  /  ${karim.password}`,
      );
    }
  } finally {
    if (!KEEP) await purgeSyndicates(createdSyndicates, Object.values(emails));
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} journey steps passed`);
  if (credentials.length) console.log("\nFixtures kept (KEEP_FIXTURES=1):\n  " + credentials.join("\n  "));
  if (failed.length) process.exitCode = 1;
}

/** Removes everything the suite created (journal purge needs a maintenance session). */
async function purgeSyndicates(ids: string[], emails: string[]) {
  const sids = ids.filter(Boolean);
  const objects = sids.length
    ? await db.select({ objectPath: storageObjectsTable.objectPath }).from(storageObjectsTable).where(inArray(storageObjectsTable.syndicateId, sids))
    : [];
  if (sids.length) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL mizan.ledger_maintenance = 'on'`);
      const list = sql.join(sids.map((s) => sql`${s}`), sql`, `);
      for (const table of [
        "reconciliation_matches",
        "bank_statement_lines",
      ]) {
        await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE syndicate_id IN (${list})`);
      }
      await tx.execute(sql`DELETE FROM transactions WHERE syndicate_id IN (${list})`);
      await tx.execute(sql`DELETE FROM appel_payments WHERE syndicate_id IN (${list})`);
      await tx.execute(sql`DELETE FROM expenses WHERE syndicate_id IN (${list})`);
      await tx.execute(sql`DELETE FROM ledger_entries WHERE syndicate_id IN (${list})`);
      await tx.execute(sql`DELETE FROM treasury_accounts WHERE syndicate_id IN (${list})`);
      for (const table of ["subscription_payments", "billing_invoices", "syndicate_subscriptions", "cotisations", "audit_logs", "alerts", "email_logs", "documents", "support_tickets"]) {
        await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE syndicate_id IN (${list})`);
      }
      await tx.execute(sql`DELETE FROM appels_de_fonds WHERE building_id IN (SELECT id FROM buildings WHERE syndicate_id IN (${list}))`);
      await tx.execute(sql`DELETE FROM document_sequences WHERE syndicate_id IN (${list})`);
      await tx.delete(storageObjectsTable).where(inArray(storageObjectsTable.syndicateId, sids));
      await tx.delete(usersTable).where(inArray(usersTable.syndicateId, sids));
      await tx.delete(syndicatesTable).where(inArray(syndicatesTable.id, sids));
    });
  }
  await db.delete(usersTable).where(inArray(usersTable.email, emails));
  await db.delete(otpTokensTable).where(inArray(otpTokensTable.email, emails));
  await db.execute(sql`DELETE FROM otp_tokens WHERE email LIKE ${"+2126" + "%" + String(RUN).slice(-6)}`);
  for (const o of objects) await fs.unlink(path.join(UPLOADS_DIR, path.basename(o.objectPath))).catch(() => {});
}

main()
  .catch((err) => {
    console.error("Journey suite failed to run:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
