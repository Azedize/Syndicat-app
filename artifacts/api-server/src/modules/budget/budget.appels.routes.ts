// budget: appels endpoints (mounted by budget.routes.ts, in order).
import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  appelsDeFondsTable,
  lotsTable,
  buildingsTable,
  membersTable,
  syndicatesTable,
  usersTable,
  storageObjectsTable,
  appelPaymentsTable,
} from "@workspace/db/schema";
import {
  eq,
  and,
  desc,
  sql,
  inArray,
} from "drizzle-orm";
import { chargesOfPersonSql, isDebtorOfCharge, memberIdsOf } from "../../lib/units.js";
import { requireAuth, requireFinanceAccess } from "../../middleware/auth.js";
import { assertUserCanAccessBuilding } from "../../lib/scope.js";
import { nextSequenceNumber } from "../../lib/sequences.js";
import { localToday } from "../../lib/charge-time.js";
import { createAlert, notifyUser } from "../../lib/notify.js";
import {
  FinanceError,
  fromCents,
  lockAccount,
  postEntry,
  recordOperation,
  sendFinanceError,
  settlementStatus,
  toCents,
  today,
  uniqueViolation,
  moneyDiff,
} from "../../lib/treasury.js";
import { serverAuditLog } from "../../lib/audit.js";
import { resolveOwnerUserId, PAYABLE_STATUSES, APPEL_LEDGER_CATEGORY } from "./budget.service.js";
import { submitPaymentSchema } from "./budget.validation.js";
import { isSyndicateScoped, CHARGE_READ_ROLES, resolveSupervisedChargeSyndicate } from "./budget.access.js";

const router = Router();

// ─── Appels de Fonds ──────────────────────────────────────────────────────

