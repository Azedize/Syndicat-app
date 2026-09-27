import { z } from "zod";
import { db } from "@workspace/db";
import {
  appelPaymentsTable,
  appelsDeFondsTable,
  expensesTable,
  ledgerEntriesTable,
  reconciliationMatchesTable,
  salaryRecordsTable,
  transactionsTable,
  treasuryAccountsTable,
} from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { nextSequenceNumber } from "./sequences.js";

/**
 * Treasury service — the only code path that writes the journal
 * (ledger_entries). Balances are always derived from the journal, never
 * stored. Every function takes the caller's transaction so a business state
 * change and its accounting entry commit or roll back together.
 */

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type TreasuryAccount = typeof treasuryAccountsTable.$inferSelect;
export type LedgerEntry = typeof ledgerEntriesTable.$inferSelect;

/** Business error carrying the HTTP status and a stable machine code. */
export class FinanceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// ─── Money ────────────────────────────────────────────────────────────────────

const MAX_CENTS = 9_999_999_999_99; // numeric(12,2)

/** numeric string / number → integer cents (exact for 2-decimal inputs). */
export function toCents(value: string | number | null | undefined): number {
  return Math.round(Number(value ?? 0) * 100);
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Positive amount with at most 2 decimals, normalised to "123.45". */
export const amountSchema = z
  .union([z.number(), z.string().trim()])
  .transform((v) => String(v))
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), {
    message: "Montant invalide (nombre positif, 2 décimales maximum)",
  })
  .transform((v) => toCents(v))
  .refine((c) => c > 0 && c <= MAX_CENTS, { message: "Montant hors limites" })
  .transform((c) => fromCents(c));

/** Calendar date YYYY-MM-DD that actually exists. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Date invalide (AAAA-MM-JJ)" })
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), {
    message: "Date invalide",
  });

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Moroccan RIB: 24 digits (bank 3, city 3, account 16, key 2). The key makes
 * the whole 24-digit number divisible by 97.
 */
export function normalizeRib(value: string): string {
  return value.replace(/[\s-]/g, "");
}

export function isValidMoroccanRib(rib: string): boolean {
  if (!/^\d{24}$/.test(rib)) return false;
  return BigInt(rib) % 97n === 0n;
}

/** Masks all but the last 4 digits (for lists and logs). */
export function maskRib(rib: string | null): string | null {
  if (!rib) return null;
  return `${"•".repeat(Math.max(0, rib.length - 4))}${rib.slice(-4)}`;
}

/** Journal categories. Budget-line categories (free text) are also accepted. */
export const categorySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{1,39}$/, {
    message: "Catégorie invalide (minuscules, chiffres et _)",
  });

export const PAYMENT_METHODS = ["virement", "cheque", "especes"] as const;

// ─── Accounts ─────────────────────────────────────────────────────────────────

/**
 * Loads (and row-locks) the account a movement is posted to. Without an
 * explicit id, the syndicate's default account of the preferred kind is used
 * (cash for espèces, bank otherwise), or its only active account of that kind.
 */
export async function lockAccount(
  tx: Tx,
  syndicateId: string,
  opts: { accountId?: string | null; preferKind?: "bank" | "cash" },
): Promise<TreasuryAccount> {
  if (opts.accountId) {
    const [account] = await tx
      .select()
      .from(treasuryAccountsTable)
      .where(
        and(
          eq(treasuryAccountsTable.id, opts.accountId),
          eq(treasuryAccountsTable.syndicateId, syndicateId),
        ),
      )
      .for("update");
    if (!account) {
      throw new FinanceError(404, "ACCOUNT_NOT_FOUND", "Compte introuvable dans ce syndicat");
    }
    if (account.status !== "active") {
      throw new FinanceError(409, "ACCOUNT_CLOSED", "Ce compte est clôturé");
    }
    return account;
  }

  const kind = opts.preferKind ?? "bank";
  const candidates = await tx
    .select()
    .from(treasuryAccountsTable)
    .where(
      and(
        eq(treasuryAccountsTable.syndicateId, syndicateId),
        eq(treasuryAccountsTable.kind, kind),
        eq(treasuryAccountsTable.status, "active"),
      ),
    )
    .for("update");
  const chosen = candidates.find((a) => a.isDefault) ?? (candidates.length === 1 ? candidates[0] : undefined);
  if (!chosen) {
    throw new FinanceError(
      409,
      "TREASURY_ACCOUNT_REQUIRED",
      kind === "cash"
        ? "Aucune caisse active par défaut : créez-la ou choisissez un compte."
        : "Aucun compte bancaire actif par défaut : créez-le ou choisissez un compte.",
    );
  }
  return chosen;
}

