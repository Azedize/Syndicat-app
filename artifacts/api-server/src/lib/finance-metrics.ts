import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { fromCents, toCents, today } from "./treasury.js";

/**
 * Financial metrics — one definition per figure, shared by every screen
 * (treasury, statistics, reports, operations register, portfolio). Cash
 * figures come from the journal (ledger_entries) only; receivables from the
 * calls for funds; nothing is read from the legacy register amounts.
 *
 * Reversals: an extourne is dated on the day it is posted and counts against
 * the flow it cancels (a reversed receipt lowers income of the reversal's
 * period, a reversed expense lowers expenses). Internal transfers and opening
 * balances move cash between accounts: they change balances, never income or
 * expenses. Amounts are summed per currency, never across currencies.
 */
export const METRIC_DEFINITIONS = {
  cashBalance:
    "Solde de trésorerie à la date de fin : somme des écritures du journal (encaissements − décaissements) de tous les comptes, ouverture et virements internes compris. Par devise.",
  income:
    "Encaissements de la période (date d'écriture) : paiements validés des appels de fonds et autres recettes, nets des extournes passées dans la période. Hors virements internes et reprises de solde.",
  expenses:
    "Décaissements de la période (date d'écriture) : dépenses payées, salaires et frais, nets des extournes passées dans la période. Hors virements internes. Une dépense approuvée mais non payée n'y figure pas.",
  net: "Encaissements − décaissements de la période.",
  receivables:
    "Reste dû aujourd'hui : montant − payé validé des appels de fonds non soldés et non annulés. Un paiement déclaré mais non validé ne le réduit pas.",
  overdueReceivables: "Part du reste dû dont l'échéance est dépassée (échéance antérieure à aujourd'hui).",
  pendingPayments:
    "Paiements déclarés par les copropriétaires, en attente de validation : ni encaissés, ni déduits du reste dû.",
  expensesToApprove: "Dépenses soumises, en attente d'approbation (aucun effet comptable).",
  committedExpenses: "Dépenses approuvées non encore payées (engagements, aucun effet sur la trésorerie).",
  collectionRate:
    "Taux de recouvrement : payé validé ÷ montant appelé, sur les appels non annulés dont l'échéance tombe dans la période.",
  unreconciledEntries: "Écritures des comptes bancaires non (entièrement) rapprochées d'une ligne de relevé.",
} as const;

export type MoneyByCurrency = { currency: string; amount: string }[];

const EXCLUDED_FROM_FLOWS = sql`('virement_interne', 'reprise_solde')`;

/** Scope of a ledger query: one syndicate (or the whole platform) and optional building. */
interface Scope {
  syndicateId: string | null;
  buildingId?: string | null;
}

function ledgerWhere(scope: Scope, from?: string | null, to?: string | null): SQL {
  const c: SQL[] = [sql`TRUE`];
  if (scope.syndicateId) c.push(sql`le.syndicate_id = ${scope.syndicateId}`);
  if (scope.buildingId) c.push(sql`le.building_id = ${scope.buildingId}`);
  if (from) c.push(sql`le.entry_date >= ${from}::date`);
  if (to) c.push(sql`le.entry_date <= ${to}::date`);
  return sql.join(c, sql` AND `);
}

/**
 * Income and expenses per currency (and per day when `byDay`), from the
 * journal. Dates are inclusive. Returns cents.
 */
export async function ledgerFlows(
  scope: Scope,
  opts: { from?: string | null; to?: string | null; byDay?: boolean } = {},
): Promise<{ currency: string; day: string | null; income: number; expenses: number }[]> {
  const rows = (await db.execute(sql`
    WITH e AS (
      SELECT le.currency, le.entry_date,
             CASE WHEN le.direction = 'in' THEN le.amount ELSE -le.amount END AS signed,
             CASE WHEN le.source_type = 'reversal'
                  THEN CASE WHEN le.direction = 'in' THEN 'out' ELSE 'in' END
                  ELSE le.direction END AS original
      FROM ledger_entries le
      WHERE ${ledgerWhere(scope, opts.from, opts.to)} AND le.category NOT IN ${EXCLUDED_FROM_FLOWS}
    )
    SELECT currency, ${opts.byDay ? sql`entry_date::text` : sql`NULL::text`} AS day,
           COALESCE(SUM(signed) FILTER (WHERE original = 'in'), 0) AS income,
           COALESCE(-SUM(signed) FILTER (WHERE original = 'out'), 0) AS expenses
    FROM e
    GROUP BY 1, 2
    ORDER BY 1, 2
  `)) as unknown as { currency: string; day: string | null; income: string; expenses: string }[];
  return rows.map((r) => ({ currency: r.currency, day: r.day, income: toCents(r.income), expenses: toCents(r.expenses) }));
}

/** Cash balance per currency at the end of `asOf` (inclusive), in cents. */
export async function cashBalances(scope: Scope, asOf?: string | null): Promise<Map<string, number>> {
  const rows = (await db.execute(sql`
    SELECT le.currency, COALESCE(SUM(CASE WHEN le.direction = 'in' THEN le.amount ELSE -le.amount END), 0) AS balance
    FROM ledger_entries le
    WHERE ${ledgerWhere(scope, null, asOf)}
    GROUP BY 1
  `)) as unknown as { currency: string; balance: string }[];
  return new Map(rows.map((r) => [r.currency, toCents(r.balance)]));
}