// GET /appels-de-fonds
// SECURITY: Admin path scoped to syndicate; buildingId param verified before use
router.get("/appels-de-fonds", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { buildingId, lotId, status, period, ownerId } = req.query as Record<
      string,
      string
    >;

    if (
      !CHARGE_READ_ROLES.includes(
        user.role as (typeof CHARGE_READ_ROLES)[number],
      )
    ) {
      return void res.status(403).json({ error: "Accès refusé" });
    }

    const conditions: any[] = [];
    let scopedSyndicateId: string | null = null;

    if (user.role === "super_admin") {
      scopedSyndicateId = await resolveSupervisedChargeSyndicate(req);
    }

    // Syndicate admin MUST have syndicateId in JWT — never fall through to global scope
    if (isSyndicateScoped(user.role) && !user.syndicateId) {
      return void res
        .status(403)
        .json({ error: "Syndicat non défini dans le token" });
    }
    if (isSyndicateScoped(user.role)) {
      scopedSyndicateId = user.syndicateId!;
    }

    if (buildingId) {
      if (user.role === "super_admin") {
        const [bld] = await db
          .select({ syndicateId: buildingsTable.syndicateId })
          .from(buildingsTable)
          .where(
            and(
              eq(buildingsTable.id, buildingId),
              eq(buildingsTable.syndicateId, scopedSyndicateId!),
            ),
          )
          .limit(1);
        if (!bld) {
          return void res.status(404).json({ error: "Immeuble introuvable" });
        }
      } else {
        await assertUserCanAccessBuilding(user, buildingId);
        // For syndicate-team roles, verify the buildingId belongs to their syndicate
        if (isSyndicateScoped(user.role)) {
          const [bld] = await db
            .select({ syndicateId: buildingsTable.syndicateId })
            .from(buildingsTable)
            .where(eq(buildingsTable.id, buildingId))
            .limit(1);
          if (!bld || bld.syndicateId !== user.syndicateId) {
            return void res
              .status(403)
              .json({ error: "Accès refusé à cet immeuble" });
          }
        }
      }
      conditions.push(eq(appelsDeFondsTable.buildingId, buildingId));
    } else if (scopedSyndicateId) {
      // Super Admin and syndicate-team views must always be syndicate-scoped.
      const syndicateBuildings = await db
        .select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.syndicateId, scopedSyndicateId));
      const buildingIds = syndicateBuildings.map((b) => b.id);
      if (buildingIds.length === 0) {
        return void res.json({
          data: [],
          total: 0,
          stats: { total: 0, collected: 0, pending: 0, overdue: 0 },
        });
      }
      conditions.push(inArray(appelsDeFondsTable.buildingId, buildingIds));
    }

    if (lotId) {
      const [lot] = await db
        .select({
          buildingId: lotsTable.buildingId,
          syndicateId: buildingsTable.syndicateId,
        })
        .from(lotsTable)
        .innerJoin(buildingsTable, eq(buildingsTable.id, lotsTable.buildingId))
        .where(eq(lotsTable.id, lotId))
        .limit(1);
      if (!lot) return void res.status(404).json({ error: "Lot introuvable" });
      if (buildingId && lot.buildingId !== buildingId) {
        return void res
          .status(400)
          .json({ error: "Le lot n'appartient pas à cet immeuble" });
      }
      if (scopedSyndicateId && lot.syndicateId !== scopedSyndicateId) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
      if (user.role === "member") {
        await assertUserCanAccessBuilding(user, lot.buildingId);
      }
      conditions.push(eq(appelsDeFondsTable.lotId, lotId));
    }

    if (period) conditions.push(eq(appelsDeFondsTable.period, period));
    if (ownerId) conditions.push(eq(appelsDeFondsTable.ownerId, ownerId));

    // Members see the calls issued to them, and the calls of a lot they
    // owned (any share) when the call was issued — co-owners included,
    // previous owners keep their own history.
    if (user.role === "member") {
      if (!user.syndicateId) {
        return void res
          .status(403)
          .json({ error: "Syndicat non défini dans le token" });
      }
      conditions.push(chargesOfPersonSql(await memberIdsOf(user)));
    }

    // The totals describe the whole account: a status filter only narrows the list below them.
    const statsWhere = conditions.length ? and(...conditions) : undefined;
    if (status) conditions.push(eq(appelsDeFondsTable.status, status));
    const where = conditions.length ? and(...conditions) : undefined;

    const [rows, [stats]] = await Promise.all([
      db
        .select()
        .from(appelsDeFondsTable)
        .where(where)
        .orderBy(desc(appelsDeFondsTable.createdAt)),
      db
        // Amounts come from validated payments (amount_paid), so partial
        // payments count for what was really received. Cancelled calls are
        // not owed and are excluded.
        .select({
          total: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount}) FILTER (WHERE ${appelsDeFondsTable.status} <> 'cancelled'), 0)`,
          collected: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amountPaid}), 0)`,
          pending: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount} - ${appelsDeFondsTable.amountPaid}) FILTER (WHERE ${appelsDeFondsTable.status} IN ('pending', 'pending_validation', 'partially_paid', 'rejected')), 0)`,
          overdue: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount} - ${appelsDeFondsTable.amountPaid}) FILTER (WHERE ${appelsDeFondsTable.status} = 'overdue'), 0)`,
        })
        .from(appelsDeFondsTable)
        .where(statsWhere),
    ]);

    // Human-readable context for the mobile cards (lot number instead of an
    // id, building, owner) and the amount still due after partial payments.
    const lotIds = [...new Set(rows.map((r) => r.lotId))];
    const buildingIds = [...new Set(rows.map((r) => r.buildingId))];
    const ownerIds = [...new Set(rows.map((r) => r.ownerId).filter((v): v is string => !!v))];
    const [lotRows, buildingRows, ownerRows] = await Promise.all([
      lotIds.length
        ? db.select({ id: lotsTable.id, number: lotsTable.number }).from(lotsTable).where(inArray(lotsTable.id, lotIds))
        : [],
      buildingIds.length
        ? db.select({ id: buildingsTable.id, name: buildingsTable.name }).from(buildingsTable).where(inArray(buildingsTable.id, buildingIds))
        : [],
      ownerIds.length && user.role !== "member"
        ? db.select({ id: membersTable.id, name: membersTable.name }).from(membersTable).where(inArray(membersTable.id, ownerIds))
        : [],
    ]);
    const lotNumber = new Map(lotRows.map((l) => [l.id, l.number]));
    const buildingName = new Map(buildingRows.map((b) => [b.id, b.name]));
    const ownerName = new Map(ownerRows.map((o) => [o.id, o.name]));
    // What was declared and awaits validation: a partial payment is less than the amount of the call.
    const awaitingIds = rows.filter((r) => r.status === "pending_validation").map((r) => r.id);
    const declaredRows = awaitingIds.length
      ? await db
          .select({ appelId: appelPaymentsTable.appelId, amount: appelPaymentsTable.amount })
          .from(appelPaymentsTable)
          .where(and(inArray(appelPaymentsTable.appelId, awaitingIds), eq(appelPaymentsTable.status, "pending")))
          .orderBy(desc(appelPaymentsTable.createdAt))
      : [];
    const declaredAmount = new Map<string, string>();
    for (const d of declaredRows) if (!declaredAmount.has(d.appelId)) declaredAmount.set(d.appelId, d.amount);
    const data = rows.map((r) => ({
      ...r,
      declaredAmount: declaredAmount.get(r.id) ?? null,
      lotNumber: lotNumber.get(r.lotId) ?? null,
      buildingName: buildingName.get(r.buildingId) ?? null,
      ownerName: r.ownerId ? (ownerName.get(r.ownerId) ?? null) : null,
      remaining: fromCents(Math.max(0, toCents(r.amount) - toCents(r.amountPaid))),
    }));

    res.json({ data, total: data.length, stats });
  } catch (e: any) {
    if (e?.status) return void res.status(e.status).json({ error: e.message });
    req.log.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /appels-de-fonds/:id/pay — Declare a payment (owner or admin).
// Each declaration is kept in appel_payments; a call may be settled in
// several partial payments. Nothing is credited until a treasurer validates.
router.put("/appels-de-fonds/:id/pay", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (
      user.role !== "super_admin" &&
      user.role !== "syndicate_admin" &&
      user.role !== "member"
    ) {
      return void res.status(403).json({ error: "Accès refusé" });
    }
    let supervisedSyndicateId: string | null = null;
    if (user.role === "super_admin") {
      supervisedSyndicateId = await resolveSupervisedChargeSyndicate(req);
    }
    if (isSyndicateScoped(user.role) && !user.syndicateId) {
      return void res
        .status(403)
        .json({ error: "Syndicat non défini dans le token" });
    }

    // Fetch the call-for-funds first to verify ownership
    const [appel] = await db
      .select()
      .from(appelsDeFondsTable)
      .where(eq(appelsDeFondsTable.id, String(req.params.id)));

    if (!appel) return void res.status(404).json({ error: "Not found" });

    const [appelBuilding] = await db
      .select({ syndicateId: buildingsTable.syndicateId })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, appel.buildingId))
      .limit(1);

    // Only Super Admin (supervised) and syndicate admins can submit for any
    // charge in scope. Members must match the owner identity.
    const isAdmin =
      user.role === "super_admin" || user.role === "syndicate_admin";

    if (isAdmin) {
      const expectedSyndicateId =
        user.role === "super_admin" ? supervisedSyndicateId : user.syndicateId;
      if (!appelBuilding || appelBuilding.syndicateId !== expectedSyndicateId) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
    }

    if (!isAdmin) {
      // The debtor: the person the call was issued to, or a co-owner of the
      // lot at issue time.
      const isOwner =
        appelBuilding?.syndicateId === user.syndicateId &&
        (await isDebtorOfCharge(user, appel.id));
      if (!isOwner) {
        return void res.status(403).json({
          error:
            "Vous ne pouvez soumettre un paiement que pour vos propres appels de fonds",
        });
      }
    }

    const parsed = submitPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json({
        error: parsed.error.issues[0]?.message ?? "Données de paiement invalides",
        code: "INVALID_PAYMENT",
      });
    }
    const { paymentMethod, proofUrl, notes, reference } = parsed.data;
    const syndicateId = appelBuilding?.syndicateId;
    if (!syndicateId) {
      return void res
        .status(409)
        .json({ error: "Immeuble sans syndicat : paiement impossible" });
    }

    // The proof must be a file uploaded to our private storage by this user
    // (or within the charge's syndicate) — never an arbitrary URL or another
    // tenant's object path.
    if (proofUrl) {
      const [proof] = await db
        .select({
          ownerId: storageObjectsTable.ownerId,
          syndicateId: storageObjectsTable.syndicateId,
        })
        .from(storageObjectsTable)
        .where(eq(storageObjectsTable.objectPath, proofUrl))
        .limit(1);
      const proofAllowed =
        !!proof &&
        (proof.ownerId === user.userId ||
          (!!proof.syndicateId && proof.syndicateId === syndicateId));
      if (!proofAllowed) {
        return void res.status(400).json({
          error:
            "Le justificatif doit être un fichier téléversé sur MIZAN par vous-même.",
          code: "PROOF_NOT_OWNED",
        });
      }
    }

    // Status transition + payment row in one transaction. The status
    // condition on the UPDATE makes concurrent declarations (double click,
    // retry) fail instead of creating two pending payments; the partial
    // unique index on appel_payments is the last line of defence.
    let result: { appel: typeof appelsDeFondsTable.$inferSelect; payment: typeof appelPaymentsTable.$inferSelect };
    try {
      result = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(appelsDeFondsTable)
          .set({
            status: "pending_validation",
            paymentMethod,
            proofUrl: proofUrl ?? null,
            notes: notes ?? null,
            rejectionReason: null,
          })
          .where(
            and(
              eq(appelsDeFondsTable.id, appel.id),
              inArray(appelsDeFondsTable.status, [...PAYABLE_STATUSES]),
            ),
          )
          .returning();
        if (!updated) {
          throw new FinanceError(
            409,
            "APPEL_NOT_PAYABLE",
            appel.status === "paid"
              ? "Cet appel de fonds est déjà réglé."
              : appel.status === "cancelled"
                ? "Cet appel de fonds est annulé."
                : "Un paiement est déjà en attente de validation pour cet appel.",
          );
        }
        const remaining = toCents(updated.amount) - toCents(updated.amountPaid);
        const amount = parsed.data.amount ?? fromCents(remaining);
        if (toCents(amount) > remaining) {
          throw new FinanceError(
            400,
            "AMOUNT_EXCEEDS_BALANCE",
            `Le montant déclaré dépasse le reste à payer (${fromCents(remaining)} MAD).`,
          );
        }
        const [payment] = await tx
          .insert(appelPaymentsTable)
          .values({
            syndicateId,
            appelId: appel.id,
            amount,
            method: paymentMethod,
            reference: reference ?? null,
            proofUrl: proofUrl ?? null,
            notes: notes ?? null,
            status: "pending",
            declaredBy: user.userId,
          })
          .returning();
        return { appel: updated, payment };
      });
    } catch (err) {
      if (uniqueViolation(err) !== null) {
        return void res.status(409).json({
          error: "Un paiement est déjà en attente de validation pour cet appel.",
          code: "APPEL_NOT_PAYABLE",
        });
      }
      throw err;
    }

    await serverAuditLog(req, {
      action: "PAYMENT_SUBMITTED",
      entity: "appel_de_fonds",
      entityId: appel.id,
      syndicateId,
      details: JSON.stringify({
        paymentId: result.payment.id,
        amount: result.payment.amount,
        period: appel.period,
        paymentMethod,
      }),
    });

    createAlert({
      key: "payment.toValidate",
      params: { amount: result.payment.amount, period: appel.period },
      type: "info",
      syndicateId,
      target: "admin",
    }).catch(() => {});

    res.json({
      data: result.appel,
      payment: result.payment,
      message: "Paiement soumis, en attente de validation",
    });
  } catch (e) {
    sendFinanceError(res, req, e, "Server error");
  }
});