/** Balance of one account in cents, from the journal only. */
export async function accountBalanceCents(
  executor: Pick<typeof db, "select">,
  accountId: string,
): Promise<number> {
  const [row] = await executor
    .select({
      balance: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntriesTable.direction} = 'in' THEN ${ledgerEntriesTable.amount} ELSE -${ledgerEntriesTable.amount} END), 0)`,
    })
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.accountId, accountId));
  return toCents(row?.balance ?? 0);
}

/** Per-account balances, flows and reconciliation backlog for a syndicate. */
export async function accountSummaries(syndicateId: string) {
  const accounts = await db
    .select()
    .from(treasuryAccountsTable)
    .where(eq(treasuryAccountsTable.syndicateId, syndicateId))
    .orderBy(treasuryAccountsTable.createdAt);
  if (accounts.length === 0) return [];

  const flows = await db
    .select({
      accountId: ledgerEntriesTable.accountId,
      inflow: sql<string>`COALESCE(SUM(${ledgerEntriesTable.amount}) FILTER (WHERE ${ledgerEntriesTable.direction} = 'in'), 0)`,
      outflow: sql<string>`COALESCE(SUM(${ledgerEntriesTable.amount}) FILTER (WHERE ${ledgerEntriesTable.direction} = 'out'), 0)`,
      entries: sql<number>`COUNT(*)::int`,
      lastEntryDate: sql<string | null>`MAX(${ledgerEntriesTable.entryDate})::text`,
    })
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.syndicateId, syndicateId))
    .groupBy(ledgerEntriesTable.accountId);

  // Entries not (fully) matched with a bank statement line.
  const unreconciled = await db.execute<{ account_id: string; n: number }>(sql`
    SELECT le.account_id, COUNT(*)::int AS n
    FROM ledger_entries le
    LEFT JOIN (
      SELECT ledger_entry_id, SUM(amount) AS matched
      FROM reconciliation_matches
      WHERE syndicate_id = ${syndicateId}
      GROUP BY ledger_entry_id
    ) m ON m.ledger_entry_id = le.id
    WHERE le.syndicate_id = ${syndicateId}
      AND COALESCE(m.matched, 0) < le.amount
    GROUP BY le.account_id
  `);
  const unreconciledByAccount = new Map(
    (unreconciled as unknown as { account_id: string; n: number }[]).map((r) => [r.account_id, Number(r.n)]),
  );
  const flowByAccount = new Map(flows.map((f) => [f.accountId, f]));

  return accounts.map((a) => {
    const f = flowByAccount.get(a.id);
    const inflow = toCents(f?.inflow ?? 0);
    const outflow = toCents(f?.outflow ?? 0);
    return {
      ...a,
      rib: undefined,
      ribMasked: maskRib(a.rib),
      balance: fromCents(inflow - outflow),
      inflow: fromCents(inflow),
      outflow: fromCents(outflow),
      entries: f?.entries ?? 0,
      lastEntryDate: f?.lastEntryDate ?? null,
      unreconciledEntries: a.kind === "bank" ? (unreconciledByAccount.get(a.id) ?? 0) : null,
    };
  });
}

// ─── Journal ──────────────────────────────────────────────────────────────────

export interface PostEntryInput {
  syndicateId: string;
  account: TreasuryAccount;
  direction: "in" | "out";
  amount: string;
  entryDate: string;
  category: string;
  label: string;
  reference?: string | null;
  sourceType: "opening" | "appel_payment" | "expense" | "salary" | "manual" | "transfer" | "reversal";
  sourceId?: string | null;
  reversesEntryId?: string | null;
  buildingId?: string | null;
  proofUrl?: string | null;
  idempotencyKey?: string | null;
  createdBy: string;
}

/**
 * Appends one journal entry. The account row must be locked by the caller
 * (lockAccount) so the cash-balance check and the insert are serialized.
 */
export async function postEntry(tx: Tx, input: PostEntryInput): Promise<LedgerEntry> {
  const { account } = input;
  if (account.syndicateId !== input.syndicateId) {
    // Defence in depth: an account of another syndicate can never be posted to.
    throw new FinanceError(404, "ACCOUNT_NOT_FOUND", "Compte introuvable dans ce syndicat");
  }
  if (input.entryDate > today()) {
    throw new FinanceError(400, "ENTRY_DATE_IN_FUTURE", "Une opération ne peut pas être datée dans le futur");
  }
  if (input.entryDate < account.openingDate && input.sourceType !== "reversal") {
    throw new FinanceError(
      400,
      "ENTRY_BEFORE_OPENING",
      `Date antérieure à l'ouverture du compte (${account.openingDate})`,
    );
  }
  const amountCents = toCents(input.amount);
  if (amountCents <= 0) {
    throw new FinanceError(400, "INVALID_AMOUNT", "Montant invalide");
  }
  if (account.kind === "cash" && input.direction === "out") {
    const balance = await accountBalanceCents(tx, account.id);
    if (balance < amountCents) {
      throw new FinanceError(
        409,
        "INSUFFICIENT_CASH",
        `Solde de caisse insuffisant (${fromCents(balance)} ${account.currency})`,
      );
    }
  }

  const entryNumber = await nextSequenceNumber(tx, input.syndicateId, "JRN", 6);
  try {
    const [entry] = await tx
      .insert(ledgerEntriesTable)
      .values({
        syndicateId: input.syndicateId,
        accountId: account.id,
        entryNumber,
        entryDate: input.entryDate,
        direction: input.direction,
        amount: fromCents(amountCents),
        currency: account.currency,
        category: input.category,
        label: input.label,
        reference: input.reference ?? null,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        reversesEntryId: input.reversesEntryId ?? null,
        buildingId: input.buildingId ?? account.buildingId ?? null,
        proofUrl: input.proofUrl ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        createdBy: input.createdBy,
      })
      .returning();
    return entry;
  } catch (err: any) {
    const constraint = uniqueViolation(err);
    if (constraint !== null) {
      if (constraint.includes("reverses")) {
        throw new FinanceError(409, "ALREADY_REVERSED", "Cette écriture a déjà été extournée");
      }
      if (constraint.includes("idempotency")) {
        throw new FinanceError(409, "IDEMPOTENCY_CONFLICT", "Requête déjà en cours de traitement");
      }
      throw new FinanceError(409, "ALREADY_POSTED", "Cette opération est déjà comptabilisée");
    }
    throw err;
  }
}

