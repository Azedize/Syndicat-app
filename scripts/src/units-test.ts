/**
 * Units (lots): register, ownership, occupancy and lifecycle — real HTTP API
 * against PostgreSQL, on the seeded Atlas / Agdal syndicates.
 *
 * Usage (API running, SMTP disabled):
 *   API_BASE_URL=http://localhost:5055/api pnpm --filter @workspace/scripts run units:test
 *
 * Every lot, tenancy, call and payment the suite creates uses a "UT-" lot
 * reference or a 2099-1x period and is removed at the end.
 */
import jwt from "jsonwebtoken";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import {
  appelPaymentsTable,
  appelsDeFondsTable,
  auditLogsTable,
  ledgerEntriesTable,
  lotOwnershipsTable,
  lotsTable,
  storageObjectsTable,
  tenantsTable,
  transactionsTable,
  usersTable,
} from "@workspace/db/schema";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");
const RUN = Date.now();
const BUILDING = "building_atlas_a";
const BUDGET = "budget_atlas_2026";
const PERIODS = ["2099-10", "2099-11", "2099-12"];
const TENANT_EMAIL = `ut-tenant-${RUN}@example.invalid`;

type U = typeof usersTable.$inferSelect;
const results: { name: string; pass: boolean; detail: string }[] = [];
function step(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const tokenFor = (u: U) =>
  jwt.sign({ userId: u.id, email: u.email, role: u.role, syndicateId: u.syndicateId ?? undefined, name: u.name }, JWT_SECRET!, { expiresIn: "15m" });
async function user(id: string): Promise<U> {
  const [row] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!row) throw new Error(`Fixture user ${id} missing — run pnpm db:seed`);
  return row;
}
async function api(u: U, p: string, method = "GET", body?: unknown) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { Authorization: `Bearer ${tokenFor(u)}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => null);
  return { status: res.status, json };
}
const ids = (r: { json: any }) => ((r.json?.data ?? []) as any[]).map((l) => l.id);

async function main() {
  const admin = await user("user_admin_atlas");
  const secretary = await user("user_secretary_atlas");
  const treasurer = await user("user_treasurer_atlas");
  const mohammed = await user("user_member_1"); // members.member_1
  const khadija = await user("user_member_2"); // members.member_2
  const hassan = await user("user_member_5"); // members.member_3
  const agdalAdmin = await user("user_admin_agdal");
  const created: string[] = [];
  let tenantUser: U | null = null;

  try {
    // ═══ 1. Creation & validation ════════════════════════════════════════
    const a1 = await api(admin, "/lots", "POST", { number: "UT-A1", type: "appartement", floor: 2, surfaceM2: 65.5, tantiemes: 120, buildingId: BUILDING, ownerId: "member_2" });
    const a1Id = a1.json?.id;
    if (a1Id) created.push(a1Id);
    step("syndic creates an apartment with one owner", a1.status === 201 && a1.json?.ownerId === "member_2" && a1.json?.status === "occupied", `status=${a1.status} ${a1.json?.error ?? ""}`);
    const own1 = await db.select().from(lotOwnershipsTable).where(eq(lotOwnershipsTable.lotId, a1Id));
    step("DB: one ownership period at 100 %", own1.length === 1 && own1[0].sharePercent === "100.00" && own1[0].endDate === null);
    const noFloor = await api(admin, "/lots", "POST", { number: "UT-X", type: "appartement", tantiemes: 10, buildingId: BUILDING });
    step("an apartment needs a floor (clear error, no lot created)", noFloor.status === 400 && noFloor.json?.field === "floor", `status=${noFloor.status} field=${noFloor.json?.field}`);
    const badType = await api(admin, "/lots", "POST", { number: "UT-X", type: "chateau", floor: 1, tantiemes: 10, buildingId: BUILDING });
    step("an unknown unit type is refused", badType.status === 400);
    const p1 = await api(admin, "/lots", "POST", { number: "UT-P1", type: "parking", tantiemes: 0, buildingId: BUILDING, ownerId: "member_1" });
    if (p1.json?.id) created.push(p1.json.id);
    step("a parking space needs no floor", p1.status === 201, `status=${p1.status} ${p1.json?.error ?? ""}`);
    const dup = await api(admin, "/lots", "POST", { number: "ut-a1", type: "appartement", floor: 3, tantiemes: 10, buildingId: BUILDING });
    step("duplicate reference in the building refused (case-insensitive)", dup.status === 409 && dup.json?.code === "LOT_REFERENCE_EXISTS");
    const [d1, d2] = await Promise.all([
      api(admin, "/lots", "POST", { number: "UT-DUP", type: "cave", tantiemes: 1, buildingId: BUILDING }),
      api(admin, "/lots", "POST", { number: "UT-DUP", type: "cave", tantiemes: 1, buildingId: BUILDING }),
    ]);
    for (const r of [d1, d2]) if (r.json?.id) created.push(r.json.id);
    step("two simultaneous creations of the same reference: one lot", [d1.status, d2.status].sort().join() === "201,409", `${d1.status}/${d2.status}`);

    // ═══ 2. Permissions & isolation ══════════════════════════════════════
    step("treasurer cannot create a lot", (await api(treasurer, "/lots", "POST", { number: "UT-T", type: "cave", tantiemes: 1, buildingId: BUILDING })).status === 403);
    const s1 = await api(secretary, "/lots", "POST", { number: "UT-S1", type: "cave", tantiemes: 0, buildingId: BUILDING });
    if (s1.json?.id) created.push(s1.json.id);
    step("secretary can register a lot", s1.status === 201, `status=${s1.status}`);
    step("secretary cannot change owners", (await api(secretary, `/lots/${a1Id}/owners`, "PUT", { owners: [{ memberId: "member_1", sharePercent: 100 }], reason: "test vente" })).status === 403);
    step("a co-owner cannot change owners", (await api(khadija, `/lots/${a1Id}/owners`, "PUT", { owners: [{ memberId: "member_2", sharePercent: 100 }], reason: "moi seul" })).status === 403);
    step("other syndicate cannot create a lot in this building", (await api(agdalAdmin, "/lots", "POST", { number: "UT-AG", type: "cave", tantiemes: 1, buildingId: BUILDING })).status === 404);
    step("other syndicate cannot open the lot", (await api(agdalAdmin, `/lots/${a1Id}`)).status === 404);
    step("other syndicate never lists it", !ids(await api(agdalAdmin, "/lots?q=UT-")).includes(a1Id));
    const foreignOwner = await api(admin, "/lots", "POST", { number: "UT-F", type: "cave", tantiemes: 1, buildingId: BUILDING, ownerId: "member_4" });
    step("an owner from another syndicate is refused", foreignOwner.status === 400 && foreignOwner.json?.code === "FOREIGN_REFERENCE");
    step("Mohammed (not owner) cannot open Khadija's lot", (await api(mohammed, `/lots/${a1Id}`)).status === 403);

    // ═══ 3. Co-ownership & several units ═════════════════════════════════
    const badSum = await api(admin, `/lots/${a1Id}/owners`, "PUT", { owners: [{ memberId: "member_2", sharePercent: 60 }, { memberId: "member_3", sharePercent: 30 }], reason: "mariage" });
    step("co-owner shares must total 100 %", badSum.status === 400);
    const co = await api(admin, `/lots/${a1Id}/owners`, "PUT", { owners: [{ memberId: "member_2", sharePercent: 50 }, { memberId: "member_3", sharePercent: 50 }], reason: "Acte de donation" });
    step("syndic adds a co-owner (50 / 50)", co.status === 200 && (co.json?.data?.owners ?? []).length === 2, `status=${co.status} ${co.json?.error ?? ""}`);
    const history1 = await db.select().from(lotOwnershipsTable).where(eq(lotOwnershipsTable.lotId, a1Id));
    step("DB: the 100 % period is closed, not rewritten; two current 50 % periods", history1.length === 3 && history1.filter((h) => h.endDate === null).every((h) => h.sharePercent === "50.00"));
    step("both co-owners see the lot", ids(await api(khadija, "/lots")).includes(a1Id) && ids(await api(hassan, "/lots")).includes(a1Id));
    const mine = ids(await api(mohammed, "/lots"));
    step("an owner of several units sees each of them", mine.includes(p1.json?.id) && mine.includes("lot_a101") && mine.includes("lot_a301"), `n=${mine.length}`);

    // ═══ 4. Occupancy: tenant in, out, next tenant ═══════════════════════
    const moveIn = await api(secretary, `/lots/${a1Id}/tenancy`, "POST", { tenant: { name: "Youssef Locataire", email: TENANT_EMAIL }, monthlyRent: 4500 });
    step("the lot is rented to a tenant", moveIn.status === 201, `status=${moveIn.status} ${moveIn.json?.error ?? ""}`);
    const [rented] = await db.select().from(lotsTable).where(eq(lotsTable.id, a1Id));
    step("DB: lot rented and pointing to the lease", rented.status === "rented" && rented.tenantId === moveIn.json?.data?.id);
    step("a second lease on a rented lot is refused", (await api(secretary, `/lots/${a1Id}/tenancy`, "POST", { tenant: { name: "Autre" } })).status === 409);
    step("a tenant is never made owner", (await db.select().from(lotOwnershipsTable).where(and(eq(lotOwnershipsTable.lotId, a1Id), sql`end_date IS NULL`))).length === 2);
    [tenantUser] = await db.insert(usersTable).values({ name: "Youssef Locataire", email: TENANT_EMAIL, passwordHash: "x", role: "tenant", status: "active", syndicateId: admin.syndicateId }).returning();
    const tenantView = await api(tenantUser, `/lots/${a1Id}`);
    step("tenant sees their lot, without owners' or financial data", tenantView.status === 200 && (tenantView.json?.owners ?? []).length === 0 && (tenantView.json?.charges ?? []).length === 0);
    step("tenant has no access to calls for funds", (await api(tenantUser, "/appels-de-fonds")).status === 403);
    const moveOut = await api(secretary, `/lots/${a1Id}/tenancy/end`, "POST", { nextStatus: "vacant" });
    step("the tenant leaves; the lot is vacant", moveOut.status === 200 && (await db.select().from(lotsTable).where(eq(lotsTable.id, a1Id)))[0].status === "vacant");
    step("the former tenant loses access to the lot", (await api(tenantUser, `/lots/${a1Id}`)).status === 403 && (await api(tenantUser, "/lots/my-lot")).status === 404);
    const next = await api(secretary, `/lots/${a1Id}/tenancy`, "POST", { tenant: { name: "Nadia Nouvelle" } });
    const tenancies = await db.select().from(tenantsTable).where(eq(tenantsTable.lotId, a1Id));
    step("another tenant arrives; the previous lease stays in history", next.status === 201 && tenancies.length === 2 && tenancies.some((t) => t.status === "expired"));

    // ═══ 5. Sale with an outstanding balance ═════════════════════════════
    const gen = await api(treasurer, `/budgets/${BUDGET}/generate-appels`, "POST", { period: PERIODS[0] });
    const calls = await db.select().from(appelsDeFondsTable).where(eq(appelsDeFondsTable.period, PERIODS[0]));
    const a1Call = calls.find((c) => c.lotId === a1Id);
    step("calls issued; the 0-tantième parking gets none", gen.status === 201 && !!a1Call && !calls.some((c) => c.lotId === p1.json?.id), `status=${gen.status}`);
    const noAck = await api(admin, `/lots/${a1Id}/owners`, "PUT", { owners: [{ memberId: "member_1", sharePercent: 100 }], reason: "Vente notariée" });
    step("selling a lot with unpaid calls requires confirmation", noAck.status === 409 && noAck.json?.code === "OUTSTANDING_BALANCE" && (noAck.json?.details?.byDebtor ?? []).length > 0, `status=${noAck.status}`);
    const sale = await api(admin, `/lots/${a1Id}/owners`, "PUT", { owners: [{ memberId: "member_1", sharePercent: 100 }], reason: "Vente notariée", acknowledgeOutstanding: true });
    step("the sale is recorded once confirmed", sale.status === 200 && sale.json?.data?.mainOwnerId === "member_1", `status=${sale.status} ${sale.json?.error ?? ""}`);
    const [callAfter] = await db.select().from(appelsDeFondsTable).where(eq(appelsDeFondsTable.id, a1Call!.id));
    step("the unpaid call keeps its original debtor (never rewritten)", callAfter.ownerId === a1Call!.ownerId && callAfter.ownerId === "member_2");
    step("Khadija (seller) still sees her debt", (await api(khadija, `/appels-de-fonds?period=${PERIODS[0]}`)).json?.data?.some((c: any) => c.id === a1Call!.id));
    step("Hassan (co-owner at issue) sees it too", (await api(hassan, `/appels-de-fonds?period=${PERIODS[0]}`)).json?.data?.some((c: any) => c.id === a1Call!.id));
    step("Mohammed (buyer) does not inherit it", !(await api(mohammed, `/appels-de-fonds?period=${PERIODS[0]}`)).json?.data?.some((c: any) => c.id === a1Call!.id));
    step("the sellers lose access to the lot", (await api(khadija, `/lots/${a1Id}`)).status === 403 && (await api(hassan, `/lots/${a1Id}`)).status === 403);
    step("the buyer has access", (await api(mohammed, `/lots/${a1Id}`)).status === 200);
    step("the buyer cannot pay the seller's old call", (await api(mohammed, `/appels-de-fonds/${a1Call!.id}/pay`, "PUT", { paymentMethod: "virement", proofUrl: "/objects/uploads/x.png" })).status === 403);
    const proof = `/objects/uploads/ut-proof-${RUN}.png`;
    await db.insert(storageObjectsTable).values({ objectPath: proof, ownerId: khadija.id, syndicateId: admin.syndicateId, contentType: "image/png" });
    const sellerPays = await api(khadija, `/appels-de-fonds/${a1Call!.id}/pay`, "PUT", { paymentMethod: "virement", proofUrl: proof });
    const validated = await api(treasurer, `/appels-de-fonds/${a1Call!.id}/validate`, "PUT", { approve: true });
    const [register] = await db.select().from(transactionsTable).where(eq(transactionsTable.ledgerEntryId, validated.json?.ledgerEntry?.id ?? "none"));
    step("the seller settles her old debt; the transaction is attributed to her", sellerPays.status === 200 && validated.status === 200 && register?.memberId === khadija.id, `pay=${sellerPays.status} validate=${validated.status}`);
    await api(treasurer, `/budgets/${BUDGET}/generate-appels`, "POST", { period: PERIODS[1] });
    const [newCall] = await db.select().from(appelsDeFondsTable).where(and(eq(appelsDeFondsTable.period, PERIODS[1]), eq(appelsDeFondsTable.lotId, a1Id)));
    step("calls issued after the sale go to the buyer", newCall?.ownerId === "member_1" && (await api(mohammed, `/appels-de-fonds?period=${PERIODS[1]}`)).json?.data?.some((c: any) => c.id === newCall.id));
    step("…and not to the seller", !(await api(khadija, `/appels-de-fonds?period=${PERIODS[1]}`)).json?.data?.some((c: any) => c.id === newCall?.id));
    const detail = await api(admin, `/lots/${a1Id}`);
    step(
      "detail page: ownership history, tenancies, outstanding by debtor and audit trail",
      detail.status === 200 && detail.json?.ownershipHistory?.length === 4 && detail.json?.tenancies?.length === 2 && (detail.json?.history ?? []).some((h: any) => h.action === "LOT_OWNERSHIP_CHANGED"),
      `owners=${detail.json?.ownershipHistory?.length} tenancies=${detail.json?.tenancies?.length}`,
    );

    // ═══ 6. Concurrent edits ═════════════════════════════════════════════
    const version = detail.json?.lot?.version;
    const [e1, e2] = await Promise.all([
      api(secretary, `/lots/${a1Id}`, "PUT", { version, surfaceM2: 66 }),
      api(admin, `/lots/${a1Id}`, "PUT", { version, description: "Vue mer" }),
    ]);
    step("two simultaneous edits of the same version: one wins, one must reload", [e1.status, e2.status].sort().join() === "200,409", `${e1.status}/${e2.status}`);
    step("owners cannot be changed through a plain edit", (await api(admin, `/lots/${a1Id}`, "PUT", { version: version + 1, ownerId: "member_3" })).status === 400);

    // ═══ 7. Archive, restore, delete ═════════════════════════════════════
    step("a rented lot cannot be archived", (await api(admin, `/lots/${a1Id}/archive`, "POST", { reason: "Fusion de lots" })).json?.code === "TENANCY_ACTIVE");
    await api(secretary, `/lots/${a1Id}/tenancy/end`, "POST", { nextStatus: "vacant" });
    const arch = await api(admin, `/lots/${a1Id}/archive`, "POST", { reason: "Fusion de lots", acknowledgeOutstanding: true });
    step("the lot is archived (history kept)", arch.status === 200 && !!arch.json?.data?.archivedAt, `status=${arch.status} ${arch.json?.error ?? ""}`);
    step("archived lots leave the active list…", !ids(await api(admin, "/lots?q=UT-A1")).includes(a1Id));
    step("…and are found with the archive filter", ids(await api(admin, "/lots?q=UT-A1&archived=only")).includes(a1Id));
    await api(treasurer, `/budgets/${BUDGET}/generate-appels`, "POST", { period: PERIODS[2] });
    step("an archived lot receives no new call", (await db.select().from(appelsDeFondsTable).where(and(eq(appelsDeFondsTable.period, PERIODS[2]), eq(appelsDeFondsTable.lotId, a1Id)))).length === 0);
    step("an archived lot cannot be edited", (await api(admin, `/lots/${a1Id}`, "PUT", { version: arch.json?.data?.version, description: "x" })).status === 409);
    const reuse = await api(admin, "/lots", "POST", { number: "UT-A1", type: "appartement", floor: 2, tantiemes: 120, buildingId: BUILDING });
    if (reuse.json?.id) created.push(reuse.json.id);
    step("the reference of an archived lot can be reused", reuse.status === 201);
    step("restoring is refused while another active lot uses the reference", (await api(admin, `/lots/${a1Id}/restore`, "POST")).json?.code === "LOT_REFERENCE_EXISTS");
    const del = await api(admin, `/lots/${a1Id}`, "DELETE");
    step("a lot with history cannot be deleted (archive instead)", del.status === 409 && del.json?.code === "LOT_HAS_HISTORY" && del.json?.dependencies?.callsForFunds > 0);
    step("secretary cannot delete", (await api(secretary, `/lots/${s1.json?.id}`, "DELETE")).status === 403);
    const delOk = await api(admin, `/lots/${s1.json?.id}`, "DELETE");
    step("a lot created by mistake (no history) can be deleted", delOk.status === 200);

    // ═══ 8. Search, filters, pagination ══════════════════════════════════
    step("search by reference and filter by type", ids(await api(admin, "/lots?q=UT-&type=parking")).join() === p1.json?.id);
    const byOwner = await api(admin, "/lots?q=Mohammed&archived=include");
    step("search by owner name", ids(byOwner).includes(p1.json?.id));
    const page = await api(admin, `/lots?q=UT-&limit=1&page=2&sort=reference`);
    step("pagination returns the requested page and the total", page.json?.limit === 1 && page.json?.page === 2 && page.json?.total >= 3 && (page.json?.data ?? []).length === 1, `total=${page.json?.total}`);
    step("a resident's list is limited to their own lots", ids(await api(khadija, "/lots")).every((id: string) => id !== p1.json?.id));

    // ═══ 9. Import ═══════════════════════════════════════════════════════
    const rows = [
      { number: "UT-I1", type: "appartement", floor: 1, tantiemes: 50, ownerEmail: "khadija.tahiri@residence-atlas.ma" },
      { number: "UT-P1", type: "parking", tantiemes: 1 },
      { number: "UT-I1", type: "appartement", floor: 1, tantiemes: 50 },
      { number: "UT-I2", type: "appartement", floor: 1, tantiemes: 50, ownerEmail: "inconnu@example.invalid" },
      { number: "UT-I3", type: "manoir", floor: 1, tantiemes: 50 },
    ];
    const dry = await api(admin, "/lots/import", "POST", { buildingId: BUILDING, dryRun: true, rows });
    step(
      "import dry-run explains each rejected row",
      dry.status === 200 && dry.json?.data?.valid === 1 && dry.json?.data?.errors?.length === 4 && dry.json?.data?.errors.map((e: any) => e.row).join() === "2,3,4,5",
      JSON.stringify(dry.json?.data?.errors?.map((e: any) => `${e.row}:${e.reason}`)),
    );
    step("dry-run writes nothing", (await db.select().from(lotsTable).where(eq(lotsTable.number, "UT-I1"))).length === 0);
    const imp = await api(admin, "/lots/import", "POST", { buildingId: BUILDING, rows });
    for (const c of imp.json?.data?.created ?? []) created.push(c.id);
    const imported = await db.select().from(lotsTable).where(eq(lotsTable.number, "UT-I1"));
    step("import creates the valid row with its owner", imp.status === 201 && imported.length === 1 && imported[0].ownerId === "member_2");
    step("other syndicate cannot import into this building", (await api(agdalAdmin, "/lots/import", "POST", { buildingId: BUILDING, rows: [rows[0]] })).status === 404);
  } finally {
    // Cleanup: payments / journal of the test calls (maintenance session),
    // calls, tenancies, ownership periods, lots, tenant account, audit rows.
    const testLots = await db.select({ id: lotsTable.id }).from(lotsTable).where(like(lotsTable.number, "UT-%"));
    const lotIds = [...new Set([...created, ...testLots.map((l) => l.id)])];
    const calls = await db.select({ id: appelsDeFondsTable.id }).from(appelsDeFondsTable).where(inArray(appelsDeFondsTable.period, PERIODS));
    const callIds = calls.map((c) => c.id);
    const payments = callIds.length
      ? await db.select({ id: appelPaymentsTable.id, entry: appelPaymentsTable.ledgerEntryId }).from(appelPaymentsTable).where(inArray(appelPaymentsTable.appelId, callIds))
      : [];
    const entryIds = payments.map((p) => p.entry).filter((v): v is string => !!v);
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL mizan.ledger_maintenance = 'on'`);
      if (entryIds.length) await tx.delete(transactionsTable).where(inArray(transactionsTable.ledgerEntryId, entryIds));
      if (payments.length) await tx.delete(appelPaymentsTable).where(inArray(appelPaymentsTable.id, payments.map((p) => p.id)));
      if (entryIds.length) await tx.delete(ledgerEntriesTable).where(inArray(ledgerEntriesTable.id, entryIds));
      if (callIds.length) await tx.delete(appelsDeFondsTable).where(inArray(appelsDeFondsTable.id, callIds));
      if (lotIds.length) {
        await tx.delete(tenantsTable).where(inArray(tenantsTable.lotId, lotIds));
        await tx.delete(lotOwnershipsTable).where(inArray(lotOwnershipsTable.lotId, lotIds));
        await tx.delete(auditLogsTable).where(and(eq(auditLogsTable.entity, "lot"), inArray(auditLogsTable.entityId, lotIds)));
        await tx.delete(lotsTable).where(inArray(lotsTable.id, lotIds));
      }
    });
    await db.execute(sql`UPDATE buildings SET total_lots = (SELECT COUNT(*) FROM lots WHERE building_id = ${BUILDING}) WHERE id = ${BUILDING}`);
    await db.delete(storageObjectsTable).where(like(storageObjectsTable.objectPath, `%ut-proof-${RUN}%`));
    if (tenantUser) await db.delete(usersTable).where(eq(usersTable.id, tenantUser.id));
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} unit checks passed`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Units suite failed to run:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