const validatePaymentSchema = z
  .object({
    approve: z.boolean(),
    rejectionReason: z.string().trim().max(500).optional(),
    // Treasury account credited; default: the syndicate's default bank
    // account (cash box for espèces).
    accountId: z.string().optional(),
  })
  .refine((d) => d.approve || !!d.rejectionReason, {
    message: "Un motif de rejet est obligatoire",
    path: ["rejectionReason"],
  });

// PUT /appels-de-fonds/:id/validate — Treasurer approves or rejects the payment under review
router.put(
  "/appels-de-fonds/:id/validate",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    try {
      const user = req.user!;
      const parsed = validatePaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        return void res.status(400).json({
          error: parsed.error.issues[0]?.message ?? "Données invalides",
          code: "INVALID_VALIDATION",
        });
      }
      const { approve, rejectionReason, accountId } = parsed.data;

      const [appel] = await db
        .select()
        .from(appelsDeFondsTable)
        .where(eq(appelsDeFondsTable.id, String(req.params.id)));
      if (!appel) return void res.status(404).json({ error: "Not found" });

      // Derive syndicate via building for isolation and audit
      const [building] = await db
        .select({ syndicateId: buildingsTable.syndicateId })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, appel.buildingId));

      if (!building?.syndicateId || building.syndicateId !== user.syndicateId) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
      const syndicateId = building.syndicateId;

      // A decision on a call that is no longer under review is a state
      // conflict (already processed by someone else, double click, retry).
      if (appel.status !== "pending_validation") {
        return void res.status(409).json({
          error: "Cet appel n'est pas en attente de validation",
          code: "PAYMENT_ALREADY_PROCESSED",
        });
      }

      const now = new Date();
      const dateStr = today();

      // One atomic unit: payment decision, call settlement, receipt number,
      // journal entry and operation register either all commit or all roll
      // back. The appel row is locked, so two treasurers validating at the
      // same time are serialized and the second one gets a 409.
      const outcome = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(appelsDeFondsTable)
          .where(eq(appelsDeFondsTable.id, appel.id))
          .for("update");
        if (!locked || locked.status !== "pending_validation") {
          throw new FinanceError(409, "PAYMENT_ALREADY_PROCESSED", "Paiement déjà traité");
        }
        const [payment] = await tx
          .select()
          .from(appelPaymentsTable)
          .where(
            and(
              eq(appelPaymentsTable.appelId, appel.id),
              eq(appelPaymentsTable.status, "pending"),
            ),
          )
          .for("update");
        if (!payment) {
          throw new FinanceError(409, "NO_PENDING_PAYMENT", "Aucun paiement en attente pour cet appel");
        }

        if (!approve) {
          const [rejected] = await tx
            .update(appelPaymentsTable)
            .set({
              status: "rejected",
              reviewedBy: user.userId,
              reviewedAt: now,
              rejectionReason: rejectionReason!,
            })
            .where(eq(appelPaymentsTable.id, payment.id))
            .returning();
          const [row] = await tx
            .update(appelsDeFondsTable)
            .set({
              // A call with earlier validated payments stays partially paid.
              status: toCents(locked.amountPaid) > 0 ? "partially_paid" : "rejected",
              rejectionReason: rejectionReason!,
              validatedBy: user.userId,
              validatedAt: now,
            })
            .where(eq(appelsDeFondsTable.id, appel.id))
            .returning();
          return { appel: row, payment: rejected, entry: null, receipt: undefined as string | undefined };
        }

        // Enforce: a payment cannot be approved without proof of payment.
        if (!payment.proofUrl) {
          throw new FinanceError(
            400,
            "PROOF_REQUIRED",
            "Validation refusée : une pièce justificative est obligatoire avant d'approuver un paiement.",
          );
        }
        const paidCents = toCents(locked.amountPaid) + toCents(payment.amount);
        if (paidCents > toCents(locked.amount)) {
          throw new FinanceError(409, "AMOUNT_EXCEEDS_BALANCE", "Le paiement dépasse le reste à payer de l'appel");
        }
        const account = await lockAccount(tx, syndicateId, {
          accountId,
          preferKind: payment.method === "especes" ? "cash" : "bank",
        });
        const receipt = await nextSequenceNumber(tx, syndicateId, "REC", 6);
        const entry = await postEntry(tx, {
          syndicateId,
          account,
          direction: "in",
          amount: payment.amount,
          entryDate: dateStr,
          category: APPEL_LEDGER_CATEGORY[locked.type ?? "charges_courantes"] ?? "charges_copropriete",
          label: `Appel de fonds ${locked.period} — Reçu ${receipt}`,
          reference: receipt,
          sourceType: "appel_payment",
          sourceId: payment.id,
          buildingId: locked.buildingId,
          proofUrl: payment.proofUrl,
          createdBy: user.userId,
        });
        // transactions.member_id references users.id, whereas appel.ownerId
        // references members.id — resolve the owner's user account (same
        // syndicate) instead of inserting a dangling foreign key.
        const payerUserId = await resolveOwnerUserId(tx, locked.ownerId, syndicateId);
        await recordOperation(tx, {
          syndicateId,
          type: "cotisation",
          amount: payment.amount,
          label: `Appel de fonds ${locked.period} — Reçu ${receipt}`,
          date: dateStr,
          memberId: payerUserId,
          proofUrl: payment.proofUrl,
          ledgerEntryId: entry.id,
        });
        const [validated] = await tx
          .update(appelPaymentsTable)
          .set({
            status: "validated",
            reviewedBy: user.userId,
            reviewedAt: now,
            accountId: account.id,
            ledgerEntryId: entry.id,
            receiptNumber: receipt,
          })
          .where(eq(appelPaymentsTable.id, payment.id))
          .returning();
        const fullyPaid = paidCents >= toCents(locked.amount);
        const [row] = await tx
          .update(appelsDeFondsTable)
          .set({
            amountPaid: fromCents(paidCents),
            status: settlementStatus(toCents(locked.amount), paidCents, locked.dueDate),
            paidDate: fullyPaid ? dateStr : locked.paidDate,
            receiptNumber: receipt,
            rejectionReason: null,
            validatedBy: user.userId,
            validatedAt: now,
          })
          .where(eq(appelsDeFondsTable.id, appel.id))
          .returning();
        return { appel: row, payment: validated, entry, receipt };
      });

      await serverAuditLog(req, {
        action: approve ? "payment_approved" : "payment_rejected",
        entity: "appel_de_fonds",
        entityId: appel.id,
        syndicateId,
        details: JSON.stringify({
          paymentId: outcome.payment.id,
          amount: outcome.payment.amount,
          period: appel.period,
          paymentMethod: outcome.payment.method,
          receiptNumber: outcome.receipt,
          ledgerEntry: outcome.entry?.entryNumber,
          rejectionReason: approve ? null : rejectionReason,
        }),
      });

      // The owner learns the outcome in their notification center (+ push).
      const ownerUserId = await resolveOwnerUserId(db, appel.ownerId, syndicateId);
      const remaining = fromCents(toCents(outcome.appel.amount) - toCents(outcome.appel.amountPaid));
      void notifyUser(ownerUserId, approve
        ? {
            key: outcome.appel.status === "paid" ? "payment.validated" : "payment.validatedPartial",
            params: { amount: outcome.payment.amount, period: appel.period, receipt: outcome.receipt, remaining },
            type: "success",
            syndicateId,
          }
        : {
            key: "payment.rejected",
            params: { period: appel.period, reason: rejectionReason },
            type: "warning",
            syndicateId,
          });

      res.json({
        data: outcome.appel,
        payment: outcome.payment,
        ledgerEntry: outcome.entry,
        message: approve
          ? `Paiement validé. Reçu: ${outcome.receipt}`
          : "Paiement rejeté. Le propriétaire sera informé.",
      });
    } catch (e) {
      sendFinanceError(res, req, e, "Server error");
    }
  },
);

