/**
 * Financial workflow, end to end — real HTTP API against PostgreSQL.
 *
 * A dedicated condominium (company, building, two lots, co-owners, syndic,
 * treasurer, president) is created in the database, then everything else goes
 * through the API: payments declared / rejected / validated / refunded,
 * partial payments and rounding, other income, expenses (draft → paid), a
 * duplicated payment confirmation, bank statements and their reconciliation,
 * and finally the same figures read from every financial screen.
 * Everything is removed at the end.
 *
 * Usage (API running, SMTP disabled):
 *   API_BASE_URL=http://localhost:5055/api pnpm --filter @workspace/scripts run finance-workflow:test
 */
import jwt from "jsonwebtoken";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import {
  appelPaymentsTable,
  appelsDeFondsTable,
  auditLogsTable,
  billingInvoicesTable,
  buildingsTable,
  expensesTable,
  ledgerEntriesTable,
  lotOwnershipsTable,
  lotsTable,
  membersTable,
  organizationMembersTable,
  organizationsTable,
  storageObjectsTable,
  subscriptionPaymentsTable,
  syndicateSubscriptionsTable,
  syndicatesTable,
  transactionsTable,
  usersTable,
} from "@workspace/db/schema";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");
const RUN = Date.now();
const SID = `syn_fw_${RUN}`;
const ORG = `org_fw_${RUN}`;
const BLD = `bld_fw_${RUN}`;

type U = typeof usersTable.$inferSelect;
const results: { name: string; pass: boolean; detail: string }[] = [];
function step(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const tokenFor = (u: U) =>
  jwt.sign({ userId: u.id, email: u.email, role: u.role, syndicateId: u.syndicateId ?? undefined, name: u.name }, JWT_SECRET!, { expiresIn: "15m" });
async function api(u: U, p: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { Authorization: `Bearer ${tokenFor(u)}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => null);
  return { status: res.status, json };
}
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const TODAY = isoDay(new Date());
const YEAR_START = `${TODAY.slice(0, 4)}-01-01`;
const tenDaysAgo = isoDay(new Date(Date.now() - 10 * 86_400_000));
const D0 = tenDaysAgo < YEAR_START ? YEAR_START : tenDaysAgo; // account opening date
const YESTERDAY = isoDay(new Date(Date.now() - 86_400_000));
const TOMORROW = isoDay(new Date(Date.now() + 86_400_000));

/** A valid Moroccan RIB: 22 digits + key so that the number is divisible by 97. */
function rib(seed: number): string {
  const body = `0117800000${String(seed).padStart(12, "0")}`.slice(0, 22);
  const key = (97n - ((BigInt(body) * 100n) % 97n)) % 97n;
  return body + String(key).padStart(2, "0");
}
const mad = (m: { currency: string; amount: string }[] | undefined) => m?.find((x) => x.currency === "MAD")?.amount ?? "0.00";

async function fixture() {
  await db.insert(organizationsTable).values({ id: ORG, name: `Syndic Test FW ${RUN}` });
  await db.insert(syndicatesTable).values({ id: SID, name: `Résidence Finance ${RUN}`, status: "active", organizationId: ORG, currency: "MAD" } as any);
  await db.insert(syndicateSubscriptionsTable).values({ syndicateId: SID, status: "trial", trialStartDate: new Date(), trialEndDate: new Date(Date.now() + 30 * 86_400_000), autoRenew: false } as any);
  const mk = (id: string, name: string, role: string) => ({ id: `${id}_${RUN}`, name, email: `${id}-${RUN}@example.invalid`, passwordHash: "x", role, status: "active", syndicateId: SID });
  const users = await db
    .insert(usersTable)
    .values([
      mk("fw_admin", "Salma Syndic", "syndicate_admin"),
      mk("fw_treasurer", "Tarik Trésorier", "treasurer"),
      mk("fw_president", "Pauline Présidente", "president"),
      mk("fw_owner", "Omar Copropriétaire", "member"),
      mk("fw_owner2", "Ines Copropriétaire", "member"),
    ] as any)
    .returning();
  const [A, T, P, O, O2] = users;
  await db.insert(organizationMembersTable).values({ organizationId: ORG, userId: A.id, role: "org_admin" });
  await db.insert(buildingsTable).values({ id: BLD, name: "Bâtiment FW", address: "1 rue du Test", city: "Rabat", syndicateId: SID } as any);
  const [m1, m2] = await db
    .insert(membersTable)
    .values([
      { name: O.name, email: O.email, syndicateId: SID },
      { name: O2.name, email: O2.email, syndicateId: SID },
    ])
    .returning();
  const [l1, l2] = await db
    .insert(lotsTable)
    .values([
      { number: "FW-1", buildingId: BLD, ownerId: m1.id, type: "appartement", floor: 1, tantiemes: 100, status: "occupied" },
      { number: "FW-2", buildingId: BLD, ownerId: m2.id, type: "appartement", floor: 2, tantiemes: 100, status: "occupied" },
    ] as any)
    .returning();
  await db.insert(lotOwnershipsTable).values([
    { syndicateId: SID, lotId: l1.id, memberId: m1.id, sharePercent: "100", startDate: D0 },
    { syndicateId: SID, lotId: l2.id, memberId: m2.id, sharePercent: "100", startDate: D0 },
  ] as any);
  const calls = await db
    .insert(appelsDeFondsTable)
    .values([
      { buildingId: BLD, lotId: l1.id, ownerId: m1.id, debtorMemberIds: [m1.id], period: "2099-01", amount: "1000.00", dueDate: "2099-01-31", status: "pending" },
      { buildingId: BLD, lotId: l1.id, ownerId: m1.id, debtorMemberIds: [m1.id], period: "2099-02", amount: "99.99", dueDate: "2099-02-28", status: "pending" },
      { buildingId: BLD, lotId: l2.id, ownerId: m2.id, debtorMemberIds: [m2.id], period: "2099-03", amount: "500.00", dueDate: "2020-01-31", status: "overdue" },
    ] as any)
    .returning();
  const proof = `/objects/uploads/fw-${RUN}-owner.pdf`;
  const invoice = `/objects/uploads/fw-${RUN}-invoice.pdf`;
  await db.insert(storageObjectsTable).values([
    { objectPath: proof, ownerId: O.id, syndicateId: SID, contentType: "application/pdf", size: 10 },
    { objectPath: invoice, ownerId: T.id, syndicateId: SID, contentType: "application/pdf", size: 10 },
  ]);
  return { A, T, P, O, O2, C1: calls[0], C2: calls[1], C3: calls[2], proof, invoice };
}

async function purge() {
  const list = sql`${SID}`;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL mizan.ledger_maintenance = 'on'`);
    for (const table of ["reconciliation_matches", "bank_statement_lines", "bank_statements", "transactions", "appel_payments", "expenses", "ledger_entries", "treasury_accounts", "lot_ownerships"]) {
      await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE syndicate_id IN (${list})`);
    }
    for (const table of ["billing_invoices", "subscription_payments", "syndicate_subscriptions", "audit_logs", "alerts", "email_logs", "document_sequences"]) {
      await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE syndicate_id IN (${list})`);
    }
    await tx.execute(sql`DELETE FROM appels_de_fonds WHERE building_id = ${BLD}`);
    await tx.delete(storageObjectsTable).where(eq(storageObjectsTable.syndicateId, SID));
    await tx.execute(sql`DELETE FROM organization_members WHERE organization_id = ${ORG}`);
    await tx.delete(usersTable).where(eq(usersTable.syndicateId, SID));
    await tx.delete(syndicatesTable).where(eq(syndicatesTable.id, SID));
    await tx.delete(organizationsTable).where(eq(organizationsTable.id, ORG));
  });
}

