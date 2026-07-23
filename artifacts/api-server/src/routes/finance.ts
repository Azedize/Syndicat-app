import { Router } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
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
import { eq, desc, count, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { syndicateWhere, effectiveSyndicateId } from "../lib/syndicate-filter.js";
import { getPagination, buildPagedResponse } from "../lib/paginate.js";

const router = Router();

// ─── Transactions ─────────────────────────────────────────────────────────────

router.get(
  "/finance/transactions",
  requireAuth,
  requireRole("syndicate_admin", "treasurer"),
  async (req, res) => {
    const pagination = getPagination(req);
    try {
      const where = syndicateWhere(req, transactionsTable.syndicateId);
      const [rows, [{ value: total }]] = await Promise.all([
        db.select().from(transactionsTable)
          .where(where)
          .orderBy(desc(transactionsTable.createdAt))
          .limit(pagination.limit)
          .offset(pagination.offset),
        db.select({ value: count() }).from(transactionsTable).where(where),
      ]);
      res.json(buildPagedResponse(rows, Number(total), pagination));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.post(
  "/finance/transactions",
  requireAuth,
  requireRole("syndicate_admin", "treasurer"),
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
      })
      .refine((d) => d.type !== "depense" || !!d.proofUrl, {
        message: "Un justificatif (facture) est obligatoire pour toute dépense.",
        path: ["proofUrl"],
      });
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.issues[0]?.message ?? "Données invalides" });
      return;
    }
    try {
      const sid = effectiveSyndicateId(req, result.data.syndicateId);
      const { syndicateId: _sid, ...data } = result.data;
      const [row] = await db
        .insert(transactionsTable)
        .values({ ...data, syndicateId: sid } as any)
        .returning();
      res.status(201).json({ data: row, message: "Transaction ajoutée" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Update transaction status ────────────────────────────────────────────────

router.patch(
  "/finance/transactions/:id/status",
  requireAuth,
  requireRole("syndicate_admin", "treasurer"),
  async (req, res) => {
    const id = String(req.params.id);
    const schema = z.object({
      status: z.enum(["paid", "pending", "overdue"]),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "Statut invalide" }); return; }
    try {
      const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id));
      if (!tx) { res.status(404).json({ error: "Transaction introuvable" }); return; }
      if (req.user!.role !== "super_admin" && tx.syndicateId !== req.user!.syndicateId) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      const [updated] = await db
        .update(transactionsTable)
        .set({ status: result.data.status })
        .where(eq(transactionsTable.id, id))
        .returning();
      res.json({ data: updated, message: "Statut mis à jour" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Salaries ─────────────────────────────────────────────────────────────────

router.get(
  "/finance/salaries",
  requireAuth,
  requireRole("syndicate_admin", "treasurer"),
  async (req, res) => {
    const pagination = getPagination(req);
    try {
      const where = syndicateWhere(req, salaryRecordsTable.syndicateId);
      const [rows, [{ value: total }]] = await Promise.all([
        db.select().from(salaryRecordsTable)
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
  requireRole("syndicate_admin", "treasurer"),
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
    if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
    try {
      const sid = effectiveSyndicateId(req, result.data.syndicateId);
      const { syndicateId: _sid, ...data } = result.data;
      const [row] = await db
        .insert(salaryRecordsTable)
        .values({ ...data, syndicateId: sid } as any)
        .returning();
      res.status(201).json({ data: row, message: "Salaire ajouté" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Caisse ───────────────────────────────────────────────────────────────────

router.get(
  "/finance/caisse",
  requireAuth,
  requireRole("syndicate_admin", "treasurer"),
  async (req, res) => {
    const pagination = getPagination(req);
    try {
      const where = syndicateWhere(req, caisseEntriesTable.syndicateId);
      const [rows, [{ value: total }]] = await Promise.all([
        db.select().from(caisseEntriesTable)
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

router.post(
  "/finance/caisse",
  requireAuth,
  requireRole("syndicate_admin", "treasurer"),
  async (req, res) => {
    const schema = z.object({
      label: z.string().min(1),
      amount: z.number().positive(),
      type: z.enum(["encaissement", "decaissement"]),
      date: z.string(),
      category: z.string().default(""),
      syndicateId: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
    try {
      const syndicateId = effectiveSyndicateId(req, result.data.syndicateId);
      const { syndicateId: _sid, ...data } = result.data;
      let newRow: typeof caisseEntriesTable.$inferSelect;

      await db.transaction(async (tx) => {
        // Advisory lock keyed on syndicateId — prevents concurrent caisse writes
        // from reading the same lastBalance and producing wrong running totals.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${syndicateId}))`);

        const existing = await tx
          .select()
          .from(caisseEntriesTable)
          .where(eq(caisseEntriesTable.syndicateId, syndicateId))
          .orderBy(desc(caisseEntriesTable.createdAt))
          .limit(1);

        const lastBalance = Number(existing[0]?.balance ?? 0);
        const balance =
          data.type === "encaissement"
            ? lastBalance + data.amount
            : lastBalance - data.amount;

        const [row] = await tx
          .insert(caisseEntriesTable)
          .values({ ...data, syndicateId, balance: String(balance) } as any)
          .returning();
        newRow = row;
      });

      res.status(201).json({ data: newRow!, message: "Entrée caisse ajoutée" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

// ─── Invoices ─────────────────────────────────────────────────────────────────

router.get(
  "/invoices",
  requireAuth,
  requireRole("syndicate_admin", "treasurer"),
  async (req, res) => {
    const pagination = getPagination(req);
    try {
      const where = syndicateWhere(req, invoicesTable.syndicateId);
      const [rows, [{ value: total }]] = await Promise.all([
        db.select().from(invoicesTable)
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
        ? await db.select().from(invoiceItemsTable).where(inArray(invoiceItemsTable.invoiceId, invoiceIds))
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
  },
);

router.post(
  "/invoices",
  requireAuth,
  requireRole("syndicate_admin", "treasurer"),
  async (req, res) => {
    const itemSchema = z.object({
      label: z.string().min(1),
      quantity: z.number().positive(),
      unitPrice: z.number().positive(),
    });
    const schema = z.object({
      reference: z.string().min(1),
      type: z.enum(["devis", "facture"]).default("facture"),
      recipient: z.string().min(1),
      date: z.string(),
      dueDate: z.string(),
      status: z.enum(["draft", "issued", "sent", "paid", "partially_paid", "due", "overdue", "cancelled"]).default("draft"),
      items: z.array(itemSchema).default([]),
      syndicateId: z.string().optional(),
      proofUrl: z.string().optional(),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
    try {
      const sid = effectiveSyndicateId(req, result.data.syndicateId);
      const { syndicateId: _sid, items, ...data } = result.data;
      const amount = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const [inv] = await db
        .insert(invoicesTable)
        .values({ ...data, syndicateId: sid, amount } as any)
        .returning();
      if (items.length > 0) {
        await db
          .insert(invoiceItemsTable)
          .values(items.map((i) => ({ ...i, invoiceId: inv.id })) as any);
      }
      res.status(201).json({ data: inv, message: "Facture créée" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

router.put(
  "/invoices/:id/status",
  requireAuth,
  requireRole("syndicate_admin", "treasurer"),
  async (req, res) => {
    const id = String(req.params.id) as string;
    const schema = z.object({
      status: z.enum(["draft", "issued", "sent", "paid", "partially_paid", "due", "overdue", "cancelled"]),
    });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "Statut invalide" }); return; }
    try {
      const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
      if (!inv) { res.status(404).json({ error: "Facture introuvable" }); return; }
      if (
        req.user!.role !== "super_admin" &&
        inv.syndicateId !== req.user!.syndicateId
      ) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      const [updated] = await db
        .update(invoicesTable)
        .set({ status: result.data.status })
        .where(eq(invoicesTable.id, id))
        .returning();
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
  requireRole("syndicate_admin", "treasurer"),
  async (req, res) => {
    const pagination = getPagination(req);
    try {
      const where = syndicateWhere(req, bonsLivraisonTable.syndicateId);
      const [rows, [{ value: total }]] = await Promise.all([
        db.select().from(bonsLivraisonTable)
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
        ? await db.select().from(bonItemsTable).where(inArray(bonItemsTable.bonId, bonIds))
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
      const VALID_STATUSES = new Set(["draft", "sent", "delivered", "cancelled"]);
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
  requireRole("syndicate_admin", "treasurer"),
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
    if (!result.success) { res.status(400).json({ error: "Données invalides" }); return; }
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
  requireRole("syndicate_admin", "treasurer"),
  async (req, res) => {
    const id = String(req.params.id) as string;
    const schema = z.object({ status: z.enum(["draft", "sent", "delivered", "cancelled"]) });
    const result = schema.safeParse(req.body);
    if (!result.success) { res.status(400).json({ error: "Statut invalide" }); return; }
    try {
      const [bon] = await db
        .select()
        .from(bonsLivraisonTable)
        .where(eq(bonsLivraisonTable.id, id));
      if (!bon) { res.status(404).json({ error: "Bon introuvable" }); return; }
      if (
        req.user!.role !== "super_admin" &&
        bon.syndicateId !== req.user!.syndicateId
      ) {
        res.status(403).json({ error: "Accès refusé" }); return;
      }
      const [updated] = await db
        .update(bonsLivraisonTable)
        .set({ status: result.data.status })
        .where(eq(bonsLivraisonTable.id, id))
        .returning();
      res.json({ data: updated, message: "Statut mis à jour" });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
);

export default router;
