/**
 * P10 — Financial Transparency
 * - Admins submit expense justifications (title, description, amount, receipt)
 * - All members can view and challenge
 * - Members give their opinion on a challenged expense: « for » = the
 *   expense is justified, « against » = it is not (the meaning shown by the
 *   app since the start, so existing opinions keep their sense). It is a
 *   consultative opinion (one per account, not weighted by shares, no
 *   quorum): NOT a vote of the general assembly, it decides nothing by itself.
 * - The syndic closes the justification; a closed one cannot change.
 * - Co-owners read the approved / paid expenses and their invoices
 *   (/transparency/expenses/:id).
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  expenseJustificationsTable,
  expenseVotesTable,
  membersTable,
  syndicatesTable,
  transactionsTable,
} from "@workspace/db/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { appelsDeFondsTable, budgetLinesTable, budgetsTable, buildingsTable, expensesTable, prestatairesTable, storageObjectsTable, treasuryAccountsTable, ledgerEntriesTable } from "@workspace/db/schema";
import { serverAuditLog } from "../lib/audit.js";
import { sendStoredObject } from "../lib/file-store.js";
import { uniqueViolation } from "../lib/treasury.js";
import { localToday } from "../lib/charge-time.js";
import { fromCents, toCents } from "../lib/treasury.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

function canAccessJustification(
  req: any,
  syndicateId: string | null | undefined,
): boolean {
  const user = req.user!;
  if (user.role === "super_admin") {
    return (
      req.query.supervision === "true" &&
      !!req.query.syndicateId &&
      syndicateId === req.query.syndicateId
    );
  }
  return !!user.syndicateId && syndicateId === user.syndicateId;
}

function getJustificationSyndicate(
  req: import("express").Request,
  res: import("express").Response,
): string | null {
  const user = req.user!;
  if (user.role === "super_admin") {
    const syndicateId =
      typeof req.query.syndicateId === "string" ? req.query.syndicateId : "";
    if (req.query.supervision !== "true" || !syndicateId) {
      res.status(403).json({
        error: "La supervision et un syndicat cible sont requis.",
        code: "SUPERVISION_REQUIRED",
      });
      return null;
    }
    return syndicateId;
  }
  if (!user.syndicateId) {
    res.status(403).json({ error: "Syndicat non défini dans le token" });
    return null;
  }
  return user.syndicateId;
}

async function requireActiveMember(req: any, res: any): Promise<boolean> {
  const user = req.user!;
  if (user.role !== "member") {
    res
      .status(403)
      .json({ error: "Cette action est réservée aux copropriétaires actifs" });
    return false;
  }
  if (!user.syndicateId) {
    res.status(403).json({ error: "Syndicat non défini dans le token" });
    return false;
  }
  const [member] = await db
    .select({ id: membersTable.id })
    .from(membersTable)
    .where(
      and(
        eq(membersTable.syndicateId, user.syndicateId),
        eq(membersTable.email, user.email),
        eq(membersTable.status, "active"),
      ),
    )
    .limit(1);
  if (!member) {
    res.status(403).json({ error: "Adhésion active introuvable" });
    return false;
  }
  return true;
}

// ─── GET /transparency/finances — the condominium's accounts, read-only ─────
// Co-owners have a right to know how the common funds are used (budget voted
// in general meeting, its execution, the accounts' balances, the expenses).
// Aggregated and impersonal: no neighbour's payment status, no RIB in full,
// salaries only as a total (they are personal data of the employees).
const FINANCE_READERS = new Set(["member", "syndicate_admin", "president", "treasurer", "secretary", "committee_member"]);

router.get("/transparency/finances", requireAuth, async (req, res) => {
  const user = req.user!;
  if (!FINANCE_READERS.has(user.role) || !user.syndicateId) {
    return void res.status(403).json({ error: "Accès réservé aux copropriétaires et à l'équipe du syndic", code: "FINANCE_READ_FORBIDDEN" });
  }
  if (user.role === "member" && !(await requireActiveMember(req, res))) return;
  const sid = user.syndicateId;
  try {
    const year = Number(localToday().slice(0, 4));
    const buildings = await db.select({ id: buildingsTable.id, name: buildingsTable.name }).from(buildingsTable).where(eq(buildingsTable.syndicateId, sid));
    const buildingIds = buildings.map((b) => b.id);
    const buildingName = new Map(buildings.map((b) => [b.id, b.name]));

    const [budgets, accounts, flows, [calls], expenses, [salaries]] = await Promise.all([
      buildingIds.length
        ? db
            .select({ id: budgetsTable.id, year: budgetsTable.year, status: budgetsTable.status, buildingId: budgetsTable.buildingId, totalAmount: budgetsTable.totalAmount })
            .from(budgetsTable)
            // Only budgets adopted by the general meeting — never a draft.
            .where(and(inArray(budgetsTable.buildingId, buildingIds), inArray(budgetsTable.status, ["approved", "closed"])))
            .orderBy(desc(budgetsTable.year))
        : Promise.resolve([]),
      db.select({ id: treasuryAccountsTable.id, label: treasuryAccountsTable.label, kind: treasuryAccountsTable.kind }).from(treasuryAccountsTable).where(eq(treasuryAccountsTable.syndicateId, sid)),
      db
        .select({
          accountId: ledgerEntriesTable.accountId,
          balance: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntriesTable.direction} = 'in' THEN ${ledgerEntriesTable.amount} ELSE -${ledgerEntriesTable.amount} END), 0)`,
        })
        .from(ledgerEntriesTable)
        .where(eq(ledgerEntriesTable.syndicateId, sid))
        .groupBy(ledgerEntriesTable.accountId),
      buildingIds.length
        ? db
            .select({
              called: sql<string>`COALESCE(SUM(${appelsDeFondsTable.amount}) FILTER (WHERE ${appelsDeFondsTable.status} <> 'cancelled'), 0)`,
              collected: sql<string>`COALESCE(SUM(${appelsDeFondsTable.amountPaid}) FILTER (WHERE ${appelsDeFondsTable.status} <> 'cancelled'), 0)`,
            })
            .from(appelsDeFondsTable)
            .where(and(inArray(appelsDeFondsTable.buildingId, buildingIds), sql`left(${appelsDeFondsTable.period}, 4) = ${String(year)}`))
        : Promise.resolve([{ called: "0", collected: "0" }]),
      db
        .select({
          id: expensesTable.id,
          date: sql<string>`COALESCE(${expensesTable.invoiceDate}, ${expensesTable.createdAt}::date)::text`,
          label: expensesTable.label,
          category: expensesTable.category,
          amount: expensesTable.amount,
          supplierName: expensesTable.supplierName,
          buildingId: expensesTable.buildingId,
          status: expensesTable.status,
          hasProof: sql<boolean>`${expensesTable.proofUrl} IS NOT NULL AND ${expensesTable.proofUrl} <> ''`,
        })
        .from(expensesTable)
        .where(and(eq(expensesTable.syndicateId, sid), inArray(expensesTable.status, ["approved", "paid"])))
        .orderBy(desc(sql`COALESCE(${expensesTable.invoiceDate}, ${expensesTable.createdAt}::date)`))
        .limit(40),
      db
        .select({ total: sql<string>`COALESCE(SUM(${ledgerEntriesTable.amount}), 0)` })
        .from(ledgerEntriesTable)
        .where(and(eq(ledgerEntriesTable.syndicateId, sid), eq(ledgerEntriesTable.sourceType, "salary"), sql`EXTRACT(YEAR FROM ${ledgerEntriesTable.entryDate}) = ${year}`)),
    ]);

    const balanceOf = new Map(flows.map((f) => [f.accountId, toCents(f.balance)]));
    const called = toCents(calls?.called ?? 0);
    const collected = toCents(calls?.collected ?? 0);
    res.json({
      data: {
        year,
        budgets: budgets.map((b) => ({ ...b, buildingName: buildingName.get(b.buildingId) ?? null })),
        accounts: accounts.map((a) => ({ label: a.label, kind: a.kind, balance: fromCents(balanceOf.get(a.id) ?? 0) })),
        collection: { called: fromCents(called), collected: fromCents(collected), rate: called > 0 ? Math.round((collected / called) * 1000) / 10 : null },
        expenses: expenses.map((e) => ({ ...e, buildingName: e.buildingId ? buildingName.get(e.buildingId) ?? null : null })),
        salariesTotal: fromCents(toCents(salaries?.total ?? 0)),
      },
    });
  } catch (err) {
    req.log.error({ err }, "transparency finances failed");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ─── GET /transparency/expenses/:id — one expense, as a co-owner reads it ────
// What was bought, from whom, for how much, against which budget line, and
// when it was approved and paid. Never the bank details, the payment
// reference or the names of the people who handled it (steps only).
// Only approved or paid expenses of the reader's condominium; anything else
// does not exist for them (404).
async function loadPublicExpense(req: any, res: any) {
  const user = req.user!;
  if (!FINANCE_READERS.has(user.role) || !user.syndicateId) {
    res.status(403).json({ error: "Accès réservé aux copropriétaires et à l'équipe du syndic", code: "FINANCE_READ_FORBIDDEN" });
    return null;
  }
  if (user.role === "member" && !(await requireActiveMember(req, res))) return null;
  const [e] = await db
    .select()
    .from(expensesTable)
    .where(and(eq(expensesTable.id, String(req.params.id)), eq(expensesTable.syndicateId, user.syndicateId), inArray(expensesTable.status, ["approved", "paid"])))
    .limit(1);
  if (!e) {
    res.status(404).json({ error: "Dépense introuvable" });
    return null;
  }
  return e;
}

router.get("/transparency/expenses/:id", requireAuth, async (req, res) => {
  try {
    const e = await loadPublicExpense(req, res);
    if (!e) return;
    const [building] = e.buildingId ? await db.select({ name: buildingsTable.name }).from(buildingsTable).where(eq(buildingsTable.id, e.buildingId)) : [];
    const [line] = e.budgetLineId
      ? await db
          .select({ label: budgetLinesTable.label, category: budgetLinesTable.category, planned: budgetLinesTable.amountAnnual, year: budgetsTable.year })
          .from(budgetLinesTable)
          .innerJoin(budgetsTable, eq(budgetsTable.id, budgetLinesTable.budgetId))
          .where(eq(budgetLinesTable.id, e.budgetLineId))
      : [];
    const [provider] = e.prestataireId
      ? await db.select({ name: prestatairesTable.name, type: prestatairesTable.type }).from(prestatairesTable).where(eq(prestatairesTable.id, e.prestataireId))
      : [];
    const [proof] = e.proofUrl
      ? await db.select({ contentType: storageObjectsTable.contentType }).from(storageObjectsTable).where(and(eq(storageObjectsTable.objectPath, e.proofUrl), eq(storageObjectsTable.syndicateId, e.syndicateId))).limit(1)
      : [];
    const history = [
      { step: "recorded", at: e.createdAt },
      e.approvedAt ? { step: "approved", at: e.approvedAt } : null,
      e.paidAt ? { step: "paid", at: e.paidAt, method: e.paymentMethod ?? null } : null,
    ].filter(Boolean);
    res.json({
      data: {
        id: e.id,
        reference: e.reference,
        label: e.label,
        category: e.category,
        amount: e.amount,
        currency: e.currency,
        invoiceNumber: e.invoiceNumber,
        invoiceDate: e.invoiceDate,
        supplierName: provider?.name ?? e.supplierName,
        supplierType: provider?.type ?? null,
        buildingName: building?.name ?? null,
        budget: line ? { year: line.year, lineLabel: line.label, lineCategory: line.category, linePlanned: line.planned } : null,
        status: e.status,
        history,
        hasProof: !!proof,
        proofKind: proof ? (proof.contentType === "application/pdf" ? "pdf" : proof.contentType.startsWith("image/") ? "image" : "file") : null,
      },
    });
  } catch (err) {
    req.log.error({ err }, "transparency expense failed");
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /transparency/expenses/:id/proof — the invoice of that expense (inline).
router.get("/transparency/expenses/:id/proof", requireAuth, async (req, res) => {
  try {
    const e = await loadPublicExpense(req, res);
    if (!e) return;
    if (!e.proofUrl) return void res.status(404).json({ error: "Aucun justificatif" });
    const [meta] = await db
      .select({ contentType: storageObjectsTable.contentType, originalName: storageObjectsTable.originalName })
      .from(storageObjectsTable)
      .where(and(eq(storageObjectsTable.objectPath, e.proofUrl), eq(storageObjectsTable.syndicateId, e.syndicateId)))
      .limit(1);
    if (!meta) return void res.status(404).json({ error: "Justificatif introuvable" });
    const sent = await sendStoredObject(e.proofUrl, res, { contentType: meta.contentType, fileName: meta.originalName ?? `${e.reference}.pdf`, inline: true });
    if (!sent && !res.headersSent) res.status(404).json({ error: "Fichier du justificatif introuvable" });
  } catch (err) {
    req.log.error({ err }, "transparency expense proof failed");
    if (!res.headersSent) res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /transparency — list expense justifications
router.get("/expense-justifications", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { status } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (user.role === "super_admin" && req.query.supervision !== "true") {
      return void res.status(403).json({
        error:
          "Les Super Admins doivent activer le mode supervision pour consulter la transparence.",
        code: "SUPERVISION_REQUIRED",
      });
    }
    const targetSyndicateId =
      user.role === "super_admin"
        ? typeof req.query.syndicateId === "string"
          ? req.query.syndicateId.trim()
          : ""
        : user.syndicateId;
    if (!targetSyndicateId) {
      return void res.status(user.role === "super_admin" ? 400 : 403).json({
        error:
          user.role === "super_admin"
            ? "Un syndicat cible est requis"
            : "Syndicat non défini dans le token",
      });
    }
    const [targetSyndicate] = await db
      .select({ id: syndicatesTable.id })
      .from(syndicatesTable)
      .where(eq(syndicatesTable.id, targetSyndicateId))
      .limit(1);
    if (!targetSyndicate) {
      return void res.status(404).json({ error: "Syndicat cible introuvable" });
    }
    conditions.push(
      eq(expenseJustificationsTable.syndicateId, targetSyndicateId),
    );
    if (status) conditions.push(eq(expenseJustificationsTable.status, status));

    const rows = await db
      .select()
      .from(expenseJustificationsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(expenseJustificationsTable.createdAt));

    // Attach user's own vote
    const ids = rows.map((r) => r.id);
    const myVotes = ids.length
      ? await db
          .select({
            justificationId: expenseVotesTable.justificationId,
            vote: expenseVotesTable.vote,
          })
          .from(expenseVotesTable)
          .where(eq(expenseVotesTable.userId, user.userId))
      : [];
    const voteMap = new Map(myVotes.map((v) => [v.justificationId, v.vote]));

    res.json({
      data: rows.map((r) => ({ ...r, myVote: voteMap.get(r.id) ?? null })),
      total: rows.length,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /transparency — admin creates expense justification
router.post(
  "/expense-justifications",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const user = req.user!;
      const {
        title,
        description,
        amount,
        category,
        receiptUrl,
        transactionId,
        syndicateId: requestedSyndicateId,
      } = req.body;

      if (user.role !== "super_admin" && !user.syndicateId) {
        return void res
          .status(403)
          .json({ error: "Syndicat non défini dans le token" });
      }
      if (user.role === "super_admin" && req.query.supervision !== "true") {
        return void res.status(403).json({
          error:
            "Les Super Admins doivent activer le mode supervision pour cibler un syndicat.",
          code: "SUPERVISION_REQUIRED",
        });
      }
      if (!title?.trim() || !amount) {
        return void res
          .status(400)
          .json({ error: "Le titre et le montant sont obligatoires" });
      }
      if (!/^\d+(\.\d{1,2})?$/.test(String(amount).trim()) || Number(amount) <= 0) {
        return void res.status(400).json({ error: "Montant invalide (positif, 2 décimales au plus)", code: "INVALID_AMOUNT" });
      }

      let targetSyndicateId =
        user.role === "super_admin"
          ? typeof requestedSyndicateId === "string" &&
            requestedSyndicateId.trim()
            ? requestedSyndicateId.trim()
            : null
          : user.syndicateId!;
      if (user.role === "super_admin" && !targetSyndicateId) {
        return void res.status(400).json({
          error: "Un syndicat cible est obligatoire pour ce justificatif",
        });
      }
      let transactionSyndicateId: string | null | undefined;
      if (transactionId) {
        const [transaction] = await db
          .select({ syndicateId: transactionsTable.syndicateId })
          .from(transactionsTable)
          .where(
            and(
              eq(transactionsTable.id, String(transactionId)),
              eq(transactionsTable.syndicateId, targetSyndicateId!),
            ),
          )
          .limit(1);
        if (!transaction) {
          return void res
            .status(400)
            .json({ error: "Transaction introuvable" });
        }
        transactionSyndicateId = transaction.syndicateId;
        if (!transactionSyndicateId) {
          return void res
            .status(400)
            .json({ error: "La transaction doit appartenir à un syndicat" });
        }
        if (targetSyndicateId !== transactionSyndicateId) {
          return void res.status(400).json({
            error: "Le syndic ciblé ne correspond pas à la transaction",
          });
        }
      }

      if (!targetSyndicateId) {
        return void res.status(400).json({
          error: "Un syndicat cible est obligatoire pour ce justificatif",
        });
      }

      const [targetSyndicate] = await db
        .select({ id: syndicatesTable.id })
        .from(syndicatesTable)
        .where(eq(syndicatesTable.id, targetSyndicateId))
        .limit(1);
      if (!targetSyndicate) {
        return void res
          .status(400)
          .json({ error: "Syndicat cible introuvable" });
      }

      const [row] = await db
        .insert(expenseJustificationsTable)
        .values({
          syndicateId: targetSyndicateId,
          transactionId: transactionId ?? null,
          title: title.trim(),
          description: (description ?? "").trim(),
          amount: Number(String(amount).trim()).toFixed(2),
          category: category ?? null,
          receiptUrl: receiptUrl ?? null,
          status: "pending",
          submittedBy: user.userId,
          submitterName: user.name,
        })
        .returning();

      res.status(201).json({ data: row, message: "Justificatif soumis" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// POST /transparency/:id/challenge — member challenges a justification
router.post(
  "/expense-justifications/:id/challenge",
  requireAuth,
  async (req, res) => {
    try {
      const user = req.user!;
      const { reason } = req.body;

      if (!(await requireActiveMember(req, res))) return;

      if (!reason?.trim()) {
        return void res
          .status(400)
          .json({ error: "Le motif de contestation est obligatoire" });
      }

      const [row] = await db
        .select()
        .from(expenseJustificationsTable)
        .where(
          and(
            eq(expenseJustificationsTable.id, String(req.params.id)),
            eq(expenseJustificationsTable.syndicateId, req.user!.syndicateId!),
          ),
        );

      if (!row)
        return void res.status(404).json({ error: "Justificatif introuvable" });
      if (!canAccessJustification(req, row.syndicateId)) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
      if (row.status !== "pending") {
        return void res
          .status(400)
          .json({ error: "Ce justificatif ne peut plus être contesté" });
      }

      const [updated] = await db
        .update(expenseJustificationsTable)
        .set({
          status: "challenged",
          challengedBy: user.userId,
          challengerName: user.name,
          challengeReason: reason.trim(),
        })
        .where(eq(expenseJustificationsTable.id, row.id))
        .returning();

      await serverAuditLog(req, { action: "UPDATE", entity: "expense_justification", entityId: row.id, syndicateId: row.syndicateId ?? undefined, details: `Contestation : ${reason.trim().slice(0, 200)}` });
      res.json({
        data: updated,
        message: "Contestation enregistrée. Les copropriétaires peuvent donner leur avis.",
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// POST /transparency/:id/vote — vote on a challenged justification
router.post(
  "/expense-justifications/:id/vote",
  requireAuth,
  async (req, res) => {
    try {
      const user = req.user!;
      const { vote } = req.body; // "for" = the expense is justified | "against" = it is not

      if (!(await requireActiveMember(req, res))) return;

      if (!["for", "against"].includes(vote)) {
        return void res
          .status(400)
          .json({ error: "Vote invalide: 'for' ou 'against'" });
      }

      const [row] = await db
        .select()
        .from(expenseJustificationsTable)
        .where(
          and(
            eq(expenseJustificationsTable.id, String(req.params.id)),
            eq(expenseJustificationsTable.syndicateId, req.user!.syndicateId!),
          ),
        );

      if (!row)
        return void res.status(404).json({ error: "Justificatif introuvable" });
      if (!canAccessJustification(req, row.syndicateId)) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
      if (row.status !== "challenged") {
        return void res.status(400).json({
          error: "Le vote n'est ouvert que pour les justificatifs contestés",
        });
      }

      // Upsert vote
      const [existingVote] = await db
        .select()
        .from(expenseVotesTable)
        .where(
          and(
            eq(expenseVotesTable.justificationId, row.id),
            eq(expenseVotesTable.userId, user.userId),
          ),
        );

      if (existingVote) {
        if (existingVote.vote === vote) {
          return void res.status(409).json({ error: "Vous avez déjà voté" });
        }
        await db
          .update(expenseVotesTable)
          .set({ vote })
          .where(eq(expenseVotesTable.id, existingVote.id));
      } else {
        try {
          await db.insert(expenseVotesTable).values({
            justificationId: row.id,
            userId: user.userId,
            vote,
          });
        } catch (err) {
          // Two taps at once: the unique index keeps one opinion per person.
          if (uniqueViolation(err)) return void res.status(409).json({ error: "Vous avez déjà voté" });
          throw err;
        }
      }
      // Every opinion, and every change of opinion, is kept in the audit trail.
      await serverAuditLog(req, { action: existingVote ? "UPDATE" : "CREATE", entity: "expense_justification_vote", entityId: row.id, syndicateId: row.syndicateId ?? undefined, details: existingVote ? `Avis modifié : ${existingVote.vote} → ${vote}` : `Avis : ${vote}` });

      // Recount
      const allVotes = await db
        .select()
        .from(expenseVotesTable)
        .where(eq(expenseVotesTable.justificationId, row.id));

      const votesFor = allVotes.filter((v) => v.vote === "for").length;
      const votesAgainst = allVotes.filter((v) => v.vote === "against").length;

      await db
        .update(expenseJustificationsTable)
        .set({ voteCount: allVotes.length, votesFor, votesAgainst })
        .where(eq(expenseJustificationsTable.id, row.id));

      res.json({
        message: "Vote enregistré",
        votesFor,
        votesAgainst,
        total: allVotes.length,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// PUT /transparency/:id/resolve — admin resolves a challenged justification
router.put(
  "/expense-justifications/:id/resolve",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { status, resolutionNote } = req.body; // "approved" | "resolved"

      if (
        req.user!.role === "super_admin" &&
        req.query.supervision !== "true"
      ) {
        return void res.status(403).json({
          error:
            "Les Super Admins doivent activer le mode supervision pour résoudre un justificatif.",
          code: "SUPERVISION_REQUIRED",
        });
      }

      const effectiveSyndicateId = getJustificationSyndicate(req, res);
      if (!effectiveSyndicateId) return;

      const [existing] = await db
        .select()
        .from(expenseJustificationsTable)
        .where(
          and(
            eq(expenseJustificationsTable.id, String(req.params.id)),
            eq(expenseJustificationsTable.syndicateId, effectiveSyndicateId),
          ),
        );
      if (!existing)
        return void res.status(404).json({ error: "Justificatif introuvable" });
      if (!canAccessJustification(req, existing.syndicateId)) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
      if (!status || !["approved", "resolved", "rejected"].includes(status)) {
        return void res
          .status(400)
          .json({ error: "Statut de résolution invalide" });
      }
      // A decision taken is final: no change after closing.
      if (!["pending", "challenged"].includes(existing.status ?? "")) {
        return void res.status(409).json({ error: "Ce justificatif est déjà clos.", code: "JUSTIFICATION_CLOSED" });
      }

      const [updated] = await db
        .update(expenseJustificationsTable)
        .set({
          status,
          resolutionNote: resolutionNote ?? null,
          resolvedAt: new Date(),
        })
        .where(
          and(
            eq(expenseJustificationsTable.id, String(req.params.id) as string),
            eq(expenseJustificationsTable.syndicateId, existing.syndicateId!),
          ),
        )
        .returning();

      await serverAuditLog(req, { action: "UPDATE", entity: "expense_justification", entityId: existing.id, syndicateId: existing.syndicateId ?? undefined, details: `Clos : ${status} (avis : ${existing.votesFor ?? 0} justifiée / ${existing.votesAgainst ?? 0} non justifiée)${resolutionNote ? ` — ${String(resolutionNote).slice(0, 200)}` : ""}` });
      res.json({ data: updated, message: "Justificatif résolu" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

export default router;