// GET /appels-de-fonds/:id/payments — payment history of a call (owner or finance team)
router.get("/appels-de-fonds/:id/payments", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const [appel] = await db
      .select({ id: appelsDeFondsTable.id, ownerId: appelsDeFondsTable.ownerId, syndicateId: buildingsTable.syndicateId })
      .from(appelsDeFondsTable)
      .innerJoin(buildingsTable, eq(buildingsTable.id, appelsDeFondsTable.buildingId))
      .where(eq(appelsDeFondsTable.id, String(req.params.id)));
    if (!appel || !user.syndicateId || appel.syndicateId !== user.syndicateId) {
      return void res.status(404).json({ error: "Appel de fonds introuvable" });
    }
    const financeReader = ["syndicate_admin", "treasurer", "president", "committee_member"].includes(user.role);
    if (!financeReader) {
      if (user.role !== "member" || !(await isDebtorOfCharge(user, appel.id))) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
    }
    const rows = await db
      .select({
        id: appelPaymentsTable.id,
        amount: appelPaymentsTable.amount,
        method: appelPaymentsTable.method,
        reference: appelPaymentsTable.reference,
        proofUrl: appelPaymentsTable.proofUrl,
        notes: appelPaymentsTable.notes,
        status: appelPaymentsTable.status,
        rejectionReason: appelPaymentsTable.rejectionReason,
        receiptNumber: appelPaymentsTable.receiptNumber,
        reviewedAt: appelPaymentsTable.reviewedAt,
        createdAt: appelPaymentsTable.createdAt,
      })
      .from(appelPaymentsTable)
      .where(eq(appelPaymentsTable.appelId, appel.id))
      .orderBy(desc(appelPaymentsTable.createdAt));
    res.json({ data: rows });
  } catch (e) {
    sendFinanceError(res, req, e, "Server error");
  }
});

