import { db } from "@workspace/db";
import { bankStatementsTable } from "@workspace/db/schema";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { fromCents, toCents, type Tx } from "./treasury.js";

/**
 * Bank reconciliation of one statement (balance method):
 *
 *   bank closing balance (printed by the bank)
 *   + journal entries up to the period end not yet on the bank's records
 *     (deposits in transit, cheques not cashed: timing differences)
 *   = adjusted bank balance
 *
 *   journal balance of the account at the period end
 *   + bank lines up to the period end not (fully) matched to an entry dated
 *     up to the period end (fees not booked yet, unknown credits…)
 *   = adjusted book balance
 *
 * The difference must be zero, the statement's lines must add up from its
 * opening to its closing balance (no missing line), and every line must be
 * matched or explicitly ignored with a reason. Only then can the statement be
 * closed. Nothing here is inferred: every figure comes from the imported
 * statement or the journal.
 */
export type Statement = typeof bankStatementsTable.$inferSelect;
type Executor = Tx | typeof db;

const STALE_DAYS = 60;

export async function statementReport(executor: Executor, statement: Statement) {
  const { accountId, periodEnd: end, id } = statement;

  const [lineAgg] = (await executor.execute(sql`
    SELECT COALESCE(SUM(amount) FILTER (WHERE status <> 'ignored'), 0) AS total,
           COUNT(*)::int AS n,
           COUNT(*) FILTER (WHERE status = 'matched')::int AS matched,
           COUNT(*) FILTER (WHERE status = 'ignored')::int AS ignored,
           COUNT(*) FILTER (WHERE status IN ('unmatched', 'partial', 'anomaly'))::int AS unresolved
    FROM bank_statement_lines WHERE statement_id = ${id}
  `)) as unknown as { total: string; n: number; matched: number; ignored: number; unresolved: number }[];

  const [ledger] = (await executor.execute(sql`
    SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS balance
    FROM ledger_entries WHERE account_id = ${accountId} AND entry_date <= ${end}::date
  `)) as unknown as { balance: string }[];

  // Journal entries up to the end that the bank has not shown (as of the end).
  const bookItems = (await executor.execute(sql`
    SELECT le.id, le.entry_number, le.entry_date::text AS entry_date, le.direction, le.amount, le.label, le.reference,
           le.source_type, le.reverses_entry_id,
           le.amount - COALESCE(m.matched, 0) AS remaining,
           (${end}::date - le.entry_date) AS age_days
    FROM ledger_entries le
    LEFT JOIN (
      SELECT rm.ledger_entry_id, SUM(rm.amount) AS matched
      FROM reconciliation_matches rm JOIN bank_statement_lines l ON l.id = rm.statement_line_id
      WHERE l.value_date <= ${end}::date
      GROUP BY 1
    ) m ON m.ledger_entry_id = le.id
    WHERE le.account_id = ${accountId} AND le.entry_date <= ${end}::date AND le.source_type <> 'opening'
      AND le.amount - COALESCE(m.matched, 0) > 0
    ORDER BY le.entry_date, le.entry_number
  `)) as unknown as Record<string, any>[];

  // Bank lines up to the end without (full) counterpart in the journal up to the end.
  const bankItems = (await executor.execute(sql`
    SELECT l.id, l.value_date::text AS value_date, l.amount, l.label, l.reference, l.status, l.note, l.statement_id,
           abs(l.amount) - COALESCE(m.matched, 0) AS remaining
    FROM bank_statement_lines l
    LEFT JOIN (
      SELECT rm.statement_line_id, SUM(rm.amount) AS matched
      FROM reconciliation_matches rm JOIN ledger_entries le ON le.id = rm.ledger_entry_id
      WHERE le.entry_date <= ${end}::date
      GROUP BY 1
    ) m ON m.statement_line_id = l.id
    WHERE l.account_id = ${accountId} AND l.value_date <= ${end}::date AND l.status <> 'ignored'
      AND abs(l.amount) - COALESCE(m.matched, 0) > 0
    ORDER BY l.value_date
  `)) as unknown as Record<string, any>[];

  // An entry and its reversal that never reached the bank cancel each other.
  const unmatchedFully = new Map(bookItems.filter((e) => toCents(e.remaining) === toCents(e.amount)).map((e) => [e.id as string, e]));
  const compensated = new Set<string>();
  const reversalPairs: { entry: string; reversal: string; amount: string }[] = [];
  for (const e of unmatchedFully.values()) {
    if (e.reverses_entry_id && unmatchedFully.has(e.reverses_entry_id)) {
      compensated.add(e.id);
      compensated.add(e.reverses_entry_id);
      reversalPairs.push({ entry: unmatchedFully.get(e.reverses_entry_id)!.entry_number, reversal: e.entry_number, amount: e.amount });
    }
  }
  const outstanding = bookItems.filter((e) => !compensated.has(e.id));

  const signedBook = (e: Record<string, any>) => (e.direction === "in" ? 1 : -1) * toCents(e.remaining);
  const signedBank = (l: Record<string, any>) => Math.sign(toCents(l.amount)) * toCents(l.remaining);
  const inTransit = bookItems.reduce((s, e) => s + signedBook(e), 0);
  const notBooked = bankItems.reduce((s, l) => s + signedBank(l), 0);

  const closing = toCents(statement.closingBalance);
  const opening = toCents(statement.openingBalance);
  const linesTotal = toCents(lineAgg?.total);
  const ledgerBalance = toCents(ledger?.balance);
  const adjustedBank = closing + inTransit;
  const adjustedBook = ledgerBalance + notBooked;

  // Continuity with the previous statement of the account.
  const [previous] = await executor
    .select()
    .from(bankStatementsTable)
    .where(and(eq(bankStatementsTable.accountId, accountId), lt(bankStatementsTable.periodEnd, statement.periodStart)))
    .orderBy(desc(bankStatementsTable.periodEnd))
    .limit(1);

  // Discrepancies to review.
  const duplicateLineRefs = (await executor.execute(sql`
    SELECT reference, COUNT(*)::int AS n, SUM(amount) AS total FROM bank_statement_lines
    WHERE statement_id = ${id} AND reference IS NOT NULL AND status <> 'ignored'
    GROUP BY reference HAVING COUNT(*) > 1
  `)) as unknown as { reference: string; n: number; total: string }[];
  const duplicateEntryRefs = (await executor.execute(sql`
    SELECT le.reference, le.direction, le.amount, COUNT(*)::int AS n, string_agg(le.entry_number, ', ' ORDER BY le.entry_number) AS entries
    FROM ledger_entries le
    WHERE le.account_id = ${accountId} AND le.entry_date <= ${end}::date AND le.reference IS NOT NULL
      AND le.source_type <> 'reversal'
      AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses_entry_id = le.id)
    GROUP BY le.reference, le.direction, le.amount HAVING COUNT(*) > 1
  `)) as unknown as Record<string, any>[];
  const amountMismatches = (await executor.execute(sql`
    SELECT l.id, l.value_date::text AS value_date, l.amount, l.matched_amount, l.label
    FROM bank_statement_lines l WHERE l.statement_id = ${id} AND l.status = 'partial'
  `)) as unknown as Record<string, any>[];
  const bookedLater = (await executor.execute(sql`
    SELECT l.id AS line_id, l.value_date::text AS value_date, le.entry_number, le.entry_date::text AS entry_date, rm.amount
    FROM reconciliation_matches rm
    JOIN bank_statement_lines l ON l.id = rm.statement_line_id
    JOIN ledger_entries le ON le.id = rm.ledger_entry_id
    WHERE l.statement_id = ${id} AND le.entry_date > ${end}::date
  `)) as unknown as Record<string, any>[];
  const anomalies = (await executor.execute(sql`
    SELECT id, value_date::text AS value_date, amount, label, note FROM bank_statement_lines
    WHERE statement_id = ${id} AND status = 'anomaly'
  `)) as unknown as Record<string, any>[];

  const blocking: { code: string; message: string }[] = [];
  if (opening + linesTotal !== closing) {
    blocking.push({
      code: "STATEMENT_INCOMPLETE",
      message: `Les lignes importées ne mènent pas du solde d'ouverture au solde de clôture (écart ${fromCents(closing - opening - linesTotal)}) : une ligne manque ou est en double.`,
    });
  }
  if (previous && toCents(previous.closingBalance) !== opening) {
    blocking.push({
      code: "STATEMENT_DISCONTINUITY",
      message: `Le solde d'ouverture (${fromCents(opening)}) diffère du solde de clôture du relevé précédent (${previous.closingBalance}).`,
    });
  }
  if ((lineAgg?.unresolved ?? 0) > 0) {
    blocking.push({ code: "LINES_UNRESOLVED", message: `${lineAgg.unresolved} ligne(s) du relevé non rapprochée(s) ou en anomalie.` });
  }
  if (adjustedBank !== adjustedBook) {
    blocking.push({
      code: "UNEXPLAINED_DIFFERENCE",
      message: `Écart inexpliqué de ${fromCents(adjustedBank - adjustedBook)} entre la banque et le journal (lignes bancaires antérieures non importées, solde d'ouverture du compte erroné…).`,
    });
  }
  const view = (e: Record<string, any>) => ({
    id: e.id,
    entryNumber: e.entry_number,
    entryDate: e.entry_date,
    direction: e.direction,
    amount: fromCents(toCents(e.amount)),
    remaining: fromCents(toCents(e.remaining)),
    label: e.label,
    reference: e.reference,
    ageDays: Number(e.age_days),
  });

  return {
    statement: {
      id: statement.id,
      reference: statement.reference,
      periodStart: statement.periodStart,
      periodEnd: statement.periodEnd,
      openingBalance: fromCents(opening),
      closingBalance: fromCents(closing),
      status: statement.status,
    },
    lines: {
      count: lineAgg?.n ?? 0,
      matched: lineAgg?.matched ?? 0,
      ignored: lineAgg?.ignored ?? 0,
      unresolved: lineAgg?.unresolved ?? 0,
      total: fromCents(linesTotal),
    },
    balances: {
      bankClosing: fromCents(closing),
      inTransit: fromCents(inTransit),
      adjustedBank: fromCents(adjustedBank),
      ledger: fromCents(ledgerBalance),
      notBooked: fromCents(notBooked),
      adjustedBook: fromCents(adjustedBook),
      difference: fromCents(adjustedBank - adjustedBook),
    },
    timingDifferences: outstanding.map(view),
    staleItems: outstanding.filter((e) => Number(e.age_days) > STALE_DAYS).map(view),
    bankNotBooked: bankItems.map((l) => ({
      id: l.id,
      valueDate: l.value_date,
      amount: fromCents(toCents(l.amount)),
      remaining: fromCents(toCents(l.remaining)),
      label: l.label,
      reference: l.reference,
      status: l.status,
      inThisStatement: l.statement_id === id,
    })),
    discrepancies: {
      duplicateLineReferences: duplicateLineRefs,
      duplicateEntryReferences: duplicateEntryRefs,
      amountMismatches,
      bookedAfterPeriod: bookedLater,
      compensatedReversals: reversalPairs,
      anomalies,
    },
    previousStatement: previous ? { id: previous.id, periodEnd: previous.periodEnd, closingBalance: previous.closingBalance } : null,
    blocking,
    canClose: blocking.length === 0,
  };
}