/**
 * Returns the violated constraint name when `err` is a PostgreSQL unique
 * violation (drizzle may wrap the driver error in `cause`), otherwise null.
 */
export function uniqueViolation(err: unknown): string | null {
  for (const e of [err, (err as any)?.cause]) {
    if ((e as any)?.code === "23505") {
      return String((e as any).constraint_name ?? (e as any).constraint ?? "");
    }
  }
  return null;
}

/** Operation-register row (transactions) linked to its journal entry. */
export async function recordOperation(
  tx: Tx,
  input: {
    syndicateId: string;
    type: "cotisation" | "recette" | "depense" | "salaire";
    amount: string;
    label: string;
    date: string;
    memberId?: string | null;
    proofUrl?: string | null;
    ledgerEntryId: string;
  },
) {
  const [row] = await tx
    .insert(transactionsTable)
    .values({
      type: input.type,
      amount: input.amount,
      label: input.label,
      date: input.date,
      status: "paid",
      memberId: input.memberId ?? null,
      syndicateId: input.syndicateId,
      proofUrl: input.proofUrl ?? null,
      ledgerEntryId: input.ledgerEntryId,
    })
    .returning();
  return row;
}

async function reconciledAmountCents(tx: Tx, entryId: string): Promise<number> {
  const [row] = await tx
    .select({ matched: sql<string>`COALESCE(SUM(${reconciliationMatchesTable.amount}), 0)` })
    .from(reconciliationMatchesTable)
    .where(eq(reconciliationMatchesTable.ledgerEntryId, entryId));
  return toCents(row?.matched ?? 0);
}

/**
 * Reverses a journal entry with an opposite entry and undoes its business
 * effect (payment → reversed and the call's paid amount reduced; expense /
 * salary → back to payable; transfer → both legs). Nothing is deleted.
 */
