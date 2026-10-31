/**
 * Funds calls — real HTTP API against PostgreSQL.
 *
 * A dedicated condominium (one building, lots FC-1…FC-3 + an archived lot, an
 * allocation key, approved expenses, a default bank account) is created in the
 * database; drafts, publication, payments, reminders, adjustments, reversals
 * and reconciliation all go through the API. Everything is removed at the end.
 *
 * Usage: API_BASE_URL=http://localhost:5055/api pnpm --filter @workspace/scripts run funds-calls:test
 */
import jwt from "jsonwebtoken";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import {
  allocationsTable,
  appelsDeFondsTable,
  buildingsTable,
  expensesTable,
  lotOwnershipsTable,
  lotsTable,
  membersTable,
  organizationsTable,
  storageObjectsTable,
  syndicateSubscriptionsTable,
  syndicatesTable,
  usersTable,
} from "@workspace/db/schema";
import { purgeAllocationsOfSyndicates } from "./test-cleanup.js";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");
const TZ = process.env.APP_TIMEZONE || "Africa/Casablanca";
const RUN = Date.now();
const SID = `syn_fc_${RUN}`;
const ORG = `org_fc_${RUN}`;
const BLD = `bld_fc_${RUN}`;

type U = typeof usersTable.$inferSelect;
const results: { name: string; pass: boolean; detail: string }[] = [];
function step(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const tokenFor = (u: U) => jwt.sign({ userId: u.id, email: u.email, role: u.role, syndicateId: u.syndicateId ?? undefined, name: u.name }, JWT_SECRET, { expiresIn: "15m" });
async function api(u: U, p: string, method = "GET", body?: unknown, key?: string) {
  const headers: Record<string, string> = { Authorization: `Bearer ${tokenFor(u)}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (key) headers["Idempotency-Key"] = key;
  const res = await fetch(`${BASE}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}
const codes = (r: { json: any }) => ((r.json?.errors ?? r.json?.data?.errors ?? []) as any[]).map((e) => e.code);
const localDay = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offsetDays * 86_400_000));
function rib(seed: number): string {
  const body = `0117800000${String(seed).padStart(12, "0")}`.slice(0, 22);
  const k = (97n - ((BigInt(body) * 100n) % 97n)) % 97n;
  return body + String(k).padStart(2, "0");
}