// POST /appels-de-fonds/:id/cancel — cancel an unpaid call (kept for history)
router.post(
  "/appels-de-fonds/:id/cancel",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    try {
      const parsed = z.object({ reason: z.string().trim().min(3).max(500) }).strict().safeParse(req.body);
      if (!parsed.success) {
        return void res.status(400).json({ error: "Un motif d'annulation est obligatoire", code: "REASON_REQUIRED" });
      }
      const user = req.user!;
      const [appel] = await db
        .select({ id: appelsDeFondsTable.id, status: appelsDeFondsTable.status, period: appelsDeFondsTable.period, syndicateId: buildingsTable.syndicateId })
        .from(appelsDeFondsTable)
        .innerJoin(buildingsTable, eq(buildingsTable.id, appelsDeFondsTable.buildingId))
        .where(eq(appelsDeFondsTable.id, String(req.params.id)));
      if (!appel || appel.syndicateId !== user.syndicateId) {
        return void res.status(404).json({ error: "Appel de fonds introuvable" });
      }
      // Only a call with nothing paid and nothing under review can be cancelled;
      // a paid amount must first be reversed in the journal.
      const [row] = await db
        .update(appelsDeFondsTable)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          cancelledBy: user.userId,
          cancellationReason: parsed.data.reason,
        })
        .where(
          and(
            eq(appelsDeFondsTable.id, appel.id),
            inArray(appelsDeFondsTable.status, ["pending", "overdue", "rejected"]),
            eq(appelsDeFondsTable.amountPaid, "0"),
          ),
        )
        .returning();
      if (!row) {
        return void res.status(409).json({
          error: "Seul un appel sans paiement validé ni en attente peut être annulé.",
          code: "APPEL_NOT_CANCELLABLE",
        });
      }
      await serverAuditLog(req, {
        action: "APPEL_CANCELLED",
        entity: "appel_de_fonds",
        entityId: appel.id,
        syndicateId: appel.syndicateId ?? undefined,
        details: `${appel.period} — ${parsed.data.reason}`,
      });
      res.json({ data: row, message: "Appel de fonds annulé" });
    } catch (e) {
      sendFinanceError(res, req, e, "Server error");
    }
  },
);