async function main() {
  const atlasAdmin = (await db.select().from(usersTable).where(eq(usersTable.id, "user_admin_atlas")))[0];
  const superAdmin = (await db.select().from(usersTable).where(eq(usersTable.id, "user_super_admin")))[0];
  if (!atlasAdmin || !superAdmin) throw new Error("Seed users missing — run pnpm db:seed");
  const f = await fixture();
  const { A, T, P, O, O2, C1, C2, C3, proof, invoice } = f;
  const overview = async (q = "") => (await api(T, `/treasury/summary${q}`)).json?.data?.overview;
  const call = async (id: string) => (await db.select().from(appelsDeFondsTable).where(eq(appelsDeFondsTable.id, id)))[0];

  try {
    // ═══ 0. Treasury accounts ════════════════════════════════════════════
    const bank = await api(A, "/treasury/accounts", "POST", { kind: "bank", label: "Banque FW", bankName: "Banque Test", rib: rib(RUN % 1e9), openingBalance: "1000.00", openingDate: D0, isDefault: true });
    const cash = await api(A, "/treasury/accounts", "POST", { kind: "cash", label: "Caisse FW", openingDate: D0, isDefault: true });
    const bank2 = await api(A, "/treasury/accounts", "POST", { kind: "bank", label: "Banque FW 2", bankName: "Banque Test", rib: rib((RUN % 1e9) + 7), openingBalance: "500.00", openingDate: D0 });
    const BANK = bank.json?.data?.id;
    const BANK2 = bank2.json?.data?.id;
    step("bank (opening 1000.00), cash box and a second bank account are opened", bank.status === 201 && cash.status === 201 && bank2.status === 201, `${bank.status}/${cash.status}/${bank2.status} ${bank.json?.error ?? ""}`);

    // ═══ 1. Pending is not received; failed does not reduce the balance ═══
    let o0 = await overview();
    step("before any payment: receivables 1599.99, overdue 500.00, no income", o0?.receivables?.amount === "1599.99" && o0?.overdueReceivables?.amount === "500.00" && mad(o0?.income) === "0.00", JSON.stringify({ r: o0?.receivables, i: o0?.income }));
    const d1 = await api(O, `/appels-de-fonds/${C1.id}/pay`, "PUT", { paymentMethod: "virement", amount: "400.00", reference: "VIR-O-1", proofUrl: proof });
    step("co-owner declares a 400.00 transfer on the 1000.00 call", d1.status === 200 && d1.json?.payment?.status === "pending", `status=${d1.status} ${d1.json?.error ?? ""}`);
    step("a second declaration while one is under review is refused", (await api(O, `/appels-de-fonds/${C1.id}/pay`, "PUT", { paymentMethod: "virement", amount: "10", proofUrl: proof })).status === 409);
    o0 = await overview();
    step("pending payment: not income, not deducted from receivables, shown as pending", mad(o0?.income) === "0.00" && o0?.receivables?.amount === "1599.99" && o0?.pendingPayments?.count === 1 && o0?.pendingPayments?.amount === "400.00", JSON.stringify(o0?.pendingPayments));
    step("pending payment: no receipt can be issued", (await api(O, `/appels-de-fonds/${C1.id}/receipt`)).status === 400);
    step("pending payment: nothing in the journal", (await db.select().from(ledgerEntriesTable).where(and(eq(ledgerEntriesTable.syndicateId, SID), eq(ledgerEntriesTable.sourceType, "appel_payment")))).length === 0);
    step("the co-owner cannot validate their own payment", (await api(O, `/appels-de-fonds/${C1.id}/validate`, "PUT", { approve: true })).status === 403);
    const rej = await api(T, `/appels-de-fonds/${C1.id}/validate`, "PUT", { approve: false, rejectionReason: "Virement non reçu" });
    const afterRej = await call(C1.id);
    step("treasurer rejects it (failed): balance untouched, status rejected", rej.status === 200 && afterRej.amountPaid === "0.00" && afterRej.status === "rejected", `${rej.status} ${afterRej.status} ${afterRej.amountPaid}`);
    o0 = await overview();
    step("after the failure: receivables still 1599.99, no income, nothing pending", o0?.receivables?.amount === "1599.99" && mad(o0?.income) === "0.00" && o0?.pendingPayments?.count === 0);

    // ═══ 2. Income: validated payment, idempotent decision ════════════════
    await api(O, `/appels-de-fonds/${C1.id}/pay`, "PUT", { paymentMethod: "virement", amount: "400.00", reference: "VIR-O-2", proofUrl: proof });
    const [v1, v2] = await Promise.all([
      api(T, `/appels-de-fonds/${C1.id}/validate`, "PUT", { approve: true }),
      api(T, `/appels-de-fonds/${C1.id}/validate`, "PUT", { approve: true }),
    ]);
    step("two simultaneous validations: one receipt only", [v1.status, v2.status].sort().join() === "200,409", `${v1.status}/${v2.status}`);
    const okV = v1.status === 200 ? v1 : v2;
    const entry400 = okV.json?.ledgerEntry;
    const c1v = await call(C1.id);
    step("the call is partially paid (400.00), with receipt and journal entry on the bank", c1v.status === "partially_paid" && c1v.amountPaid === "400.00" && /^REC-/.test(c1v.receiptNumber ?? "") && entry400?.accountId === BANK && entry400?.amount === "400.00");
    step("the receipt of the validated payment can be downloaded", (await fetch(`${BASE}/appels-de-fonds/${C1.id}/receipt`, { headers: { Authorization: `Bearer ${tokenFor(O)}` } })).status === 200);
    step("a co-owner cannot declare on someone else's call", (await api(O, `/appels-de-fonds/${C3.id}/pay`, "PUT", { paymentMethod: "virement", proofUrl: proof })).status === 403);
    const tamper = await api(O, `/appels-de-fonds/${C2.id}/pay`, "PUT", { paymentMethod: "virement", amount: "10.00", proofUrl: proof, amountPaid: "99.99", status: "paid" });
    step("a declaration trying to set the paid amount / status is refused", tamper.status === 400, `status=${tamper.status}`);

    // ═══ 3. Partial payments and rounding (99.99 in three parts) ═════════
    step("an amount with three decimals is refused", (await api(O, `/appels-de-fonds/${C2.id}/pay`, "PUT", { paymentMethod: "virement", amount: "33.333", proofUrl: proof })).status === 400);
    const c2Entries: string[] = [];
    const c2Receipts: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const body: Record<string, string> = { paymentMethod: "virement", reference: `R${i}`, proofUrl: proof };
      if (i < 3) body.amount = "33.33"; // the last one defaults to the remaining balance
      if (i === 2) {
        // Over the balance: 33.33 already validated, 66.67 > 66.66 remaining.
        const over = await api(O, `/appels-de-fonds/${C2.id}/pay`, "PUT", { paymentMethod: "virement", amount: "66.67", proofUrl: proof });
        step("a declaration above the remaining balance is refused (66.67 > 66.66)", over.status === 400 && over.json?.code === "AMOUNT_EXCEEDS_BALANCE", `status=${over.status} ${over.json?.code}`);
      }
      const decl = await api(O, `/appels-de-fonds/${C2.id}/pay`, "PUT", body);
      const val = await api(T, `/appels-de-fonds/${C2.id}/validate`, "PUT", { approve: true });
      if (val.json?.ledgerEntry?.id) c2Entries.push(val.json.ledgerEntry.id);
      if (val.json?.payment?.receiptNumber) c2Receipts.push(val.json.payment.receiptNumber);
      if (decl.status !== 200 || val.status !== 200) step(`partial payment ${i}`, false, `${decl.status} ${decl.json?.error ?? ""} / ${val.status} ${val.json?.error ?? ""}`);
    }
    const c2v = await call(C2.id);
    const c2Sum = (await db.execute(sql`SELECT COALESCE(SUM(amount), 0)::text AS s FROM ledger_entries WHERE source_type = 'appel_payment' AND source_id IN (SELECT id FROM appel_payments WHERE appel_id = ${C2.id})`)) as unknown as { s: string }[];
    step("three partial payments settle 99.99 exactly (status paid, three receipts)", c2v.status === "paid" && c2v.amountPaid === "99.99" && new Set(c2Receipts).size === 3 && c2Sum[0]?.s === "99.99", `${c2v.status} ${c2v.amountPaid} ${c2Sum[0]?.s} ${c2Receipts.join(",")}`);
    step("a settled call accepts no further payment", (await api(O, `/appels-de-fonds/${C2.id}/pay`, "PUT", { paymentMethod: "virement", amount: "0.01", proofUrl: proof })).status === 409);

    // ═══ 4. Other income and closed parallel paths ═══════════════════════
    const recette = await api(T, "/finance/transactions", "POST", { type: "recette", amount: 100, label: "Location salle commune", date: TODAY, status: "paid", accountId: BANK });
    step("other income (recette) is recorded and posted to the journal", recette.status === 201 && !!recette.json?.data?.ledgerEntryId, `status=${recette.status} ${recette.json?.error ?? ""}`);
    const regCot = await api(T, "/finance/transactions", "POST", { type: "cotisation", amount: 50, label: "x", date: TODAY, status: "paid" });
    step("a co-owner payment cannot bypass the call for funds", regCot.status === 409 && regCot.json?.code === "USE_CALL_FOR_FUNDS");
    const regDep = await api(T, "/finance/transactions", "POST", { type: "depense", amount: 50, label: "x", date: TODAY, proofUrl: invoice });
    step("an expense cannot bypass the approval workflow (register)", regDep.status === 409 && regDep.json?.code === "USE_EXPENSES");
    step("a 'pending' register item is refused (receivables are calls for funds)", (await api(T, "/finance/transactions", "POST", { type: "recette", amount: 50, label: "x", date: TODAY, status: "pending" })).json?.code === "NOT_A_MOVEMENT");
    const manualSupplier = await api(T, "/treasury/entries", "POST", { accountId: BANK, direction: "out", amount: 80, category: "entretien", label: "Plombier", proofUrl: invoice });
    step("a supplier cannot be paid by a manual journal entry", manualSupplier.status === 409 && manualSupplier.json?.code === "USE_EXPENSES");
    step("a posted register row cannot be switched back to pending", (await api(T, `/finance/transactions/${recette.json?.data?.id}/status`, "PATCH", { status: "pending" })).json?.code === "LEDGER_POSTED");

    // ═══ 5. Duplicate payment confirmation (subscription provider callback) ═
    const checkout = await api(A, "/subscriptions", "POST", { planId: "plan_basic", paymentMethod: "bank_transfer", idempotencyKey: `fw-sub-${RUN}` });
    const payId = checkout.json?.data?.id;
    step("a subscription payment is initialised (pending, not active)", [200, 201].includes(checkout.status) && checkout.json?.data?.status === "pending", `status=${checkout.status} ${checkout.json?.error ?? ""}`);
    const confirmUrl = `/subscriptions/payments/${payId}/confirm?supervision=true&syndicateId=${SID}`;
    const [k1, k2] = await Promise.all([
      api(superAdmin, confirmUrl, "POST", { providerReference: `BANK-${RUN}` }),
      api(superAdmin, confirmUrl, "POST", { providerReference: `BANK-${RUN}` }),
    ]);
    const k3 = await api(superAdmin, confirmUrl, "POST", { providerReference: `BANK-${RUN}` });
    const dups = [k1, k2, k3].map((k) => k.json?.data?.duplicate);
    const invoices = await db.select().from(billingInvoicesTable).where(eq(billingInvoicesTable.paymentId, payId));
    step(
      "the same confirmation received three times (two at once): one success, two replays, one invoice",
      [k1, k2, k3].every((k) => k.status === 200) && dups.filter((d) => d === false).length === 1 && dups.filter((d) => d === true).length === 2 && invoices.length === 1,
      `${k1.status}/${k2.status}/${k3.status} dup=${dups.join(",")} invoices=${invoices.length}`,
    );

    // ═══ 6. Refund and reversal ═════════════════════════════════════════
    const refund = await api(T, `/treasury/entries/${entry400?.id}/reverse`, "POST", { reason: "Chèque revenu impayé", kind: "refund" });
    const c1r = await call(C1.id);
    step("the 400.00 payment is refunded: the call is open again, its receipt withdrawn", refund.status === 200 && c1r.amountPaid === "0.00" && c1r.status === "pending" && c1r.receiptNumber === null, `${refund.status} ${c1r.status} ${c1r.amountPaid} ${c1r.receiptNumber}`);
    step("the refund is a new journal entry (out 400.00), nothing is deleted", refund.json?.data?.[0]?.direction === "out" && refund.json?.data?.[0]?.amount === "400.00" && /^Remboursement/.test(refund.json?.data?.[0]?.label ?? ""));
    step("an entry cannot be reversed twice", (await api(T, `/treasury/entries/${entry400?.id}/reverse`, "POST", { reason: "encore" })).status === 409);
    step("a reversal cannot be reversed", (await api(T, `/treasury/entries/${refund.json?.data?.[0]?.id}/reverse`, "POST", { reason: "annuler l'annulation" })).status === 409);
    const [refundedPayment] = await db.select().from(appelPaymentsTable).where(eq(appelPaymentsTable.ledgerEntryId, entry400?.id));
    const [regRow] = await db.select().from(transactionsTable).where(eq(transactionsTable.ledgerEntryId, entry400?.id));
    step("payment marked reversed, register row cancelled", refundedPayment?.status === "reversed" && regRow?.status === "cancelled");
    step("no receipt for the refunded payment", (await api(O, `/appels-de-fonds/${C1.id}/receipt?paymentId=${refundedPayment?.id}`)).status !== 200);
    const rev3 = await api(T, `/treasury/entries/${c2Entries[2]}/reverse`, "POST", { reason: "Virement rejeté par la banque" });
    const c2r = await call(C2.id);
    step("reversing the last of three partial payments: 66.66 paid, the call shows the previous receipt", rev3.status === 200 && c2r.amountPaid === "66.66" && c2r.status === "partially_paid" && c2r.receiptNumber === c2Receipts[1], `${c2r.status} ${c2r.amountPaid} ${c2r.receiptNumber}`);

    // ═══ 7. Expenses: draft → submitted → approved → paid ═════════════════
    const draft = await api(T, "/expenses", "POST", { label: "Maintenance ascenseur", category: "ascenseur", amount: "250.00", supplierName: "Ascenseurs Test", invoiceNumber: `F-${RUN}`, proofUrl: invoice, draft: true });
    const E1 = draft.json?.data?.id;
    step("treasurer saves an expense as draft", draft.status === 201 && draft.json?.data?.status === "draft", `status=${draft.status} ${draft.json?.error ?? ""}`);
    step("a draft is not awaiting approval", (await overview())?.expensesToApprove?.count === 0);
    const edit = await api(T, `/expenses/${E1}`, "PATCH", { amount: "260.00" });
    await api(T, `/expenses/${E1}`, "PATCH", { amount: "250.00" });
    const editAudit = await db.select().from(auditLogsTable).where(and(eq(auditLogsTable.entityId, E1), eq(auditLogsTable.action, "EXPENSE_UPDATED")));
    step(
      "a draft can be corrected; each change is audited with old and new value",
      edit.status === 200 && edit.json?.data?.amount === "260.00" && editAudit.some((a) => (a.details ?? "").includes("250.00 → 260.00")) && editAudit.some((a) => (a.details ?? "").includes("260.00 → 250.00")),
      editAudit.map((a) => a.details).join(" | "),
    );
    step("a draft cannot be approved or paid", (await api(P, `/expenses/${E1}/approve`, "POST")).status === 409 && (await api(T, `/expenses/${E1}/pay`, "POST", { paymentMethod: "virement", paymentReference: "X" })).status === 409);
    const sub = await api(T, `/expenses/${E1}/submit`, "POST");
    const oSub = await overview();
    step("submitted: awaiting approval, no accounting effect", sub.status === 200 && oSub?.expensesToApprove?.count === 1 && oSub?.expensesToApprove?.amount === "250.00" && mad(oSub?.expenses) === "0.00");
    step("a treasurer cannot approve", (await api(T, `/expenses/${E1}/approve`, "POST")).status === 403);
    const E2r = await api(A, "/expenses", "POST", { label: "Peinture hall", category: "entretien", amount: "120.00", supplierName: "Peintre", proofUrl: invoice });
    const E2 = E2r.json?.data?.id;
    const self = await api(A, `/expenses/${E2}/approve`, "POST");
    step("the syndic cannot approve an expense they submitted (a president exists)", self.status === 409 && self.json?.code === "SELF_APPROVAL", `status=${self.status}`);
    const cancel = await api(A, `/expenses/${E2}/cancel`, "POST", { reason: "Devis refusé par le conseil" });
    step("cancelled expense: cannot be paid, no effect", cancel.status === 200 && (await api(T, `/expenses/${E2}/pay`, "POST", { paymentMethod: "virement", paymentReference: "X" })).status === 409);
    const appr = await api(P, `/expenses/${E1}/approve`, "POST");
    const oAppr = await overview();
    step("president approves: a commitment, cash and expenses unchanged", appr.status === 200 && oAppr?.committedExpenses?.amount === "250.00" && mad(oAppr?.expenses) === "0.00", JSON.stringify(oAppr?.committedExpenses));
    step("an approved expense is frozen", (await api(T, `/expenses/${E1}`, "PATCH", { amount: "1.00" })).json?.code === "EXPENSE_FROZEN");
    const [p1, p2] = await Promise.all([
      api(T, `/expenses/${E1}/pay`, "POST", { paymentMethod: "virement", paymentReference: "VIR-FW-1", accountId: BANK }),
      api(T, `/expenses/${E1}/pay`, "POST", { paymentMethod: "virement", paymentReference: "VIR-FW-1", accountId: BANK }),
    ]);
    const paid = p1.status === 200 ? p1 : p2;
    const expenseEntry = paid.json?.entry;
    const oPaid = await overview();
    step("paying twice at once: the supplier is paid once", [p1.status, p2.status].sort().join() === "200,409" && expenseEntry?.amount === "250.00", `${p1.status}/${p2.status}`);
    step("paid: counted in expenses, no longer a commitment", mad(oPaid?.expenses) === "250.00" && oPaid?.committedExpenses?.count === 0);

    // ═══ 8. Date boundaries ══════════════════════════════════════════════
    step("an entry dated tomorrow is refused", (await api(T, "/treasury/entries", "POST", { accountId: BANK, direction: "in", amount: 1, category: "recette", label: "futur", entryDate: TOMORROW })).json?.code === "ENTRY_DATE_IN_FUTURE");
    if (D0 > YEAR_START || D0 < TODAY) {
      const before = isoDay(new Date(Date.parse(`${D0}T00:00:00Z`) - 86_400_000));
      step("an entry before the account opening is refused", (await api(T, "/treasury/entries", "POST", { accountId: BANK, direction: "in", amount: 1, category: "recette", label: "avant", entryDate: before })).json?.code === "ENTRY_BEFORE_OPENING");
    }
    const jToday = await api(T, `/treasury/journal?from=${TODAY}&to=${TODAY}&limit=200`);
    const todayCount = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM ledger_entries WHERE syndicate_id = ${SID} AND entry_date = ${TODAY}::date`)) as unknown as { n: number }[];
    step("journal date filter is inclusive (from = to = today)", jToday.json?.total === todayCount[0]?.n && todayCount[0]?.n > 0, `${jToday.json?.total} vs ${todayCount[0]?.n}`);
    if (D0 < TODAY) {
      const oy = await overview(`?from=${D0}&to=${YESTERDAY}`);
      step("a period ending yesterday excludes today's movements (cash = opening balance)", mad(oy?.income) === "0.00" && mad(oy?.cashBalance) === "1500.00", JSON.stringify({ i: oy?.income, c: oy?.cashBalance }));
    }
    step("an inverted period is refused", (await api(T, `/treasury/summary?from=${TODAY}&to=${YESTERDAY}`)).status === 400);

    // ═══ 9. Bank reconciliation ══════════════════════════════════════════
    // What the bank really shows for the period: the three 33.33 transfers
    // and the rejection of the third, the supplier transfer debited 255.00
    // (5.00 more than the books) and 15.00 of fees. The 400.00 cheque
    // bounced (never credited) and the 100.00 rent is not credited yet.
    const L = (amount: string, label: string, reference?: string) => ({ valueDate: TODAY, amount, label, ...(reference ? { reference } : {}) });
    const firstLines = [L("33.33", "VIR COPRO 1", "R1"), L("33.33", "VIR COPRO 2", "R2"), L("33.33", "VIR COPRO 3", "R3"), L("-33.33", "REJET VIR COPRO 3", "R3-REJ"), L("-255.00", "VIR ASCENSEURS TEST", "VIR-FW-1")];
    const st = await api(T, `/treasury/accounts/${BANK}/statements`, "POST", { reference: `RLV-${RUN}`, periodStart: D0, periodEnd: TODAY, openingBalance: "1000.00", closingBalance: "796.66", lines: firstLines });
    const STMT = st.json?.data?.statement?.id;
    step("a bank statement is recorded with its printed balances and lines", st.status === 201 && st.json?.data?.inserted === 5, `status=${st.status} ${st.json?.error ?? ""}`);
    const early = await api(T, `/treasury/statements/${STMT}/close`, "POST");
    const codes = (early.json?.blocking ?? []).map((b: any) => b.code);
    step("closing is refused while lines are missing and unmatched", early.status === 409 && codes.includes("STATEMENT_INCOMPLETE") && codes.includes("LINES_UNRESOLVED"), codes.join(","));
    step("the overlapping period of another statement is refused", (await api(T, `/treasury/accounts/${BANK}/statements`, "POST", { periodStart: TODAY, periodEnd: TODAY, openingBalance: "0", closingBalance: "0" })).json?.code === "STATEMENT_OVERLAP");
    const more = await api(T, `/treasury/statements/${STMT}/lines`, "POST", { lines: [L("-15.00", "FRAIS TENUE DE COMPTE"), L("33.33", "VIR COPRO 1 (doublon import)", "R1")] });
    step("forgotten lines are added to the open statement", more.status === 201 && more.json?.data?.inserted === 2);
    const lines = ((await api(T, `/treasury/statements/${STMT}`)).json?.data?.lines ?? []) as any[];
    const byLabel = (lbl: string) => lines.find((l) => l.label === lbl);
    let report = (await api(T, `/treasury/statements/${STMT}`)).json?.data?.report;
    step("duplicate reference detected (R1 twice)", (report?.discrepancies?.duplicateLineReferences ?? []).some((d: any) => d.reference === "R1" && d.n === 2));
    step("ignoring a line needs a reason", (await api(T, `/treasury/statement-lines/${byLabel("VIR COPRO 1 (doublon import)")?.id}/status`, "POST", { status: "ignored" })).status === 400);
    await api(T, `/treasury/statement-lines/${byLabel("VIR COPRO 1 (doublon import)")?.id}/status`, "POST", { status: "ignored", note: "Ligne importée deux fois depuis le fichier de la banque" });
    const match = (lineLabel: string, entryId: string) => api(T, "/treasury/reconciliation/matches", "POST", { statementLineId: byLabel(lineLabel)?.id, ledgerEntryId: entryId });
    const [rejEntry] = await db.select().from(ledgerEntriesTable).where(eq(ledgerEntriesTable.reversesEntryId, c2Entries[2]));
    const ms = [await match("VIR COPRO 1", c2Entries[0]), await match("VIR COPRO 2", c2Entries[1]), await match("VIR COPRO 3", c2Entries[2]), await match("REJET VIR COPRO 3", rejEntry.id), await match("VIR ASCENSEURS TEST", expenseEntry?.id)];
    step("transfers, their rejection and the supplier payment are matched", ms.every((m) => m.status === 201), ms.map((m) => m.status).join(","));
    report = (await api(T, `/treasury/statements/${STMT}`)).json?.data?.report;
    step("incorrect amount detected (bank 255.00 vs books 250.00)", (report?.discrepancies?.amountMismatches ?? []).some((m: any) => m.amount === "-255.00" && m.matched_amount === "250.00"));
    step("the bounced 400.00 cheque and its refund are paired, not timing differences", (report?.discrepancies?.compensatedReversals ?? []).some((p: any) => p.amount === "400.00") && !(report?.timingDifferences ?? []).some((t: any) => t.amount === "400.00"));
    step("a bank line cannot be booked as a supplier payment", (await api(T, `/treasury/statement-lines/${byLabel("FRAIS TENUE DE COMPTE")?.id}/post-entry`, "POST", { category: "entretien" })).json?.code === "USE_EXPENSES");
    const fee = await api(T, `/treasury/statement-lines/${byLabel("FRAIS TENUE DE COMPTE")?.id}/post-entry`, "POST", { category: "frais_bancaires" });
    const gap = await api(T, `/treasury/statement-lines/${byLabel("VIR ASCENSEURS TEST")?.id}/post-entry`, "POST", { category: "frais_bancaires", label: "Commission sur virement fournisseur" });
    step("bank fees and the 5.00 commission are booked from the statement and matched", fee.status === 201 && fee.json?.data?.amount === "15.00" && gap.status === 201 && gap.json?.data?.amount === "5.00", `${fee.status} ${fee.json?.error ?? ""} / ${gap.status} ${gap.json?.error ?? ""}`);
    report = (await api(T, `/treasury/statements/${STMT}`)).json?.data?.report;
    step(
      "report: only the 100.00 rent is in transit, adjusted balances agree (896.66), difference 0",
      report?.canClose === true && report?.timingDifferences?.length === 1 && report?.timingDifferences?.[0]?.amount === "100.00" && report?.balances?.adjustedBank === "896.66" && report?.balances?.adjustedBook === "896.66" && report?.balances?.difference === "0.00",
      JSON.stringify({ b: report?.balances, blocking: report?.blocking }),
    );
    step("a council member can read the reconciliation but not close it", (await api(P, `/treasury/statements/${STMT}`)).status === 200 && (await api(P, `/treasury/statements/${STMT}/close`, "POST")).status === 403);
    const closed = await api(T, `/treasury/statements/${STMT}/close`, "POST");
    const recon = await api(T, `/treasury/accounts/${BANK}/reconciliation`);
    step("the statement is closed; the account is reconciled through its end date", closed.status === 200 && recon.json?.data?.reconciledThrough === TODAY, `status=${closed.status} ${closed.json?.error ?? ""}`);
    const [aMatch] = (await db.execute(sql`SELECT id FROM reconciliation_matches WHERE statement_line_id = ${byLabel("VIR COPRO 2")?.id}`)) as unknown as { id: string }[];
    step("a closed statement is frozen (no unmatching)", (await api(T, `/treasury/reconciliation/matches/${aMatch?.id}`, "DELETE")).json?.code === "STATEMENT_CLOSED");
    step("a reconciled entry cannot be reversed", (await api(T, `/treasury/entries/${expenseEntry?.id}/reverse`, "POST", { reason: "erreur" })).json?.code === "ENTRY_RECONCILED");
    step("only the syndic reopens a statement", (await api(T, `/treasury/statements/${STMT}/reopen`, "POST", { reason: "contrôle" })).status === 403);
    const reopen = await api(A, `/treasury/statements/${STMT}/reopen`, "POST", { reason: "Contrôle du conseil syndical" });
    const reclose = await api(T, `/treasury/statements/${STMT}/close`, "POST");
    step("the syndic reopens it with a reason; it closes again", reopen.status === 200 && reopen.json?.data?.status === "open" && reclose.status === 200);
    const st2 = await api(T, `/treasury/accounts/${BANK2}/statements`, "POST", { periodStart: D0, periodEnd: TODAY, openingBalance: "600.00", closingBalance: "600.00" });
    const close2 = await api(T, `/treasury/statements/${st2.json?.data?.statement?.id}/close`, "POST");
    const codes2 = (close2.json?.blocking ?? []).map((b: any) => b.code);
    step("a statement that does not agree with the books (600 vs 500) is never declared reconciled", close2.status === 409 && codes2.includes("UNEXPLAINED_DIFFERENCE") && !codes2.includes("STATEMENT_INCOMPLETE"), codes2.join(","));

    // ═══ 10. Security ════════════════════════════════════════════════════
    step("another condominium cannot read the statement", (await api(atlasAdmin, `/treasury/statements/${STMT}`)).status === 404);
    step("another condominium cannot reverse an entry", (await api(atlasAdmin, `/treasury/entries/${c2Entries[0]}/reverse`, "POST", { reason: "pirate" })).status === 404);
    step("another condominium cannot read or edit the expense", (await api(atlasAdmin, `/expenses/${E1}`)).status === 404 && (await api(atlasAdmin, `/expenses/${E2}`, "PATCH", { amount: "1.00" })).status === 404);
    step("another condominium cannot validate a payment", (await api(atlasAdmin, `/appels-de-fonds/${C1.id}/validate`, "PUT", { approve: true })).status === 403);
    step("a co-owner reaches no treasury operation", [
      (await api(O, "/treasury/summary")).status,
      (await api(O, "/expenses", "POST", { label: "x", category: "autre", amount: 1, supplierName: "x", proofUrl: invoice })).status,
      (await api(O, `/expenses/${E2}`, "PATCH", { amount: "1.00" })).status,
      (await api(O, `/treasury/entries/${c2Entries[0]}/reverse`, "POST", { reason: "moi" })).status,
      (await api(O, `/treasury/statements/${STMT}`)).status,
    ].every((s) => s === 403));
    const auditActions = new Set(
      (await db.select({ action: auditLogsTable.action }).from(auditLogsTable).where(eq(auditLogsTable.syndicateId, SID))).map((a) => a.action),
    );
    const expected = ["payment_rejected", "payment_approved", "LEDGER_ENTRY_REVERSED", "EXPENSE_UPDATED", "EXPENSE_APPROVED", "EXPENSE_CANCELLED", "EXPENSE_PAID", "STATEMENT_LINE_FLAGGED", "STATEMENT_LINE_BOOKED", "BANK_STATEMENT_CLOSED", "BANK_STATEMENT_REOPENED", "RECONCILIATION_MATCHED"];
    const missing = expected.filter((a) => !auditActions.has(a));
    step("every decision and correction is in the audit log", missing.length === 0, missing.join(","));

    // ═══ 11. Every screen tells the same story ═══════════════════════════
    // income   = 400 + 99.99 + 100 − 400 (refund) − 33.33 (rejected) = 166.66
    // expenses = 250 + 5 + 15                                         = 270.00
    // cash     = 1000 + 500 (bank 2) + 166.66 − 270                   = 1396.66
    // receivables = 1000 + 33.33 + 500 = 1533.33 (overdue 500.00)
    const ov = await overview();
    step("treasury overview: income 166.66, expenses 270.00, cash 1396.66, receivables 1533.33", mad(ov?.income) === "166.66" && mad(ov?.expenses) === "270.00" && mad(ov?.net) === "-103.34" && mad(ov?.cashBalance) === "1396.66" && ov?.receivables?.amount === "1533.33" && ov?.overdueReceivables?.amount === "500.00", JSON.stringify({ i: ov?.income, e: ov?.expenses, c: ov?.cashBalance, r: ov?.receivables }));
    step("every overview figure carries its definition", ["cashBalance", "income", "expenses", "receivables", "pendingPayments", "committedExpenses"].every((k) => typeof ov?.definitions?.[k] === "string"));
    const summary = (await api(T, "/treasury/summary")).json?.data;
    const accountsTotal = (summary?.accounts ?? []).reduce((s: number, a: any) => s + Math.round(Number(a.balance) * 100), 0);
    step("account balances add up to the cash balance", accountsTotal === 139666 && mad(summary?.balances?.map((b: any) => ({ currency: b.currency, amount: b.balance }))) === "1396.66", String(accountsTotal));
    const stats = (await api(A, "/statistics/finance/summary")).json?.data;
    step("statistics summary agrees (revenue, expenses, cash)", stats?.totalRevenue === 166.66 && stats?.totalExpenses === 270 && stats?.caisseBalance === 1396.66 && stats?.monthlyRevenue === 166.66, JSON.stringify(stats));
    const rep = (await api(A, "/statistics/reports?period=year")).json?.data;
    const chartSum = Math.round((rep?.revenueChart ?? []).reduce((s: number, b: any) => s + b.value, 0) * 100) / 100;
    step("yearly report agrees (KPIs and chart)", rep?.kpi?.revenues === 166.66 && rep?.kpi?.expenses === 270 && chartSum === 166.66, JSON.stringify(rep?.kpi));
    const reg = (await api(T, `/finance/transactions?from=${YEAR_START}`)).json?.totals;
    step("operations register totals agree", reg?.inflow === 166.66 && reg?.outflow === 270, JSON.stringify(reg));
    const journal = (await api(T, "/treasury/journal?limit=1")).json?.totals;
    step("journal net movement equals the cash balance", journal?.net === "1396.66", JSON.stringify(journal));
    const bld = (await api(T, `/finance/building/${BLD}`)).json?.data;
    const thisMonth = bld?.monthlyHistory?.[bld.monthlyHistory.length - 1];
    step("building dashboard: collected 66.66 = calls' validated payments = this month's net collections", bld?.summary?.totalEncaisse === 67 && thisMonth?.paid === 67 && c1r.amountPaid === "0.00" && c2r.amountPaid === "66.66", JSON.stringify({ s: bld?.summary?.totalEncaisse, m: thisMonth }));
    const pf = (await api(A, `/organizations/${ORG}/portfolio`)).json?.data?.condominiums?.[0];
    step("company portfolio agrees (treasury 1396.66, outstanding 1533.33)", pf?.treasury === "1396.66" && pf?.outstanding === "1533.33", JSON.stringify({ t: pf?.treasury, o: pf?.outstanding }));
    const mine = (await api(O, "/me/payments")).json?.data ?? [];
    const statuses = mine.map((p: any) => p.status).sort().join(",");
    step("co-owner's account: 2 validated, 2 reversed, 1 rejected — receipts only on validated ones", statuses === "rejected,reversed,reversed,validated,validated" && mine.filter((p: any) => p.status === "validated").every((p: any) => /^REC-/.test(p.receiptNumber ?? "")), statuses);
    step("the other co-owner sees none of it", ((await api(O2, "/me/payments")).json?.data ?? []).length === 0);

    // Pagination on the journal: pages are disjoint and cover every entry.
    const total = ((await db.execute(sql`SELECT COUNT(*)::int AS n FROM ledger_entries WHERE syndicate_id = ${SID}`)) as unknown as { n: number }[])[0].n;
    const pages: string[] = [];
    for (let page = 1; page <= Math.ceil(total / 4); page++) {
      pages.push(...(((await api(T, `/treasury/journal?limit=4&page=${page}`)).json?.data ?? []) as any[]).map((e) => e.id));
    }
    step("journal pagination: pages are disjoint and cover every entry", pages.length === total && new Set(pages).size === total, `${pages.length}/${total}`);
  } finally {
    await purge();
    const left = ((await db.execute(sql`SELECT (SELECT COUNT(*) FROM syndicates WHERE id = ${SID}) + (SELECT COUNT(*) FROM organizations WHERE id = ${ORG}) + (SELECT COUNT(*) FROM ledger_entries WHERE syndicate_id = ${SID}) AS n`)) as unknown as { n: string }[])[0].n;
    step("everything created by the suite is removed", Number(left) === 0, `left=${left}`);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} finance workflow checks passed`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Finance workflow suite failed to run:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