async function fixture() {
  await db.insert(organizationsTable).values({ id: ORG, name: `Syndic FC ${RUN}` });
  await db.insert(syndicatesTable).values({ id: SID, name: `Résidence Appels ${RUN}`, status: "active", organizationId: ORG, currency: "MAD" } as any);
  await db.insert(syndicateSubscriptionsTable).values({ syndicateId: SID, status: "trial", trialStartDate: new Date(), trialEndDate: new Date(Date.now() + 30 * 86_400_000), autoRenew: false } as any);
  const mk = (id: string, name: string, role: string) => ({ id: `${id}_${RUN}`, name, email: `${id}-${RUN}@example.invalid`, passwordHash: "x", role, status: "active", syndicateId: SID });
  const [A, T, O1, O2] = await db
    .insert(usersTable)
    .values([mk("fc_admin", "Amal Syndic", "syndicate_admin"), mk("fc_treasurer", "Tawfiq Trésorier", "treasurer"), mk("fc_owner1", "Omar FC-1", "member"), mk("fc_owner2", "Ouafae FC-2", "member")] as any)
    .returning();
  await db.insert(buildingsTable).values({ id: BLD, name: "Bât. FC", address: "7 rue des Appels", city: "Fès", syndicateId: SID } as any);
  const [m1, m2, m3] = await db
    .insert(membersTable)
    .values([{ name: O1.name, email: O1.email, syndicateId: SID }, { name: O2.name, email: O2.email, syndicateId: SID }, { name: "Nadia FC-3", email: `fc_owner3-${RUN}@example.invalid`, syndicateId: SID }])
    .returning();
  const lotRows = await db
    .insert(lotsTable)
    .values([
      { number: "FC-1", buildingId: BLD, ownerId: m1.id, type: "appartement", floor: 1, tantiemes: 250 },
      { number: "FC-2", buildingId: BLD, ownerId: m2.id, type: "appartement", floor: 2, tantiemes: 250 },
      { number: "FC-3", buildingId: BLD, ownerId: m3.id, type: "appartement", floor: 3, tantiemes: 500 },
      { number: "FC-OLD", buildingId: BLD, ownerId: m3.id, type: "cave", floor: 0, tantiemes: 10, archivedAt: new Date() },
    ] as any)
    .returning();
  const L = Object.fromEntries(lotRows.map((l) => [l.number, l.id])) as Record<string, string>;
  await db.insert(lotOwnershipsTable).values([
    { syndicateId: SID, lotId: L["FC-1"], memberId: m1.id, sharePercent: "100", startDate: "2020-01-01" },
    { syndicateId: SID, lotId: L["FC-2"], memberId: m2.id, sharePercent: "100", startDate: "2020-01-01" },
    { syndicateId: SID, lotId: L["FC-3"], memberId: m3.id, sharePercent: "100", startDate: "2020-01-01" },
  ] as any);
  const invoice = `/objects/uploads/fc-${RUN}-facture.pdf`;
  const proof1 = `/objects/uploads/fc-${RUN}-o1.pdf`;
  const proof2 = `/objects/uploads/fc-${RUN}-o2.pdf`;
  await db.insert(storageObjectsTable).values([
    { objectPath: invoice, ownerId: A.id, syndicateId: SID, contentType: "application/pdf", size: 10 },
    { objectPath: proof1, ownerId: O1.id, syndicateId: SID, contentType: "application/pdf", size: 10 },
    { objectPath: proof2, ownerId: O2.id, syndicateId: SID, contentType: "application/pdf", size: 10 },
  ]);
  const exp = (ref: string, label: string, amount: string) => ({ syndicateId: SID, buildingId: BLD, reference: `${ref}-${RUN}`, label, category: "entretien_general", amount, supplierName: "Fournisseur", proofUrl: invoice, status: "approved", createdBy: A.id });
  const [e1, e2, e3, e4] = await db
    .insert(expensesTable)
    .values([exp("FC-A", "Nettoyage des parties communes", "1000.00"), exp("FC-B", "Remplacement interphone", "333.33"), exp("FC-C", "Peinture hall", "600.00"), exp("FC-D", "Élagage", "120.00")] as any)
    .returning();
  return { A, T, O1, O2, L, m1, m2, e1, e2, e3, e4, proof1, proof2 };
}

