/**
 * Real-world multi-user scenarios, end to end through the HTTP API.
 *
 * Usage (API must be running):
 *   API_BASE_URL=http://localhost:5000/api pnpm --filter @workspace/scripts run scenario-e2e:test
 *
 * Scenario 1 — Charges: treasurer generates charge calls → co-owner is
 *   notified and sees their charge → uploads a proof and declares payment →
 *   team is notified → treasurer validates → co-owner sees "paid" + receipt,
 *   gets a personal notification and downloads the receipt PDF. Neighbours and
 *   other syndicates see none of it.
 * Scenario 2 — Ticket: resident opens a ticket → team is notified → another
 *   resident cannot read it → admin replies → resident is notified and sees the
 *   reply → admin resolves → resident is notified, status is final.
 *
 * Users are the seeded fixtures (pnpm db:seed). Everything created is removed
 * and every mutated row restored in `finally`.
 */
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import {
  alertsTable,
  appelPaymentsTable,
  appelsDeFondsTable,
  auditLogsTable,
  ledgerEntriesTable,
  documentsTable,
  emailLogsTable,
  lotsTable,
  membersTable,
  storageObjectsTable,
  supportTicketsTable,
  transactionsTable,
  usersTable,
} from "@workspace/db/schema";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");
const UPLOADS_DIR = path.resolve(
  process.env.LOCAL_UPLOADS_DIR ?? path.join(import.meta.dirname, "../../artifacts/api-server/uploads"),
);
const PERIOD = "2099-03";
const BUDGET = "budget_atlas_2026";
const NEW_OWNER_EMAIL = `salma.test.${Date.now()}@example.invalid`;

