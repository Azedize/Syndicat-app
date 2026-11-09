import { db } from "@workspace/db";
import { alertsTable, appelAdjustmentsTable, appelRemindersTable, appelsDeFondsTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { localToday } from "./charge-time.js";
import { scheduleJob } from "./scheduler.js";
import { notifyUser } from "./notify.js";
import { logger } from "./logger.js";
import { FinanceError, fromCents, settlementStatus, toCents, type Tx } from "./treasury.js";

/**
 * Funds calls (appels de fonds): status upkeep, reminders, adjustments and
 * reconciliation. A call for funds is the published allocation (header,
 * ALC-…); its obligations are the appels_de_fonds rows, one per lot.
 *
 * Nothing here creates penalties, interest or collection steps: a reminder
 * states the amount still due and the passed due date, nothing more.
 */

/**
 * Obligations past their due date (local time) on which nothing has been paid
 * become "overdue" — the same rule as settlementStatus(): once something is
 * paid the obligation stays "partially_paid" (with what remains due), even
 * after the due date. The sweep used to turn those into "overdue", so a call's
 * status depended on whether the last thing to touch it was a payment or the
 * hourly job. Late partial payers still get their reminder (see below).
 */
export async function markOverdueCalls(syndicateId?: string): Promise<number> {
  const today = localToday();
  const rows = await db.execute(sql`
    UPDATE appels_de_fonds a SET status = 'overdue'
    WHERE a.status IN ('pending', 'rejected')
      AND a.due_date IS NOT NULL AND a.due_date < ${today}
      AND a.amount_paid = 0 AND a.amount > 0
      ${syndicateId ? sql`AND a.building_id IN (SELECT id FROM buildings WHERE syndicate_id = ${syndicateId})` : sql``}
    RETURNING a.id
  `);
  return (rows as unknown as unknown[]).length;
}

/** Users who owe an obligation: its debtors at issue time (snapshot), by email, in its condominium. */
async function debtorUsers(appelId: string): Promise<string[]> {
  const rows = (await db.execute(sql`
    SELECT DISTINCT u.id FROM appels_de_fonds a
    JOIN buildings b ON b.id = a.building_id
    JOIN members m ON m.id = ANY(a.debtor_member_ids) OR m.id = a.owner_id
    JOIN users u ON lower(u.email) = lower(m.email) AND u.syndicate_id = b.syndicate_id AND u.status = 'active'
    WHERE a.id = ${appelId}
  `)) as unknown as { id: string }[];
  return rows.map((r) => r.id);
}

/**
 * Why an obligation may not receive a reminder (null = eligible): settled,
 * cancelled, a payment under review, not yet due, or a condominium that is
 * not active.
 */
export async function reminderBlocker(appelId: string): Promise<string | null> {
  const [a] = (await db.execute(sql`
    SELECT a.status, a.amount, a.amount_paid, a.due_date, s.status AS condo
    FROM appels_de_fonds a JOIN buildings b ON b.id = a.building_id JOIN syndicates s ON s.id = b.syndicate_id
    WHERE a.id = ${appelId}
  `)) as unknown as { status: string; amount: string; amount_paid: string; due_date: string | null; condo: string }[];
  if (!a) return "Appel de fonds introuvable";
  if (a.status === "paid" || toCents(a.amount) <= toCents(a.amount_paid)) return "Appel de fonds réglé";
  if (a.status === "cancelled") return "Appel de fonds annulé";
  if (a.status === "pending_validation") return "Un paiement est en cours de validation";
  if (!a.due_date || a.due_date >= localToday()) return "L'échéance n'est pas dépassée";
  if (a.condo !== "active") return "Copropriété non active";
  return null;
}

async function sendReminder(appelId: string, kind: "overdue" | "manual", createdBy: string | null) {
  const [a] = await db
    .select({ a: appelsDeFondsTable, syndicateId: sql<string>`(SELECT syndicate_id FROM buildings WHERE id = ${appelsDeFondsTable.buildingId})` })
    .from(appelsDeFondsTable)
    .where(eq(appelsDeFondsTable.id, appelId));
  const remaining = fromCents(toCents(a.a.amount) - toCents(a.a.amountPaid));
  const users = await debtorUsers(appelId);
  // The reminder row first: the unique index makes the automatic one happen once.
  const [row] = await db
    .insert(appelRemindersTable)
    .values({ syndicateId: a.syndicateId, appelId, kind, remaining, recipients: users.length, createdBy })
    .onConflictDoNothing()
    .returning();
  if (!row) return null;
  // A translated template: each debtor reads it (and gets the push) in their own language.
  for (const u of users) {
    await notifyUser(u, { key: "fundsCall.overdue", params: { period: a.a.period, amount: remaining, dueDate: a.a.dueDate }, type: "warning", syndicateId: a.syndicateId });
  }
  return row;
}

/** One automatic reminder per obligation past due with something left to pay — overdue or partially paid (never after settlement or cancellation). */
export async function sendOverdueReminders(): Promise<number> {
  const candidates = (await db.execute(sql`
    SELECT a.id FROM appels_de_fonds a
    JOIN buildings b ON b.id = a.building_id JOIN syndicates s ON s.id = b.syndicate_id AND s.status = 'active'
    WHERE a.status IN ('overdue', 'partially_paid') AND a.amount > a.amount_paid AND a.due_date < ${localToday()}
      AND NOT EXISTS (SELECT 1 FROM appel_reminders r WHERE r.appel_id = a.id AND r.kind = 'overdue')
    LIMIT 500
  `)) as unknown as { id: string }[];
  let sent = 0;
  for (const c of candidates) {
    if (await reminderBlocker(c.id)) continue;
    if (await sendReminder(c.id, "overdue", null)) sent++;
  }
  return sent;
}

/** Reminder sent by the finance team (eligible obligations only, at most once a day). */
export async function sendManualReminder(appelId: string, userId: string) {
  const blocker = await reminderBlocker(appelId);
  if (blocker) throw new FinanceError(409, "REMINDER_NOT_ELIGIBLE", blocker);
  const [recent] = (await db.execute(sql`SELECT 1 FROM appel_reminders WHERE appel_id = ${appelId} AND created_at > now() - interval '24 hours'`)) as unknown as unknown[];
  if (recent) throw new FinanceError(409, "REMINDER_TOO_SOON", "Un rappel a déjà été envoyé ces dernières 24 heures");
  return sendReminder(appelId, "manual", userId);
}

/**
 * Controlled change of one obligation's amount. Allowed while the call is
 * open and no payment is under review; never below what was already paid
 * (an overpayment is handled by reversing the payment). The adjustment row
 * keeps the previous amount and the reason.
 */
export async function adjustObligation(tx: Tx, input: { syndicateId: string; appelId: string; newAmount: string; reason: string; userId: string }) {
  const [a] = await tx
    .select()
    .from(appelsDeFondsTable)
    .where(and(eq(appelsDeFondsTable.id, input.appelId), sql`${appelsDeFondsTable.buildingId} IN (SELECT id FROM buildings WHERE syndicate_id = ${input.syndicateId})`))
    .for("update");
  if (!a) throw new FinanceError(404, "APPEL_NOT_FOUND", "Appel de fonds introuvable");
  if (a.status === "cancelled") throw new FinanceError(409, "APPEL_CANCELLED", "Appel annulé : il ne s'ajuste plus");
  if (a.status === "pending_validation") throw new FinanceError(409, "PAYMENT_UNDER_REVIEW", "Traitez d'abord le paiement en cours de validation");
  const next = toCents(input.newAmount);
  const paid = toCents(a.amountPaid);
  if (next === toCents(a.amount)) throw new FinanceError(409, "SAME_AMOUNT", "Le montant est inchangé");
  if (next < paid) {
    throw new FinanceError(409, "BELOW_PAID", `Le nouveau montant (${input.newAmount}) est inférieur au déjà payé (${a.amountPaid}) : extournez ou remboursez d'abord le trop-perçu`);
  }
  await tx.insert(appelAdjustmentsTable).values({ syndicateId: input.syndicateId, appelId: a.id, previousAmount: a.amount, newAmount: fromCents(next), reason: input.reason, createdBy: input.userId });
  const status = settlementStatus(next, paid, a.dueDate);
  const [row] = await tx
    .update(appelsDeFondsTable)
    .set({ amount: fromCents(next), status, paidDate: status === "paid" ? (a.paidDate ?? localToday()) : null })
    .where(eq(appelsDeFondsTable.id, a.id))
    .returning();
  return { before: a, after: row };
}

/**
 * Reconciliation of one funds call: allocation lines, issued obligations,
 * adjustments, payments, receipts and journal entries must agree.
 */
export async function reconcileCall(allocationId: string) {
  const [r] = (await db.execute(sql`
    WITH calls AS (SELECT * FROM appels_de_fonds WHERE allocation_id = ${allocationId}),
    pays AS (SELECT p.* FROM appel_payments p JOIN calls c ON c.id = p.appel_id)
    SELECT
      (SELECT total_amount FROM allocations WHERE id = ${allocationId}) AS allocation_total,
      (SELECT COALESCE(SUM(amount), 0) FROM allocation_lines WHERE allocation_id = ${allocationId}) AS lines_total,
      (SELECT COALESCE(SUM(original_amount), 0) FROM calls) AS issued_total,
      (SELECT COALESCE(SUM(amount), 0) FROM calls WHERE status <> 'cancelled') AS current_total,
      (SELECT COALESCE(SUM(amount), 0) FROM calls WHERE status = 'cancelled') AS cancelled_total,
      (SELECT COALESCE(SUM(new_amount - previous_amount), 0) FROM appel_adjustments j JOIN calls c ON c.id = j.appel_id) AS adjustments_total,
      (SELECT COALESCE(SUM(original_amount), 0) FROM calls WHERE status = 'cancelled') AS cancelled_issued,
      (SELECT COALESCE(SUM(amount_paid), 0) FROM calls) AS paid_on_calls,
      (SELECT COALESCE(SUM(amount), 0) FROM pays WHERE status = 'validated') AS validated_payments,
      (SELECT COUNT(*)::int FROM pays WHERE status = 'validated' AND receipt_number IS NOT NULL) AS receipts,
      (SELECT COUNT(*)::int FROM pays WHERE status = 'validated') AS validated_count,
      (SELECT COALESCE(SUM(CASE WHEN le.source_type = 'reversal' THEN -le.amount ELSE le.amount END), 0)
         FROM ledger_entries le LEFT JOIN ledger_entries o ON o.id = le.reverses_entry_id
         WHERE (le.source_type = 'appel_payment' AND le.source_id IN (SELECT id FROM pays))
            OR (le.source_type = 'reversal' AND o.source_type = 'appel_payment' AND o.source_id IN (SELECT id FROM pays))) AS journal_net,
      (SELECT COALESCE(SUM(amount - amount_paid), 0) FROM calls WHERE status <> 'cancelled') AS remaining,
      (SELECT COUNT(*)::int FROM calls) AS obligations
  `)) as unknown as Record<string, any>[];
  const c = (v: any) => toCents(v ?? 0);
  // issued = allocation; current = issued + adjustments − (cancelled, at their current amount)
  const checks = {
    linesMatchAllocation: c(r.lines_total) === c(r.allocation_total),
    obligationsMatchAllocation: c(r.issued_total) === c(r.allocation_total),
    adjustmentsExplainDifference: c(r.current_total) + c(r.cancelled_total) === c(r.issued_total) + c(r.adjustments_total),
    paymentsMatchObligations: c(r.paid_on_calls) === c(r.validated_payments),
    journalMatchesPayments: c(r.journal_net) === c(r.validated_payments),
    oneReceiptPerPayment: r.receipts === r.validated_count,
  };
  return {
    allocationTotal: fromCents(c(r.allocation_total)),
    linesTotal: fromCents(c(r.lines_total)),
    issuedTotal: fromCents(c(r.issued_total)),
    adjustmentsTotal: fromCents(c(r.adjustments_total)),
    cancelledTotal: fromCents(c(r.cancelled_total)),
    currentTotal: fromCents(c(r.current_total)),
    paid: fromCents(c(r.paid_on_calls)),
    validatedPayments: fromCents(c(r.validated_payments)),
    journalNet: fromCents(c(r.journal_net)),
    remaining: fromCents(c(r.remaining)),
    obligations: r.obligations,
    receipts: r.receipts,
    checks,
    reconciled: Object.values(checks).every(Boolean),
  };
}

/** Hourly upkeep: overdue statuses, then the one-time overdue reminders. */
export function startFundsCallsScheduler() {
  scheduleJob("funds-calls", 60 * 60 * 1000, async () => {
    const marked = await markOverdueCalls();
    const reminded = await sendOverdueReminders();
    if (marked || reminded) logger.info({ marked, reminded }, "funds calls upkeep");
  });
}
