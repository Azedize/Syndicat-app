import { db } from "@workspace/db";
import { syndicatesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { fromCents } from "../../lib/treasury.js";

/**
 * Income / expenses of one currency from ledgerFlows rows, in currency units
 * (2 decimals). Charts and counters below all use the journal, never the
 * operations register, so they agree with the treasury screens.
 */
export function flowsIn(rows: { currency: string; income: number; expenses: number }[], currency: string) {
  let income = 0;
  let expenses = 0;
  for (const r of rows) {
    if (r.currency !== currency) continue;
    income += r.income;
    expenses += r.expenses;
  }
  return { income: Number(fromCents(income)), expenses: Number(fromCents(expenses)) };
}

export async function syndicateCurrency(syndicateId: string | null): Promise<string> {
  if (!syndicateId) return "MAD";
  const [row] = await db.select({ currency: syndicatesTable.currency }).from(syndicatesTable).where(eq(syndicatesTable.id, syndicateId));
  return row?.currency ?? "MAD";
}

// Helper: last N months as { label, from, to }
export function lastNMonths(n: number) {
  const months: { label: string; key: string; from: Date; to: Date }[] = [];
  const FR_MONTHS = [
    "Jan",
    "Fév",
    "Mar",
    "Avr",
    "Mai",
    "Jun",
    "Jul",
    "Aoû",
    "Sep",
    "Oct",
    "Nov",
    "Déc",
  ];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    months.push({
      label: FR_MONTHS[d.getMonth()],
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      from,
      to,
    });
  }
  return months;
}