type User = typeof usersTable.$inferSelect;
const results: { name: string; pass: boolean; detail: string }[] = [];
function step(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function tokenFor(u: User): string {
  return jwt.sign(
    { userId: u.id, email: u.email, role: u.role, syndicateId: u.syndicateId ?? undefined, name: u.name },
    JWT_SECRET!,
    { expiresIn: "15m" },
  );
}
async function user(id: string): Promise<User> {
  const [row] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!row) throw new Error(`Fixture user ${id} missing — run pnpm db:seed`);
  return row;
}
async function api(u: User | null, p: string, method = "GET", body?: unknown) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: {
      ...(u ? { Authorization: `Bearer ${tokenFor(u)}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = res.headers.get("content-type") ?? "";
  const json: any = type.includes("json") ? await res.json().catch(() => null) : (await res.arrayBuffer(), null);
  return { status: res.status, json, type };
}
/** Notifications are dispatched asynchronously — poll the notification center. */
async function waitForAlert(u: User, titlePart: string, tries = 20): Promise<any | null> {
  for (let i = 0; i < tries; i++) {
    const r = await api(u, "/alerts?limit=100");
    const hit = (r.json?.data ?? []).find((a: any) => String(a.title).includes(titlePart) || String(a.message).includes(titlePart));
    if (hit) return hit;
    await sleep(250);
  }
  return null;
}
async function alertsOf(u: User): Promise<any[]> {
  return (await api(u, "/alerts?limit=200")).json?.data ?? [];
}

async function main() {
  const treasurer = await user("user_treasurer_atlas");
  const admin = await user("user_admin_atlas");
  const mohammed = await user("user_member_1"); // owns lots in building_atlas_a
  const khadija = await user("user_member_2"); // neighbour, same syndicate
  const agdalAdmin = await user("user_admin_agdal");
  const startedAt = new Date();
  const createdObjects: string[] = [];
  let ticketId: string | null = null;
  let receipt: string | null = null;
  let newMemberId: string | null = null;
  let newUserId: string | null = null;
  let newLotId: string | null = null;
  let personalDocId: string | null = null;

  try {
    // ═══ Scenario 1 — Charges, from generation to receipt ════════════════
    const gen = await api(treasurer, `/budgets/${BUDGET}/generate-appels`, "POST", { period: PERIOD });
    step("treasurer generates the monthly charge calls", gen.status === 201, `status=${gen.status} count=${gen.json?.count}`);

    const mine = await api(mohammed, `/appels-de-fonds?period=${PERIOD}`);
    const myAppels: any[] = mine.json?.data ?? [];
    step("co-owner sees only their own new charges", mine.status === 200 && myAppels.length > 0, `own=${myAppels.length}`);
    const appel = myAppels[0];

    const neighbour = await api(khadija, `/appels-de-fonds?period=${PERIOD}`);
    const leaked = (neighbour.json?.data ?? []).some((a: any) => a.id === appel?.id);
    step("neighbour does not see the co-owner's charge", !leaked);

    step("co-owner is notified of the new charge", !!(await waitForAlert(mohammed, "Nouvel appel de fonds")));

    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "virement.png");
    const up = await fetch(`${BASE}/storage/uploads`, { method: "POST", headers: { Authorization: `Bearer ${tokenFor(mohammed)}` }, body: form });
    const upJson: any = await up.json();
    if (upJson?.objectPath) createdObjects.push(upJson.objectPath);
    step("co-owner uploads the transfer proof", up.status === 200 && !!upJson?.objectPath);

    const pay = await api(mohammed, `/appels-de-fonds/${appel.id}/pay`, "PUT", { paymentMethod: "virement", proofUrl: upJson.objectPath });
    step("co-owner declares the payment", pay.status === 200 && pay.json?.data?.status === "pending_validation", `status=${pay.status}`);

    step("treasurer is notified that a payment awaits validation", !!(await waitForAlert(treasurer, "Paiement à valider")));
    const khadijaAlerts = await alertsOf(khadija);
    step("residents do not receive team-only alerts", !khadijaAlerts.some((a) => a.title === "Paiement à valider"));

    const queue = await api(treasurer, `/appels-de-fonds?status=pending_validation`);
    step("payment appears in the treasurer's validation queue", (queue.json?.data ?? []).some((a: any) => a.id === appel.id));

    const proof = await api(treasurer, `/storage${upJson.objectPath}`);
    step("treasurer can open the proof", proof.status === 200);
    const foreignProof = await api(agdalAdmin, `/storage${upJson.objectPath}`);
    step("other syndicate cannot open the proof", foreignProof.status === 403);

    const [v1, v2] = await Promise.all([
      api(treasurer, `/appels-de-fonds/${appel.id}/validate`, "PUT", { approve: true }),
      api(treasurer, `/appels-de-fonds/${appel.id}/validate`, "PUT", { approve: true }), // double click
    ]);
    step("double-click on 'validate' is processed once", [v1.status, v2.status].sort().join() === "200,409", `${v1.status}/${v2.status}`);

    const after = await api(mohammed, `/appels-de-fonds?period=${PERIOD}`);
    const paid = (after.json?.data ?? []).find((a: any) => a.id === appel.id);
    receipt = paid?.receiptNumber ?? null;
    step("co-owner sees the charge as paid with a receipt number", paid?.status === "paid" && /^REC-\d{4}-\d{6}$/.test(receipt ?? ""), `receipt=${receipt}`);

    const validated = await waitForAlert(mohammed, "Paiement validé");
    step("co-owner gets a personal 'payment validated' notification", !!validated && String(validated.message).includes(receipt ?? "?"));
    const khadijaAfter = await alertsOf(khadija);
    step("neighbour never sees the co-owner's personal notification", !khadijaAfter.some((a) => a.id === validated?.id));

    const ticketRes = await api(mohammed, "/auth/file-ticket", "POST");
    const pdf = await fetch(`${BASE}/appels-de-fonds/${appel.id}/receipt?token=${encodeURIComponent(ticketRes.json?.data?.ticket)}`);
    await pdf.arrayBuffer();
    step("co-owner downloads the receipt PDF", pdf.status === 200 && (pdf.headers.get("content-type") ?? "").includes("pdf"), `status=${pdf.status}`);

    const foreignRead = await api(agdalAdmin, `/appels-de-fonds/${appel.id}/receipt`);
    step("other syndicate cannot download the receipt", foreignRead.status === 403 || foreignRead.status === 404, `status=${foreignRead.status}`);

    // ═══ Scenario 2 — Support ticket conversation ═══════════════════════
    const open = await api(mohammed, "/support", "POST", { title: "Fuite dans le parking", description: "Une fuite d'eau au niveau -1, place 12.", priority: "high", category: "maintenance" });
    ticketId = open.json?.data?.id ?? null;
    step("resident opens a ticket", open.status === 201 && !!ticketId, `status=${open.status}`);
    step("syndicate admin is notified of the new ticket", !!(await waitForAlert(admin, "Fuite dans le parking")));
    step("other residents are not notified of it", !(await alertsOf(khadija)).some((a) => String(a.message).includes("Fuite dans le parking")));

    const peek = await api(khadija, `/support/${ticketId}`);
    step("another resident cannot read the ticket", peek.status === 403 || peek.status === 404, `status=${peek.status}`);
    const foreignPeek = await api(agdalAdmin, `/support/${ticketId}`);
    step("other syndicate cannot read the ticket", foreignPeek.status === 403 || foreignPeek.status === 404, `status=${foreignPeek.status}`);

    const reply = await api(admin, `/support/${ticketId}/replies`, "POST", { text: "Le plombier passe demain à 9h." });
    step("admin replies", reply.status === 201);
    step("resident is notified of the reply", !!(await waitForAlert(mohammed, "Réponse à votre ticket")));
    const thread = await api(mohammed, `/support/${ticketId}`);
    step("resident sees the reply and the in-progress status", (thread.json?.data?.replies ?? []).some((r: any) => r.text.includes("plombier")) && thread.json?.data?.status === "in_progress", `status=${thread.json?.data?.status}`);

    const resolve = await api(admin, `/support/${ticketId}/resolve`, "PUT");
    step("admin resolves the ticket", resolve.status === 200);
    step("resident is notified of the resolution", !!(await waitForAlert(mohammed, "Ticket résolu")));
    const final = await api(mohammed, `/support/${ticketId}`);
    step("resident sees the final status", final.json?.data?.status === "resolved");
    const memberResolve = await api(khadija, `/support/${ticketId}/resolve`, "PUT");
    step("a resident cannot change the ticket status", memberResolve.status === 403);

    // ═══ Scenario 3 — Syndic onboards a new co-owner ═════════════════════
    const add = await api(admin, "/members", "POST", { name: "Salma Berrada", email: NEW_OWNER_EMAIL, phone: "0612345678", inviteToApp: true });
    newMemberId = add.json?.data?.id ?? null;
    step("syndic adds a co-owner and invites them to the app", add.status === 201 && add.json?.invited === true, `status=${add.status}`);
    const [account] = await db.select().from(usersTable).where(eq(usersTable.email, NEW_OWNER_EMAIL));
    newUserId = account?.id ?? null;
    step(
      "a login account is created in the same syndicate, with a mandatory password change",
      account?.role === "member" && account?.syndicateId === admin.syndicateId && account?.mustChangePassword === true,
    );
    const dup = await api(admin, "/members", "POST", { name: "Salma Berrada", email: NEW_OWNER_EMAIL.toUpperCase(), inviteToApp: true });
    step("adding the same person twice is refused", dup.status === 409, `status=${dup.status}`);

    // The emailed temporary password is not readable here (email is only
    // logged in tests): simulate the co-owner receiving it.
    await db.update(usersTable).set({ passwordHash: await bcrypt.hash("Temp-From-Email-1", 10) }).where(eq(usersTable.id, account.id));
    const firstLogin = await api(null, "/auth/login", "POST", { email: NEW_OWNER_EMAIL, password: "Temp-From-Email-1" });
    step("co-owner logs in with the emailed credentials", firstLogin.status === 200 && firstLogin.json?.data?.user?.mustChangePassword === true);
    const restricted = await fetch(`${BASE}/appels-de-fonds`, { headers: { Authorization: `Bearer ${firstLogin.json?.data?.token}` } });
    step("app features stay locked until the password is changed", restricted.status === 403);
    const changed = await fetch(`${BASE}/auth/change-password`, {
      method: "POST",
      headers: { Authorization: `Bearer ${firstLogin.json?.data?.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "Temp-From-Email-1", newPassword: "Salma-Own-Pass-9" }),
    });
    step("co-owner sets their own password", changed.status === 200);

    const lot = await api(admin, "/lots", "POST", { number: `T-${Date.now() % 100000}`, buildingId: "building_atlas_a", tantiemes: 10, ownerId: newMemberId });
    newLotId = lot.json?.id ?? lot.json?.data?.id ?? null;
    step("syndic assigns a lot to the new co-owner", (lot.status === 201 || lot.status === 200) && !!newLotId, `status=${lot.status}`);
    const secondLogin = await api(null, "/auth/login", "POST", { email: NEW_OWNER_EMAIL, password: "Salma-Own-Pass-9" });
    const salmaToken = secondLogin.json?.data?.token as string;
    const myLot = await fetch(`${BASE}/lots/my-lot`, { headers: { Authorization: `Bearer ${salmaToken}` } });
    const myLotJson: any = await myLot.json().catch(() => null);
    const lotSeen = JSON.stringify(myLotJson ?? {}).includes(newLotId ?? "none");
    step("co-owner signs in with their password and sees their lot", secondLogin.status === 200 && myLot.status === 200 && lotSeen, `status=${myLot.status}`);

    // ═══ Scenario 4 — Personal document (ownership attestation) ══════════
    const docRes = await api(admin, "/documents", "POST", {
      title: "Attestation de propriété — Mohammed Alaoui",
      category: "attestation",
      templateId: "attestation_propriete",
      lotId: "lot_a101",
    });
    personalDocId = docRes.json?.data?.id ?? null;
    step("syndic generates an attestation for a co-owner's lot", docRes.status === 201 && !!personalDocId, `status=${docRes.status}`);
    const [docRow] = personalDocId ? await db.select().from(documentsTable).where(eq(documentsTable.id, personalDocId)) : [];
    step("the document is recorded as personal to the lot owner", docRow?.subjectUserId === mohammed.id, `subject=${docRow?.subjectUserId}`);
    for (const status of ["validated", "published"]) {
      const t = await api(admin, `/documents/${personalDocId}`, "PUT", { status });
      step(`syndic moves the document to "${status}"`, t.status === 200, `status=${t.status}`);
    }
    const mohammedDocs = await api(mohammed, "/documents");
    const khadijaDocs = await api(khadija, "/documents");
    step("co-owner sees their personal document", (mohammedDocs.json?.data ?? []).some((d: any) => d.id === personalDocId));
    step("neighbour does not see it in the list", !(khadijaDocs.json?.data ?? []).some((d: any) => d.id === personalDocId));
    step("both still see general syndicate documents", (khadijaDocs.json?.data ?? []).some((d: any) => d.id === "doc_1") && (mohammedDocs.json?.data ?? []).some((d: any) => d.id === "doc_1"));
    const direct = await api(khadija, `/documents/${personalDocId}`);
    step("neighbour cannot open it by ID", direct.status === 403, `status=${direct.status}`);
    const versions = await api(khadija, `/documents/${personalDocId}/versions`);
    step("neighbour cannot read its version history", versions.status === 403, `status=${versions.status}`);
    step("co-owner is notified that their document is available", !!(await waitForAlert(mohammed, "Votre document est disponible")));
    step("neighbour gets no notification about it", !(await alertsOf(khadija)).some((a) => String(a.message).includes("Mohammed Alaoui")));
  } finally {
    if (personalDocId) await db.delete(documentsTable).where(eq(documentsTable.id, personalDocId));
    if (newLotId) await db.delete(lotsTable).where(eq(lotsTable.id, newLotId));
    if (newMemberId) await db.delete(membersTable).where(eq(membersTable.id, newMemberId));
    await db.delete(usersTable).where(eq(usersTable.email, NEW_OWNER_EMAIL));
    await db.delete(emailLogsTable).where(gte(emailLogsTable.createdAt, startedAt));
    // Payments of this run's calls, their journal entries and register rows
    // (the journal is append-only: purge through a maintenance session).
    const runAppels = await db.select({ id: appelsDeFondsTable.id }).from(appelsDeFondsTable).where(eq(appelsDeFondsTable.period, PERIOD));
    const runPayments = runAppels.length
      ? await db
          .select({ id: appelPaymentsTable.id, ledgerEntryId: appelPaymentsTable.ledgerEntryId })
          .from(appelPaymentsTable)
          .where(inArray(appelPaymentsTable.appelId, runAppels.map((a) => a.id)))
      : [];
    const entryIds = runPayments.map((p) => p.ledgerEntryId).filter((v): v is string => !!v);
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL mizan.ledger_maintenance = 'on'`);
      if (entryIds.length) await tx.delete(transactionsTable).where(inArray(transactionsTable.ledgerEntryId, entryIds));
      if (runPayments.length) await tx.delete(appelPaymentsTable).where(inArray(appelPaymentsTable.id, runPayments.map((p) => p.id)));
      if (entryIds.length) await tx.delete(ledgerEntriesTable).where(inArray(ledgerEntriesTable.id, entryIds));
    });
    await db.delete(appelsDeFondsTable).where(eq(appelsDeFondsTable.period, PERIOD));
    if (ticketId) await db.delete(supportTicketsTable).where(eq(supportTicketsTable.id, ticketId));
    await db.delete(alertsTable).where(and(eq(alertsTable.syndicateId, "syn_residence_atlas"), gte(alertsTable.createdAt, startedAt)));
    await db.delete(auditLogsTable).where(and(eq(auditLogsTable.syndicateId, "syn_residence_atlas"), gte(auditLogsTable.createdAt, startedAt)));
    if (createdObjects.length) {
      await db.delete(storageObjectsTable).where(inArray(storageObjectsTable.objectPath, createdObjects));
      for (const p of createdObjects) await fs.unlink(path.join(UPLOADS_DIR, path.basename(p))).catch(() => {});
    }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} scenario steps passed`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Scenario suite failed to run:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
