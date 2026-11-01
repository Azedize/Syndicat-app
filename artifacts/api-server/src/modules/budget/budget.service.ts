import { db } from "@workspace/db";
import { membersTable, usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { fromCents, toCents } from "../../lib/treasury.js";

/**
 * Budget amounts, in cents. The convention used by the execution report, the
 * calls for funds and the charge allocation: the budget lines detail the
 * current charges, and the reserve fund is apart from them —
 *   lines = charges, total = charges + reserve.
 * A missing amount is derived; amounts given that contradict each other are
 * refused rather than stored.
 */
export function reconcileBudgetAmounts(input: {
  totalAmount?: string;
  chargesAmount?: string;
  fondsReserve?: string;
  linesTotal?: string;
}): { ok: true; totalAmount: string; chargesAmount: string; fondsReserve: string } | { ok: false; error: string } {
  const lines = input.linesTotal !== undefined ? toCents(input.linesTotal) : undefined;
  const charges = input.chargesAmount !== undefined ? toCents(input.chargesAmount) : lines ?? 0;
  if (lines !== undefined && lines !== charges) {
    return { ok: false, error: `Les lignes du budget (${fromCents(lines)} MAD) doivent totaliser le montant des charges (${fromCents(charges)} MAD). Le fonds de réserve ne figure pas parmi les lignes.` };
  }
  const reserve = input.fondsReserve !== undefined ? toCents(input.fondsReserve) : 0;
  const total = input.totalAmount !== undefined ? toCents(input.totalAmount) : charges + reserve;
  if (total !== charges + reserve) {
    return { ok: false, error: `Le total du budget (${fromCents(total)} MAD) doit être égal aux charges (${fromCents(charges)} MAD) plus le fonds de réserve (${fromCents(reserve)} MAD).` };
  }
  return { ok: true, totalAmount: fromCents(total), chargesAmount: fromCents(charges), fondsReserve: fromCents(reserve) };
}

export type OwnerLookupExecutor = Pick<typeof db, "select">;

/**
 * Maps an appel owner (members.id, or a users.id for legacy rows) to the
 * owner's user account in the same syndicate. Returns null when the owner has
 * no platform account — the transaction then stays unattributed rather than
 * violating the users foreign key.
 */
export async function resolveOwnerUserId(
  executor: OwnerLookupExecutor,
  ownerId: string | null,
  syndicateId: string,
): Promise<string | null> {
  if (!ownerId) return null;
  const [direct] = await executor
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, ownerId), eq(usersTable.syndicateId, syndicateId)))
    .limit(1);
  if (direct) return direct.id;
  const [viaMember] = await executor
    .select({ id: usersTable.id })
    .from(membersTable)
    .innerJoin(usersTable, eq(usersTable.email, membersTable.email))
    .where(
      and(
        eq(membersTable.id, ownerId),
        eq(membersTable.syndicateId, syndicateId),
        eq(usersTable.syndicateId, syndicateId),
      ),
    )
    .limit(1);
  return viaMember?.id ?? null;
}

/** Statuses from which a co-owner may declare a payment. */
export const PAYABLE_STATUSES = ["pending", "overdue", "rejected", "partially_paid"] as const;

/** Journal category of a call-for-funds payment, by call type. */
export const APPEL_LEDGER_CATEGORY: Record<string, string> = {
  charges_courantes: "charges_copropriete",
  fonds_reserve: "fonds_reserve",
  appel_special: "appel_special",
};

export function periodsPerYear(period: string): number {
  if (/^\d{4}-Q[1-4]$/.test(period)) return 4;
  if (/^\d{4}-\d{2}$/.test(period)) return 12;
  return 1;
}

/** Budget lifecycle: draft → submitted → approved (by AG) → closed. */
export const PRE_APPROVAL_BUDGET_STATUSES: string[] = ["draft", "submitted"];

export const APPROVED_BUDGET_STATUSES: string[] = ["approved", "closed"];
