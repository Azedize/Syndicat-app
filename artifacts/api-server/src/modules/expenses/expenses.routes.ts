import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { buildingsTable, expensesTable, prestatairesTable, treasuryAccountsTable } from "@workspace/db/schema";
import { and, count, desc, eq } from "drizzle-orm";
import { requireAuth, requireFinanceAccess } from "../../middleware/auth.js";
import { getPagination, buildPagedResponse } from "../../lib/paginate.js";
import { serverAuditLog } from "../../lib/audit.js";
import { nextSequenceNumber } from "../../lib/sequences.js";
import {
  FinanceError,
  isoDateSchema,
  lockAccount,
  postEntry,
  recordOperation,
  sendFinanceError,
  today,
  uniqueViolation,
} from "../../lib/treasury.js";
import {
  loadScopedExpense,
  checkExpenseReferences,
  alertApprovers,
  otherApprovers,
  inArrayStatus,
} from "./expenses.service.js";
import { expenseFields, type ExpenseRefs } from "./expenses.validation.js";

/**
 * Syndicate expenses — workflow:
 *   draft (prepared, editable, no effect)
 *     → submitted (treasurer / admin, with the supplier invoice; still editable)
 *     → approved (admin / president: a commitment, no cash effect) | rejected
 *     → paid (treasurer / admin: supplier paid, journal entry posted)
 *   draft | submitted | approved → cancelled
 * An approved expense is frozen. A paid expense can only be undone by
 * reversing its journal entry. Whoever submitted an expense cannot approve it
 * when another approver exists in the condominium.
 */
const router = Router();

const READ_ROLES = ["syndicate_admin", "treasurer", "president", "committee_member"];
const APPROVER_ROLES = ["syndicate_admin", "president"];

function requireRoles(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return void res.status(401).json({ error: "Non authentifié" });
    if (!roles.includes(req.user.role)) return void res.status(403).json({ error: "Accès refusé" });
    if (!req.user.syndicateId) return void res.status(403).json({ error: "Syndicat non défini dans le token" });
    next();
  };
}

