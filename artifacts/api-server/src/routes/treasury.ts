import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import {
  bankStatementLinesTable,
  ledgerEntriesTable,
  reconciliationMatchesTable,
  treasuryAccountsTable,
  appelPaymentsTable,
  appelsDeFondsTable,
  expensesTable,
} from "@workspace/db/schema";
import { and, desc, eq, gte, lte, sql, count, inArray } from "drizzle-orm";
import { requireAuth, requireFinanceAccess } from "../middleware/auth.js";
import { findForeignReference } from "../lib/scope.js";
import { getPagination, buildPagedResponse } from "../lib/paginate.js";
import { serverAuditLog } from "../lib/audit.js";
import { notifyUser } from "../lib/notify.js";
import {
  FinanceError,
  accountBalanceCents,
  accountSummaries,
  amountSchema,
  categorySchema,
  fromCents,
  isValidMoroccanRib,
  isoDateSchema,
  lockAccount,
  maskRib,
  normalizeRib,
  postEntry,
  recordOperation,
  reverseEntry,
  sendFinanceError,
  toCents,
  today,
  uniqueViolation,
} from "../lib/treasury.js";

const router = Router();

/**
 * Read access to the syndicate's treasury: the finance team (admin,
 * treasurer) and the council that controls it (president, committee
 * members). Always scoped to the syndicate in the JWT — never to an id sent
 * by the client. Residents and the platform owner have no access.
 */
const TREASURY_READ_ROLES = ["syndicate_admin", "treasurer", "president", "committee_member"];

function requireTreasuryRead(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return void res.status(401).json({ error: "Non authentifié" });
  if (!TREASURY_READ_ROLES.includes(req.user.role)) {
    return void res.status(403).json({ error: "Accès refusé" });
  }
  if (!req.user.syndicateId) {
    return void res.status(403).json({ error: "Syndicat non défini dans le token" });
  }
  next();
}

const canSeeFullRib = (role: string) => role === "syndicate_admin" || role === "treasurer";