/** Receivables of a syndicate (or one building) today, in the syndicate's currency (cents). */
export async function receivables(scope: Scope) {
  const where = [sql`a.status NOT IN ('paid', 'cancelled')`];
  if (scope.syndicateId) where.push(sql`b.syndicate_id = ${scope.syndicateId}`);
  if (scope.buildingId) where.push(sql`a.building_id = ${scope.buildingId}`);
  const [row] = (await db.execute(sql`
    SELECT COALESCE(SUM(a.amount - a.amount_paid), 0) AS outstanding,
           COALESCE(SUM(a.amount - a.amount_paid) FILTER (WHERE a.due_date IS NOT NULL AND a.due_date < ${today()}), 0) AS overdue,
           COUNT(*)::int AS calls
    FROM appels_de_fonds a JOIN buildings b ON b.id = a.building_id
    WHERE ${sql.join(where, sql` AND `)}
  `)) as unknown as { outstanding: string; overdue: string; calls: number }[];
  return { outstanding: toCents(row?.outstanding), overdue: toCents(row?.overdue), calls: Number(row?.calls ?? 0) };
}

/** Collection rate (%) of the calls due in [from, to] (all calls when no range). */
export async function collectionRate(scope: Scope, from?: string | null, to?: string | null): Promise<number | null> {
  const where = [sql`a.status <> 'cancelled'`];
  if (scope.syndicateId) where.push(sql`b.syndicate_id = ${scope.syndicateId}`);
  if (scope.buildingId) where.push(sql`a.building_id = ${scope.buildingId}`);
  if (from) where.push(sql`a.due_date >= ${from}`);
  if (to) where.push(sql`a.due_date <= ${to}`);
  const [row] = (await db.execute(sql`
    SELECT COALESCE(SUM(a.amount), 0) AS called, COALESCE(SUM(a.amount_paid), 0) AS paid
    FROM appels_de_fonds a JOIN buildings b ON b.id = a.building_id
    WHERE ${sql.join(where, sql` AND `)}
  `)) as unknown as { called: string; paid: string }[];
  const called = toCents(row?.called);
  return called > 0 ? Math.round((toCents(row?.paid) / called) * 1000) / 10 : null;
}

const money = (m: Map<string, number>): MoneyByCurrency =>
  [...m].sort(([a], [b]) => a.localeCompare(b)).map(([currency, cents]) => ({ currency, amount: fromCents(cents) }));

/** First day of the current calendar year (YYYY-01-01). */
export function yearStart(): string {
  return `${today().slice(0, 4)}-01-01`;
}

/**
 * The financial overview of one syndicate for a period: every figure with its
 * definition, the period and the currency it is expressed in.
 */
export async function financialOverview(syndicateId: string, period: { from?: string | null; to?: string | null } = {}) {
  const from = period.from ?? yearStart();
  const to = period.to ?? today();
  const scope = { syndicateId };
  const [flows, balances, recv, rate, pending] = await Promise.all([
    ledgerFlows(scope, { from, to }),
    cashBalances(scope, to),
    receivables(scope),
    collectionRate(scope, from, to),
    db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM appel_payments WHERE syndicate_id = ${syndicateId} AND status = 'pending') AS pending_n,
        (SELECT COALESCE(SUM(amount), 0) FROM appel_payments WHERE syndicate_id = ${syndicateId} AND status = 'pending') AS pending_total,
        (SELECT COUNT(*)::int FROM expenses WHERE syndicate_id = ${syndicateId} AND status = 'submitted') AS to_approve_n,
        (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE syndicate_id = ${syndicateId} AND status = 'submitted') AS to_approve_total,
        (SELECT COUNT(*)::int FROM expenses WHERE syndicate_id = ${syndicateId} AND status = 'approved') AS committed_n,
        (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE syndicate_id = ${syndicateId} AND status = 'approved') AS committed_total,
        (SELECT currency FROM syndicates WHERE id = ${syndicateId}) AS currency
    `) as unknown as Promise<Record<string, any>[]>,
  ]);
  const p = (pending as Record<string, any>[])[0] ?? {};
  const income = new Map<string, number>();
  const expenses = new Map<string, number>();
  const net = new Map<string, number>();
  for (const f of flows) {
    income.set(f.currency, (income.get(f.currency) ?? 0) + f.income);
    expenses.set(f.currency, (expenses.get(f.currency) ?? 0) + f.expenses);
    net.set(f.currency, (net.get(f.currency) ?? 0) + f.income - f.expenses);
  }
  const currency = (p.currency as string) ?? "MAD";
  return {
    period: { from, to },
    currency,
    cashBalance: money(balances),
    income: money(income),
    expenses: money(expenses),
    net: money(net),
    receivables: { amount: fromCents(recv.outstanding), currency, calls: recv.calls },
    overdueReceivables: { amount: fromCents(recv.overdue), currency },
    pendingPayments: { count: Number(p.pending_n ?? 0), amount: fromCents(toCents(p.pending_total)), currency },
    expensesToApprove: { count: Number(p.to_approve_n ?? 0), amount: fromCents(toCents(p.to_approve_total)), currency },
    committedExpenses: { count: Number(p.committed_n ?? 0), amount: fromCents(toCents(p.committed_total)), currency },
    collectionRate: rate,
    definitions: METRIC_DEFINITIONS,
  };
}

/** Sum of the cents of one currency in a MoneyByCurrency-like list (default MAD). */
export function amountIn(m: MoneyByCurrency, currency: string): number {
  return Number(m.find((x) => x.currency === currency)?.amount ?? 0);
}

/** Local calendar date YYYY-MM-DD of a Date (bucket boundaries of the charts). */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