router.get("/expenses", requireAuth, requireRoles(READ_ROLES), async (req, res) => {
  const sid = req.user!.syndicateId!;
  const pagination = getPagination(req);
  try {
    const conditions = [eq(expensesTable.syndicateId, sid)];
    if (typeof req.query.status === "string") conditions.push(eq(expensesTable.status, req.query.status));
    if (typeof req.query.buildingId === "string") conditions.push(eq(expensesTable.buildingId, req.query.buildingId));
    const where = and(...conditions);
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select({
          expense: expensesTable,
          buildingName: buildingsTable.name,
          accountLabel: treasuryAccountsTable.label,
          prestataireName: prestatairesTable.name,
        })
        .from(expensesTable)
        .leftJoin(buildingsTable, eq(buildingsTable.id, expensesTable.buildingId))
        .leftJoin(treasuryAccountsTable, eq(treasuryAccountsTable.id, expensesTable.accountId))
        .leftJoin(prestatairesTable, eq(prestatairesTable.id, expensesTable.prestataireId))
        .where(where)
        .orderBy(desc(expensesTable.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.select({ value: count() }).from(expensesTable).where(where),
    ]);
    res.json(
      buildPagedResponse(
        rows.map((r) => ({ ...r.expense, buildingName: r.buildingName, accountLabel: r.accountLabel, prestataireName: r.prestataireName })),
        Number(total),
        pagination,
      ),
    );
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

router.get("/expenses/:id", requireAuth, requireRoles(READ_ROLES), async (req, res) => {
  try {
    const expense = await loadScopedExpense(String(req.params.id), req.user!.syndicateId!);
    if (!expense) return void res.status(404).json({ error: "Dépense introuvable" });
    res.json({ data: expense });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});


const createExpenseSchema = expenseFields
  .extend({ draft: z.boolean().optional() })
  .refine((d) => !!d.supplierName || !!d.prestataireId, {
    message: "Le fournisseur est obligatoire",
    path: ["supplierName"],
  });


router.post("/expenses", requireAuth, requireFinanceAccess, async (req, res) => {
  const parsed = createExpenseSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides", code: "INVALID_EXPENSE" });
  }
  const data = parsed.data;
  const sid = req.user!.syndicateId!;
  try {
    const rawKey = req.header("Idempotency-Key")?.trim() || null;
    if (rawKey && !/^[A-Za-z0-9_\-:.]{8,100}$/.test(rawKey)) {
      throw new FinanceError(400, "INVALID_IDEMPOTENCY_KEY", "En-tête Idempotency-Key invalide");
    }
    if (rawKey) {
      const [existing] = await db
        .select()
        .from(expensesTable)
        .where(and(eq(expensesTable.syndicateId, sid), eq(expensesTable.idempotencyKey, rawKey)));
      if (existing) return void res.status(200).json({ data: existing, replayed: true, message: "Dépense déjà enregistrée" });
    }
    await checkExpenseReferences(sid, data);

    if (!data.buildingId) {
      // A syndicate with a single building: the expense is that building's
      // (so it counts in its budget). With several buildings it stays
      // unassigned until the syndic says which one.
      const buildings = await db
        .select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.syndicateId, sid))
        .limit(2);
      if (buildings.length === 1) data.buildingId = buildings[0].id;
    }

    const expense = await db.transaction(async (tx) => {
      const reference = await nextSequenceNumber(tx, sid, "DEP", 4);
      try {
        const [row] = await tx
          .insert(expensesTable)
          .values({
            syndicateId: sid,
            buildingId: data.buildingId ?? null,
            reference,
            label: data.label,
            category: data.category,
            amount: data.amount,
            supplierName: data.supplierName ?? null,
            prestataireId: data.prestataireId ?? null,
            invoiceNumber: data.invoiceNumber ?? null,
            invoiceDate: data.invoiceDate ?? null,
            proofUrl: data.proofUrl,
            budgetLineId: data.budgetLineId ?? null,
            status: data.draft ? "draft" : "submitted",
            createdBy: req.user!.userId,
            idempotencyKey: rawKey,
          })
          .returning();
        return row;
      } catch (err) {
        if (uniqueViolation(err)?.includes("idempotency")) {
          throw new FinanceError(409, "IDEMPOTENCY_CONFLICT", "Requête déjà en cours de traitement");
        }
        throw err;
      }
    });
    await serverAuditLog(req, {
      action: expense.status === "draft" ? "EXPENSE_DRAFTED" : "EXPENSE_SUBMITTED",
      entity: "expense",
      entityId: expense.id,
      syndicateId: sid,
      details: `${expense.reference} — ${expense.label} — ${expense.amount}`,
    });
    if (expense.status === "submitted") alertApprovers(sid, expense);
    res.status(201).json({
      data: expense,
      message: expense.status === "draft" ? `Brouillon ${expense.reference} enregistré` : `Dépense ${expense.reference} soumise`,
    });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

const updateExpenseSchema = expenseFields.partial().refine((d) => Object.keys(d).length > 0, { message: "Aucune modification" });
const EDITABLE_FIELDS = ["label", "category", "amount", "supplierName", "prestataireId", "invoiceNumber", "invoiceDate", "proofUrl", "budgetLineId", "buildingId"] as const;

/**
 * Edits a draft or a submitted expense (before approval). Every changed
 * field is written to the audit log with its old and new value. An approved
 * expense is frozen: cancel it and create a new one.
 */
router.patch("/expenses/:id", requireAuth, requireFinanceAccess, async (req, res) => {
  const parsed = updateExpenseSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides", code: "INVALID_EXPENSE" });
  }
  const sid = req.user!.syndicateId!;
  const id = String(req.params.id);
  try {
    const current = await loadScopedExpense(id, sid);
    if (!current) throw new FinanceError(404, "EXPENSE_NOT_FOUND", "Dépense introuvable");
    if (!["draft", "submitted"].includes(current.status)) {
      throw new FinanceError(409, "EXPENSE_FROZEN", `Une dépense « ${current.status} » ne se modifie plus : annulez-la et créez-en une nouvelle.`);
    }
    const next: Record<string, unknown> & typeof parsed.data = { ...parsed.data };
    const refs: ExpenseRefs = {
      invoiceDate: next.invoiceDate,
      proofUrl: next.proofUrl,
      buildingId: next.buildingId ?? (next.budgetLineId ? undefined : current.buildingId ?? undefined),
      prestataireId: next.prestataireId,
      supplierName: next.supplierName,
      budgetLineId: next.budgetLineId,
    };
    await checkExpenseReferences(sid, refs);
    if (next.prestataireId) next.supplierName ??= refs.supplierName;
    if (next.budgetLineId) next.buildingId ??= refs.buildingId;
    const changes: string[] = [];
    const set: Record<string, unknown> = {};
    for (const f of EDITABLE_FIELDS) {
      if (next[f] === undefined) continue;
      const before = (current as Record<string, unknown>)[f] ?? null;
      if (String(before ?? "") === String(next[f])) continue;
      set[f] = next[f];
      changes.push(`${f}: ${before ?? "—"} → ${String(next[f])}`);
    }
    if (changes.length === 0) return void res.json({ data: current, message: "Aucune modification" });
    const [row] = await db
      .update(expensesTable)
      .set(set)
      // Conditional on the status read: an approval in between wins.
      .where(and(eq(expensesTable.id, id), eq(expensesTable.syndicateId, sid), eq(expensesTable.status, current.status)))
      .returning();
    if (!row) throw new FinanceError(409, "EXPENSE_STATE_CONFLICT", "La dépense a changé entre-temps : rechargez-la");
    await serverAuditLog(req, {
      action: "EXPENSE_UPDATED",
      entity: "expense",
      entityId: id,
      syndicateId: sid,
      details: `${row.reference} — ${changes.join(" ; ")}`,
    });
    res.json({ data: row });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

router.post("/expenses/:id/submit", requireAuth, requireFinanceAccess, async (req, res) => {
  const sid = req.user!.syndicateId!;
  try {
    const [row] = await db
      .update(expensesTable)
      .set({ status: "submitted" })
      .where(and(eq(expensesTable.id, String(req.params.id)), eq(expensesTable.syndicateId, sid), eq(expensesTable.status, "draft")))
      .returning();
    if (!row) {
      const current = await loadScopedExpense(String(req.params.id), sid);
      if (!current) throw new FinanceError(404, "EXPENSE_NOT_FOUND", "Dépense introuvable");
      throw new FinanceError(409, "EXPENSE_STATE_CONFLICT", `Seul un brouillon peut être soumis (statut : ${current.status})`);
    }
    await serverAuditLog(req, { action: "EXPENSE_SUBMITTED", entity: "expense", entityId: row.id, syndicateId: sid, details: `${row.reference} — ${row.amount}` });
    alertApprovers(sid, row);
    res.json({ data: row, message: `Dépense ${row.reference} soumise` });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

async function transition(
  req: Request,
  res: Response,
  opts: {
    from: string[];
    to: "approved" | "rejected" | "cancelled";
    set: Partial<typeof expensesTable.$inferInsert>;
    action: string;
    details?: string;
  },
) {
  const sid = req.user!.syndicateId!;
  const id = String(req.params.id);
  try {
    const current = await loadScopedExpense(id, sid);
    if (!current) throw new FinanceError(404, "EXPENSE_NOT_FOUND", "Dépense introuvable");
    const [row] = await db
      .update(expensesTable)
      .set({ ...opts.set, status: opts.to })
      .where(
        and(
          eq(expensesTable.id, id),
          eq(expensesTable.syndicateId, sid),
          // Conditional transition: concurrent decisions cannot both apply.
          opts.from.length === 1 ? eq(expensesTable.status, opts.from[0]) : inArrayStatus(opts.from),
        ),
      )
      .returning();
    if (!row) {
      throw new FinanceError(409, "EXPENSE_STATE_CONFLICT", `Action impossible : la dépense est « ${current.status} »`);
    }
    await serverAuditLog(req, {
      action: opts.action,
      entity: "expense",
      entityId: id,
      syndicateId: sid,
      details: `${row.reference}${opts.details ? ` — ${opts.details}` : ""}`,
    });
    res.json({ data: row });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
}

router.post("/expenses/:id/approve", requireAuth, requireRoles(APPROVER_ROLES), async (req, res) => {
  const sid = req.user!.syndicateId!;
  try {
    const current = await loadScopedExpense(String(req.params.id), sid);
    let selfApproved = false;
    if (current && current.createdBy === req.user!.userId) {
      // Four eyes: the person who submitted the expense does not approve it,
      // unless nobody else in the condominium can (recorded in the audit).
      if ((await otherApprovers(sid, req.user!.userId)) > 0) {
        throw new FinanceError(409, "SELF_APPROVAL", "Vous avez soumis cette dépense : un autre approbateur (syndic ou président) doit l'approuver.");
      }
      selfApproved = true;
    }
    return transition(req, res, {
      from: ["submitted"],
      to: "approved",
      set: { approvedBy: req.user!.userId, approvedAt: new Date() },
      action: "EXPENSE_APPROVED",
      details: selfApproved ? "auto-approbation : aucun autre approbateur dans la copropriété" : undefined,
    });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

const reasonSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();

router.post("/expenses/:id/reject", requireAuth, requireRoles(APPROVER_ROLES), (req, res) => {
  const parsed = reasonSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Un motif de rejet est obligatoire", code: "REASON_REQUIRED" });
  return transition(req, res, {
    from: ["submitted", "approved"],
    to: "rejected",
    set: { rejectedBy: req.user!.userId, rejectedAt: new Date(), rejectionReason: parsed.data.reason },
    action: "EXPENSE_REJECTED",
    details: parsed.data.reason,
  });
});

router.post("/expenses/:id/cancel", requireAuth, requireFinanceAccess, (req, res) => {
  const parsed = reasonSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Un motif d'annulation est obligatoire", code: "REASON_REQUIRED" });
  return transition(req, res, {
    from: ["draft", "submitted", "approved"],
    to: "cancelled",
    set: { rejectionReason: parsed.data.reason },
    action: "EXPENSE_CANCELLED",
    details: parsed.data.reason,
  });
});

const payExpenseSchema = z
  .object({
    accountId: z.string().optional(),
    paymentMethod: z.enum(["virement", "cheque", "especes", "prelevement"]),
    paymentReference: z.string().trim().max(100).optional(),
    paidDate: isoDateSchema.optional(),
  })
  .strict()
  .refine((d) => d.paymentMethod === "especes" || !!d.paymentReference, {
    message: "La référence du virement / n° de chèque est obligatoire",
    path: ["paymentReference"],
  });

router.post("/expenses/:id/pay", requireAuth, requireFinanceAccess, async (req, res) => {
  const parsed = payExpenseSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides", code: "INVALID_PAYMENT" });
  }
  const sid = req.user!.syndicateId!;
  const id = String(req.params.id);
  try {
    const { expense, entry } = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(expensesTable)
        .where(and(eq(expensesTable.id, id), eq(expensesTable.syndicateId, sid)))
        .for("update");
      if (!current) throw new FinanceError(404, "EXPENSE_NOT_FOUND", "Dépense introuvable");
      if (current.status !== "approved") {
        throw new FinanceError(
          409,
          current.status === "paid" ? "EXPENSE_ALREADY_PAID" : "EXPENSE_NOT_PAYABLE",
          current.status === "paid" ? "Cette dépense est déjà payée" : `Seule une dépense approuvée peut être payée (statut : ${current.status})`,
        );
      }
      const account = await lockAccount(tx, sid, {
        accountId: parsed.data.accountId,
        preferKind: parsed.data.paymentMethod === "especes" ? "cash" : "bank",
      });
      const paidDate = parsed.data.paidDate ?? today();
      const posted = await postEntry(tx, {
        syndicateId: sid,
        account,
        direction: "out",
        amount: current.amount,
        entryDate: paidDate,
        category: current.category,
        label: `${current.reference} — ${current.label}${current.supplierName ? ` (${current.supplierName})` : ""}`,
        reference: parsed.data.paymentReference ?? current.invoiceNumber ?? current.reference,
        sourceType: "expense",
        sourceId: current.id,
        buildingId: current.buildingId,
        proofUrl: current.proofUrl,
        createdBy: req.user!.userId,
      });
      await recordOperation(tx, {
        syndicateId: sid,
        type: "depense",
        amount: current.amount,
        label: `${current.reference} — ${current.label}`,
        date: paidDate,
        proofUrl: current.proofUrl,
        ledgerEntryId: posted.id,
      });
      const [row] = await tx
        .update(expensesTable)
        .set({
          status: "paid",
          paidBy: req.user!.userId,
          paidAt: new Date(),
          paymentMethod: parsed.data.paymentMethod,
          paymentReference: parsed.data.paymentReference ?? null,
          accountId: account.id,
          ledgerEntryId: posted.id,
        })
        .where(and(eq(expensesTable.id, id), eq(expensesTable.status, "approved")))
        .returning();
      if (!row) throw new FinanceError(409, "EXPENSE_ALREADY_PAID", "Cette dépense est déjà payée");
      return { expense: row, entry: posted };
    });
    await serverAuditLog(req, {
      action: "EXPENSE_PAID",
      entity: "expense",
      entityId: id,
      syndicateId: sid,
      details: `${expense.reference} — ${expense.amount} — écriture ${entry.entryNumber}`,
    });
    res.json({ data: expense, entry, message: `Dépense payée (écriture ${entry.entryNumber})` });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

export default router;