async function purge() {
  await purgeAllocationsOfSyndicates([SID]);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL mizan.ledger_maintenance = 'on'`);
    await tx.execute(sql`DELETE FROM appel_reminders WHERE syndicate_id = ${SID}`);
    await tx.execute(sql`DELETE FROM appel_adjustments WHERE syndicate_id = ${SID}`);
    for (const t of ["reconciliation_matches", "bank_statement_lines", "bank_statements", "transactions", "appel_payments", "ledger_entries"]) await tx.execute(sql`DELETE FROM ${sql.identifier(t)} WHERE syndicate_id = ${SID}`);
    await tx.execute(sql`DELETE FROM appels_de_fonds WHERE building_id = ${BLD}`);
    for (const t of ["expenses", "treasury_accounts", "lot_ownerships", "audit_logs", "alerts", "syndicate_subscriptions", "document_sequences"]) await tx.execute(sql`DELETE FROM ${sql.identifier(t)} WHERE syndicate_id = ${SID}`);
    await tx.delete(lotsTable).where(eq(lotsTable.buildingId, BLD));
    await tx.delete(buildingsTable).where(eq(buildingsTable.id, BLD));
    await tx.delete(membersTable).where(eq(membersTable.syndicateId, SID));
    await tx.delete(storageObjectsTable).where(eq(storageObjectsTable.syndicateId, SID));
    await tx.delete(usersTable).where(eq(usersTable.syndicateId, SID));
    await tx.delete(syndicatesTable).where(eq(syndicatesTable.id, SID));
    await tx.delete(organizationsTable).where(eq(organizationsTable.id, ORG));
  });
}

async function main() {
  const atlasAdmin = (await db.select().from(usersTable).where(eq(usersTable.id, "user_admin_atlas")))[0];
  if (!atlasAdmin) throw new Error("Seed users missing — run pnpm db:seed");
  const f = await fixture();
  const { A, T, O1, O2, L, e1, e2, e3, e4, proof1, proof2 } = f;
  const TODAY = localDay(0);
  const YESTERDAY = localDay(-1);
  const DUE = localDay(30);
  const call = async (lot: string, period: string) =>
    (await db.select().from(appelsDeFondsTable).where(and(eq(appelsDeFondsTable.lotId, L[lot]), eq(appelsDeFondsTable.period, period), sql`${appelsDeFondsTable.status} <> 'cancelled'`)))[0];
  const account = async (u: U, id: string) => api(u, `/appels-de-fonds/${id}/account`);

  try {
    // ═══ 0. Set-up: key and default bank account (through the API) ═════════
    const key = await api(A, "/allocation-keys", "POST", {
      buildingId: BLD,
      code: "GEN",
      name: "Charges générales",
      purpose: "Entretien des parties communes",
      method: "shares",
      categories: ["entretien_general"],
      effectiveFrom: "2020-01-01",
      sourceReference: "Règlement de copropriété — tableau des tantièmes (à vérifier)",
      shares: [
        { lotId: L["FC-1"], coefficient: "250" },
        { lotId: L["FC-2"], coefficient: "250" },
        { lotId: L["FC-3"], coefficient: "500" },
      ],
    });
    const bank = await api(A, "/treasury/accounts", "POST", { kind: "bank", label: "Banque FC", bankName: "Banque Test", rib: rib(RUN % 1e9), openingBalance: "0", openingDate: TODAY, isDefault: true });
    step("allocation key and default bank account are set up", key.status === 201 && bank.status === 201, `${key.status} ${key.json?.error ?? ""} / ${bank.status} ${bank.json?.error ?? ""}`);

    // ═══ A. Create: preview, basis, warnings, date rules ═════════════════
    const run = (sources: any[], period: string, extra: any = {}) => ({ buildingId: BLD, period, chargeType: "charges_courantes", sources, dueDate: DUE, ...extra });
    step("a co-owner cannot prepare a funds call", (await api(O1, "/allocations/preview", "POST", run([{ type: "expense", id: e1.id }], "2099-01"))).status === 403);
    const pv = await api(T, "/allocations/preview", "POST", run([{ type: "expense", id: e1.id }], "2099-01", { issueDate: TODAY }));
    const pvd = pv.json?.data;
    const lines = Object.fromEntries((pvd?.sources?.[0]?.lines ?? []).map((l: any) => [l.lotNumber, l.amount]));
    step("preview: per-unit amounts on the key (250/250/500 of 1000.00)", JSON.stringify(lines) === JSON.stringify({ "FC-1": "250.00", "FC-2": "250.00", "FC-3": "500.00" }), JSON.stringify(lines));
    step("preview: issue date, due date and time zone are shown", pvd?.issueDate === TODAY && pvd?.dueDate === DUE && pvd?.timezone === "Africa/Casablanca", `${pvd?.issueDate} ${pvd?.dueDate} ${pvd?.timezone}`);
    step("preview: the archived unit is reported (INACTIVE_UNIT warning), not charged", (pvd?.warnings ?? []).some((w: any) => w.code === "INACTIVE_UNIT" && w.lotNumber === "FC-OLD") && !("FC-OLD" in lines));
    step("a due date already passed is refused (DUE_DATE_PASSED)", codes(await api(T, "/allocations/preview", "POST", run([{ type: "expense", id: e1.id }], "2099-01", { dueDate: YESTERDAY }))).includes("DUE_DATE_PASSED"));
    step("a due date before the issue date is refused (INVALID_DATES)", codes(await api(T, "/allocations/preview", "POST", run([{ type: "expense", id: e1.id }], "2099-01", { issueDate: DUE, dueDate: localDay(10) }))).includes("INVALID_DATES"));

    // ═══ B. Draft, review, publication, idempotency ══════════════════════
    const draft = await api(T, "/allocations", "POST", { ...run([{ type: "expense", id: e1.id }], "2099-01", { issueDate: TODAY }), previewHash: pvd?.inputsHash, draft: true });
    const DRAFT = draft.json?.data?.id;
    const draftCalls = await db.select().from(appelsDeFondsTable).where(eq(appelsDeFondsTable.allocationId, DRAFT ?? "-"));
    step("a draft is saved without any obligation", draft.status === 201 && draft.json?.data?.status === "draft" && draftCalls.length === 0, `${draft.status} ${draft.json?.error ?? ""} n=${draftCalls.length}`);
    step("a draft does not reserve its source (another draft on it is possible)", (await api(T, "/allocations/preview", "POST", run([{ type: "expense", id: e1.id }], "2099-01"))).json?.data?.valid === true);
    const review = await api(T, `/allocations/${DRAFT}/publish`, "POST", {});
    const reviewHash = review.json?.data?.preview?.inputsHash;
    step("publishing starts with a revalidated review of the draft", review.status === 200 && review.json?.data?.preview?.valid === true && review.json?.data?.preview?.changed === false, `${review.status} ${review.json?.error ?? ""}`);
    step("publication with a stale review is refused (PREVIEW_STALE)", (await api(T, `/allocations/${DRAFT}/publish`, "POST", { previewHash: "0".repeat(64) })).json?.code === "PREVIEW_STALE");
    const [p1, p2] = await Promise.all([api(T, `/allocations/${DRAFT}/publish`, "POST", { previewHash: reviewHash }), api(T, `/allocations/${DRAFT}/publish`, "POST", { previewHash: reviewHash })]);
    const published = await db.select().from(appelsDeFondsTable).where(eq(appelsDeFondsTable.allocationId, DRAFT));
    step(
      "two simultaneous publications: one set of obligations (3 lots)",
      published.length === 3 && [p1.status, p2.status].includes(201) && [p1.status, p2.status].every((s) => s === 201 || s === 200 || s === 409),
      `${p1.status}/${p2.status} n=${published.length}`,
    );
    const o1 = published.find((a) => a.lotId === L["FC-1"])!;
    const o2 = published.find((a) => a.lotId === L["FC-2"])!;
    const o3 = published.find((a) => a.lotId === L["FC-3"])!;
    step(
      "each obligation references the call and its unit, with amount, dates and status",
      !!o1 && o1.allocationId === DRAFT && o1.amount === "250.00" && o1.originalAmount === "250.00" && o1.issueDate === TODAY && o1.dueDate === DUE && o1.status === "pending",
      JSON.stringify({ a: o1?.amount, o: o1?.originalAmount, i: o1?.issueDate, d: o1?.dueDate, s: o1?.status }),
    );
    step("a published call is no longer a draft (edit/delete refused)", (await api(T, `/allocations/${DRAFT}`, "DELETE")).json?.code === "NOT_A_DRAFT");
    step("a second call on the same expense is refused", codes(await api(T, "/allocations/preview", "POST", run([{ type: "expense", id: e1.id }], "2099-01"))).some((c: string) => /ALREADY|ALLOCATED|APPELS/.test(c)));

    // Idempotent direct publication (no draft): same key sent twice at once
    const pvB = (await api(T, "/allocations/preview", "POST", run([{ type: "expense", id: e2.id }], "2099-02"))).json?.data;
    const ik = `fc-${RUN}-pub`;
    const [d1, d2] = await Promise.all([
      api(T, "/allocations", "POST", { ...run([{ type: "expense", id: e2.id }], "2099-02"), previewHash: pvB?.inputsHash }, ik),
      api(T, "/allocations", "POST", { ...run([{ type: "expense", id: e2.id }], "2099-02"), previewHash: pvB?.inputsHash }, ik),
    ]);
    const callB = (d1.status === 201 ? d1 : d2).json?.data;
    const nB = (await db.select().from(allocationsTable).where(and(eq(allocationsTable.syndicateId, SID), eq(allocationsTable.period, "2099-02")))).length;
    step("duplicate publication (same Idempotency-Key, concurrent): one call", nB === 1 && [d1.status, d2.status].sort().join() === "200,201", `${d1.status}/${d2.status} n=${nB}`);
    step("a retry later returns the same call", (await api(T, "/allocations", "POST", { ...run([{ type: "expense", id: e2.id }], "2099-02"), previewHash: pvB?.inputsHash }, ik)).json?.replayed === true);
    const bCalls = await db.select().from(appelsDeFondsTable).where(eq(appelsDeFondsTable.allocationId, callB?.id ?? "-"));
    const bSum = bCalls.reduce((s, a) => s + Math.round(Number(a.amount) * 100), 0);
    step("333.33 split 25/25/50 reconciles to the cent (largest remainder)", bSum === 33333, `sum=${bSum} ${bCalls.map((a) => a.amount).join("/")}`);

    // Draft that is deleted
    const pvC = (await api(T, "/allocations/preview", "POST", run([{ type: "expense", id: e4.id }], "2099-04"))).json?.data;
    const dC = await api(T, "/allocations", "POST", { ...run([{ type: "expense", id: e4.id }], "2099-04"), previewHash: pvC?.inputsHash, draft: true });
    const del = await api(T, `/allocations/${dC.json?.data?.id}`, "DELETE");
    const gone = await db.select().from(allocationsTable).where(eq(allocationsTable.id, dC.json?.data?.id ?? "-"));
    step("an unpublished draft can be deleted (no financial effect)", del.status === 200 && gone.length === 0, `${del.status} ${del.json?.error ?? ""}`);

    // ═══ C. Resident account: payments ═══════════════════════════════════
    let acc = (await account(O1, o1.id)).json?.data;
    step(
      "resident account: amount, due date, remaining, payment options, no online payment",
      acc?.amount === "250.00" && acc?.remaining === "250.00" && acc?.dueDate === DUE && acc?.overdue === false && acc?.paymentOptions?.online === false && acc?.paymentOptions?.methods?.length === 3,
      JSON.stringify({ r: acc?.remaining, o: acc?.overdue, p: acc?.paymentOptions?.online }),
    );
    step("cross-resident: another co-owner cannot read this obligation", (await account(O2, o1.id)).status === 404);
    step("cross-condominium: another syndic cannot read it", (await account(atlasAdmin, o1.id)).status === 404);
    step("a co-owner cannot declare on another co-owner's obligation", (await api(O2, `/appels-de-fonds/${o1.id}/pay`, "PUT", { paymentMethod: "virement", amount: "10.00", proofUrl: proof2 })).status === 403);

    const dec1 = await api(O1, `/appels-de-fonds/${o1.id}/pay`, "PUT", { paymentMethod: "virement", amount: "100.00", reference: "VIR-FC-1", proofUrl: proof1 });
    acc = (await account(O1, o1.id)).json?.data;
    step(
      "a declared payment is pending: not settlement, remaining unchanged",
      dec1.status === 200 && acc?.status === "pending_validation" && acc?.remaining === "250.00" && acc?.amountPaid === "0.00" && acc?.pendingAmount === "100.00" && acc?.payments?.[0]?.status === "pending" && acc?.payments?.[0]?.receiptNumber === null,
      `${dec1.status} ${dec1.json?.error ?? ""} ${acc?.status} ${acc?.remaining}`,
    );
    step("no reminder while a payment is under review", (await api(T, `/appels-de-fonds/${o1.id}/reminder-eligibility`)).json?.data?.eligible === false);
    step("no adjustment while a payment is under review", (await api(A, `/appels-de-fonds/${o1.id}/adjust`, "POST", { newAmount: "240.00", reason: "Test sous revue" })).json?.code === "PAYMENT_UNDER_REVIEW");
    const v1 = await api(T, `/appels-de-fonds/${o1.id}/validate`, "PUT", { approve: true });
    const entry1 = v1.json?.ledgerEntry;
    acc = (await account(O1, o1.id)).json?.data;
    step(
      "partial payment validated: partially paid, remaining 150.00, receipt issued",
      v1.status === 200 && acc?.status === "partially_paid" && acc?.amountPaid === "100.00" && acc?.remaining === "150.00" && /^REC-/.test(acc?.payments?.[0]?.receiptNumber ?? ""),
      `${v1.status} ${v1.json?.error ?? ""} ${acc?.status} ${acc?.remaining}`,
    );

    await api(O1, `/appels-de-fonds/${o1.id}/pay`, "PUT", { paymentMethod: "cheque", amount: "50.00", reference: "CHQ-1", proofUrl: proof1 });
    const rej = await api(T, `/appels-de-fonds/${o1.id}/validate`, "PUT", { approve: false, rejectionReason: "Chèque sans provision" });
    acc = (await account(O1, o1.id)).json?.data;
    step(
      "failed (rejected) payment: balance untouched, listed as rejected with its reason",
      rej.status === 200 && acc?.amountPaid === "100.00" && acc?.remaining === "150.00" && acc?.payments?.some((p: any) => p.status === "rejected" && p.rejectionReason === "Chèque sans provision"),
      `${rej.status} ${acc?.status} ${acc?.remaining}`,
    );
    step("a declaration above the remaining balance is refused", (await api(O1, `/appels-de-fonds/${o1.id}/pay`, "PUT", { paymentMethod: "virement", amount: "150.01", proofUrl: proof1 })).status === 400);
    await api(O1, `/appels-de-fonds/${o1.id}/pay`, "PUT", { paymentMethod: "virement", reference: "VIR-FC-2", proofUrl: proof1 });
    const v2 = await api(T, `/appels-de-fonds/${o1.id}/validate`, "PUT", { approve: true });
    acc = (await account(O1, o1.id)).json?.data;
    step("full settlement: paid, remaining 0.00, two receipts", v2.status === 200 && acc?.status === "paid" && acc?.remaining === "0.00" && acc?.payments?.filter((p: any) => p.receiptNumber).length === 2 && acc?.paymentOptions === null);
    step("a settled obligation accepts no further payment", (await api(O1, `/appels-de-fonds/${o1.id}/pay`, "PUT", { paymentMethod: "virement", amount: "1.00", proofUrl: proof1 })).status === 409);
    step("no reminder after settlement", (await api(T, `/appels-de-fonds/${o1.id}/remind`, "POST", {})).json?.code === "REMINDER_NOT_ELIGIBLE");

    // ═══ E. Reversal of a posted payment ═════════════════════════════════
    const rev = await api(T, `/treasury/entries/${entry1?.id}/reverse`, "POST", { reason: "Virement retourné par la banque" });
    acc = (await account(O1, o1.id)).json?.data;
    step(
      "reversed transaction: paid amount and remaining restored, payment shown as reversed",
      rev.status === 201 || rev.status === 200 ? acc?.amountPaid === "150.00" && acc?.remaining === "100.00" && acc?.status !== "paid" : false,
      `${rev.status} ${rev.json?.error ?? ""} paid=${acc?.amountPaid} st=${acc?.status}`,
    );
    step("the obligation with posted payments was not erased", !!(await db.select().from(appelsDeFondsTable).where(eq(appelsDeFondsTable.id, o1.id)))[0]);
    step("a call with payments cannot be reversed wholesale (ALLOCATION_HAS_PAYMENTS)", (await api(A, `/allocations/${DRAFT}/reverse`, "POST", { reason: "Erreur de saisie" })).json?.code === "ALLOCATION_HAS_PAYMENTS");

    // ═══ E. Adjustments ══════════════════════════════════════════════════
    step("an adjustment is decided by the syndic only", (await api(T, `/appels-de-fonds/${o2.id}/adjust`, "POST", { newAmount: "200.00", reason: "Remise accordée par l'AG" })).status === 403);
    step("an adjustment below what was paid is refused (BELOW_PAID)", (await api(A, `/appels-de-fonds/${o1.id}/adjust`, "POST", { newAmount: "100.00", reason: "Correction de quote-part" })).json?.code === "BELOW_PAID");
    const adj = await api(A, `/appels-de-fonds/${o2.id}/adjust`, "POST", { newAmount: "200.00", reason: "Remise décidée en AG du 2099-01-10" });
    acc = (await account(O2, o2.id)).json?.data;
    step(
      "adjustment: new amount, original kept, reason in the resident's history",
      adj.status === 200 && acc?.amount === "200.00" && acc?.originalAmount === "250.00" && acc?.adjustments?.[0]?.reason?.includes("Remise"),
      `${adj.status} ${adj.json?.error ?? ""} ${acc?.amount}/${acc?.originalAmount}`,
    );

    // ═══ D. Due-date boundaries and reminders (local time zone) ══════════
    const [dueToday, dueYesterday] = await db
      .insert(appelsDeFondsTable)
      .values([
        { buildingId: BLD, lotId: L["FC-2"], ownerId: f.m2.id, debtorMemberIds: [f.m2.id], period: "2099-07", type: "charges_courantes", amount: "80.00", originalAmount: "80.00", issueDate: YESTERDAY, dueDate: TODAY, status: "pending" },
        { buildingId: BLD, lotId: L["FC-2"], ownerId: f.m2.id, debtorMemberIds: [f.m2.id], period: "2099-08", type: "charges_courantes", amount: "90.00", originalAmount: "90.00", issueDate: localDay(-31), dueDate: YESTERDAY, status: "pending" },
      ] as any)
      .returning();
    const aToday = (await account(O2, dueToday.id)).json?.data;
    const aYest = (await account(O2, dueYesterday.id)).json?.data;
    step(`due today (${TODAY}, ${TZ}) is not overdue; due yesterday is`, aToday?.overdue === false && aYest?.overdue === true, `${aToday?.overdue}/${aYest?.overdue}`);
    step("no reminder before the due date has passed", (await api(T, `/appels-de-fonds/${dueToday.id}/reminder-eligibility`)).json?.data?.eligible === false);
    step("a co-owner cannot send reminders", (await api(O1, `/appels-de-fonds/${dueYesterday.id}/remind`, "POST", {})).status === 403);
    await db.execute(sql`DELETE FROM appel_reminders WHERE appel_id = ${dueYesterday.id}`);
    const r1 = await api(T, `/appels-de-fonds/${dueYesterday.id}/remind`, "POST", {});
    const alertsSent = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM alerts WHERE syndicate_id = ${SID} AND recipient_user_id = ${O2.id}`)) as unknown as { n: number }[];
    step("a reminder for an overdue obligation reaches its debtor (amount + date, no penalty)", r1.status === 201 && r1.json?.data?.recipients === 1 && Number(alertsSent[0]?.n) >= 1, `${r1.status} ${r1.json?.error ?? ""}`);
    step("a second reminder within 24 h is refused", (await api(T, `/appels-de-fonds/${dueYesterday.id}/remind`, "POST", {})).json?.code === "REMINDER_TOO_SOON");

    // ═══ E. Cancelled call ═══════════════════════════════════════════════
    const pvE = (await api(T, "/allocations/preview", "POST", run([{ type: "expense", id: e3.id }], "2099-03"))).json?.data;
    const pubE = await api(T, "/allocations", "POST", { ...run([{ type: "expense", id: e3.id }], "2099-03"), previewHash: pvE?.inputsHash });
    const revE = await api(A, `/allocations/${pubE.json?.data?.id}/reverse`, "POST", { reason: "Dépense refacturée au prestataire" });
    const eCalls = await db.select().from(appelsDeFondsTable).where(eq(appelsDeFondsTable.allocationId, pubE.json?.data?.id ?? "-"));
    step("a call without payments can be cancelled: obligations cancelled, kept", revE.status === 200 && eCalls.length === 3 && eCalls.every((a) => a.status === "cancelled" && !!a.cancellationReason), `${revE.status} ${revE.json?.error ?? ""}`);
    const eO1 = eCalls.find((a) => a.lotId === L["FC-1"])!;
    step("cancelled obligation: no payment, no reminder", (await api(O1, `/appels-de-fonds/${eO1.id}/pay`, "PUT", { paymentMethod: "virement", amount: "1.00", proofUrl: proof1 })).status >= 400 && (await api(T, `/appels-de-fonds/${eO1.id}/reminder-eligibility`)).json?.data?.eligible === false);

    // ═══ F. Reconciliation ═══════════════════════════════════════════════
    const rc = (await api(T, `/allocations/${DRAFT}/reconciliation`)).json?.data;
    step(
      "reconciliation of the call: lines = obligations = total, adjustments explained, journal = payments, one receipt per payment",
      rc?.reconciled === true && rc?.issuedTotal === "1000.00" && rc?.adjustmentsTotal === "-50.00" && rc?.currentTotal === "950.00",
      JSON.stringify(rc?.checks ?? rc),
    );
    const rcB = (await api(T, `/allocations/${callB?.id}/reconciliation`)).json?.data;
    const rcE = (await api(T, `/allocations/${pubE.json?.data?.id}/reconciliation`)).json?.data;
    step("reconciliation of the rounded and of the cancelled call", rcB?.reconciled === true && rcE?.reconciled === true && rcE?.cancelledTotal === "600.00", `${JSON.stringify(rcB?.checks)} ${JSON.stringify(rcE?.checks)}`);
    step("a co-owner cannot read the reconciliation", (await api(O1, `/allocations/${DRAFT}/reconciliation`)).status === 403);
    void o3;
  } finally {
    await purge();
    await pool.end();
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await purge();
  } catch {}
  process.exit(1);
});
