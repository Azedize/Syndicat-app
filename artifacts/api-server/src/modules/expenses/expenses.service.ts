import { db } from "@workspace/db";
import type { ExpenseRefs } from "./expenses.validation.js";
import {
  budgetLinesTable,
  budgetsTable,
  buildingsTable,
  expensesTable,
  prestatairesTable,
} from "@workspace/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { findForeignReference } from "../../lib/scope.js";
import { createAlert } from "../../lib/notify.js";
import { FinanceError, today } from "../../lib/treasury.js";

export async function loadScopedExpense(id: string, syndicateId: string) {
  const [row] = await db
    .select()
    .from(expensesTable)
    .where(and(eq(expensesTable.id, id), eq(expensesTable.syndicateId, syndicateId)));
  return row;
}

/**
 * Checks that everything an expense points to belongs to the syndicate
 * (invoice file, building, supplier, budget line) and completes the building
 * and supplier name. Throws a FinanceError otherwise.
 */
export async function checkExpenseReferences(sid: string, data: ExpenseRefs): Promise<void> {
  if (data.invoiceDate && data.invoiceDate > today()) {
    throw new FinanceError(400, "INVOICE_DATE_IN_FUTURE", "La date de facture ne peut pas être dans le futur");
  }
  const foreign = await findForeignReference(sid, { objectPath: data.proofUrl, buildingId: data.buildingId });
  if (foreign) {
    throw new FinanceError(
      400,
      "FOREIGN_REFERENCE",
      foreign === "objectPath" ? "La facture doit être un fichier téléversé dans ce syndicat." : "Immeuble introuvable dans votre syndicat",
    );
  }
  if (data.prestataireId) {
    const [prest] = await db
      .select({ id: prestatairesTable.id, name: prestatairesTable.name })
      .from(prestatairesTable)
      .where(and(eq(prestatairesTable.id, data.prestataireId), eq(prestatairesTable.syndicateId, sid)));
    if (!prest) throw new FinanceError(400, "FOREIGN_REFERENCE", "Prestataire introuvable dans votre syndicat");
    data.supplierName ??= prest.name;
  }
  if (data.budgetLineId) {
    const [line] = await db
      .select({ id: budgetLinesTable.id, buildingId: budgetsTable.buildingId })
      .from(budgetLinesTable)
      .innerJoin(budgetsTable, eq(budgetsTable.id, budgetLinesTable.budgetId))
      .innerJoin(buildingsTable, eq(buildingsTable.id, budgetsTable.buildingId))
      .where(and(eq(budgetLinesTable.id, data.budgetLineId), eq(buildingsTable.syndicateId, sid)));
    if (!line) throw new FinanceError(400, "FOREIGN_REFERENCE", "Ligne budgétaire introuvable dans votre syndicat");
    if (data.buildingId && data.buildingId !== line.buildingId) {
      throw new FinanceError(400, "BUILDING_MISMATCH", "La ligne budgétaire concerne un autre immeuble");
    }
    data.buildingId ??= line.buildingId;
  }
}

export function alertApprovers(sid: string, expense: { reference: string; label: string; amount: string }) {
  createAlert({
    key: "expense.toApprove",
    params: { reference: expense.reference, label: expense.label, amount: expense.amount },
    type: "info",
    syndicateId: sid,
    target: "admin",
  }).catch(() => {});
}

/**
 * People other than `userId` who can approve expenses in the syndicate
 * (syndic or president, through their account, an assignment or the company).
 */
export async function otherApprovers(sid: string, userId: string): Promise<number> {
  const [row] = (await db.execute(sql`
    SELECT COUNT(DISTINCT uid)::int AS n FROM (
      SELECT u.id AS uid FROM users u
        WHERE u.syndicate_id = ${sid} AND u.role IN ('syndicate_admin', 'president') AND u.status = 'active'
      UNION
      SELECT m.user_id FROM syndicate_memberships m JOIN users u ON u.id = m.user_id
        WHERE m.syndicate_id = ${sid} AND m.status = 'active' AND m.role IN ('syndicate_admin', 'president') AND u.status = 'active'
      UNION
      SELECT om.user_id FROM organization_members om
        JOIN syndicates s ON s.organization_id = om.organization_id
        JOIN users u ON u.id = om.user_id
        WHERE s.id = ${sid} AND om.status = 'active' AND om.role = 'org_admin' AND u.status = 'active'
    ) a WHERE uid <> ${userId}
  `)) as unknown as { n: number }[];
  return Number(row?.n ?? 0);
}

export function inArrayStatus(statuses: string[]) {
  return inArray(expensesTable.status, statuses);
}
