import { db } from "@workspace/db";
import { bankStatementsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { FinanceError } from "../../lib/treasury.js";

export function lineStatus(lineAmountCents: number, matchedCents: number): "unmatched" | "partial" | "matched" {
  if (matchedCents <= 0) return "unmatched";
  return matchedCents >= Math.abs(lineAmountCents) ? "matched" : "partial";
}

/** A line printed on a closed statement is frozen (reopen the statement first). */
export async function assertLineEditable(executor: Pick<typeof db, "select">, line: { statementId: string | null }) {
  if (!line.statementId) return;
  const [st] = await executor
    .select({ status: bankStatementsTable.status })
    .from(bankStatementsTable)
    .where(eq(bankStatementsTable.id, line.statementId));
  if (st?.status === "closed") {
    throw new FinanceError(409, "STATEMENT_CLOSED", "Relevé clôturé : rouvrez-le avant de modifier son rapprochement");
  }
}

export async function loadStatement(id: string, sid: string) {
  const [st] = await db
    .select()
    .from(bankStatementsTable)
    .where(and(eq(bankStatementsTable.id, id), eq(bankStatementsTable.syndicateId, sid)));
  if (!st) throw new FinanceError(404, "STATEMENT_NOT_FOUND", "Relevé introuvable");
  return st;
}
