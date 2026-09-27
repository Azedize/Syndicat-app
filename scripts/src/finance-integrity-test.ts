/**
 * Financial integrity & billing regression suite.
 *
 * Usage (API must be running):
 *   API_BASE_URL=http://localhost:5000/api pnpm --filter @workspace/scripts run finance-integrity:test
 *
 * Covers: subscription self-activation, deny-by-default subscription gate,
 * appel-de-fonds payment lifecycle (submit / duplicate / reject / approve /
 * concurrent double-approval / paid-lock), cross-tenant validation, proof
 * ownership, and idempotent charge generation with exact rounding.
 *
 * Every row the suite mutates is snapshotted and restored in `finally`, and
 * every row it creates is deleted, so it can run against a development DB.
 */
import jwt from "jsonwebtoken";
import { and, eq, gte, inArray, like, sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import {
  appelPaymentsTable,
  appelsDeFondsTable,
  auditLogsTable,
  budgetsTable,
  ledgerEntriesTable,
  meetingsTable,
  storageObjectsTable,
  syndicateSubscriptionsTable,
  transactionsTable,
  usersTable,
} from "@workspace/db/schema";

const BASE = (process.env.API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required to mint test tokens");

const ATLAS = "syn_residence_atlas";
const TEST_PERIOD = "2099-01";

type User = typeof usersTable.$inferSelect;
const results: { name: string; pass: boolean; detail: string }[] = [];

function record(name: string, pass: boolean, detail: string): void {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} — ${detail}`);
}

function tokenFor(user: User): string {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      syndicateId: user.syndicateId ?? undefined,
      name: user.name,
    },
    JWT_SECRET!,
    { expiresIn: "15m" },
  );
}

async function api(path: string, token: string, method = "GET", body?: unknown) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

function expectStatus(name: string, actual: number, expected: number | number[]) {
  const list = Array.isArray(expected) ? expected : [expected];
  record(name, list.includes(actual), `expected ${list.join("/")}, received ${actual}`);
}

async function user(id: string): Promise<User> {
  const [row] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!row) throw new Error(`Fixture user ${id} missing — run pnpm db:seed`);
  return row;
}

async function appel(id: string) {
  const [row] = await db.select().from(appelsDeFondsTable).where(eq(appelsDeFondsTable.id, id));
  if (!row) throw new Error(`Fixture appel ${id} missing — run pnpm db:seed`);
  return row;
}

async function main() {
  const adminAtlas = await user("user_admin_atlas");
  const adminAgdal = await user("user_admin_agdal");
  const treasurerAtlas = await user("user_treasurer_atlas");
  const member1 = await user("user_member_1"); // members.member_1 → owns adf_4
  const member5 = await user("user_member_5"); // members.member_3 → owns adf_5

  const approveTarget = await appel("adf_4");
  const rejectTarget = await appel("adf_5");
  const subsBefore = await db
    .select()
    .from(syndicateSubscriptionsTable)
    .where(eq(syndicateSubscriptionsTable.syndicateId, ATLAS));
  const startedAt = new Date();
  let createdBudgetId: string | null = null;

  const proofPaths = [
    `/objects/uploads/test-proof-${Date.now()}-m1.png`,
    `/objects/uploads/test-proof-${Date.now()}-m5.png`,
    `/objects/uploads/test-proof-${Date.now()}-agdal.png`,
  ];
  await db.insert(storageObjectsTable).values([
    { objectPath: proofPaths[0], ownerId: member1.id, syndicateId: ATLAS, contentType: "image/png" },
    { objectPath: proofPaths[1], ownerId: member5.id, syndicateId: ATLAS, contentType: "image/png" },
    { objectPath: proofPaths[2], ownerId: adminAgdal.id, syndicateId: adminAgdal.syndicateId, contentType: "image/png" },
  ]);

  try {
    // ── 1. Subscription self-activation (S1) ───────────────────────────────
    const sub = subsBefore[0];
    if (sub) {
      const r1 = await api(`/subscriptions/${sub.id}`, tokenFor(adminAtlas), "PUT", { status: "active" });
      expectStatus("syndicate admin cannot self-activate a subscription", r1.status, 403);
      const r2 = await api(`/subscriptions/${sub.id}`, tokenFor(adminAtlas), "PUT", { status: "trial" });
      expectStatus("syndicate admin cannot switch subscription to trial", r2.status, 403);
      const r3 = await api(`/subscriptions/${sub.id}`, tokenFor(adminAtlas), "PUT", { autoRenew: sub.autoRenew ?? true });
      expectStatus("syndicate admin may toggle auto-renew", r3.status, 200);
    } else {
      record("subscription fixture present", false, "no subscription for Atlas");
    }

    // ── 2. Deny-by-default subscription gate (S2) ──────────────────────────
    await db
      .update(syndicateSubscriptionsTable)
      .set({ status: "pending_payment" })
      .where(eq(syndicateSubscriptionsTable.syndicateId, ATLAS));
    const gated = await api(`/appels-de-fonds/${approveTarget.id}/pay`, tokenFor(member1), "PUT", {
      paymentMethod: "virement",
    });
    expectStatus("pending_payment subscription blocks writes (402)", gated.status, 402);
    await db
      .update(syndicateSubscriptionsTable)
      .set({ status: "grace", gracePeriodEnd: null })
      .where(eq(syndicateSubscriptionsTable.syndicateId, ATLAS));
    const graceNoEnd = await api(`/appels-de-fonds/${approveTarget.id}/pay`, tokenFor(member1), "PUT", {
      paymentMethod: "virement",
    });
    expectStatus("grace without end date blocks writes (402)", graceNoEnd.status, 402);
    for (const s of subsBefore) {
      await db
        .update(syndicateSubscriptionsTable)
        .set({ status: s.status, gracePeriodEnd: s.gracePeriodEnd })
        .where(eq(syndicateSubscriptionsTable.id, s.id));
    }

    // ── 3. Payment submission validation ───────────────────────────────────
    const online = await api(`/appels-de-fonds/${approveTarget.id}/pay`, tokenFor(member1), "PUT", {
      paymentMethod: "online",
    });
    expectStatus("undeclarable 'online' method rejected", online.status, 400);
    const foreignProof = await api(`/appels-de-fonds/${approveTarget.id}/pay`, tokenFor(member1), "PUT", {
      paymentMethod: "virement",
      proofUrl: proofPaths[2],
    });
    expectStatus("proof from another syndicate rejected", foreignProof.status, 400);
    const externalProof = await api(`/appels-de-fonds/${approveTarget.id}/pay`, tokenFor(member1), "PUT", {
      paymentMethod: "virement",
      proofUrl: "https://evil.example/proof.png",
    });
    expectStatus("external proof URL rejected", externalProof.status, 400);
    const otherOwner = await api(`/appels-de-fonds/${rejectTarget.id}/pay`, tokenFor(member1), "PUT", {
      paymentMethod: "virement",
      proofUrl: proofPaths[0],
    });
    expectStatus("member cannot pay someone else's charge", otherOwner.status, 403);

    const submit = await api(`/appels-de-fonds/${approveTarget.id}/pay`, tokenFor(member1), "PUT", {
      paymentMethod: "virement",
      proofUrl: proofPaths[0],
    });
    expectStatus("owner submits payment with own proof", submit.status, 200);
    const duplicate = await api(`/appels-de-fonds/${approveTarget.id}/pay`, tokenFor(member1), "PUT", {
      paymentMethod: "virement",
      proofUrl: proofPaths[0],
    });
    expectStatus("duplicate submission while under review rejected", duplicate.status, 409);

    // ── 4. Cross-tenant validation ─────────────────────────────────────────
    const crossTenant = await api(`/appels-de-fonds/${approveTarget.id}/validate`, tokenFor(adminAgdal), "PUT", {
      approve: true,
    });
    expectStatus("other syndicate admin cannot validate", crossTenant.status, 403);

    // ── 5. Concurrent double approval ──────────────────────────────────────
    const [a, b] = await Promise.all([
      api(`/appels-de-fonds/${approveTarget.id}/validate`, tokenFor(treasurerAtlas), "PUT", { approve: true }),
      api(`/appels-de-fonds/${approveTarget.id}/validate`, tokenFor(adminAtlas), "PUT", { approve: true }),
    ]);
    const statuses = [a.status, b.status].sort();
    record(
      "concurrent approvals: exactly one succeeds",
      statuses[0] === 200 && statuses[1] === 409,
      `received ${statuses.join(", ")}`,
    );
    const approved = await appel(approveTarget.id);
    record(
      "approved charge carries a sequential receipt number",
      approved.status === "paid" && /^REC-\d{4}-\d{6}$/.test(approved.receiptNumber ?? ""),
      `status=${approved.status} receipt=${approved.receiptNumber}`,
    );
    const ledger = await db
      .select()
      .from(transactionsTable)
      .where(like(transactionsTable.label, `%${approved.receiptNumber}%`));
    record(
      "exactly one ledger transaction, attributed to the owner's user account",
      ledger.length === 1 && ledger[0]?.memberId === member1.id && ledger[0]?.amount === approveTarget.amount,
      `rows=${ledger.length} memberId=${ledger[0]?.memberId} amount=${ledger[0]?.amount}`,
    );
    // The payment is posted once to the journal, on the syndicate's default
    // bank account (virement), and linked to the payment row.
    const journal = await db
      .select()
      .from(ledgerEntriesTable)
      .where(eq(ledgerEntriesTable.reference, approved.receiptNumber ?? "?"));
    const [paymentRow] = await db
      .select()
      .from(appelPaymentsTable)
      .where(and(eq(appelPaymentsTable.appelId, approveTarget.id), eq(appelPaymentsTable.status, "validated")));
    record(
      "exactly one journal entry, on the bank account, linked to the payment",
      journal.length === 1 &&
        journal[0].accountId === "acct_atlas_bank" &&
        journal[0].direction === "in" &&
        paymentRow?.ledgerEntryId === journal[0].id &&
        ledger[0]?.ledgerEntryId === journal[0].id,
      `rows=${journal.length} account=${journal[0]?.accountId} linked=${paymentRow?.ledgerEntryId === journal[0]?.id}`,
    );

    const repay = await api(`/appels-de-fonds/${approveTarget.id}/pay`, tokenFor(member1), "PUT", {
      paymentMethod: "virement",
      proofUrl: proofPaths[0],
    });
    expectStatus("paid charge cannot be re-opened by a new submission", repay.status, 409);

    // ── 6. Rejection keeps history and allows a new declaration ────────────
    const submit2 = await api(`/appels-de-fonds/${rejectTarget.id}/pay`, tokenFor(member5), "PUT", {
      paymentMethod: "cheque",
      proofUrl: proofPaths[1],
    });
    expectStatus("second owner submits payment", submit2.status, 200);
    const noReason = await api(`/appels-de-fonds/${rejectTarget.id}/validate`, tokenFor(treasurerAtlas), "PUT", {
      approve: false,
    });
    expectStatus("rejection without reason refused", noReason.status, 400);
    const reject = await api(`/appels-de-fonds/${rejectTarget.id}/validate`, tokenFor(treasurerAtlas), "PUT", {
      approve: false,
      rejectionReason: "Montant du virement incorrect",
    });
    expectStatus("treasurer rejects payment with reason", reject.status, 200);
    const rejected = await appel(rejectTarget.id);
    record(
      "rejected payment keeps its reason and validator",
      rejected.status === "rejected" &&
        rejected.rejectionReason === "Montant du virement incorrect" &&
        rejected.validatedBy === treasurerAtlas.id,
      `status=${rejected.status} reason=${rejected.rejectionReason}`,
    );
    const [rejectionAudit] = await db
      .select()
      .from(auditLogsTable)
      .where(and(eq(auditLogsTable.entityId, rejectTarget.id), eq(auditLogsTable.action, "payment_rejected")));
    record("rejection is audit-logged with its syndicate", rejectionAudit?.syndicateId === ATLAS, `syndicate=${rejectionAudit?.syndicateId}`);
    const resubmit = await api(`/appels-de-fonds/${rejectTarget.id}/pay`, tokenFor(member5), "PUT", {
      paymentMethod: "cheque",
      proofUrl: proofPaths[1],
    });
    expectStatus("rejected charge can be declared again", resubmit.status, 200);

    // ── 7. Idempotent generation with exact rounding ───────────────────────
    const gen = await api(`/budgets/budget_atlas_2026/generate-appels`, tokenFor(treasurerAtlas), "POST", {
      period: TEST_PERIOD,
    });
    expectStatus("monthly charge calls generated", gen.status, 201);
    const generated = await db
      .select()
      .from(appelsDeFondsTable)
      .where(and(eq(appelsDeFondsTable.period, TEST_PERIOD), eq(appelsDeFondsTable.budgetId, "budget_atlas_2026")));
    const sumCents = generated.reduce((s, r) => s + Math.round(Number(r.amount) * 100), 0);
    record(
      "generated monthly total equals budget / 12 to the centime",
      sumCents === Math.round((108000 * 100) / 12),
      `sum=${sumCents / 100} expected=${108000 / 12}`,
    );
    const again = await api(`/budgets/budget_atlas_2026/generate-appels`, tokenFor(treasurerAtlas), "POST", {
      period: TEST_PERIOD,
    });
    expectStatus("re-generating the same period is refused (idempotent)", again.status, 409);
    const badPeriod = await api(`/budgets/budget_atlas_2026/generate-appels`, tokenFor(treasurerAtlas), "POST", {
      period: "janvier",
    });
    expectStatus("malformed period rejected", badPeriod.status, 400);
    const crossGen = await api(`/budgets/budget_atlas_2026/generate-appels`, tokenFor(adminAgdal), "POST", {
      period: "2099-02",
    });
    expectStatus("other syndicate cannot generate on this budget", crossGen.status, 403);

    // ── 8. Budget lifecycle: approval only through a general assembly ──────
    const directApproved = await api(`/budgets`, tokenFor(treasurerAtlas), "POST", {
      year: 2099,
      buildingId: "building_atlas_a",
      chargesAmount: 1000,
      status: "approved",
    });
    expectStatus("budget cannot be created as already approved", directApproved.status, 400);
    const draft = await api(`/budgets`, tokenFor(treasurerAtlas), "POST", {
      year: 2099,
      buildingId: "building_atlas_a",
      chargesAmount: 1000,
    });
    expectStatus("draft budget created", draft.status, 201);
    createdBudgetId = draft.json?.id ?? null;
    if (createdBudgetId) {
      const noAg = await api(`/budgets/${createdBudgetId}`, tokenFor(treasurerAtlas), "PUT", { status: "approved" });
      record("approval without an AG reference refused", noAg.status === 400 && noAg.json?.code === "BUDGET_APPROVAL_REQUIRES_AG", `status=${noAg.status}`);
      const [atlasMeeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.syndicateId, ATLAS)).limit(1);
      const [agdalMeeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.syndicateId, "syn_jardins_agdal")).limit(1);
      if (agdalMeeting) {
        const foreignAg = await api(`/budgets/${createdBudgetId}`, tokenFor(treasurerAtlas), "PUT", { status: "approved", meetingId: agdalMeeting.id });
        expectStatus("approval referencing another syndicate's AG refused", foreignAg.status, 400);
      }
      if (atlasMeeting) {
        const approvedRes = await api(`/budgets/${createdBudgetId}`, tokenFor(treasurerAtlas), "PUT", { status: "approved", meetingId: atlasMeeting.id });
        record("approval with the syndicate's AG succeeds and is dated by the server", approvedRes.status === 200 && !!approvedRes.json?.votedAt, `status=${approvedRes.status} votedAt=${approvedRes.json?.votedAt}`);
        const locked = await api(`/budgets/${createdBudgetId}`, tokenFor(treasurerAtlas), "PUT", { chargesAmount: 5000 });
        record("approved budget amounts are locked", locked.status === 409 && locked.json?.code === "BUDGET_LOCKED", `status=${locked.status}`);
      } else {
        record("AG fixture present", false, "no meeting for Atlas");
      }
      const badAmount = await api(`/budgets/budget_atlas_2025`, tokenFor(treasurerAtlas), "PUT", { notes: 42 });
      expectStatus("malformed update rejected by validation", badAmount.status, 400);
    }
  } finally {
    if (createdBudgetId) {
      await db.delete(auditLogsTable).where(eq(auditLogsTable.entityId, createdBudgetId));
      await db.delete(budgetsTable).where(eq(budgetsTable.id, createdBudgetId));
    }
    // Restore mutated fixtures and remove everything the suite created.
    // Payments declared during this run, their journal entries and register
    // rows. The journal is append-only: purging test rows needs an explicit
    // maintenance session.
    const runPayments = await db
      .select({ id: appelPaymentsTable.id, ledgerEntryId: appelPaymentsTable.ledgerEntryId })
      .from(appelPaymentsTable)
      .where(
        and(
          inArray(appelPaymentsTable.appelId, [approveTarget.id, rejectTarget.id]),
          gte(appelPaymentsTable.createdAt, startedAt),
        ),
      );
    const entryIds = runPayments.map((p) => p.ledgerEntryId).filter((v): v is string => !!v);
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL mizan.ledger_maintenance = 'on'`);
      if (entryIds.length) await tx.delete(transactionsTable).where(inArray(transactionsTable.ledgerEntryId, entryIds));
      if (runPayments.length) {
        await tx.delete(appelPaymentsTable).where(inArray(appelPaymentsTable.id, runPayments.map((p) => p.id)));
      }
      if (entryIds.length) await tx.delete(ledgerEntriesTable).where(inArray(ledgerEntriesTable.id, entryIds));
    });
    for (const original of [approveTarget, rejectTarget]) {
      const { id, ...rest } = original;
      await db.update(appelsDeFondsTable).set(rest).where(eq(appelsDeFondsTable.id, id));
    }
    for (const s of subsBefore) {
      await db
        .update(syndicateSubscriptionsTable)
        .set({ status: s.status, gracePeriodEnd: s.gracePeriodEnd, autoRenew: s.autoRenew })
        .where(eq(syndicateSubscriptionsTable.id, s.id));
    }
    await db.delete(appelsDeFondsTable).where(eq(appelsDeFondsTable.period, TEST_PERIOD));
    await db.delete(storageObjectsTable).where(inArray(storageObjectsTable.objectPath, proofPaths));
    await db
      .delete(auditLogsTable)
      .where(
        and(
          inArray(auditLogsTable.entityId, [approveTarget.id, rejectTarget.id, "budget_atlas_2026"]),
          gte(auditLogsTable.createdAt, startedAt), // only rows from this run
        ),
      );
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Finance integrity suite failed to run:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
