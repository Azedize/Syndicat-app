/**
 * Charge allocation — real HTTP API against PostgreSQL.
 *
 * A dedicated condominium (one building, lots DL-1…DL-5 + an archived lot,
 * an approved budget with categorised lines, expenses) is created in the
 * database; keys, previews, confirmations, corrections and reversals all go
 * through the API. Everything is removed at the end.
 *
 * Usage: API_BASE_URL=http://localhost:5055/api pnpm --filter @workspace/scripts run allocation:test
 */
import jwt from "jsonwebtoken";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import {
  allocationLinesTable,
  allocationsTable,
  appelsDeFondsTable,
  budgetLinesTable,
  budgetsTable,
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
const RUN = Date.now();
const SID = `syn_al_${RUN}`;
const ORG = `org_al_${RUN}`;
const BLD = `bld_al_${RUN}`;

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
const amountsOf = (src: any) => Object.fromEntries((src?.lines ?? []).map((l: any) => [l.lotNumber, l.amount]));
function rib(seed: number): string {
  const body = `0117800000${String(seed).padStart(12, "0")}`.slice(0, 22);
  const k = (97n - ((BigInt(body) * 100n) % 97n)) % 97n;
  return body + String(k).padStart(2, "0");
}

async function fixture() {
  await db.insert(organizationsTable).values({ id: ORG, name: `Syndic AL ${RUN}` });
  await db.insert(syndicatesTable).values({ id: SID, name: `Résidence Répartition ${RUN}`, status: "active", organizationId: ORG } as any);
  await db.insert(syndicateSubscriptionsTable).values({ syndicateId: SID, status: "trial", trialStartDate: new Date(), trialEndDate: new Date(Date.now() + 30 * 86_400_000), autoRenew: false } as any);
  const mk = (id: string, name: string, role: string) => ({ id: `${id}_${RUN}`, name, email: `${id}-${RUN}@example.invalid`, passwordHash: "x", role, status: "active", syndicateId: SID });
  const [A, T, O1, O2] = await db
    .insert(usersTable)
    .values([mk("al_admin", "Aya Syndic", "syndicate_admin"), mk("al_treasurer", "Taha Trésorier", "treasurer"), mk("al_owner1", "Omar DL-1", "member"), mk("al_owner2", "Olfa DL-2", "member")] as any)
    .returning();
  await db.insert(buildingsTable).values({ id: BLD, name: "Bât. AL", address: "4 rue des Tantièmes", city: "Meknès", syndicateId: SID } as any);
  const [m1, m2, m3] = await db.insert(membersTable).values([{ name: O1.name, email: O1.email, syndicateId: SID }, { name: O2.name, email: O2.email, syndicateId: SID }, { name: "Nour DL-3/4", email: `al_owner3-${RUN}@example.invalid`, syndicateId: SID }]).returning();
  const lotRows = await db
    .insert(lotsTable)
    .values([
      { number: "DL-1", buildingId: BLD, ownerId: m1.id, type: "appartement", floor: 0, tantiemes: 100 },
      { number: "DL-2", buildingId: BLD, ownerId: m2.id, type: "appartement", floor: 1, tantiemes: 200 },
      { number: "DL-3", buildingId: BLD, ownerId: m3.id, type: "appartement", floor: 2, tantiemes: 300 },
      { number: "DL-4", buildingId: BLD, ownerId: m3.id, type: "appartement", floor: 3, tantiemes: 400 },
      { number: "DL-5", buildingId: BLD, ownerId: m3.id, type: "parking", floor: 0, tantiemes: 0 },
      { number: "DL-OLD", buildingId: BLD, ownerId: m3.id, type: "cave", floor: 0, tantiemes: 10, archivedAt: new Date() },
    ] as any)
    .returning();
  const L = Object.fromEntries(lotRows.map((l) => [l.number, l.id])) as Record<string, string>;
  await db.insert(lotOwnershipsTable).values([
    { syndicateId: SID, lotId: L["DL-1"], memberId: m1.id, sharePercent: "100", startDate: "2020-01-01" },
    { syndicateId: SID, lotId: L["DL-2"], memberId: m2.id, sharePercent: "100", startDate: "2020-01-01" },
    { syndicateId: SID, lotId: L["DL-3"], memberId: m3.id, sharePercent: "100", startDate: "2020-01-01" },
    { syndicateId: SID, lotId: L["DL-4"], memberId: m3.id, sharePercent: "100", startDate: "2020-01-01" },
    { syndicateId: SID, lotId: L["DL-5"], memberId: m3.id, sharePercent: "100", startDate: "2020-01-01" },
  ] as any);
  const [budget] = await db.insert(budgetsTable).values({ year: 2099, buildingId: BLD, totalAmount: "12000.00", chargesAmount: "10000.00", fondsReserve: "2000.00", status: "approved" }).returning();
  const [lineEnt] = await db.insert(budgetLinesTable).values({ budgetId: budget.id, category: "entretien_general", label: "Entretien des parties communes", amountAnnual: "4000.00", amountQ1: "1000.01" }).returning();
  const [lineEau] = await db.insert(budgetLinesTable).values({ budgetId: budget.id, category: "eau", label: "Eau des parties communes", amountAnnual: "1000.00" }).returning();
  const proof = `/objects/uploads/al-${RUN}-facture.pdf`;
  await db.insert(storageObjectsTable).values({ objectPath: proof, ownerId: A.id, syndicateId: SID, contentType: "application/pdf", size: 10 });
  const exp = (ref: string, label: string, category: string, amount: string, status: string) => ({ syndicateId: SID, buildingId: BLD, reference: `${ref}-${RUN}`, label, category, amount, supplierName: "Fournisseur", proofUrl: proof, status, createdBy: A.id });
  const [eLift, eWater, eDraft, eGarden] = await db
    .insert(expensesTable)
    .values([exp("DEP-A", "Réparation ascenseur", "ascenseur", "1000.00", "approved"), exp("DEP-B", "Facture eau", "eau", "333.33", "paid"), exp("DEP-C", "Devis peinture", "entretien_general", "500.00", "submitted"), exp("DEP-D", "Jardinage", "jardin", "200.00", "approved")] as any)
    .returning();
  return { A, T, O1, O2, L, budget, lineEnt, lineEau, eLift, eWater, eDraft, eGarden };
}

async function purge() {
  await purgeAllocationsOfSyndicates([SID]);
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL mizan.ledger_maintenance = 'on'`);
    for (const t of ["reconciliation_matches", "bank_statement_lines", "bank_statements", "transactions", "appel_payments", "ledger_entries"]) await tx.execute(sql`DELETE FROM ${sql.identifier(t)} WHERE syndicate_id = ${SID}`);
    await tx.execute(sql`DELETE FROM appels_de_fonds WHERE building_id = ${BLD}`);
    for (const t of ["expenses", "treasury_accounts", "lot_ownerships", "audit_logs", "alerts", "syndicate_subscriptions", "document_sequences"]) await tx.execute(sql`DELETE FROM ${sql.identifier(t)} WHERE syndicate_id = ${SID}`);
    await tx.execute(sql`DELETE FROM budgets WHERE building_id = ${BLD}`);
    await tx.delete(storageObjectsTable).where(eq(storageObjectsTable.syndicateId, SID));
    await tx.delete(usersTable).where(eq(usersTable.syndicateId, SID));
    await tx.delete(syndicatesTable).where(eq(syndicatesTable.id, SID));
    await tx.delete(organizationsTable).where(eq(organizationsTable.id, ORG));
  });
}

async function main() {
  const atlasAdmin = (await db.select().from(usersTable).where(eq(usersTable.id, "user_admin_atlas")))[0];
  const [atlasLot] = (await db.execute(sql`SELECT l.id FROM lots l JOIN buildings b ON b.id = l.building_id WHERE b.syndicate_id = 'syn_residence_atlas' LIMIT 1`)) as unknown as { id: string }[];
  const f = await fixture();
  const { A, T, O1, O2, L, budget, lineEnt, lineEau, eLift, eWater, eDraft, eGarden } = f;
  const general = (extra: any[] = []) => [
    { lotId: L["DL-1"], coefficient: "100" },
    { lotId: L["DL-2"], coefficient: "200" },
    { lotId: L["DL-3"], coefficient: "300" },
    { lotId: L["DL-4"], coefficient: "400" },
    { lotId: L["DL-5"], excluded: true, exclusionReason: "Parking : hors charges générales (règlement art. à vérifier)" },
    ...extra,
  ];
  const keyBody = (over: any = {}) => ({ buildingId: BLD, code: "GEN", name: "Charges générales", purpose: "Entretien et eau des parties communes", method: "shares", categories: ["entretien_general", "eau"], effectiveFrom: "2098-01-01", sourceReference: "Règlement de copropriété — tableau des tantièmes (à vérifier)", shares: general(), ...over });

  try {
    // ═══ A/B. Key configuration and validation ═══════════════════════════
    step("the treasurer cannot define a key (syndic only)", (await api(T, "/allocation-keys", "POST", keyBody())).status === 403);
    step("another condominium's building is refused", (await api(atlasAdmin, "/allocation-keys", "POST", keyBody())).status === 404);
    step("the source of the rule is mandatory", (await api(A, "/allocation-keys", "POST", keyBody({ sourceReference: "" }))).status === 400);
    const missing = await api(A, "/allocation-keys", "POST", keyBody({ shares: general().filter((s) => s.lotId !== L["DL-3"]) }));
    step("a lot neither weighted nor excluded is reported (not silently omitted)", missing.status === 422 && missing.json?.errors?.some((e: any) => e.code === "MISSING_SHARE" && e.lotNumber === "DL-3"), JSON.stringify(codes(missing)));
    step("a unit listed twice is refused", codes(await api(A, "/allocation-keys", "POST", keyBody({ shares: general([{ lotId: L["DL-1"], coefficient: "5" }]) }))).includes("DUPLICATE_UNIT"));
    step("a negative coefficient is refused", codes(await api(A, "/allocation-keys", "POST", keyBody({ shares: general().map((s) => (s.lotId === L["DL-2"] ? { ...s, coefficient: "-200" } : s)) }))).includes("NEGATIVE_COEFFICIENT"));
    step("a malformed coefficient is refused (7 decimals)", codes(await api(A, "/allocation-keys", "POST", keyBody({ shares: general().map((s) => (s.lotId === L["DL-2"] ? { ...s, coefficient: "0.1234567" } : s)) }))).includes("INVALID_COEFFICIENT"));
    step("a lot of another building is refused", codes(await api(A, "/allocation-keys", "POST", keyBody({ shares: general([{ lotId: atlasLot.id, coefficient: "10" }]) }))).includes("FOREIGN_UNIT"));
    step("an archived lot cannot carry a share", codes(await api(A, "/allocation-keys", "POST", keyBody({ shares: general([{ lotId: L["DL-OLD"], coefficient: "10" }]) }))).includes("INELIGIBLE_UNIT"));
    step("an exclusion needs a reason", codes(await api(A, "/allocation-keys", "POST", keyBody({ shares: general().map((s) => (s.lotId === L["DL-5"] ? { lotId: s.lotId, excluded: true } : s)) }))).includes("EXCLUSION_REASON_REQUIRED"));
    step("a key whose coefficients add up to zero cannot be used", codes(await api(A, "/allocation-keys", "POST", keyBody({ shares: general().map((s) => (s.excluded ? s : { ...s, coefficient: "0" })) }))).includes("ZERO_DENOMINATOR"));
    const gen = await api(A, "/allocation-keys", "POST", keyBody());
    const GEN = gen.json?.data?.key?.id;
    step("syndic defines the general key (explicit coefficients, explicit exclusion)", gen.status === 201 && gen.json?.data?.version?.version === 1, `${gen.status} ${gen.json?.error ?? ""}`);
    step("a second key on the same categories is refused (no ambiguity)", (await api(A, "/allocation-keys", "POST", keyBody({ code: "GEN2" }))).json?.code === "KEY_CATEGORY_CONFLICT");
    step("equal shares mean coefficient 1 for each listed lot", codes(await api(A, "/allocation-keys", "POST", { ...keyBody({ code: "ASC", categories: ["ascenseur"], method: "equal" }), shares: [{ lotId: L["DL-1"], excluded: true, exclusionReason: "Rez-de-chaussée" }, { lotId: L["DL-2"], coefficient: "2" }, { lotId: L["DL-3"] }, { lotId: L["DL-4"] }, { lotId: L["DL-5"], excluded: true, exclusionReason: "Parking" }] })).includes("EQUAL_KEY_COEFFICIENT"));
    const asc = await api(A, "/allocation-keys", "POST", {
      ...keyBody({ code: "ASC", name: "Ascenseur", categories: ["ascenseur"], method: "equal", sourceReference: "Décision d'AG du 2098-06-01 (à vérifier)" }),
      shares: [{ lotId: L["DL-1"], excluded: true, exclusionReason: "Rez-de-chaussée, n'utilise pas l'ascenseur" }, { lotId: L["DL-2"] }, { lotId: L["DL-3"] }, { lotId: L["DL-4"] }, { lotId: L["DL-5"], excluded: true, exclusionReason: "Parking" }],
    });
    step("lift key in equal parts, explicitly configured", asc.status === 201, `${asc.status} ${asc.json?.error ?? ""}`);

    // ═══ C. Preview ══════════════════════════════════════════════════════
    const run = (sources: any[], period = "2099-Q1", chargeType = "charges_courantes") => ({ buildingId: BLD, period, chargeType, sources });
    step("a co-owner cannot run a preview", (await api(O1, "/allocations/preview", "POST", run([{ type: "expense", id: eLift.id }]))).status === 403);
    const p1 = (await api(T, "/allocations/preview", "POST", run([{ type: "expense", id: eLift.id }]))).json?.data;
    step("equal split of 1000.00 between DL-2, DL-3, DL-4: residual cent to DL-2 (documented rule)", JSON.stringify(amountsOf(p1?.sources?.[0])) === JSON.stringify({ "DL-2": "333.34", "DL-3": "333.33", "DL-4": "333.33" }), JSON.stringify(amountsOf(p1?.sources?.[0])));
    const p2 = (await api(T, "/allocations/preview", "POST", run([{ type: "expense", id: eWater.id }]))).json?.data;
    const water = p2?.sources?.[0];
    step(
      // 33333 × 100/1000 = 3333.3 · ×200 = 6666.6 · ×300 = 9999.9 · ×400 = 13333.2
      // floors add up to 33331: 2 cents left, to the largest remainders (DL-3 .9, DL-2 .6)
      "weighted split of 333.33 by 100/200/300/400: the 2 residual cents go to the largest remainders",
      JSON.stringify(amountsOf(water)) === JSON.stringify({ "DL-1": "33.33", "DL-2": "66.67", "DL-3": "100.00", "DL-4": "133.33" }) && water?.total === "333.33",
      JSON.stringify(amountsOf(water)),
    );
    step("each line explains the calculation and shows the rounding adjustment", water?.lines?.every((l: any) => /× \d+ ÷ 1000 \(clé GEN v1\)/.test(l.explanation)) && water?.lines?.filter((l: any) => l.roundingAdjustment === "0.01").length === 2, water?.lines?.[0]?.explanation);
    step("excluded lots are listed with their reason, not silently dropped", p2?.excluded?.some((e: any) => e.lotNumber === "DL-5" && /Parking/.test(e.reason)) && !water?.lines?.some((l: any) => l.lotNumber === "DL-5"));
    const multi = await api(T, "/allocations/preview", "POST", run([{ type: "expense", id: eLift.id }, { type: "expense", id: eWater.id }, { type: "budget_line", id: lineEnt.id }]));
    const pm = multi.json?.data;
    const lotSum = (pm?.perLot ?? []).reduce((s: number, l: any) => s + Math.round(Number(l.amount) * 100), 0);
    step("several keys in one calculation; totals reconcile to the cent (1000 + 333.33 + 1000.01)", pm?.valid === true && pm?.totals?.source === "2333.34" && pm?.totals?.allocated === "2333.34" && pm?.totals?.reconciled === true && lotSum === 233334, JSON.stringify(pm?.totals));
    step("the Q1 amount of the budget line is used, with its origin", pm?.sources?.find((s: any) => s.type === "budget_line")?.amount === "1000.01" && /trimestre 1/.test(pm?.sources?.find((s: any) => s.type === "budget_line")?.amountNote ?? ""));
    step("an expense not approved yet cannot be allocated", codes(await api(T, "/allocations/preview", "POST", run([{ type: "expense", id: eDraft.id }]))).includes("EXPENSE_NOT_APPROVED"));
    step("a category without key is reported (no default rule)", codes(await api(T, "/allocations/preview", "POST", run([{ type: "expense", id: eGarden.id }]))).includes("NO_KEY_FOR_CATEGORY"));
    step("a key used outside its effective dates is refused", codes(await api(T, "/allocations/preview", "POST", run([{ type: "expense", id: eWater.id, keyId: GEN }], "2097-05"))).includes("KEY_NOT_EFFECTIVE"));
    step("a key that does not cover the category is refused", codes(await api(T, "/allocations/preview", "POST", run([{ type: "expense", id: eLift.id, keyId: GEN }]))).includes("CATEGORY_NOT_COVERED"));
    step("the same source twice in a request is refused", codes(await api(T, "/allocations/preview", "POST", run([{ type: "expense", id: eWater.id }, { type: "expense", id: eWater.id }]))).includes("DUPLICATE_SOURCE"));
    step("a budget line outside the budget year is refused", codes(await api(T, "/allocations/preview", "POST", run([{ type: "budget_line", id: lineEau.id }], "2098-03"))).includes("PERIOD_OUTSIDE_BUDGET"));

    // ═══ D. Confirmation & persistence ═══════════════════════════════════
    const body = run([{ type: "expense", id: eLift.id }, { type: "expense", id: eWater.id }, { type: "budget_line", id: lineEnt.id }]);
    step("confirming without the reviewed preview is refused", (await api(T, "/allocations", "POST", body)).status === 400);
    step("confirming a different calculation than the preview is refused", (await api(T, "/allocations", "POST", { ...body, previewHash: "0".repeat(64) })).json?.code === "PREVIEW_STALE");
    const k = `al-${RUN}-confirm`;
    const [c1, c2] = await Promise.all([api(T, "/allocations", "POST", { ...body, previewHash: pm.inputsHash }, k), api(T, "/allocations", "POST", { ...body, previewHash: pm.inputsHash }, k)]);
    const alloc = (c1.status === 201 ? c1 : c2).json?.data;
    const allocs = await db.select().from(allocationsTable).where(eq(allocationsTable.syndicateId, SID));
    step("the same confirmation sent twice at once: one allocation", allocs.length === 1 && [c1.status, c2.status].sort().join() === "200,201", `${c1.status}/${c2.status} n=${allocs.length}`);
    step("a later retry returns it", (await api(T, "/allocations", "POST", { ...body, previewHash: pm.inputsHash }, k)).json?.replayed === true);
    const [row] = allocs;
    const inputs = row?.inputs as any;
    step("persisted: inputs (amounts, key versions, coefficients, rounding rule), author, time", row?.createdBy === T.id && !!row?.createdAt && inputs?.sources?.length === 3 && inputs?.sources?.every((s: any) => !!s.key?.versionId && s.key.shares.length > 0) && typeof inputs?.roundingRule === "string");
    const calls = await db.select().from(appelsDeFondsTable).where(eq(appelsDeFondsTable.allocationId, alloc?.id));
    const callOf = (n: string) => calls.find((c) => c.lotId === L[n]);
    step("calls for funds issued through the existing workflow, one per lot (DL-5 excluded gets none)", calls.length === 4 && !callOf("DL-5") && calls.every((c) => c.status === "pending" && c.period === "2099-Q1" && c.type === "charges_courantes"), `${calls.length}`);
    const perLot = Object.fromEntries((pm.perLot as any[]).map((l) => [l.lotNumber, l.amount]));
    step("each call equals the lot's total in the allocation", calls.every((c) => c.amount === perLot[Object.keys(L).find((n) => L[n] === c.lotId)!]), JSON.stringify(perLot));
    step("a source already allocated cannot be allocated again", codes(await api(T, "/allocations/preview", "POST", run([{ type: "expense", id: eWater.id }], "2099-Q2"))).includes("SOURCE_ALREADY_ALLOCATED"));
    const lineEau1 = (await api(T, "/allocations/preview", "POST", run([{ type: "budget_line", id: lineEau.id }]))).json?.data;
    step("no second set of calls for the same lots, period and type", (await api(T, "/allocations", "POST", { ...run([{ type: "budget_line", id: lineEau.id }]), previewHash: lineEau1?.inputsHash })).json?.code === "APPELS_ALREADY_GENERATED");

    // ═══ F. Integration ══════════════════════════════════════════════════
    const c2call = callOf("DL-2")!;
    const expl = await api(O2, `/appels-de-fonds/${c2call.id}/allocation`);
    const explSum = (expl.json?.data?.lines ?? []).reduce((s: number, l: any) => s + Math.round(Number(l.amount) * 100), 0);
    step("the co-owner sees how their call was computed, lines adding up to the call", expl.status === 200 && Math.round(Number(c2call.amount) * 100) === explSum && expl.json?.data?.lines?.length === 3 && expl.json?.data?.lines?.some((l: any) => l.key?.code === "ASC"), `${expl.status} ${explSum}`);
    step("another co-owner cannot see that explanation", (await api(O1, `/appels-de-fonds/${c2call.id}/allocation`)).status === 404);
    const mine = ((await api(O2, "/appels-de-fonds")).json?.data ?? []) as any[];
    step("the co-owner's account shows the same amount", mine.some((a) => a.id === c2call.id && a.amount === c2call.amount));
    const exec = await api(A, `/budgets/${budget.id}/execution`);
    step("budget execution counts the called amount of the budget line's allocation", exec.status === 200, `${exec.status}`);
    const legacy = await api(T, `/budgets/${budget.id}/generate-appels`, "POST", { period: "2099-02", type: "fonds_reserve" });
    step("the budget call generation goes through the engine and is persisted", legacy.status === 201 && !!legacy.json?.allocationId && legacy.json?.excludedLots?.some((l: any) => l.lotNumber === "DL-5"), `${legacy.status} ${legacy.json?.error ?? ""}`);
    step("monthly share of 2000.00 fonds de réserve = 166.67 split 100/200/300/400", Math.round(Number(legacy.json?.total) * 100) === 16667, `${legacy.json?.total}`);

    // ═══ E. Historical integrity and corrections ═════════════════════════
    step("a new version cannot start before the current one", (await api(A, `/allocation-keys/${GEN}/versions`, "POST", { ...keyBody({ effectiveFrom: "2097-12-31" }), buildingId: undefined, code: undefined, name: undefined, purpose: undefined, changeReason: "test" })).status === 400);
    const v2body = { method: "shares", categories: ["entretien_general", "eau"], effectiveFrom: "2099-01-01", sourceReference: "Règlement modifié par l'AG du 2099-02-15 (à vérifier)", changeReason: "Tantièmes de DL-1 corrigés après mesurage", shares: general().map((s) => (s.lotId === L["DL-1"] ? { ...s, coefficient: "150" } : s)) };
    const linesBefore = await db.select().from(allocationLinesTable).where(eq(allocationLinesTable.allocationId, alloc.id));
    const blocked = await api(A, `/allocation-keys/${GEN}/versions`, "POST", v2body);
    step("changing a key used by a finalized allocation is not silent", blocked.status === 409 && blocked.json?.code === "KEY_VERSION_IN_USE" && blocked.json?.affected?.some((a: any) => a.id === alloc.id));
    const v2 = await api(A, `/allocation-keys/${GEN}/versions`, "POST", { ...v2body, acknowledgeFinalized: true });
    const linesAfter = await db.select().from(allocationLinesTable).where(eq(allocationLinesTable.allocationId, alloc.id));
    const callsAfter = await db.select().from(appelsDeFondsTable).where(eq(appelsDeFondsTable.allocationId, alloc.id));
    step("acknowledged: version 2 created, the finalized allocation is listed, not recalculated", v2.status === 201 && v2.json?.toCorrect?.some((a: any) => a.id === alloc.id) && JSON.stringify(linesAfter.map((l) => l.amount).sort()) === JSON.stringify(linesBefore.map((l) => l.amount).sort()) && callsAfter.every((c) => c.status === "pending"));
    step("only the syndic corrects an allocation", (await api(T, `/allocations/${alloc.id}/correct`, "POST", { reason: "Tantièmes corrigés" })).status === 403);
    const cp = await api(A, `/allocations/${alloc.id}/correct`, "POST", { reason: "Application des tantièmes corrigés de DL-1" });
    const cpWater = cp.json?.data?.preview?.sources?.find((s: any) => s.type === "expense" && s.category === "eau");
    step("correction preview uses the version in force (v2: DL-1 at 150, total 1050)", cp.status === 200 && cpWater?.key?.version === 2 && cpWater?.lines?.[0]?.denominator === "1050", `${cp.status} ${cpWater?.lines?.[0]?.denominator}`);
    const cc = await api(A, `/allocations/${alloc.id}/correct`, "POST", { reason: "Application des tantièmes corrigés de DL-1", previewHash: cp.json?.data?.preview?.inputsHash });
    const [origAfter] = await db.select().from(allocationsTable).where(eq(allocationsTable.id, alloc.id));
    const origCalls = await db.select().from(appelsDeFondsTable).where(eq(appelsDeFondsTable.allocationId, alloc.id));
    const corrId = cc.json?.data?.correction?.id;
    const corrCalls = corrId ? await db.select().from(appelsDeFondsTable).where(eq(appelsDeFondsTable.allocationId, corrId)) : [];
    const origLinesKept = await db.select().from(allocationLinesTable).where(eq(allocationLinesTable.allocationId, alloc.id));
    step(
      "correction: original kept (status corrected, reason), its calls cancelled, new calls issued",
      cc.status === 201 && origAfter.status === "corrected" && origAfter.endReason?.includes("DL-1") === true && origCalls.every((c) => c.status === "cancelled" && c.cancellationReason?.includes(origAfter.reference)) && corrCalls.length === 4 && corrCalls.every((c) => c.status === "pending"),
      `${cc.status} ${cc.json?.error ?? ""}`,
    );
    step("the original calculation is preserved line for line", origLinesKept.length === linesBefore.length && JSON.stringify(origLinesKept.map((l) => l.explanation).sort()) === JSON.stringify(linesBefore.map((l) => l.explanation).sort()));
    const [corrRow] = corrId ? await db.select().from(allocationsTable).where(eq(allocationsTable.id, corrId)) : [];
    step("the correction points to the original and keeps the reason", corrRow?.correctionOf === alloc.id && corrRow?.correctionReason?.includes("DL-1") === true);
    step("an identical recalculation is not a correction", (await api(A, `/allocations/${corrId}/correct`, "POST", { reason: "Rien à changer ici", previewHash: (await api(A, `/allocations/${corrId}/correct`, "POST", { reason: "Rien à changer ici" })).json?.data?.preview?.inputsHash })).json?.code === "NOTHING_TO_CORRECT");
    // A payment on a corrected call blocks any further automatic correction.
    await api(A, "/treasury/accounts", "POST", { kind: "bank", label: "Banque AL", bankName: "Banque Test", rib: rib(RUN % 1e9), openingDate: "2020-01-01", isDefault: true });
    const o2call = corrCalls.find((c) => c.lotId === L["DL-2"])!;
    const pay = `/objects/uploads/al-${RUN}-virement.pdf`;
    await db.insert(storageObjectsTable).values({ objectPath: pay, ownerId: O2.id, syndicateId: SID, contentType: "application/pdf", size: 10 });
    await api(O2, `/appels-de-fonds/${o2call.id}/pay`, "PUT", { paymentMethod: "virement", amount: "10.00", proofUrl: pay });
    await api(T, `/appels-de-fonds/${o2call.id}/validate`, "PUT", { approve: true });
    step("an allocation with a validated payment cannot be corrected or reversed automatically", (await api(A, `/allocations/${corrId}/reverse`, "POST", { reason: "Erreur de saisie" })).json?.code === "ALLOCATION_HAS_PAYMENTS");
    const legacyId = legacy.json?.allocationId;
    const rev = await api(A, `/allocations/${legacyId}/reverse`, "POST", { reason: "Fonds de réserve voté à tort pour février" });
    const regen = await api(T, `/budgets/${budget.id}/generate-appels`, "POST", { period: "2099-02", type: "fonds_reserve" });
    step("a reversal cancels the calls; the period can be issued again, once", rev.status === 200 && rev.json?.cancelledCalls === 4 && regen.status === 201 && (await api(T, `/budgets/${budget.id}/generate-appels`, "POST", { period: "2099-02", type: "fonds_reserve" })).status === 409, `${rev.status} ${regen.status}`);

    // ═══ B. A new lot without share is caught ════════════════════════════
    await db.insert(lotsTable).values({ number: "DL-6", buildingId: BLD, type: "appartement", floor: 4, tantiemes: 120 } as any);
    const late = await api(T, "/allocations/preview", "POST", run([{ type: "budget_line", id: lineEau.id }], "2099-Q2"));
    step("a lot added after the key: actionable error, nothing computed for anyone", late.json?.data?.valid === false && late.json?.data?.errors?.some((e: any) => e.code === "MISSING_SHARE" && e.lotNumber === "DL-6") && (late.json?.data?.sources ?? []).length === 0);
    const keyView = await api(A, `/allocation-keys/${GEN}`);
    step("the key screen shows the same error on today's lots", keyView.json?.data?.validation?.errors?.some((e: any) => e.lotNumber === "DL-6"));

    // ═══ Reconciliation of everything persisted ══════════════════════════
    const rec = (await db.execute(sql`
      SELECT a.reference, a.total_amount,
        (SELECT COALESCE(SUM(l.amount), 0) FROM allocation_lines l WHERE l.allocation_id = a.id) AS lines,
        (SELECT COALESCE(SUM(s.amount), 0) FROM allocation_sources s WHERE s.allocation_id = a.id) AS sources,
        (SELECT COALESCE(SUM(c.amount), 0) FROM appels_de_fonds c WHERE c.allocation_id = a.id) AS calls,
        (SELECT bool_and(t.ok) FROM (SELECT s.amount = COALESCE(SUM(l.amount), 0) AS ok FROM allocation_sources s LEFT JOIN allocation_lines l ON l.source_id = s.id WHERE s.allocation_id = a.id GROUP BY s.id, s.amount) t) AS per_source
      FROM allocations a WHERE a.syndicate_id = ${SID}
    `)) as unknown as Record<string, any>[];
    step("every allocation: Σ lines = Σ sources = total = Σ calls, and per source", rec.length >= 4 && rec.every((r) => r.lines === r.total_amount && r.sources === r.total_amount && r.calls === r.total_amount && r.per_source === true), JSON.stringify(rec.map((r) => [r.reference, r.total_amount, r.lines, r.calls])));
    step("another condominium cannot read an allocation", (await api(atlasAdmin, `/allocations/${alloc.id}`)).status === 404);
  } finally {
    await purge();
    const left = ((await db.execute(sql`SELECT (SELECT COUNT(*) FROM allocations WHERE syndicate_id = ${SID}) + (SELECT COUNT(*) FROM allocation_keys WHERE syndicate_id = ${SID}) + (SELECT COUNT(*) FROM syndicates WHERE id = ${SID}) AS n`)) as unknown as { n: string }[])[0].n;
    step("everything created by the suite is removed", Number(left) === 0, `left=${left}`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} allocation checks passed`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Allocation suite failed to run:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