export async function reverseEntry(
  tx: Tx,
  input: { syndicateId: string; entryId: string; reason: string; userId: string },
): Promise<{ reversals: LedgerEntry[]; effect: string; appelId?: string; paymentId?: string }> {
  const [entry] = await tx
    .select()
    .from(ledgerEntriesTable)
    .where(and(eq(ledgerEntriesTable.id, input.entryId), eq(ledgerEntriesTable.syndicateId, input.syndicateId)))
    .for("update");
  if (!entry) throw new FinanceError(404, "ENTRY_NOT_FOUND", "Écriture introuvable");
  if (entry.sourceType === "reversal") {
    throw new FinanceError(409, "CANNOT_REVERSE_REVERSAL", "Une extourne ne peut pas être extournée");
  }
  if (entry.sourceType === "opening") {
    throw new FinanceError(
      409,
      "CANNOT_REVERSE_OPENING",
      "Le solde d'ouverture ne s'extourne pas : passez une écriture de régularisation.",
    );
  }

  // A transfer is two legs sharing the same source id: reverse both.
  const legs =
    entry.sourceType === "transfer" && entry.sourceId
      ? await tx
          .select()
          .from(ledgerEntriesTable)
          .where(
            and(
              eq(ledgerEntriesTable.syndicateId, input.syndicateId),
              eq(ledgerEntriesTable.sourceType, "transfer"),
              eq(ledgerEntriesTable.sourceId, entry.sourceId),
            ),
          )
          .for("update")
      : [entry];

  for (const leg of legs) {
    const [already] = await tx
      .select({ id: ledgerEntriesTable.id })
      .from(ledgerEntriesTable)
      .where(eq(ledgerEntriesTable.reversesEntryId, leg.id))
      .limit(1);
    if (already) throw new FinanceError(409, "ALREADY_REVERSED", "Cette écriture a déjà été extournée");
    if ((await reconciledAmountCents(tx, leg.id)) > 0) {
      throw new FinanceError(
        409,
        "ENTRY_RECONCILED",
        "Écriture rapprochée d'un relevé bancaire : annulez d'abord le rapprochement.",
      );
    }
  }

  const reversals: LedgerEntry[] = [];
  // Lock accounts in a stable order to avoid deadlocks between two reversals.
  const sortedLegs = [...legs].sort((a, b) => a.accountId.localeCompare(b.accountId));
  for (const leg of sortedLegs) {
    const account = await lockAccount(tx, input.syndicateId, { accountId: leg.accountId }).catch((e) => {
      // A closed account can still receive the reversal of its own entry.
      if (e instanceof FinanceError && e.code === "ACCOUNT_CLOSED") {
        return tx
          .select()
          .from(treasuryAccountsTable)
          .where(eq(treasuryAccountsTable.id, leg.accountId))
          .then((r) => r[0]);
      }
      throw e;
    });
    reversals.push(
      await postEntry(tx, {
        syndicateId: input.syndicateId,
        account,
        direction: leg.direction === "in" ? "out" : "in",
        amount: leg.amount,
        entryDate: today(),
        category: leg.category,
        label: `Extourne ${leg.entryNumber} — ${input.reason}`,
        reference: leg.entryNumber,
        sourceType: "reversal",
        sourceId: leg.id,
        reversesEntryId: leg.id,
        buildingId: leg.buildingId,
        createdBy: input.userId,
      }),
    );
  }

  // The operation register row(s) of the reversed entries no longer count.
  for (const leg of legs) {
    await tx
      .update(transactionsTable)
      .set({ status: "cancelled" })
      .where(eq(transactionsTable.ledgerEntryId, leg.id));
  }

  if (entry.sourceType === "appel_payment" && entry.sourceId) {
    const [payment] = await tx
      .update(appelPaymentsTable)
      .set({ status: "reversed" })
      .where(and(eq(appelPaymentsTable.id, entry.sourceId), eq(appelPaymentsTable.status, "validated")))
      .returning();
    if (!payment) throw new FinanceError(409, "PAYMENT_STATE_CONFLICT", "Paiement introuvable ou déjà annulé");
    const [appel] = await tx
      .select()
      .from(appelsDeFondsTable)
      .where(eq(appelsDeFondsTable.id, payment.appelId))
      .for("update");
    const paidCents = Math.max(0, toCents(appel.amountPaid) - toCents(payment.amount));
    const status =
      appel.status === "pending_validation"
        ? "pending_validation"
        : settlementStatus(toCents(appel.amount), paidCents, appel.dueDate);
    await tx
      .update(appelsDeFondsTable)
      .set({
        amountPaid: fromCents(paidCents),
        status,
        // The receipt of a reversed payment is no longer valid.
        receiptNumber: paidCents === 0 ? null : appel.receiptNumber,
        paidDate: paidCents === 0 ? null : appel.paidDate,
      })
      .where(eq(appelsDeFondsTable.id, appel.id));
    return { reversals, effect: "payment_reversed", appelId: appel.id, paymentId: payment.id };
  }

  if (entry.sourceType === "expense" && entry.sourceId) {
    const [expense] = await tx
      .update(expensesTable)
      .set({
        status: "approved",
        paidAt: null,
        paidBy: null,
        paymentMethod: null,
        paymentReference: null,
        accountId: null,
        ledgerEntryId: null,
      })
      .where(and(eq(expensesTable.id, entry.sourceId), eq(expensesTable.ledgerEntryId, entry.id)))
      .returning();
    if (!expense) throw new FinanceError(409, "EXPENSE_STATE_CONFLICT", "Dépense introuvable ou déjà modifiée");
    return { reversals, effect: "expense_back_to_approved" };
  }

  if (entry.sourceType === "salary" && entry.sourceId) {
    await tx
      .update(salaryRecordsTable)
      .set({ status: "pending", paidDate: null, ledgerEntryId: null })
      .where(and(eq(salaryRecordsTable.id, entry.sourceId), eq(salaryRecordsTable.ledgerEntryId, entry.id)));
    return { reversals, effect: "salary_back_to_pending" };
  }

  return { reversals, effect: entry.sourceType === "transfer" ? "transfer_reversed" : "entry_reversed" };
}

