import { Router } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  transactionsTable,
  salaryRecordsTable,
  caisseEntriesTable,
  invoicesTable,
  invoiceItemsTable,
  bonsLivraisonTable,
  bonItemsTable,
} from "@workspace/db/schema";
import { eq, desc, count, inArray, and } from "drizzle-orm";
import { requireAuth, requireFinanceAccess, requireRole } from "../middleware/auth.js";
import {
  syndicateWhere,
  effectiveSyndicateId,
} from "../lib/syndicate-filter.js";
import { findForeignReference } from "../lib/scope.js";
import { getPagination, buildPagedResponse } from "../lib/paginate.js";
import { serverAuditLog } from "../lib/audit.js";
import {
  FinanceError,
  isoDateSchema,
  lockAccount,
  postEntry,
  sendFinanceError,
  today,
} from "../lib/treasury.js";

/** Register types that are money in vs money out of the syndicate. */
const INFLOW_TYPES = new Set(["cotisation", "recette"]);

const router = Router();

// ─── Transactions ─────────────────────────────────────────────────────────────

router.get(
  "/finance/transactions",
  requireAuth,
  // The council controls the syndic's accounts: president and committee
  // members read the register too (writes stay with admin / treasurer).
  requireRole("syndicate_admin", "treasurer", "president", "committee_member"),
  async (req, res) => {
    const pagination = getPagination(req);
    try {
      const from = typeof req.query.from === "string" && isoDateSchema.safeParse(req.query.from).success ? req.query.from : null;
      const where = and(
        syndicateWhere(req, transactionsTable.syndicateId),
        from ? sql`${transactionsTable.date} >= ${from}` : undefined,
      );
      const [rows, [{ value: total }], [totals]] = await Promise.all([
        db
          .select()
          .from(transactionsTable)
          .where(where)
          .orderBy(desc(transactionsTable.date), desc(transactionsTable.createdAt))
          .limit(pagination.limit)
          .offset(pagination.offset),
        db.select({ value: count() }).from(transactionsTable).where(where),
        // Totals over the whole filter (not just the loaded page).
        db
          .select({
            inflow: sql<string>`COALESCE(SUM(${transactionsTable.amount}) FILTER (WHERE ${transactionsTable.status} = 'paid' AND ${transactionsTable.type} IN ('cotisation','recette')), 0)`,
            outflow: sql<string>`COALESCE(SUM(${transactionsTable.amount}) FILTER (WHERE ${transactionsTable.status} = 'paid' AND ${transactionsTable.type} IN ('depense','salaire')), 0)`,
            pending: sql<string>`COALESCE(SUM(${transactionsTable.amount}) FILTER (WHERE ${transactionsTable.status} = 'pending'), 0)`,
            paidCount: sql<number>`COUNT(*) FILTER (WHERE ${transactionsTable.status} = 'paid')::int`,
            pendingCount: sql<number>`COUNT(*) FILTER (WHERE ${transactionsTable.status} = 'pending')::int`,
            overdueCount: sql<number>`COUNT(*) FILTER (WHERE ${transactionsTable.status} = 'overdue')::int`,
          })
          .from(transactionsTable)
          .where(where),
      ]);
      res.json({
        ...buildPagedResponse(rows, Number(total), pagination),
        totals: {
          inflow: Number(totals?.inflow ?? 0),
          outflow: Number(totals?.outflow ?? 0),
          pending: Number(totals?.pending ?? 0),
          paidCount: totals?.paidCount ?? 0,
          pendingCount: totals?.pendingCount ?? 0,
          overdueCount: totals?.overdueCount ?? 0,
        },
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.post(
  "/finance/transactions",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    const schema = z
      .object({
        type: z.enum(["cotisation", "depense", "salaire", "recette"]),
        amount: z.number().positive(),
        label: z.string().min(1),
        date: z.string(),
        status: z.enum(["paid", "pending", "overdue"]).default("paid"),
        memberId: z.string().optional(),
        syndicateId: z.string().optional(),
        proofUrl: z.string().optional(),
        // Account credited/debited when the operation is paid (default account otherwise)
        accountId: z.string().optional(),
      })
      .refine((d) => d.type !== "depense" || !!d.proofUrl, {
        message:
          "Un justificatif (facture) est obligatoire pour toute dépense.",
        path: ["proofUrl"],
      });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: result.error.issues[0]?.message ?? "Données invalides",
      });
      return;
    }
    try {
      const sid = effectiveSyndicateId(req, result.data.syndicateId);
      const { syndicateId: _sid, ...data } = result.data;
      // The payer must be a user of this syndicate and the justification a
      // file uploaded within it — never another syndicate's records.
      const foreign = await findForeignReference(sid, {
        userId: data.memberId,
        objectPath: data.proofUrl,
      });
      if (foreign) {
        res.status(400).json({
          error:
            foreign === "objectPath"
              ? "Le justificatif doit être un fichier téléversé dans ce syndicat."
              : "Membre introuvable dans ce syndicat.",
          code: "FOREIGN_REFERENCE",
        });
        return;
      }
      const { accountId, ...register } = data;
      // A paid operation is a real cash movement: it is posted to the journal
      // on a treasury account in the same transaction. Pending / overdue
      // items are only recorded in the register until they are paid.
      const row = await db.transaction(async (tx) => {
        let ledgerEntryId: string | null = null;
        if (register.status === "paid") {
          const inflow = INFLOW_TYPES.has(register.type);
          const account = await lockAccount(tx, sid, { accountId });
          const entry = await postEntry(tx, {
            syndicateId: sid,
            account,
            direction: inflow ? "in" : "out",
            amount: register.amount.toFixed(2),
            entryDate: isoDateSchema.safeParse(register.date).success ? register.date : today(),
            category: register.type === "salaire" ? "salaires" : inflow ? "recette" : "depense",
            label: register.label,
            sourceType: "manual",
            proofUrl: register.proofUrl,
            createdBy: req.user!.userId,
          });
          ledgerEntryId = entry.id;
        }
        const [created] = await tx
          .insert(transactionsTable)
          .values({ ...register, amount: register.amount.toFixed(2), syndicateId: sid, ledgerEntryId })
          .returning();
        return created;
      });
      await serverAuditLog(req, {
        action: "CREATE",
        entity: "transaction",
        entityId: row.id,
        syndicateId: sid,
        details: `${row.label} — ${row.amount}`,
      });
      res.status(201).json({ data: row, message: "Transaction ajoutée" });
    } catch (err) {
      sendFinanceError(res, req, err);
    }
  },
);

// ─── Update transaction status ────────────────────────────────────────────────

router.patch(
  "/finance/transactions/:id/status",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    const id = String(req.params.id);
    const schema = z.object({
      status: z.enum(["paid", "pending", "overdue"]),
      accountId: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Statut invalide" });
      return;
    }
    try {
      const [tx] = await db
        .select()
        .from(transactionsTable)
        .where(
          and(
            eq(transactionsTable.id, id),
            eq(transactionsTable.syndicateId, req.user!.syndicateId!),
          ),
        );
      if (!tx) {
        res.status(404).json({ error: "Transaction introuvable" });
        return;
      }
      // A posted movement is part of the journal: it can only be corrected by
      // a reversal entry, never silently switched back to "pending".
      if (tx.ledgerEntryId) {
        throw new FinanceError(
          409,
          "LEDGER_POSTED",
          "Opération comptabilisée : utilisez l'extourne dans le journal de trésorerie.",
        );
      }
      const sid = req.user!.syndicateId!;
      const updated = await db.transaction(async (dbTx) => {
        let ledgerEntryId: string | null = null;
        if (result.data.status === "paid" && tx.status !== "paid") {
          const inflow = INFLOW_TYPES.has(tx.type);
          const account = await lockAccount(dbTx, sid, { accountId: result.data.accountId });
          const entry = await postEntry(dbTx, {
            syndicateId: sid,
            account,
            direction: inflow ? "in" : "out",
            amount: tx.amount,
            entryDate: today(),
            category: tx.type === "salaire" ? "salaires" : inflow ? "recette" : "depense",
            label: tx.label,
            sourceType: "manual",
            proofUrl: tx.proofUrl,
            createdBy: req.user!.userId,
          });
          ledgerEntryId = entry.id;
        }
        const [row] = await dbTx
          .update(transactionsTable)
          .set({ status: result.data.status, ...(ledgerEntryId ? { ledgerEntryId } : {}) })
          .where(
            and(
              eq(transactionsTable.id, id),
              eq(transactionsTable.syndicateId, sid),
              eq(transactionsTable.status, tx.status ?? "pending"),
            ),
          )
          .returning();
        if (!row) throw new FinanceError(409, "TRANSACTION_STATE_CONFLICT", "Transaction modifiée entre-temps");
        return row;
      });
      await serverAuditLog(req, {
        action: "UPDATE_STATUS",
        entity: "transaction",
        entityId: id,
        syndicateId: tx.syndicateId ?? undefined,
        details: result.data.status,
      });
      res.json({ data: updated, message: "Statut mis à jour" });
    } catch (err) {
      sendFinanceError(res, req, err);
    }
  },
);

// ─── Salaries ─────────────────────────────────────────────────────────────────

router.get(
  "/finance/salaries",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    const pagination = getPagination(req);
    try {
      const where = syndicateWhere(req, salaryRecordsTable.syndicateId);
      const [rows, [{ value: total }]] = await Promise.all([
        db
          .select()
          .from(salaryRecordsTable)
          .where(where)
          .orderBy(desc(salaryRecordsTable.createdAt))
          .limit(pagination.limit)
          .offset(pagination.offset),
        db.select({ value: count() }).from(salaryRecordsTable).where(where),
      ]);
      res.json(buildPagedResponse(rows, Number(total), pagination));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.post(
  "/finance/salaries",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    const schema = z.object({
      employee: z.string().min(1),
      role: z.string().min(1),
      amount: z.number().positive(),
      month: z.string(),
      status: z.enum(["paid", "pending"]).default("pending"),
      paidDate: z.string().optional(),
      syndicateId: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }
    try {
      const sid = effectiveSyndicateId(req, result.data.syndicateId);
      const { syndicateId: _sid, ...data } = result.data;
      const [row] = await db
        .insert(salaryRecordsTable)
        .values({ ...data, syndicateId: sid } as any)
        .returning();
      await serverAuditLog(req, {
        action: "CREATE",
        entity: "salary",
        entityId: row.id,
        syndicateId: sid,
        details: `${row.employee} — ${row.month}`,
      });
      res.status(201).json({ data: row, message: "Salaire ajouté" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

const paySalarySchema = z
  .object({
    status: z.literal("paid"),
    paidDate: isoDateSchema.optional(),
    accountId: z.string().optional(),
  })
  .strict();

/** Pays a salary: journal entry (out) + register row, once. */
router.put(
  "/finance/salaries/:id",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    const parsed = paySalarySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Données invalides", code: "INVALID_SALARY_PAYMENT" });
      return;
    }
    const sid = req.user!.syndicateId!;
    const id = String(req.params.id);
    try {
      const updated = await db.transaction(async (tx) => {
        const [salary] = await tx
          .select()
          .from(salaryRecordsTable)
          .where(and(eq(salaryRecordsTable.id, id), eq(salaryRecordsTable.syndicateId, sid)))
          .for("update");
        if (!salary) throw new FinanceError(404, "SALARY_NOT_FOUND", "Salaire introuvable");
        if (salary.status === "paid") throw new FinanceError(409, "SALARY_ALREADY_PAID", "Ce salaire est déjà payé");
        const paidDate = parsed.data.paidDate ?? today();
        const account = await lockAccount(tx, sid, { accountId: parsed.data.accountId });
        const entry = await postEntry(tx, {
          syndicateId: sid,
          account,
          direction: "out",
          amount: salary.amount,
          entryDate: paidDate,
          category: "salaires",
          label: `Salaire ${salary.month} — ${salary.employee}`,
          sourceType: "salary",
          sourceId: salary.id,
          createdBy: req.user!.userId,
        });
        await tx.insert(transactionsTable).values({
          type: "salaire",
          amount: salary.amount,
          label: `Salaire ${salary.month} — ${salary.employee}`,
          date: paidDate,
          status: "paid",
          syndicateId: sid,
          ledgerEntryId: entry.id,
        });
        const [row] = await tx
          .update(salaryRecordsTable)
          .set({ status: "paid", paidDate, ledgerEntryId: entry.id })
          .where(and(eq(salaryRecordsTable.id, id), eq(salaryRecordsTable.status, salary.status ?? "pending")))
          .returning();
        if (!row) throw new FinanceError(409, "SALARY_ALREADY_PAID", "Ce salaire est déjà payé");
        return row;
      });
      await serverAuditLog(req, {
        action: "SALARY_PAID",
        entity: "salary",
        entityId: id,
        syndicateId: sid,
        details: `${updated.employee} — ${updated.month} — ${updated.amount}`,
      });
      res.json({ data: updated, message: "Salaire payé" });
    } catch (err) {
      sendFinanceError(res, req, err);
    }
  },
);

// ─── Caisse ───────────────────────────────────────────────────────────────────

router.get(
  "/finance/caisse",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    const pagination = getPagination(req);
    try {
      const where = syndicateWhere(req, caisseEntriesTable.syndicateId);
      const [rows, [{ value: total }]] = await Promise.all([
        db
          .select()
          .from(caisseEntriesTable)
          .where(where)
          .orderBy(desc(caisseEntriesTable.createdAt))
          .limit(pagination.limit)
          .offset(pagination.offset),
        db.select({ value: count() }).from(caisseEntriesTable).where(where),
      ]);
      res.json(buildPagedResponse(rows, Number(total), pagination));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// The cash book is now the "cash" treasury account: its balance is computed
// from the journal. Direct entries with a client-side running balance are no
// longer accepted (they bypassed the journal and could diverge from it).
router.post("/finance/caisse", requireAuth, requireFinanceAccess, (_req, res) => {
  res.status(410).json({
    error:
      "La caisse est désormais un compte de trésorerie : enregistrez l'opération dans le journal (POST /treasury/entries).",
    code: "LEGACY_ENDPOINT",
  });
});

// ─── Invoices ─────────────────────────────────────────────────────────────────

router.get("/invoices", requireAuth, requireFinanceAccess, async (req, res) => {
  const pagination = getPagination(req);
  try {
    const where = syndicateWhere(req, invoicesTable.syndicateId);
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(invoicesTable)
        .where(where)
        .orderBy(desc(invoicesTable.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.select({ value: count() }).from(invoicesTable).where(where),
    ]);

    // Attach line items — the mobile client renders selectedInvoice.items.map(...)
    // and crashes with a blank error screen if items is undefined.
    const invoiceIds = rows.map((r) => r.id);
    const allItems = invoiceIds.length
      ? await db
          .select()
          .from(invoiceItemsTable)
          .where(inArray(invoiceItemsTable.invoiceId, invoiceIds))
      : [];
    const itemsByInvoice = new Map<string, typeof allItems>();
    for (const item of allItems) {
      const arr = itemsByInvoice.get(item.invoiceId) ?? [];
      arr.push(item);
      itemsByInvoice.set(item.invoiceId, arr);
    }
    const enriched = rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      items: (itemsByInvoice.get(r.id) ?? []).map((i) => ({
        label: i.label,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
      })),
    }));

    res.json(buildPagedResponse(enriched, Number(total), pagination));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post(
  "/invoices",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    const itemSchema = z.object({
      label: z.string().min(1),
      quantity: z.number().positive(),
      unitPrice: z.number().positive(),
    });
    const schema = z.object({
      type: z.enum(["devis", "facture"]).default("facture"),
      recipient: z.string().min(1),
      items: z.array(itemSchema).default([]),
      syndicateId: z.string().optional(),
      proofUrl: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }
    try {
      const sid = effectiveSyndicateId(req, result.data.syndicateId);
      const {
        syndicateId: _sid,
        items,
        type,
        recipient,
        proofUrl,
      } = result.data;
      const issuedAt = new Date();
      const dueAt = new Date(issuedAt);
      dueAt.setDate(dueAt.getDate() + 30);
      const prefix = type === "facture" ? "FAC" : "DEV";
      const reference = `${prefix}-${issuedAt.getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const amount = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const [inv] = await db
        .insert(invoicesTable)
        .values({
          reference,
          type,
          recipient,
          date: issuedAt.toISOString().slice(0, 10),
          dueDate: dueAt.toISOString().slice(0, 10),
          status: "draft",
          syndicateId: sid,
          proofUrl,
          amount,
        } as any)
        .returning();
      if (items.length > 0) {
        await db
          .insert(invoiceItemsTable)
          .values(items.map((i) => ({ ...i, invoiceId: inv.id })) as any);
      }
      await serverAuditLog(req, {
        action: "CREATE",
        entity: "invoice",
        entityId: inv.id,
        syndicateId: sid,
        details: `${reference} — ${amount}`,
      });
      res.status(201).json({
        data: { ...inv, amount: Number(inv.amount), items },
        message: "Facture créée",
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.put(
  "/invoices/:id/status",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    const id = String(req.params.id) as string;
    const schema = z.object({
      status: z.enum([
        "draft",
        "issued",
        "sent",
        "paid",
        "partially_paid",
        "due",
        "overdue",
        "cancelled",
      ]),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Statut invalide" });
      return;
    }
    try {
      const [inv] = await db
        .select()
        .from(invoicesTable)
        .where(
          and(
            eq(invoicesTable.id, id),
            eq(invoicesTable.syndicateId, req.user!.syndicateId!),
          ),
        );
      if (!inv) {
        res.status(404).json({ error: "Facture introuvable" });
        return;
      }
      const [updated] = await db
        .update(invoicesTable)
        .set({ status: result.data.status })
        .where(
          and(
            eq(invoicesTable.id, id),
            eq(invoicesTable.syndicateId, req.user!.syndicateId!),
          ),
        )
        .returning();
      await serverAuditLog(req, {
        action: "UPDATE_STATUS",
        entity: "invoice",
        entityId: id,
        syndicateId: inv.syndicateId ?? undefined,
        details: result.data.status,
      });
      res.json({ data: updated, message: "Statut mis à jour" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Bons de livraison ────────────────────────────────────────────────────────

router.get(
  "/bons-livraison",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    const pagination = getPagination(req);
    try {
      const where = syndicateWhere(req, bonsLivraisonTable.syndicateId);
      const [rows, [{ value: total }]] = await Promise.all([
        db
          .select()
          .from(bonsLivraisonTable)
          .where(where)
          .orderBy(desc(bonsLivraisonTable.createdAt))
          .limit(pagination.limit)
          .offset(pagination.offset),
        db.select({ value: count() }).from(bonsLivraisonTable).where(where),
      ]);

      // Attach line items — mobile client renders selected.items.map(...) and
      // crashes with a blank error screen if items is undefined.
      const bonIds = rows.map((r) => r.id);
      const allItems = bonIds.length
        ? await db
            .select()
            .from(bonItemsTable)
            .where(inArray(bonItemsTable.bonId, bonIds))
        : [];
      const itemsByBon = new Map<string, typeof allItems>();
      for (const item of allItems) {
        const arr = itemsByBon.get(item.bonId) ?? [];
        arr.push(item);
        itemsByBon.set(item.bonId, arr);
      }
      // Normalize any legacy/seed status values not recognized by the mobile client's
      // STATUS_CONFIG (draft | sent | delivered | cancelled) — an unmapped status
      // crashes the list render immediately.
      const VALID_STATUSES = new Set([
        "draft",
        "sent",
        "delivered",
        "cancelled",
      ]);
      const enriched = rows.map((r) => ({
        ...r,
        total: Number(r.total),
        status: VALID_STATUSES.has(r.status ?? "") ? r.status : "delivered",
        items: (itemsByBon.get(r.id) ?? []).map((i) => ({
          label: i.label,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
        })),
      }));

      res.json(buildPagedResponse(enriched, Number(total), pagination));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.post(
  "/bons-livraison",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    const itemSchema = z.object({
      label: z.string().min(1),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
    });
    const schema = z.object({
      reference: z.string().min(1),
      recipient: z.string().min(1),
      date: z.string(),
      type: z.enum(["sortie", "entree"]).default("sortie"),
      items: z.array(itemSchema).default([]),
      syndicateId: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Données invalides" });
      return;
    }
    try {
      const sid = effectiveSyndicateId(req, result.data.syndicateId);
      const { syndicateId: _sid, items, ...data } = result.data;
      const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const [bon] = await db
        .insert(bonsLivraisonTable)
        .values({ ...data, syndicateId: sid, total, status: "draft" } as any)
        .returning();
      if (items.length > 0) {
        await db
          .insert(bonItemsTable)
          .values(items.map((i) => ({ ...i, bonId: bon.id })) as any);
      }
      await serverAuditLog(req, {
        action: "CREATE",
        entity: "delivery_note",
        entityId: bon.id,
        syndicateId: sid,
        details: `${bon.reference} — ${bon.total}`,
      });
      res.status(201).json({ data: bon, message: "Bon de livraison créé" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.put(
  "/bons-livraison/:id/status",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    const id = String(req.params.id) as string;
    const schema = z.object({
      status: z.enum(["draft", "sent", "delivered", "cancelled"]),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Statut invalide" });
      return;
    }
    try {
      const [bon] = await db
        .select()
        .from(bonsLivraisonTable)
        .where(
          and(
            eq(bonsLivraisonTable.id, id),
            eq(bonsLivraisonTable.syndicateId, req.user!.syndicateId!),
          ),
        );
      if (!bon) {
        res.status(404).json({ error: "Bon introuvable" });
        return;
      }
      const [updated] = await db
        .update(bonsLivraisonTable)
        .set({ status: result.data.status })
        .where(
          and(
            eq(bonsLivraisonTable.id, id),
            eq(bonsLivraisonTable.syndicateId, req.user!.syndicateId!),
          ),
        )
        .returning();
      await serverAuditLog(req, {
        action: "UPDATE_STATUS",
        entity: "delivery_note",
        entityId: id,
        syndicateId: bon.syndicateId ?? undefined,
        details: result.data.status,
      });
      res.json({ data: updated, message: "Statut mis à jour" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

export default router;