// GET /appels-de-fonds/:id/receipt — Generate and stream a PDF payment receipt
// Access: admin (any) or the owner of the appel. Also accepts a ?token= query param
// so mobile apps can open the URL directly in Linking.openURL without CORS issues.
router.get("/appels-de-fonds/:id/receipt", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (
      user.role !== "super_admin" &&
      user.role !== "syndicate_admin" &&
      user.role !== "treasurer" &&
      user.role !== "member"
    ) {
      return void res.status(403).json({ error: "Accès refusé" });
    }
    let supervisedSyndicateId: string | null = null;
    if (user.role === "super_admin") {
      supervisedSyndicateId = await resolveSupervisedChargeSyndicate(req);
    }

    const [appel] = await db
      .select()
      .from(appelsDeFondsTable)
      .where(eq(appelsDeFondsTable.id, String(req.params.id)));
    if (!appel) return void res.status(404).json({ error: "Not found" });

    if (isSyndicateScoped(user.role)) {
      if (!user.syndicateId) {
        return void res
          .status(403)
          .json({ error: "Syndicat non défini dans le token" });
      }
      const [buildingScope] = await db
        .select({ syndicateId: buildingsTable.syndicateId })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, appel.buildingId))
        .limit(1);
      if (!buildingScope || buildingScope.syndicateId !== user.syndicateId) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
    }
    if (user.role === "super_admin") {
      const [buildingScope] = await db
        .select({ syndicateId: buildingsTable.syndicateId })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, appel.buildingId))
        .limit(1);
      if (
        !buildingScope ||
        buildingScope.syndicateId !== supervisedSyndicateId
      ) {
        return void res.status(403).json({ error: "Accès refusé" });
      }
    }

    // Access check: admin in same syndicate, or the owner
    const isAdmin =
      user.role === "super_admin" ||
      user.role === "syndicate_admin" ||
      user.role === "treasurer";
    if (!isAdmin) {
      if (!(await isDebtorOfCharge(user, appel.id))) return void res.status(403).json({ error: "Accès refusé" });
    }

    // One receipt per validated payment (?paymentId=…, default: the latest).
    // Calls settled before the payment history existed keep their own receipt.
    const requestedPaymentId =
      typeof req.query.paymentId === "string" ? req.query.paymentId : null;
    const [payment] = await db
      .select()
      .from(appelPaymentsTable)
      .where(
        and(
          eq(appelPaymentsTable.appelId, appel.id),
          eq(appelPaymentsTable.status, "validated"),
          ...(requestedPaymentId ? [eq(appelPaymentsTable.id, requestedPaymentId)] : []),
        ),
      )
      .orderBy(desc(appelPaymentsTable.reviewedAt))
      .limit(1);
    const receipt = payment
      ? {
          number: payment.receiptNumber!,
          date: (payment.reviewedAt ?? new Date()).toISOString().split("T")[0],
          amount: payment.amount,
          method: payment.method,
          reference: payment.reference ?? null,
          declaredBy: payment.declaredBy,
        }
      : !requestedPaymentId && appel.status === "paid" && appel.receiptNumber
        ? {
            number: appel.receiptNumber,
            date: appel.paidDate ?? localToday(),
            amount: appel.amount,
            method: appel.paymentMethod,
            reference: null as string | null,
            declaredBy: null as string | null,
          }
        : null;
    if (!receipt) {
      return void res.status(400).json({
        error: "Reçu disponible uniquement pour les paiements validés",
      });
    }

    // Fetch enrichment data
    const [[building], [lot]] = await Promise.all([
      db
        .select({
          address: buildingsTable.address,
          name: buildingsTable.name,
          syndicateId: buildingsTable.syndicateId,
        })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, appel.buildingId))
        .limit(1),
      db
        .select({ number: lotsTable.number })
        .from(lotsTable)
        .where(eq(lotsTable.id, appel.lotId))
        .limit(1),
    ]);

    // The person who declared the payment (from the payment record).
    const [payer] = receipt.declaredBy
      ? await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, receipt.declaredBy)).limit(1)
      : [undefined];
    const longDate = (iso: string) => {
      const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
      return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    };
    const money2 = (v: string | number | null | undefined) =>
      `${Number(v ?? 0).toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
    const remainingNow = Math.max(0, moneyDiff(appel.amount, appel.amountPaid));

    const [syndicate] = building?.syndicateId
      ? await db
          .select({ name: syndicatesTable.name })
          .from(syndicatesTable)
          .where(eq(syndicatesTable.id, building.syndicateId))
          .limit(1)
      : [undefined];

    // Dynamic pdfmake import (same pattern as documentPdf.ts)
    const PdfPrinter = (await import("pdfmake")).default as any;
    const DEJAVU_DIR = "/usr/share/fonts/truetype/dejavu";
    const { existsSync } = await import("fs");
    const fonts: Record<string, unknown> = {
      Helvetica: {
        normal: "Helvetica",
        bold: "Helvetica-Bold",
        italics: "Helvetica-Oblique",
        bolditalics: "Helvetica-BoldOblique",
      },
    };
    if (existsSync(`${DEJAVU_DIR}/DejaVuSans.ttf`)) {
      fonts.DejaVu = {
        normal: `${DEJAVU_DIR}/DejaVuSans.ttf`,
        bold: existsSync(`${DEJAVU_DIR}/DejaVuSans-Bold.ttf`)
          ? `${DEJAVU_DIR}/DejaVuSans-Bold.ttf`
          : `${DEJAVU_DIR}/DejaVuSans.ttf`,
        italics: `${DEJAVU_DIR}/DejaVuSans.ttf`,
        bolditalics: existsSync(`${DEJAVU_DIR}/DejaVuSans-Bold.ttf`)
          ? `${DEJAVU_DIR}/DejaVuSans-Bold.ttf`
          : `${DEJAVU_DIR}/DejaVuSans.ttf`,
      };
    }
    const FONT = fonts.DejaVu ? "DejaVu" : "Helvetica";
    const printer = new PdfPrinter(fonts);

    const amountFmt = Number(receipt.amount ?? 0).toLocaleString("fr-MA", {
      minimumFractionDigits: 2,
    });
    const payMethodLabels: Record<string, string> = {
      virement: "Virement bancaire",
      cheque: "Chèque",
      especes: "Espèces",
      online: "Paiement en ligne",
    };
    const typeLabels: Record<string, string> = {
      charges_courantes: "Charges courantes",
      fonds_reserve: "Fonds de réserve",
      appel_special: "Appel spécial",
    };

    const docDef = {
      pageSize: "A4",
      pageMargins: [40, 60, 40, 60],
      defaultStyle: { font: FONT, fontSize: 10 },
      info: { title: `Reçu ${receipt.number}`, author: syndicate?.name ?? "MIZAN" },
      footer: (page: number, pages: number) => ({
        columns: [
          { text: `Reçu ${receipt.number} · ${syndicate?.name ?? ""}`, fontSize: 7, color: "#94a3b8", margin: [40, 20, 0, 0] },
          { text: `${page} / ${pages}`, fontSize: 7, color: "#94a3b8", alignment: "right", margin: [0, 20, 40, 0] },
        ],
      }),
      content: [
        // Header band
        {
          canvas: [
            { type: "rect", x: 0, y: 0, w: 595.28, h: 112, color: "#1e40af" },
          ],
          absolutePosition: { x: 0, y: 0 },
        },
        {
          text: syndicate?.name ?? "Syndicat de Copropriété",
          style: { font: FONT, fontSize: 16, bold: true, color: "#ffffff" },
          margin: [0, 0, 0, 4],
        },
        {
          text: "REÇU DE PAIEMENT",
          style: { font: FONT, fontSize: 12, color: "#bfdbfe" },
          margin: [0, 0, 0, 44],
        },
        // Receipt number + date
        {
          columns: [
            {
              stack: [
                {
                  text: "Référence du reçu",
                  style: { font: FONT, fontSize: 8, color: "#64748b" },
                  margin: [0, 0, 0, 4],
                },
                {
                  text: receipt.number,
                  style: {
                    font: FONT,
                    fontSize: 14,
                    bold: true,
                    color: "#1e40af",
                  },
                },
              ],
            },
            {
              stack: [
                {
                  text: "Date de paiement",
                  style: { font: FONT, fontSize: 8, color: "#64748b" },
                  margin: [0, 0, 0, 4],
                  alignment: "right",
                },
                {
                  text: longDate(receipt.date),
                  style: { font: FONT, fontSize: 12, bold: true },
                  alignment: "right",
                },
              ],
            },
          ],
          margin: [0, 0, 0, 20],
        },
        // Amount box
        {
          table: {
            widths: ["*"],
            body: [
              [
                {
                  stack: [
                    {
                      text: "Montant payé",
                      style: {
                        font: FONT,
                        fontSize: 9,
                        color: "#64748b",
                        alignment: "center",
                      },
                      margin: [0, 0, 0, 8],
                    },
                    {
                      text: `${amountFmt} MAD`,
                      style: {
                        font: FONT,
                        fontSize: 26,
                        bold: true,
                        color: "#1e40af",
                        alignment: "center",
                      },
                    },
                  ],
                  fillColor: "#eff6ff",
                  margin: [0, 16, 0, 16],
                  border: [false, false, false, false],
                },
              ],
            ],
          },
          margin: [0, 0, 0, 20],
        },
        // Details table
        {
          table: {
            widths: [160, "*"],
            body: [
              [
                {
                  text: "Période",
                  style: {
                    font: FONT,
                    fontSize: 9,
                    bold: true,
                    color: "#475569",
                  },
                  border: [false, false, false, true],
                  borderColor: ["", "", "", "#e2e8f0"],
                },
                {
                  text: appel.period,
                  border: [false, false, false, true],
                  borderColor: ["", "", "", "#e2e8f0"],
                },
              ],
              [
                {
                  text: "Type de charge",
                  style: {
                    font: FONT,
                    fontSize: 9,
                    bold: true,
                    color: "#475569",
                  },
                  border: [false, false, false, true],
                  borderColor: ["", "", "", "#e2e8f0"],
                },
                {
                  text:
                    typeLabels[String(appel.type ?? "")] ?? appel.type ?? "—",
                  border: [false, false, false, true],
                  borderColor: ["", "", "", "#e2e8f0"],
                },
              ],
              [
                {
                  text: "Mode de paiement",
                  style: {
                    font: FONT,
                    fontSize: 9,
                    bold: true,
                    color: "#475569",
                  },
                  border: [false, false, false, true],
                  borderColor: ["", "", "", "#e2e8f0"],
                },
                {
                  text:
                    payMethodLabels[String(receipt.method ?? "")] ??
                    receipt.method ??
                    "—",
                  border: [false, false, false, true],
                  borderColor: ["", "", "", "#e2e8f0"],
                },
              ],
              ...([
                [ "Payé par", payer?.name ],
                [ "Référence du paiement", receipt.reference ],
                [ "Montant de l'appel", money2(appel.amount) ],
                [ "Reste dû à l'émission du reçu", money2(remainingNow) ],
              ] as Array<[string, string | null | undefined]>)
                .filter(([, v]) => v)
                .map(([label, value]) => [
                  {
                    text: label,
                    style: { font: FONT, fontSize: 9, bold: true, color: "#475569" },
                    border: [false, false, false, true],
                    borderColor: ["", "", "", "#e2e8f0"],
                  },
                  { text: String(value), border: [false, false, false, true], borderColor: ["", "", "", "#e2e8f0"] },
                ]),
              [
                {
                  text: "Lot",
                  style: {
                    font: FONT,
                    fontSize: 9,
                    bold: true,
                    color: "#475569",
                  },
                  border: [false, false, false, true],
                  borderColor: ["", "", "", "#e2e8f0"],
                },
                {
                  text: lot?.number ? `Lot ${lot.number}` : "—",
                  border: [false, false, false, true],
                  borderColor: ["", "", "", "#e2e8f0"],
                },
              ],
              [
                {
                  text: "Immeuble",
                  style: {
                    font: FONT,
                    fontSize: 9,
                    bold: true,
                    color: "#475569",
                  },
                  border: [false, false, false, false],
                },
                {
                  text: building?.name
                    ? `${building.name}${building.address ? ` — ${building.address}` : ""}`
                    : "—",
                  border: [false, false, false, false],
                },
              ],
            ],
          },
          layout: {
            paddingTop: () => 8,
            paddingBottom: () => 8,
            paddingLeft: () => 4,
            paddingRight: () => 4,
          },
          margin: [0, 0, 0, 24],
        },
        // Footer
        {
          text: "Ce reçu constitue la preuve du paiement de votre appel de fonds. Conservez-le pour vos archives.",
          style: { font: FONT, fontSize: 8, color: "#94a3b8", italics: true },
          alignment: "center",
        },
        {
          text: `Généré le ${longDate(new Date().toISOString())} par MIZAN`,
          style: { font: FONT, fontSize: 7, color: "#cbd5e1" },
          alignment: "center",
          margin: [0, 4, 0, 0],
        },
      ],
    };

    const pdfDoc = printer.createPdfKitDocument(docDef);
    const chunks: Buffer[] = [];
    pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdfDoc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="recu-${receipt.number}.pdf"`,
      );
      res.send(pdfBuffer);
    });
    pdfDoc.on("error", (err: Error) => {
      req.log.error(err);
      if (!res.headersSent)
        res.status(500).json({ error: "Erreur génération PDF" });
    });
    pdfDoc.end();
  } catch (e) {
    if ((e as any)?.status) {
      return void res
        .status((e as any).status)
        .json({ error: (e as any).message, code: (e as any).code });
    }
    req.log.error(e);
    if (!res.headersSent) res.status(500).json({ error: "Server error" });
  }
});

export default router;