/**
 * Settlement status of a call for funds from its paid amount:
 * paid when fully settled, partially_paid when something was paid,
 * otherwise pending (or overdue once the due date has passed).
 */
export function settlementStatus(amountCents: number, paidCents: number, dueDate: string | null): string {
  if (paidCents >= amountCents) return "paid";
  if (paidCents > 0) return "partially_paid";
  if (dueDate && dueDate < today()) return "overdue";
  return "pending";
}

/** Maps a FinanceError (or unknown error) to an HTTP response. */
export function sendFinanceError(res: any, req: any, err: unknown, fallback = "Erreur serveur"): void {
  if (err instanceof FinanceError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  const status = (err as any)?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ error: (err as any).message, code: (err as any).code });
    return;
  }
  req.log?.error?.(err);
  res.status(500).json({ error: fallback });
}

/**
 * Revenue / expenses / balance of a syndicate from the journal. Internal
 * transfers and opening balances move money between accounts without being
 * income or spending, so they only count in the balance. A reversal counts
 * against the flow it cancels (a reversed receipt reduces revenue).
 */
export async function syndicateFlows(
  syndicateId: string,
  opts: { buildingId?: string; year?: number } = {},
): Promise<{ revenue: number; expenses: number; balance: number }> {
  const conditions = [sql`le.syndicate_id = ${syndicateId}`];
  if (opts.buildingId) conditions.push(sql`le.building_id = ${opts.buildingId}`);
  if (opts.year) conditions.push(sql`EXTRACT(YEAR FROM le.entry_date) = ${opts.year}`);
  const rows = await db.execute<{ revenue: string; expenses: string; balance: string }>(sql`
    WITH e AS (
      SELECT CASE WHEN le.direction = 'in' THEN le.amount ELSE -le.amount END AS signed,
             CASE WHEN le.source_type = 'reversal'
                  THEN CASE WHEN le.direction = 'in' THEN 'out' ELSE 'in' END
                  ELSE le.direction END AS original,
             le.category
      FROM ledger_entries le
      WHERE ${sql.join(conditions, sql` AND `)}
    )
    SELECT
      COALESCE(SUM(signed) FILTER (WHERE original = 'in' AND category NOT IN ('virement_interne', 'reprise_solde')), 0) AS revenue,
      COALESCE(-SUM(signed) FILTER (WHERE original = 'out' AND category NOT IN ('virement_interne', 'reprise_solde')), 0) AS expenses,
      COALESCE(SUM(signed), 0) AS balance
    FROM e
  `);
  const row = (rows as unknown as { revenue: string; expenses: string; balance: string }[])[0];
  return {
    revenue: toCents(row?.revenue) / 100,
    expenses: toCents(row?.expenses) / 100,
    balance: toCents(row?.balance) / 100,
  };
}