function idempotencyKey(req: Request): string | null {
  const raw = req.header("Idempotency-Key");
  if (!raw) return null;
  const key = raw.trim();
  if (!/^[A-Za-z0-9_\-:.]{8,100}$/.test(key)) {
    throw new FinanceError(400, "INVALID_IDEMPOTENCY_KEY", "En-tête Idempotency-Key invalide");
  }
  return key;
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

router.get("/treasury/accounts", requireAuth, requireTreasuryRead, async (req, res) => {
  try {
    res.json({ data: await accountSummaries(req.user!.syndicateId!) });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

router.get("/treasury/accounts/:id", requireAuth, requireTreasuryRead, async (req, res) => {
  try {
    const sid = req.user!.syndicateId!;
    const summary = (await accountSummaries(sid)).find((a) => a.id === String(req.params.id));
    if (!summary) return void res.status(404).json({ error: "Compte introuvable" });
    let rib: string | null = null;
    if (canSeeFullRib(req.user!.role)) {
      const [row] = await db
        .select({ rib: treasuryAccountsTable.rib })
        .from(treasuryAccountsTable)
        .where(and(eq(treasuryAccountsTable.id, summary.id), eq(treasuryAccountsTable.syndicateId, sid)));
      rib = row?.rib ?? null;
    }
    res.json({ data: { ...summary, rib } });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

const createAccountSchema = z
  .object({
    kind: z.enum(["bank", "cash"]),
    label: z.string().trim().min(2).max(120),
    bankName: z.string().trim().max(120).optional(),
    accountHolder: z.string().trim().max(160).optional(),
    rib: z.string().max(40).optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).default("MAD"),
    openingBalance: z.union([z.literal(0), z.literal("0"), amountSchema]).default("0"),
    openingDate: isoDateSchema.optional(),
    isDefault: z.boolean().optional(),
    buildingId: z.string().optional(),
  })
  .strict();

router.post("/treasury/accounts", requireAuth, requireFinanceAccess, async (req, res) => {
  const parsed = createAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides", code: "INVALID_ACCOUNT" });
  }
  const data = parsed.data;
  const sid = req.user!.syndicateId!;
  try {
    const rib = data.rib ? normalizeRib(data.rib) : null;
    if (data.kind === "bank") {
      if (!rib) throw new FinanceError(400, "RIB_REQUIRED", "Le RIB (24 chiffres) est obligatoire pour un compte bancaire");
      if (!isValidMoroccanRib(rib)) throw new FinanceError(400, "INVALID_RIB", "RIB invalide (24 chiffres, clé RIB incorrecte)");
      if (!data.bankName) throw new FinanceError(400, "BANK_NAME_REQUIRED", "Le nom de la banque est obligatoire");
    } else if (rib) {
      throw new FinanceError(400, "RIB_NOT_ALLOWED", "Une caisse n'a pas de RIB");
    }
    const openingDate = data.openingDate ?? today();
    if (openingDate > today()) throw new FinanceError(400, "ENTRY_DATE_IN_FUTURE", "La date d'ouverture ne peut pas être dans le futur");
    if (data.buildingId && (await findForeignReference(sid, { buildingId: data.buildingId }))) {
      throw new FinanceError(404, "FOREIGN_REFERENCE", "Immeuble introuvable dans votre syndicat");
    }
    const openingBalance = String(data.openingBalance);

    const account = await db.transaction(async (tx) => {
      // Serialize account creation per syndicate (label uniqueness, default flag).
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"treasury-accounts:" + sid}))`);
      const siblings = await tx
        .select()
        .from(treasuryAccountsTable)
        .where(eq(treasuryAccountsTable.syndicateId, sid));
      if (siblings.some((a) => a.label.toLowerCase() === data.label.toLowerCase())) {
        throw new FinanceError(409, "ACCOUNT_LABEL_EXISTS", "Un compte porte déjà ce nom");
      }
      const hasDefault = siblings.some((a) => a.kind === data.kind && a.isDefault && a.status === "active");
      const makeDefault = data.isDefault === true || !hasDefault;
      if (makeDefault && hasDefault) {
        await tx
          .update(treasuryAccountsTable)
          .set({ isDefault: false })
          .where(and(eq(treasuryAccountsTable.syndicateId, sid), eq(treasuryAccountsTable.kind, data.kind)));
      }
      let created;
      try {
        [created] = await tx
          .insert(treasuryAccountsTable)
          .values({
            syndicateId: sid,
            buildingId: data.buildingId ?? null,
            kind: data.kind,
            label: data.label,
            bankName: data.kind === "bank" ? data.bankName : null,
            accountHolder: data.accountHolder ?? null,
            rib,
            currency: data.currency,
            openingBalance,
            openingDate,
            isDefault: makeDefault,
            createdBy: req.user!.userId,
          })
          .returning();
      } catch (err) {
        if (uniqueViolation(err)?.includes("rib")) {
          throw new FinanceError(409, "RIB_ALREADY_REGISTERED", "Ce RIB est déjà enregistré pour ce syndicat");
        }
        throw err;
      }
      if (toCents(openingBalance) > 0) {
        await postEntry(tx, {
          syndicateId: sid,
          account: created,
          direction: "in",
          amount: openingBalance,
          entryDate: openingDate,
          category: "reprise_solde",
          label: `Solde d'ouverture — ${created.label}`,
          sourceType: "opening",
          sourceId: created.id,
          createdBy: req.user!.userId,
        });
      }
      return created;
    });

    await serverAuditLog(req, {
      action: "TREASURY_ACCOUNT_CREATED",
      entity: "treasury_account",
      entityId: account.id,
      syndicateId: sid,
      details: JSON.stringify({ kind: account.kind, label: account.label, rib: maskRib(account.rib), openingBalance }),
    });
    res.status(201).json({ data: { ...account, rib: undefined, ribMasked: maskRib(account.rib) }, message: "Compte créé" });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

const updateAccountSchema = z
  .object({
    label: z.string().trim().min(2).max(120).optional(),
    bankName: z.string().trim().max(120).optional(),
    accountHolder: z.string().trim().max(160).nullable().optional(),
    isDefault: z.literal(true).optional(),
    status: z.literal("closed").optional(),
  })
  .strict();

router.patch("/treasury/accounts/:id", requireAuth, requireFinanceAccess, async (req, res) => {
  const parsed = updateAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides", code: "INVALID_ACCOUNT" });
  }
  const sid = req.user!.syndicateId!;
  const id = String(req.params.id);
  try {
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"treasury-accounts:" + sid}))`);
      const [account] = await tx
        .select()
        .from(treasuryAccountsTable)
        .where(and(eq(treasuryAccountsTable.id, id), eq(treasuryAccountsTable.syndicateId, sid)))
        .for("update");
      if (!account) throw new FinanceError(404, "ACCOUNT_NOT_FOUND", "Compte introuvable");
      if (account.status === "closed") throw new FinanceError(409, "ACCOUNT_CLOSED", "Ce compte est clôturé");
      const patch: Partial<typeof treasuryAccountsTable.$inferInsert> = {};
      if (parsed.data.label) {
        const [dup] = await tx
          .select({ id: treasuryAccountsTable.id })
          .from(treasuryAccountsTable)
          .where(
            and(
              eq(treasuryAccountsTable.syndicateId, sid),
              sql`lower(${treasuryAccountsTable.label}) = lower(${parsed.data.label})`,
              sql`${treasuryAccountsTable.id} <> ${id}`,
            ),
          )
          .limit(1);
        if (dup) throw new FinanceError(409, "ACCOUNT_LABEL_EXISTS", "Un compte porte déjà ce nom");
        patch.label = parsed.data.label;
      }
      if (parsed.data.bankName !== undefined && account.kind === "bank") patch.bankName = parsed.data.bankName;
      if (parsed.data.accountHolder !== undefined) patch.accountHolder = parsed.data.accountHolder;
      if (parsed.data.isDefault) {
        await tx
          .update(treasuryAccountsTable)
          .set({ isDefault: false })
          .where(and(eq(treasuryAccountsTable.syndicateId, sid), eq(treasuryAccountsTable.kind, account.kind)));
        patch.isDefault = true;
      }
      if (parsed.data.status === "closed") {
        const balance = await accountBalanceCents(tx, id);
        if (balance !== 0) {
          throw new FinanceError(
            409,
            "ACCOUNT_BALANCE_NOT_ZERO",
            `Solde non nul (${fromCents(balance)}) : transférez les fonds avant de clôturer.`,
          );
        }
        patch.status = "closed";
        patch.isDefault = false;
        patch.closedAt = new Date();
        patch.closedBy = req.user!.userId;
      }
      const [row] = await tx
        .update(treasuryAccountsTable)
        .set(patch)
        .where(eq(treasuryAccountsTable.id, id))
        .returning();
      return row;
    });
    await serverAuditLog(req, {
      action: parsed.data.status === "closed" ? "TREASURY_ACCOUNT_CLOSED" : "TREASURY_ACCOUNT_UPDATED",
      entity: "treasury_account",
      entityId: id,
      syndicateId: sid,
      details: JSON.stringify(parsed.data),
    });
    res.json({ data: { ...updated, rib: undefined, ribMasked: maskRib(updated.rib) }, message: "Compte mis à jour" });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

// ─── Journal ──────────────────────────────────────────────────────────────────

const journalQuerySchema = z.object({
  accountId: z.string().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  category: z.string().max(40).optional(),
  sourceType: z.enum(["opening", "appel_payment", "expense", "salary", "manual", "transfer", "reversal"]).optional(),
});

router.get("/treasury/journal", requireAuth, requireTreasuryRead, async (req, res) => {
  const parsed = journalQuerySchema.safeParse(req.query);
  if (!parsed.success) return void res.status(400).json({ error: "Filtres invalides" });
  const pagination = getPagination(req);
  const sid = req.user!.syndicateId!;
  try {
    const q = parsed.data;
    const conditions = [eq(ledgerEntriesTable.syndicateId, sid)];
    if (q.accountId) conditions.push(eq(ledgerEntriesTable.accountId, q.accountId));
    if (q.from) conditions.push(gte(ledgerEntriesTable.entryDate, q.from));
    if (q.to) conditions.push(lte(ledgerEntriesTable.entryDate, q.to));
    if (q.category) conditions.push(eq(ledgerEntriesTable.category, q.category));
    if (q.sourceType) conditions.push(eq(ledgerEntriesTable.sourceType, q.sourceType));
    const where = and(...conditions);

    const [rows, [{ value: total }], [totals]] = await Promise.all([
      db
        .select({
          entry: ledgerEntriesTable,
          accountLabel: treasuryAccountsTable.label,
          matched: sql<string>`COALESCE((SELECT SUM(m.amount) FROM reconciliation_matches m WHERE m.ledger_entry_id = ${ledgerEntriesTable.id}), 0)`,
          reversedBy: sql<string | null>`(SELECT r.entry_number FROM ledger_entries r WHERE r.reverses_entry_id = ${ledgerEntriesTable.id} LIMIT 1)`,
        })
        .from(ledgerEntriesTable)
        .innerJoin(treasuryAccountsTable, eq(treasuryAccountsTable.id, ledgerEntriesTable.accountId))
        .where(where)
        .orderBy(desc(ledgerEntriesTable.entryDate), desc(ledgerEntriesTable.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.select({ value: count() }).from(ledgerEntriesTable).where(where),
      db
        .select({
          inflow: sql<string>`COALESCE(SUM(${ledgerEntriesTable.amount}) FILTER (WHERE ${ledgerEntriesTable.direction} = 'in'), 0)`,
          outflow: sql<string>`COALESCE(SUM(${ledgerEntriesTable.amount}) FILTER (WHERE ${ledgerEntriesTable.direction} = 'out'), 0)`,
        })
        .from(ledgerEntriesTable)
        .where(where),
    ]);

    const data = rows.map(({ entry, accountLabel, matched, reversedBy }) => {
      const matchedCents = toCents(matched);
      const amountCents = toCents(entry.amount);
      return {
        ...entry,
        accountLabel,
        reversedBy,
        reconciledAmount: fromCents(matchedCents),
        reconciliation: matchedCents === 0 ? "unreconciled" : matchedCents >= amountCents ? "reconciled" : "partial",
      };
    });
    res.json({
      ...buildPagedResponse(data, Number(total), pagination),
      totals: {
        inflow: fromCents(toCents(totals?.inflow)),
        outflow: fromCents(toCents(totals?.outflow)),
        net: fromCents(toCents(totals?.inflow) - toCents(totals?.outflow)),
      },
    });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

const manualEntrySchema = z
  .object({
    accountId: z.string().min(1),
    direction: z.enum(["in", "out"]),
    amount: amountSchema,
    entryDate: isoDateSchema.optional(),
    category: categorySchema,
    label: z.string().trim().min(2).max(200),
    reference: z.string().trim().max(100).optional(),
    proofUrl: z.string().startsWith("/objects/").max(500).optional(),
    buildingId: z.string().optional(),
  })
  .strict();

/**
 * Manual journal entry (bank fees, interest, regularisation…). Expenses with a
 * supplier invoice go through /expenses; co-owner payments through the calls
 * for funds. Every outflow needs a justification, except bank fees whose
 * proof is the bank statement itself.
 */
router.post("/treasury/entries", requireAuth, requireFinanceAccess, async (req, res) => {
  const parsed = manualEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides", code: "INVALID_ENTRY" });
  }
  const data = parsed.data;
  const sid = req.user!.syndicateId!;
  try {
    const key = idempotencyKey(req);
    if (key) {
      const [existing] = await db
        .select()
        .from(ledgerEntriesTable)
        .where(and(eq(ledgerEntriesTable.syndicateId, sid), eq(ledgerEntriesTable.idempotencyKey, key)));
      if (existing) return void res.status(200).json({ data: existing, replayed: true, message: "Écriture déjà enregistrée" });
    }
    if (data.direction === "out" && !data.proofUrl && data.category !== "frais_bancaires") {
      throw new FinanceError(400, "PROOF_REQUIRED", "Un justificatif est obligatoire pour toute sortie de fonds");
    }
    const foreign = await findForeignReference(sid, { objectPath: data.proofUrl, buildingId: data.buildingId });
    if (foreign) throw new FinanceError(400, "FOREIGN_REFERENCE", foreign === "objectPath" ? "Le justificatif doit être un fichier téléversé dans ce syndicat." : "Immeuble introuvable dans votre syndicat");

    const entry = await db.transaction(async (tx) => {
      const account = await lockAccount(tx, sid, { accountId: data.accountId });
      const posted = await postEntry(tx, {
        syndicateId: sid,
        account,
        direction: data.direction,
        amount: data.amount,
        entryDate: data.entryDate ?? today(),
        category: data.category,
        label: data.label,
        reference: data.reference,
        sourceType: "manual",
        buildingId: data.buildingId,
        proofUrl: data.proofUrl,
        idempotencyKey: key,
        createdBy: req.user!.userId,
      });
      await recordOperation(tx, {
        syndicateId: sid,
        type: data.direction === "in" ? "recette" : "depense",
        amount: posted.amount,
        label: data.label,
        date: posted.entryDate,
        proofUrl: data.proofUrl,
        ledgerEntryId: posted.id,
      });
      return posted;
    });
    await serverAuditLog(req, {
      action: "LEDGER_ENTRY_POSTED",
      entity: "ledger_entry",
      entityId: entry.id,
      syndicateId: sid,
      details: `${entry.entryNumber} ${entry.direction} ${entry.amount} ${entry.category}`,
    });
    res.status(201).json({ data: entry, message: `Écriture ${entry.entryNumber} enregistrée` });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

const transferSchema = z
  .object({
    fromAccountId: z.string().min(1),
    toAccountId: z.string().min(1),
    amount: amountSchema,
    entryDate: isoDateSchema.optional(),
    label: z.string().trim().max(200).optional(),
    reference: z.string().trim().max(100).optional(),
  })
  .strict();

/** Internal transfer, e.g. depositing collected cash at the bank. */
router.post("/treasury/transfers", requireAuth, requireFinanceAccess, async (req, res) => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides", code: "INVALID_TRANSFER" });
  }
  const data = parsed.data;
  const sid = req.user!.syndicateId!;
  try {
    if (data.fromAccountId === data.toAccountId) {
      throw new FinanceError(400, "SAME_ACCOUNT", "Les comptes source et destination doivent être différents");
    }
    const key = idempotencyKey(req);
    if (key) {
      const legs = await db
        .select()
        .from(ledgerEntriesTable)
        .where(
          and(
            eq(ledgerEntriesTable.syndicateId, sid),
            inArray(ledgerEntriesTable.idempotencyKey, [`${key}:out`, `${key}:in`]),
          ),
        );
      if (legs.length) return void res.status(200).json({ data: legs, replayed: true, message: "Virement déjà enregistré" });
    }
    const transferId = randomUUID();
    const legs = await db.transaction(async (tx) => {
      // Lock both accounts in a stable order (no deadlock with a reverse transfer).
      const [firstId, secondId] = [data.fromAccountId, data.toAccountId].sort();
      const first = await lockAccount(tx, sid, { accountId: firstId });
      const second = await lockAccount(tx, sid, { accountId: secondId });
      const from = first.id === data.fromAccountId ? first : second;
      const to = first.id === data.toAccountId ? first : second;
      if (from.currency !== to.currency) {
        throw new FinanceError(400, "CURRENCY_MISMATCH", "Les deux comptes doivent être dans la même devise");
      }
      const entryDate = data.entryDate ?? today();
      const label = data.label || `Virement interne ${from.label} → ${to.label}`;
      const out = await postEntry(tx, {
        syndicateId: sid, account: from, direction: "out", amount: data.amount, entryDate,
        category: "virement_interne", label, reference: data.reference, sourceType: "transfer",
        sourceId: transferId, idempotencyKey: key ? `${key}:out` : null, createdBy: req.user!.userId,
      });
      const inn = await postEntry(tx, {
        syndicateId: sid, account: to, direction: "in", amount: data.amount, entryDate,
        category: "virement_interne", label, reference: data.reference, sourceType: "transfer",
        sourceId: transferId, idempotencyKey: key ? `${key}:in` : null, createdBy: req.user!.userId,
      });
      return [out, inn];
    });
    await serverAuditLog(req, {
      action: "TREASURY_TRANSFER",
      entity: "ledger_entry",
      entityId: transferId,
      syndicateId: sid,
      details: `${legs[0].entryNumber} → ${legs[1].entryNumber} ${data.amount}`,
    });
    res.status(201).json({ data: legs, message: "Virement interne enregistré" });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

const reverseSchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();

router.post("/treasury/entries/:id/reverse", requireAuth, requireFinanceAccess, async (req, res) => {
  const parsed = reverseSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: "Un motif d'extourne est obligatoire", code: "REASON_REQUIRED" });
  }
  const sid = req.user!.syndicateId!;
  try {
    const result = await db.transaction((tx) =>
      reverseEntry(tx, { syndicateId: sid, entryId: String(req.params.id), reason: parsed.data.reason, userId: req.user!.userId }),
    );
    await serverAuditLog(req, {
      action: "LEDGER_ENTRY_REVERSED",
      entity: "ledger_entry",
      entityId: String(req.params.id),
      syndicateId: sid,
      details: JSON.stringify({ reason: parsed.data.reason, effect: result.effect, reversals: result.reversals.map((r) => r.entryNumber) }),
    });
    if (result.paymentId) {
      // Tell the co-owner their payment was cancelled (e.g. bounced cheque).
      const [payment] = await db
        .select({ declaredBy: appelPaymentsTable.declaredBy, amount: appelPaymentsTable.amount, period: appelsDeFondsTable.period })
        .from(appelPaymentsTable)
        .innerJoin(appelsDeFondsTable, eq(appelsDeFondsTable.id, appelPaymentsTable.appelId))
        .where(eq(appelPaymentsTable.id, result.paymentId));
      if (payment) {
        void notifyUser(payment.declaredBy, {
          title: "Paiement annulé",
          message: `Votre paiement de ${payment.amount} MAD (appel ${payment.period}) a été annulé : ${parsed.data.reason}.`,
          type: "warning",
          syndicateId: sid,
        });
      }
    }
    res.json({ data: result.reversals, effect: result.effect, message: "Écriture extournée" });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

// ─── Summary (dashboards) ─────────────────────────────────────────────────────

router.get("/treasury/summary", requireAuth, requireTreasuryRead, async (req, res) => {
  const sid = req.user!.syndicateId!;
  try {
    const [accounts, [pendingPayments], [expenseTotals], [unmatchedLines]] = await Promise.all([
      accountSummaries(sid),
      db
        .select({ n: sql<number>`COUNT(*)::int`, total: sql<string>`COALESCE(SUM(${appelPaymentsTable.amount}), 0)` })
        .from(appelPaymentsTable)
        .where(and(eq(appelPaymentsTable.syndicateId, sid), eq(appelPaymentsTable.status, "pending"))),
      db
        .select({
          submitted: sql<number>`COUNT(*) FILTER (WHERE ${expensesTable.status} = 'submitted')::int`,
          approvedCount: sql<number>`COUNT(*) FILTER (WHERE ${expensesTable.status} = 'approved')::int`,
          approvedTotal: sql<string>`COALESCE(SUM(${expensesTable.amount}) FILTER (WHERE ${expensesTable.status} = 'approved'), 0)`,
        })
        .from(expensesTable)
        .where(eq(expensesTable.syndicateId, sid)),
      db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(bankStatementLinesTable)
        .where(and(eq(bankStatementLinesTable.syndicateId, sid), inArray(bankStatementLinesTable.status, ["unmatched", "partial", "anomaly"]))),
    ]);
    const active = accounts.filter((a) => a.status === "active");
    const byCurrency = new Map<string, number>();
    for (const a of accounts) byCurrency.set(a.currency, (byCurrency.get(a.currency) ?? 0) + toCents(a.balance));
    res.json({
      data: {
        accountsConfigured: active.length > 0,
        accounts,
        balances: [...byCurrency].map(([currency, cents]) => ({ currency, balance: fromCents(cents) })),
        pendingPayments: { count: pendingPayments?.n ?? 0, total: fromCents(toCents(pendingPayments?.total)) },
        expenses: {
          toApprove: expenseTotals?.submitted ?? 0,
          toPay: expenseTotals?.approvedCount ?? 0,
          toPayTotal: fromCents(toCents(expenseTotals?.approvedTotal)),
        },
        statementLinesToReview: unmatchedLines?.n ?? 0,
      },
    });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

// ─── Bank reconciliation ──────────────────────────────────────────────────────
// No bank API is connected: statement lines are imported from the bank's
// export (CSV parsed by the client, or typed in). Matching is always an
// explicit, audited human decision; candidates are only suggestions.

const statementLineSchema = z.object({
  valueDate: isoDateSchema,
  amount: z
    .union([z.number(), z.string().trim()])
    .transform((v) => String(v))
    .refine((v) => /^-?\d+(\.\d{1,2})?$/.test(v) && toCents(v) !== 0, { message: "Montant de ligne invalide (non nul, 2 décimales)" }),
  label: z.string().trim().min(1).max(300),
  reference: z.string().trim().max(120).optional(),
  externalId: z.string().trim().min(1).max(200).optional(),
});

router.post("/treasury/accounts/:id/statement-lines", requireAuth, requireFinanceAccess, async (req, res) => {
  const parsed = z.object({ lines: z.array(statementLineSchema).min(1).max(1000) }).strict().safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Relevé invalide", code: "INVALID_STATEMENT" });
  }
  const sid = req.user!.syndicateId!;
  try {
    const [account] = await db
      .select()
      .from(treasuryAccountsTable)
      .where(and(eq(treasuryAccountsTable.id, String(req.params.id)), eq(treasuryAccountsTable.syndicateId, sid)));
    if (!account) throw new FinanceError(404, "ACCOUNT_NOT_FOUND", "Compte introuvable");
    if (account.kind !== "bank") throw new FinanceError(400, "NOT_A_BANK_ACCOUNT", "Le rapprochement ne concerne que les comptes bancaires");

    // Stable identity per line: identical lines of one statement are told
    // apart by their rank, so re-importing the same file inserts nothing.
    const seen = new Map<string, number>();
    const batchId = randomUUID();
    const values = parsed.data.lines.map((l) => {
      const cents = toCents(l.amount);
      const base = `${l.valueDate}|${cents}|${l.label}|${l.reference ?? ""}`;
      const rank = (seen.get(base) ?? 0) + 1;
      seen.set(base, rank);
      return {
        syndicateId: sid,
        accountId: account.id,
        valueDate: l.valueDate,
        amount: fromCents(cents),
        label: l.label,
        reference: l.reference ?? null,
        externalId: l.externalId ?? createHash("sha256").update(`${base}|${rank}`).digest("hex"),
        importBatchId: batchId,
        importedBy: req.user!.userId,
      };
    });
    const inserted = await db
      .insert(bankStatementLinesTable)
      .values(values)
      .onConflictDoNothing({ target: [bankStatementLinesTable.accountId, bankStatementLinesTable.externalId] })
      .returning({ id: bankStatementLinesTable.id });
    await serverAuditLog(req, {
      action: "BANK_STATEMENT_IMPORTED",
      entity: "treasury_account",
      entityId: account.id,
      syndicateId: sid,
      details: `${inserted.length} ligne(s) importée(s), ${values.length - inserted.length} doublon(s) ignoré(s)`,
    });
    res.status(201).json({
      data: { batchId, inserted: inserted.length, duplicates: values.length - inserted.length },
      message: `${inserted.length} ligne(s) importée(s)`,
    });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

router.get("/treasury/accounts/:id/statement-lines", requireAuth, requireTreasuryRead, async (req, res) => {
  const sid = req.user!.syndicateId!;
  const pagination = getPagination(req, 100);
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  try {
    const conditions = [
      eq(bankStatementLinesTable.syndicateId, sid),
      eq(bankStatementLinesTable.accountId, String(req.params.id)),
    ];
    if (status) conditions.push(eq(bankStatementLinesTable.status, status));
    const where = and(...conditions);
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(bankStatementLinesTable)
        .where(where)
        .orderBy(desc(bankStatementLinesTable.valueDate), desc(bankStatementLinesTable.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db.select({ value: count() }).from(bankStatementLinesTable).where(where),
    ]);
    res.json(buildPagedResponse(rows, Number(total), pagination));
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

/** Suggested journal entries for a statement line (same account and sign). */
router.get("/treasury/statement-lines/:id/candidates", requireAuth, requireTreasuryRead, async (req, res) => {
  const sid = req.user!.syndicateId!;
  try {
    const [line] = await db
      .select()
      .from(bankStatementLinesTable)
      .where(and(eq(bankStatementLinesTable.id, String(req.params.id)), eq(bankStatementLinesTable.syndicateId, sid)));
    if (!line) throw new FinanceError(404, "LINE_NOT_FOUND", "Ligne de relevé introuvable");
    const lineCents = toCents(line.amount);
    const remainingLine = Math.abs(lineCents) - toCents(line.matchedAmount);
    const rows = await db.execute<Record<string, unknown>>(sql`
      SELECT le.id, le.entry_number, le.entry_date::text AS entry_date, le.amount, le.label, le.reference,
             le.category, le.source_type,
             le.amount - COALESCE(m.matched, 0) AS remaining
      FROM ledger_entries le
      LEFT JOIN (SELECT ledger_entry_id, SUM(amount) AS matched FROM reconciliation_matches GROUP BY ledger_entry_id) m
        ON m.ledger_entry_id = le.id
      WHERE le.syndicate_id = ${sid}
        AND le.account_id = ${line.accountId}
        AND le.direction = ${lineCents > 0 ? "in" : "out"}
        AND le.amount - COALESCE(m.matched, 0) > 0
      ORDER BY abs((le.amount - COALESCE(m.matched, 0)) - ${fromCents(remainingLine)}::numeric),
               abs(le.entry_date - ${line.valueDate}::date)
      LIMIT 10
    `);
    res.json({ data: rows, remaining: fromCents(remainingLine) });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

function lineStatus(lineAmountCents: number, matchedCents: number): "unmatched" | "partial" | "matched" {
  if (matchedCents <= 0) return "unmatched";
  return matchedCents >= Math.abs(lineAmountCents) ? "matched" : "partial";
}

const matchSchema = z
  .object({
    statementLineId: z.string().min(1),
    ledgerEntryId: z.string().min(1),
    amount: amountSchema.optional(),
  })
  .strict();

router.post("/treasury/reconciliation/matches", requireAuth, requireFinanceAccess, async (req, res) => {
  const parsed = matchSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides", code: "INVALID_MATCH" });
  }
  const sid = req.user!.syndicateId!;
  try {
    const match = await db.transaction(async (tx) => {
      const [line] = await tx
        .select()
        .from(bankStatementLinesTable)
        .where(and(eq(bankStatementLinesTable.id, parsed.data.statementLineId), eq(bankStatementLinesTable.syndicateId, sid)))
        .for("update");
      if (!line) throw new FinanceError(404, "LINE_NOT_FOUND", "Ligne de relevé introuvable");
      if (line.status === "ignored" || line.status === "anomaly") {
        throw new FinanceError(409, "LINE_NOT_MATCHABLE", "Ligne marquée ignorée / en anomalie : réinitialisez-la d'abord");
      }
      const [entry] = await tx
        .select()
        .from(ledgerEntriesTable)
        .where(and(eq(ledgerEntriesTable.id, parsed.data.ledgerEntryId), eq(ledgerEntriesTable.syndicateId, sid)))
        .for("update");
      if (!entry) throw new FinanceError(404, "ENTRY_NOT_FOUND", "Écriture introuvable");
      if (entry.accountId !== line.accountId) {
        throw new FinanceError(400, "ACCOUNT_MISMATCH", "L'écriture et la ligne de relevé concernent des comptes différents");
      }
      const lineCents = toCents(line.amount);
      if ((lineCents > 0) !== (entry.direction === "in")) {
        throw new FinanceError(400, "DIRECTION_MISMATCH", "Sens incompatible (crédit ↔ encaissement, débit ↔ décaissement)");
      }
      const [matchedOnEntry] = await tx
        .select({ total: sql<string>`COALESCE(SUM(${reconciliationMatchesTable.amount}), 0)` })
        .from(reconciliationMatchesTable)
        .where(eq(reconciliationMatchesTable.ledgerEntryId, entry.id));
      const remainingEntry = toCents(entry.amount) - toCents(matchedOnEntry?.total);
      const remainingLine = Math.abs(lineCents) - toCents(line.matchedAmount);
      const amount = parsed.data.amount ? toCents(parsed.data.amount) : Math.min(remainingEntry, remainingLine);
      if (amount <= 0 || amount > remainingEntry || amount > remainingLine) {
        throw new FinanceError(
          409,
          "MATCH_EXCEEDS_REMAINING",
          `Montant supérieur au reste à rapprocher (ligne ${fromCents(remainingLine)}, écriture ${fromCents(remainingEntry)})`,
        );
      }
      let created;
      try {
        [created] = await tx
          .insert(reconciliationMatchesTable)
          .values({
            syndicateId: sid,
            statementLineId: line.id,
            ledgerEntryId: entry.id,
            amount: fromCents(amount),
            matchedBy: req.user!.userId,
          })
          .returning();
      } catch (err) {
        if (uniqueViolation(err) !== null) throw new FinanceError(409, "ALREADY_MATCHED", "Ces deux éléments sont déjà rapprochés");
        throw err;
      }
      const newMatched = toCents(line.matchedAmount) + amount;
      await tx
        .update(bankStatementLinesTable)
        .set({ matchedAmount: fromCents(newMatched), status: lineStatus(lineCents, newMatched) })
        .where(eq(bankStatementLinesTable.id, line.id));
      return created;
    });
    await serverAuditLog(req, {
      action: "RECONCILIATION_MATCHED",
      entity: "bank_statement_line",
      entityId: match.statementLineId,
      syndicateId: sid,
      details: `écriture ${match.ledgerEntryId} — ${match.amount}`,
    });
    res.status(201).json({ data: match, message: "Rapprochement enregistré" });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

router.delete("/treasury/reconciliation/matches/:id", requireAuth, requireFinanceAccess, async (req, res) => {
  const sid = req.user!.syndicateId!;
  try {
    const removed = await db.transaction(async (tx) => {
      const [match] = await tx
        .select()
        .from(reconciliationMatchesTable)
        .where(and(eq(reconciliationMatchesTable.id, String(req.params.id)), eq(reconciliationMatchesTable.syndicateId, sid)));
      if (!match) throw new FinanceError(404, "MATCH_NOT_FOUND", "Rapprochement introuvable");
      const [line] = await tx
        .select()
        .from(bankStatementLinesTable)
        .where(eq(bankStatementLinesTable.id, match.statementLineId))
        .for("update");
      await tx.delete(reconciliationMatchesTable).where(eq(reconciliationMatchesTable.id, match.id));
      const newMatched = Math.max(0, toCents(line.matchedAmount) - toCents(match.amount));
      await tx
        .update(bankStatementLinesTable)
        .set({
          matchedAmount: fromCents(newMatched),
          status: line.status === "anomaly" ? "anomaly" : lineStatus(toCents(line.amount), newMatched),
        })
        .where(eq(bankStatementLinesTable.id, line.id));
      return match;
    });
    await serverAuditLog(req, {
      action: "RECONCILIATION_UNMATCHED",
      entity: "bank_statement_line",
      entityId: removed.statementLineId,
      syndicateId: sid,
      details: `écriture ${removed.ledgerEntryId} — ${removed.amount}`,
    });
    res.json({ message: "Rapprochement annulé" });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

const flagSchema = z
  .object({ status: z.enum(["anomaly", "ignored", "unmatched"]), note: z.string().trim().max(500).optional() })
  .strict()
  .refine((d) => d.status !== "anomaly" || !!d.note, { message: "Décrivez l'anomalie", path: ["note"] });

router.post("/treasury/statement-lines/:id/status", requireAuth, requireFinanceAccess, async (req, res) => {
  const parsed = flagSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides", code: "INVALID_STATUS" });
  }
  const sid = req.user!.syndicateId!;
  try {
    const updated = await db.transaction(async (tx) => {
      const [line] = await tx
        .select()
        .from(bankStatementLinesTable)
        .where(and(eq(bankStatementLinesTable.id, String(req.params.id)), eq(bankStatementLinesTable.syndicateId, sid)))
        .for("update");
      if (!line) throw new FinanceError(404, "LINE_NOT_FOUND", "Ligne de relevé introuvable");
      if (parsed.data.status === "ignored" && toCents(line.matchedAmount) > 0) {
        throw new FinanceError(409, "LINE_PARTIALLY_MATCHED", "Annulez d'abord les rapprochements de cette ligne");
      }
      const status =
        parsed.data.status === "unmatched"
          ? lineStatus(toCents(line.amount), toCents(line.matchedAmount))
          : parsed.data.status;
      const [row] = await tx
        .update(bankStatementLinesTable)
        .set({ status, note: parsed.data.note ?? line.note })
        .where(eq(bankStatementLinesTable.id, line.id))
        .returning();
      return row;
    });
    await serverAuditLog(req, {
      action: "STATEMENT_LINE_FLAGGED",
      entity: "bank_statement_line",
      entityId: updated.id,
      syndicateId: sid,
      details: `${updated.status}${parsed.data.note ? ` — ${parsed.data.note}` : ""}`,
    });
    res.json({ data: updated });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

/** Reconciliation overview of one bank account. */
router.get("/treasury/accounts/:id/reconciliation", requireAuth, requireTreasuryRead, async (req, res) => {
  const sid = req.user!.syndicateId!;
  const accountId = String(req.params.id);
  try {
    const [account] = await db
      .select({ id: treasuryAccountsTable.id, kind: treasuryAccountsTable.kind })
      .from(treasuryAccountsTable)
      .where(and(eq(treasuryAccountsTable.id, accountId), eq(treasuryAccountsTable.syndicateId, sid)));
    if (!account) throw new FinanceError(404, "ACCOUNT_NOT_FOUND", "Compte introuvable");
    const [lineStats, ledgerBalance, unreconciled] = await Promise.all([
      db
        .select({
          status: bankStatementLinesTable.status,
          n: sql<number>`COUNT(*)::int`,
          total: sql<string>`COALESCE(SUM(${bankStatementLinesTable.amount}), 0)`,
        })
        .from(bankStatementLinesTable)
        .where(and(eq(bankStatementLinesTable.accountId, accountId), eq(bankStatementLinesTable.syndicateId, sid)))
        .groupBy(bankStatementLinesTable.status),
      accountBalanceCents(db, accountId),
      db.execute<Record<string, unknown>>(sql`
        SELECT le.id, le.entry_number, le.entry_date::text AS entry_date, le.direction, le.amount, le.label,
               le.amount - COALESCE(m.matched, 0) AS remaining
        FROM ledger_entries le
        LEFT JOIN (SELECT ledger_entry_id, SUM(amount) AS matched FROM reconciliation_matches GROUP BY ledger_entry_id) m
          ON m.ledger_entry_id = le.id
        WHERE le.syndicate_id = ${sid} AND le.account_id = ${accountId}
          AND le.amount - COALESCE(m.matched, 0) > 0
        ORDER BY le.entry_date DESC
        LIMIT 100
      `),
    ]);
    const statementTotal = lineStats.filter((s) => s.status !== "ignored").reduce((s, r) => s + toCents(r.total), 0);
    res.json({
      data: {
        ledgerBalance: fromCents(ledgerBalance),
        statementTotal: fromCents(statementTotal),
        lines: Object.fromEntries(lineStats.map((s) => [s.status, s.n])),
        unreconciledEntries: unreconciled,
      },
    });
  } catch (err) {
    sendFinanceError(res, req, err);
  }
});

export default router;
