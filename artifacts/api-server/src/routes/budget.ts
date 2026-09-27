import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  budgetsTable,
  budgetLinesTable,
  appelsDeFondsTable,
  lotsTable,
  buildingsTable,
  membersTable,
  transactionsTable,
  debtEscalationsTable,
  syndicatesTable,
  alertsTable,
  caisseEntriesTable,
  usersTable,
  prestatairesTable,
  meetingsTable,
  storageObjectsTable,
  appelPaymentsTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql, sum, or, inArray } from "drizzle-orm";
import {
  requireAuth,
  requireAdmin,
  requireOperationalAccess,
  requireFinanceAccess,
  isSyndicateTeamRole,
} from "../middleware/auth.js";
import { assertUserCanAccessBuilding } from "../lib/scope.js";
import { nextSequenceNumber } from "../lib/sequences.js";
import { createAlert, notifyUser } from "../lib/notify.js";
import {
  FinanceError,
  amountSchema,
  fromCents,
  lockAccount,
  postEntry,
  recordOperation,
  sendFinanceError,
  settlementStatus,
  toCents,
  today,
  uniqueViolation,
} from "../lib/treasury.js";

/** True when the user is syndicate-scoped (not super_admin). Used for row-level scoping in finance queries. */
function isSyndicateScoped(role: string): boolean {
  return isSyndicateTeamRole(role as any);
}
import { serverAuditLog } from "../lib/audit.js";

const router = Router();

/** Statuses from which a co-owner may declare a payment. */
const PAYABLE_STATUSES = ["pending", "overdue", "rejected", "partially_paid"] as const;

/** Journal category of a call-for-funds payment, by call type. */
const APPEL_LEDGER_CATEGORY: Record<string, string> = {
  charges_courantes: "charges_copropriete",
  fonds_reserve: "fonds_reserve",
  appel_special: "appel_special",
};

// "online" is intentionally absent: there is no payment-gateway integration
// yet, so an "online" declaration would be indistinguishable from a claim.
const submitPaymentSchema = z.object({
  paymentMethod: z.enum(["virement", "cheque", "especes"], {
    errorMap: () => ({ message: "Mode de paiement invalide (virement, chèque ou espèces)" }),
  }),
  // Mandatory: a payment without proof can never be validated by the
  // treasurer, so accepting it would leave the co-owner in a dead end.
  proofUrl: z
    .string({ required_error: "Un justificatif de paiement est obligatoire." })
    .max(500)
    .refine((v) => v.startsWith("/objects/"), {
      message:
        "Le justificatif doit être téléchargé sur le serveur avant la soumission.",
    }),
  notes: z.string().max(1000).optional(),
  // Partial payment: defaults to the remaining balance of the call.
  amount: amountSchema.optional(),
  // Transfer reference or cheque number
  reference: z.string().trim().max(100).optional(),
});

const generateAppelsSchema = z.object({
  period: z
    .string()
    .regex(/^\d{4}(-(0[1-9]|1[0-2])|-Q[1-4])?$/, {
      message: "Période invalide (ex. '2026-05', '2026-Q1' ou '2026')",
    }),
  type: z
    .enum(["charges_courantes", "fonds_reserve", "appel_special"])
    .default("charges_courantes"),
});

function periodsPerYear(period: string): number {
  if (/^\d{4}-Q[1-4]$/.test(period)) return 4;
  if (/^\d{4}-\d{2}$/.test(period)) return 12;
  return 1;
}

/**
 * Splits an amount in cents proportionally to tantièmes using the
 * largest-remainder method, so the sum of the shares always equals the total
 * exactly (no centime is created or lost by rounding).
 */
export function splitByTantiemes(totalCents: number, tantiemes: number[]): number[] {
  const weight = tantiemes.reduce((s, t) => s + t, 0);
  if (weight <= 0) return tantiemes.map(() => 0);
  const raw = tantiemes.map((t) => (totalCents * t) / weight);
  const shares = raw.map(Math.floor);
  let remainder = totalCents - shares.reduce((s, v) => s + v, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    shares[i] += 1;
    remainder -= 1;
  }
  return shares;
}

/** Budget lifecycle: draft → submitted → approved (by AG) → closed. */
const PRE_APPROVAL_BUDGET_STATUSES: string[] = ["draft", "submitted"];
const APPROVED_BUDGET_STATUSES: string[] = ["approved", "closed"];

const budgetAmount = z
  .union([z.number(), z.string().regex(/^\d+(\.\d{1,2})?$/)])
  .transform((v) => Number(v).toFixed(2))
  .refine((v) => Number(v) >= 0, { message: "Montant invalide" });

const updateBudgetSchema = z.object({
  totalAmount: budgetAmount.optional(),
  chargesAmount: budgetAmount.optional(),
  fondsReserve: budgetAmount.optional(),
  status: z.enum(["draft", "submitted", "approved", "closed"]).optional(),
  meetingId: z.string().min(1).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

type OwnerLookupExecutor = Pick<typeof db, "select">;

/**
 * Maps an appel owner (members.id, or a users.id for legacy rows) to the
 * owner's user account in the same syndicate. Returns null when the owner has
 * no platform account — the transaction then stays unattributed rather than
 * violating the users foreign key.
 */
async function resolveOwnerUserId(
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

const CHARGE_READ_ROLES = [
  "super_admin",
  "syndicate_admin",
  "treasurer",
  "member",
] as const;

async function resolveSupervisedChargeSyndicate(req: any): Promise<string> {
  if (req.query.supervision !== "true") {
    throw Object.assign(
      new Error("La supervision est requise pour cibler un syndicat."),
      { status: 403, code: "SUPERVISION_REQUIRED" },
    );
  }

  const syndicateId =
    typeof req.query.syndicateId === "string"
      ? req.query.syndicateId.trim()
      : "";
  if (!syndicateId) {
    throw Object.assign(new Error("syndicateId est requis."), {
      status: 403,
      code: "SYNDICATE_TARGET_REQUIRED",
    });
  }

  const [syndicate] = await db
    .select({ id: syndicatesTable.id })
    .from(syndicatesTable)
    .where(eq(syndicatesTable.id, syndicateId))
    .limit(1);
  if (!syndicate) {
    throw Object.assign(new Error("Syndicat introuvable."), { status: 404 });
  }
  return syndicateId;
}

// GET /budgets — finance team (syndicate_admin + treasurer)
router.get("/budgets", requireAuth, requireFinanceAccess, async (req, res) => {
  try {
    const user = req.user!;

    // Mandatory syndicate scoping: syndicate_admin must have syndicateId in JWT
    if (isSyndicateScoped(user.role) && !user.syndicateId) {
      return void res
        .status(403)
        .json({ error: "Syndicat non défini dans le token" });
    }

    const { buildingId, year, status } = req.query as Record<string, string>;

    // Scope by syndicate: budgetsTable has no syndicateId — derive via building FK
    let allowedBuildingIds: string[] | null = null;
    if (isSyndicateScoped(user.role)) {
      const scopedBuildings = await db
        .select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.syndicateId, user.syndicateId!));
      allowedBuildingIds = scopedBuildings.map((b) => b.id);
      if (allowedBuildingIds.length === 0)
        return void res.json({ data: [], total: 0 });
    } else if (user.role === "super_admin" && req.query.syndicateId) {
      const scopedBuildings = await db
        .select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.syndicateId, req.query.syndicateId as string));
      allowedBuildingIds = scopedBuildings.map((b) => b.id);
      if (allowedBuildingIds.length === 0)
        return void res.json({ data: [], total: 0 });
    }

    // If a specific buildingId is requested by syndicate_admin, verify it's in scope
    if (buildingId && isSyndicateScoped(user.role)) {
      if (!allowedBuildingIds || !allowedBuildingIds.includes(buildingId)) {
        return void res
          .status(403)
          .json({ error: "Accès refusé à cet immeuble" });
      }
    }

    const conditions: any[] = [];
    if (allowedBuildingIds !== null) {
      conditions.push(inArray(budgetsTable.buildingId, allowedBuildingIds));
    }
    if (buildingId) conditions.push(eq(budgetsTable.buildingId, buildingId));
    if (year) conditions.push(eq(budgetsTable.year, parseInt(year)));
    if (status) conditions.push(eq(budgetsTable.status, status));

    const rows = await db
      .select()
      .from(budgetsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(budgetsTable.year));

    if (rows.length === 0) return void res.json({ data: [], total: 0 });

    // Batch-load lines and charge stats — avoids N+1 (was 2N queries, now 2)
    const budgetIds = rows.map((b) => b.id);
    const [allLines, allChargeStats] = await Promise.all([
      db
        .select()
        .from(budgetLinesTable)
        .where(inArray(budgetLinesTable.budgetId, budgetIds)),
      db
        .select({
          budgetId: appelsDeFondsTable.budgetId,
          collected: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amountPaid}), 0)`,
          pending: sql<number>`COALESCE(SUM(${appelsDeFondsTable.amount} - ${appelsDeFondsTable.amountPaid}) FILTER (WHERE ${appelsDeFondsTable.status} NOT IN ('paid', 'cancelled')), 0)`,
        })
        .from(appelsDeFondsTable)
        .where(inArray(appelsDeFondsTable.budgetId, budgetIds))
        .groupBy(appelsDeFondsTable.budgetId),
    ]);

    const linesByBudget = new Map<string, typeof allLines>();
    for (const line of allLines) {
      const arr = linesByBudget.get(line.budgetId) ?? [];
      arr.push(line);
      linesByBudget.set(line.budgetId, arr);
    }
    const chargeStatsByBudget = new Map(
      allChargeStats.map((s) => [s.budgetId, s]),
    );

    const enriched = rows.map((b) => ({
      ...b,
      lines: linesByBudget.get(b.id) ?? [],
      chargeStats: chargeStatsByBudget.get(b.id) ?? {
        collected: 0,
        pending: 0,
      },
    }));

    res.json({ data: enriched, total: enriched.length });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /budgets/:id — admin only
router.get(
  "/budgets/:id",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    try {
      const user = req.user!;

      const [budget] = await db
        .select()
        .from(budgetsTable)
        .where(eq(budgetsTable.id, String(req.params.id)));

      if (!budget)
        return void res.status(404).json({ error: "Budget not found" });

      // Syndicate isolation: budgetsTable has no syndicateId — derive via building FK
      if (isSyndicateScoped(user.role)) {
        if (!user.syndicateId)
          return void res
            .status(403)
            .json({ error: "Syndicat non défini dans le token" });
        const [bld] = await db
          .select({ syndicateId: buildingsTable.syndicateId })
          .from(buildingsTable)
          .where(eq(buildingsTable.id, budget.buildingId))
          .limit(1);
        if (!bld || bld.syndicateId !== user.syndicateId) {
          return void res.status(403).json({ error: "Accès refusé" });
        }
      }

      const lines = await db
        .select()
        .from(budgetLinesTable)
        .where(eq(budgetLinesTable.budgetId, budget.id));

      const appels = await db
        .select()
        .from(appelsDeFondsTable)
        .where(eq(appelsDeFondsTable.budgetId, budget.id))
        .orderBy(desc(appelsDeFondsTable.createdAt));

      res.json({ budget, lines, appels });
    } catch (e) {
      req.log.error(e);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// POST /budgets — Treasurer is responsible for budgets (spec: "Mohamed suit les budgets").
// requireFinanceAccess allows syndicate_admin and treasurer (not super_admin direct access).
router.post("/budgets", requireAuth, requireFinanceAccess, async (req, res) => {
  try {
    const user = req.user!;
    const {
      year,
      buildingId,
      totalAmount,
      chargesAmount,
      fondsReserve,
      status,
      notes,
      lines,
    } = req.body;

    if (!year || !buildingId) {
      return void res
        .status(400)
        .json({ error: "year and buildingId are required" });
    }
    // A budget is approved only by the general assembly (PUT with meetingId),
    // never at creation.
    if (status !== undefined && !PRE_APPROVAL_BUDGET_STATUSES.includes(status)) {
      return void res.status(400).json({
        error: "Un budget est créé en brouillon ; son approbation se fait en AG.",
        code: "BUDGET_STATUS_INVALID",
      });
    }

    // Syndicate ownership check via building FK
    const [building] = await db
      .select({ syndicateId: buildingsTable.syndicateId })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, buildingId))
      .limit(1);

    if (!building) {
      return void res.status(404).json({ error: "Immeuble introuvable" });
    }
    if (
      isSyndicateScoped(user.role) &&
      building.syndicateId !== user.syndicateId
    ) {
      return void res.status(403).json({
        error: "Accès refusé : cet immeuble n'appartient pas à votre syndicat",
      });
    }

    const providerIds = [
      ...new Set(
        (Array.isArray(lines) ? lines : [])
          .map((line: any) => line?.prestataireId)
          .filter(
            (id: unknown): id is string =>
              typeof id === "string" && id.length > 0,
          ),
      ),
    ];
    if (providerIds.length > 0) {
      const providers = await db
        .select({ id: prestatairesTable.id })
        .from(prestatairesTable)
        .where(
          and(
            inArray(prestatairesTable.id, providerIds),
            eq(prestatairesTable.buildingId, buildingId),
          ),
        );
      if (providers.length !== providerIds.length) {
        return void res
          .status(400)
          .json({ error: "Un prestataire n'appartient pas à cet immeuble" });
      }
    }

    // Budget and its lines are created atomically (no budget without lines
    // if a line fails validation in the database).
    const budget = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(budgetsTable)
        .values({
          year,
          buildingId,
          totalAmount: totalAmount ?? 0,
          chargesAmount: chargesAmount ?? 0,
          fondsReserve: fondsReserve ?? 0,
          status: status ?? "draft",
          notes,
          createdBy: user.userId,
        })
        .returning();

      if (lines && Array.isArray(lines) && lines.length > 0) {
        await tx.insert(budgetLinesTable).values(
          lines.map((l: any) => ({
            budgetId: created.id,
            category: l.category,
            label: l.label,
            amountAnnual: l.amountAnnual ?? 0,
            amountQ1: l.amountQ1,
            amountQ2: l.amountQ2,
            amountQ3: l.amountQ3,
            amountQ4: l.amountQ4,
            prestataireId: l.prestataireId,
          })),
        );
      }
      return created;
    });

    await serverAuditLog(req, {
      action: "CREATE",
      entity: "budget",
      entityId: budget.id,
      syndicateId: building.syndicateId ?? undefined,
      details: `Budget ${year} créé pour immeuble ${buildingId}`,
    });

    res.status(201).json(budget);
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /budgets/:id — Treasurer can update budget entries.
router.put(
  "/budgets/:id",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    try {
      const user = req.user!;

      // Fetch existing budget for ownership check
      const [existing] = await db
        .select()
        .from(budgetsTable)
        .where(eq(budgetsTable.id, String(req.params.id)));

      if (!existing)
        return void res.status(404).json({ error: "Budget not found" });

      // Syndicate ownership check via building FK
      const [building] = await db
        .select({ syndicateId: buildingsTable.syndicateId })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, existing.buildingId))
        .limit(1);

      if (isSyndicateScoped(user.role)) {
        if (!building || building.syndicateId !== user.syndicateId) {
          return void res.status(403).json({ error: "Accès refusé" });
        }
      }

      const parsed = updateBudgetSchema.safeParse(req.body);
      if (!parsed.success) {
        return void res.status(400).json({
          error: parsed.error.issues[0]?.message ?? "Données invalides",
        });
      }
      const updates: Record<string, unknown> = Object.fromEntries(
        Object.entries(parsed.data).filter(([, v]) => v !== undefined),
      );

      const isApproved = APPROVED_BUDGET_STATUSES.includes(existing.status ?? "");
      const changesAmounts = ["totalAmount", "chargesAmount", "fondsReserve"].some(
        (k) => k in updates,
      );
      if (isApproved && changesAmounts) {
        return void res.status(409).json({
          error:
            "Budget approuvé en AG : ses montants ne peuvent plus être modifiés sans nouvelle délibération.",
          code: "BUDGET_LOCKED",
        });
      }
      // Loi 18-00: the provisional budget is adopted by the general assembly.
      // Approval must reference the assembly (meeting) of this syndicate.
      if (updates.status === "approved" && existing.status !== "approved") {
        const meetingId = (updates.meetingId as string | null | undefined) ?? existing.meetingId;
        if (!meetingId) {
          return void res.status(400).json({
            error: "L'approbation d'un budget doit référencer l'assemblée générale qui l'a voté.",
            code: "BUDGET_APPROVAL_REQUIRES_AG",
          });
        }
        updates.meetingId = meetingId;
        updates.votedAt = new Date();
      }

      if (updates.meetingId !== undefined && updates.meetingId !== null) {
        const [meeting] = await db
          .select({ syndicateId: meetingsTable.syndicateId })
          .from(meetingsTable)
          .where(eq(meetingsTable.id, String(updates.meetingId)))
          .limit(1);
        if (!meeting || meeting.syndicateId !== building?.syndicateId) {
          return void res.status(400).json({
            error:
              "La réunion sélectionnée n'appartient pas au syndicat du budget",
          });
        }
      }

      const [updated] = await db
        .update(budgetsTable)
        .set(updates)
        .where(eq(budgetsTable.id, String(req.params.id)))
        .returning();

      if (!updated)
        return void res.status(404).json({ error: "Budget not found" });

      await serverAuditLog(req, {
        action: "UPDATE",
        entity: "budget",
        entityId: String(req.params.id),
        syndicateId: building?.syndicateId ?? undefined,
        details: `Budget mis à jour: ${JSON.stringify(updates)}`,
      });

      res.json(updated);
    } catch (e) {
      req.log.error(e);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// POST /budgets/:id/generate-appels — Treasurer generates charge calls from budget.
router.post(
  "/budgets/:id/generate-appels",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    try {
      const user = req.user!;
      const parsed = generateAppelsSchema.safeParse(req.body);
      if (!parsed.success) {
        return void res.status(400).json({
          error:
            parsed.error.issues[0]?.message ??
            "period is required (e.g. '2026-05', '2026-Q1' or '2026')",
        });
      }
      const { period, type: chargeType } = parsed.data;

      const [budget] = await db
        .select()
        .from(budgetsTable)
        .where(eq(budgetsTable.id, String(req.params.id)));
      if (!budget)
        return void res.status(404).json({ error: "Budget not found" });

      // Syndicate ownership check via building FK
      const [building] = await db
        .select({ syndicateId: buildingsTable.syndicateId })
        .from(buildingsTable)
        .where(eq(buildingsTable.id, budget.buildingId))
        .limit(1);

      if (isSyndicateScoped(user.role)) {
        if (!building || building.syndicateId !== user.syndicateId) {
          return void res.status(403).json({
            error:
              "Accès refusé : cet immeuble n'appartient pas à votre syndicat",
          });
        }
      }

      // Charges are called on the budget voted by the general assembly —
      // never on a draft the syndic can still change alone.
      if (budget.status !== "approved") {
        return void res.status(409).json({
          error: "Le budget doit être approuvé en assemblée générale avant d'émettre des appels de fonds.",
          code: "BUDGET_NOT_APPROVED",
        });
      }

      const lots = await db
        .select()
        .from(lotsTable)
        .where(eq(lotsTable.buildingId, budget.buildingId));

      if (lots.length === 0)
        return void res
          .status(400)
          .json({ error: "No lots found for this building" });

      const totalTantiemes = lots.reduce((s, l) => s + (l.tantiemes ?? 0), 0);
      if (totalTantiemes === 0)
        return void res
          .status(400)
          .json({ error: "Lots have no tantiemes assigned" });

      const annualAmount =
        chargeType === "fonds_reserve"
          ? (budget.fondsReserve ?? "0")
          : (budget.chargesAmount ?? "0");
      // The share of the annual budget depends on the period granularity:
      // monthly (YYYY-MM) = 1/12, quarterly (YYYY-Qn) = 1/4, yearly = 1/1.
      const periodCents = Math.round(
        toCents(annualAmount) / periodsPerYear(period),
      );
      const shares = splitByTantiemes(
        periodCents,
        lots.map((lot) => lot.tantiemes ?? 0),
      );

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const appels = lots.map((lot, i) => ({
        buildingId: budget.buildingId,
        budgetId: budget.id,
        lotId: lot.id,
        ownerId: lot.ownerId ?? null,
        period,
        type: chargeType,
        amount: (shares[i] / 100).toFixed(2),
        dueDate: dueDate.toISOString().split("T")[0],
        status: "pending" as const,
      }));

      // Idempotent: a lot receives at most one call per (period, type). The
      // unique index appels_lot_period_type_uq makes concurrent requests safe.
      const inserted = await db
        .insert(appelsDeFondsTable)
        .values(appels)
        .onConflictDoNothing({
          target: [
            appelsDeFondsTable.lotId,
            appelsDeFondsTable.period,
            appelsDeFondsTable.type,
          ],
        })
        .returning({ amount: appelsDeFondsTable.amount });

      if (inserted.length === 0) {
        return void res.status(409).json({
          error: `Les appels de fonds ${chargeType} de la période ${period} existent déjà pour cet immeuble.`,
          code: "APPELS_ALREADY_GENERATED",
        });
      }

      const totalCents = inserted.reduce((s, a) => s + toCents(a.amount), 0);

      // Each owner is told about their own call (amount + due date).
      void (async () => {
        const syndicateId = building?.syndicateId;
        if (!syndicateId) return;
        const insertedRows = await db
          .select({ ownerId: appelsDeFondsTable.ownerId, amount: appelsDeFondsTable.amount, dueDate: appelsDeFondsTable.dueDate })
          .from(appelsDeFondsTable)
          .where(
            and(
              eq(appelsDeFondsTable.budgetId, budget.id),
              eq(appelsDeFondsTable.period, period),
              eq(appelsDeFondsTable.type, chargeType),
            ),
          );
        for (const row of insertedRows) {
          const userId = await resolveOwnerUserId(db, row.ownerId, syndicateId);
          await notifyUser(userId, {
            title: "Nouvel appel de fonds",
            message: `Appel de fonds ${period} : ${row.amount} MAD à régler avant le ${row.dueDate}.`,
            type: "info",
            syndicateId,
          });
        }
      })().catch(() => {});

      await serverAuditLog(req, {
        action: "GENERATE_APPELS",
        entity: "budget",
        entityId: budget.id,
        syndicateId: building?.syndicateId ?? undefined,
        details: `${inserted.length} appels générés pour période ${period}`,
      });

      res.status(201).json({
        message: `Generated ${inserted.length} appels de fonds for period ${period}`,
        total: totalCents / 100,
        count: inserted.length,
        skipped: appels.length - inserted.length,
      });
    } catch (e) {
      req.log.error(e);
      res.status(500).json({ error: "Server error" });
    }
  },
);

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

    if (status) conditions.push(eq(appelsDeFondsTable.status, status));
    if (period) conditions.push(eq(appelsDeFondsTable.period, period));
    if (ownerId) conditions.push(eq(appelsDeFondsTable.ownerId, ownerId));

    // Members see only their own charges.
    // ownerId may store membersTable.id (seeded) or usersTable.id — try both.
    if (user.role === "member") {
      if (!user.syndicateId) {
        return void res
          .status(403)
          .json({ error: "Syndicat non défini dans le token" });
      }
      const [member] = await db
        .select({ id: membersTable.id })
        .from(membersTable)
        .where(
          and(
            eq(membersTable.email, user.email),
            eq(membersTable.syndicateId, user.syndicateId),
          ),
        )
        .limit(1);
      if (member) {
        conditions.push(
          or(
            eq(appelsDeFondsTable.ownerId, member.id),
            eq(appelsDeFondsTable.ownerId, user.userId),
          ),
        );
      } else {
        conditions.push(eq(appelsDeFondsTable.ownerId, user.userId));
      }
    }

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
        .where(where),
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
    const data = rows.map((r) => ({
      ...r,
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
      // Resolve member record by email (seeded rows use membersTable.id as ownerId)
      const [member] = await db
        .select({ id: membersTable.id })
        .from(membersTable)
        .where(
          and(
            eq(membersTable.email, user.email),
            eq(membersTable.syndicateId, user.syndicateId!),
          ),
        )
        .limit(1);
      const memberId = member?.id;
      const isOwner =
        appelBuilding?.syndicateId === user.syndicateId &&
        (appel.ownerId === user.userId ||
          (memberId && appel.ownerId === memberId));
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
      title: "Paiement à valider",
      message: `Un paiement de ${result.payment.amount} MAD (appel ${appel.period}) a été déclaré et attend votre validation.`,
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
            title: "Paiement validé",
            message:
              outcome.appel.status === "paid"
                ? `Votre paiement de ${outcome.payment.amount} MAD (appel ${appel.period}) est validé. Reçu n° ${outcome.receipt}.`
                : `Votre paiement de ${outcome.payment.amount} MAD (appel ${appel.period}) est validé. Reçu n° ${outcome.receipt}. Reste à payer : ${remaining} MAD.`,
            type: "success",
            syndicateId,
          }
        : {
            title: "Paiement refusé",
            message: `Votre paiement pour l'appel ${appel.period} a été refusé : ${rejectionReason}. Vous pouvez le déclarer à nouveau.`,
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
      const ownerUserId = await resolveOwnerUserId(db, appel.ownerId, appel.syndicateId);
      if (user.role !== "member" || ownerUserId !== user.userId) {
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
      const [member] = await db
        .select({ id: membersTable.id })
        .from(membersTable)
        .where(
          and(
            eq(membersTable.email, user.email),
            eq(membersTable.syndicateId, user.syndicateId!),
          ),
        )
        .limit(1);
      const isOwner =
        appel.ownerId === user.userId ||
        (member && appel.ownerId === member.id);
      if (!isOwner) return void res.status(403).json({ error: "Accès refusé" });
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
        }
      : !requestedPaymentId && appel.status === "paid" && appel.receiptNumber
        ? {
            number: appel.receiptNumber,
            date: appel.paidDate ?? new Date().toISOString().split("T")[0],
            amount: appel.amount,
            method: appel.paymentMethod,
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
      content: [
        // Header band
        {
          canvas: [
            { type: "rect", x: -40, y: -60, w: 595, h: 80, color: "#1e40af" },
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
          margin: [0, 0, 0, 30],
        },
        // Receipt number + date
        {
          columns: [
            {
              stack: [
                {
                  text: "Référence du reçu",
                  style: { font: FONT, fontSize: 8, color: "#64748b" },
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
                  alignment: "right",
                },
                {
                  text:
                    receipt.date,
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
                  text: lot?.number ? `Lot ${lot.number}` : appel.lotId,
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
          text: `Généré le ${new Date().toLocaleDateString("fr-MA")} — MIZAN`,
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

// POST /appels-de-fonds/escalate-debts — Scan overdue charges and create escalation records
router.post(
  "/appels-de-fonds/escalate-debts",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    try {
      const user = req.user!;
      const now = new Date();

      const scopedBuildings = await db
        .select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.syndicateId, user.syndicateId!));
      const buildingIds = scopedBuildings.map((building) => building.id);
      if (buildingIds.length === 0) {
        return void res.json({ escalations: 0, data: [] });
      }

      const overdueCharges = await db
        .select({
          ownerId: appelsDeFondsTable.ownerId,
          // Outstanding part only: partial payments reduce the debt.
          amount: sql<string>`${appelsDeFondsTable.amount} - ${appelsDeFondsTable.amountPaid}`,
          buildingId: appelsDeFondsTable.buildingId,
        })
        .from(appelsDeFondsTable)
        .where(
          and(
            eq(appelsDeFondsTable.status, "overdue"),
            inArray(appelsDeFondsTable.buildingId, buildingIds),
          ),
        );

      if (overdueCharges.length === 0) {
        res.json({ escalations: 0, message: "Aucune charge en retard" });
        return;
      }

      // Group by ownerId
      const byMember = new Map<
        string,
        {
          ownerId: string;
          buildingId: string;
          totalOverdue: number;
          months: number;
        }
      >();
      for (const charge of overdueCharges) {
        if (!charge.ownerId) continue;
        if (!byMember.has(charge.ownerId)) {
          byMember.set(charge.ownerId, {
            ownerId: charge.ownerId,
            buildingId: charge.buildingId,
            totalOverdue: 0,
            months: 0,
          });
        }
        const entry = byMember.get(charge.ownerId)!;
        entry.totalOverdue += parseFloat(String(charge.amount ?? 0));
        entry.months += 1;
      }

      const created: any[] = [];
      for (const [ownerId, data] of byMember) {
        let level: string | null = null;
        let overdueMonths = data.months;
        if (data.months >= 12) {
          level = "critical";
          overdueMonths = 12;
        } else if (data.months >= 6) {
          level = "serious";
          overdueMonths = 6;
        } else if (data.months >= 3) {
          level = "warning";
          overdueMonths = 3;
        }
        if (!level) continue;

        const [member] = await db
          .select()
          .from(membersTable)
          .where(eq(membersTable.id, ownerId));
        const [building] = await db
          .select({ syndicateId: buildingsTable.syndicateId })
          .from(buildingsTable)
          .where(eq(buildingsTable.id, data.buildingId));

        if (
          req.user!.role !== "super_admin" &&
          building?.syndicateId !== req.user!.syndicateId
        )
          continue;

        const existing = await db
          .select()
          .from(debtEscalationsTable)
          .where(
            and(
              eq(debtEscalationsTable.memberId, ownerId),
              eq(debtEscalationsTable.status, "open"),
            ),
          );

        if (existing.length > 0) {
          const [updated] = await db
            .update(debtEscalationsTable)
            .set({
              level,
              overdueMonths,
              totalOverdue: String(data.totalOverdue.toFixed(2)),
              alertSentAt: now,
            })
            .where(eq(debtEscalationsTable.id, existing[0].id))
            .returning();
          created.push(updated);
        } else {
          const [row] = await db
            .insert(debtEscalationsTable)
            .values({
              syndicateId: building?.syndicateId,
              memberId: ownerId,
              memberName: member?.name ?? "Membre inconnu",
              totalOverdue: String(data.totalOverdue.toFixed(2)),
              overdueMonths,
              level,
              status: "open",
              alertSentAt: now,
            } as any)
            .returning();
          created.push(row);
        }
      }
      res.json({ escalations: created.length, data: created });
    } catch (e) {
      req.log.error(e);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// GET /debt-escalations — list open debt escalations for this syndicate
router.get(
  "/debt-escalations",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(debtEscalationsTable)
        .where(
          req.user!.role === "super_admin"
            ? eq(debtEscalationsTable.status, "open")
            : and(
                eq(debtEscalationsTable.status, "open"),
                eq(debtEscalationsTable.syndicateId, req.user!.syndicateId!),
              ),
        )
        .orderBy(desc(debtEscalationsTable.createdAt));
      res.json({ data: rows });
    } catch (e) {
      req.log.error(e);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// POST /budgets/check-reserve-fund — Check reserve fund, fire alerts if below threshold
router.post(
  "/budgets/check-reserve-fund",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    try {
      const { thresholdMonths = 3 } = req.body as { thresholdMonths?: number };

      const base = db
        .select({
          fondsReserve: budgetsTable.fondsReserve,
          chargesAmount: budgetsTable.chargesAmount,
          syndicateId: buildingsTable.syndicateId,
          syndicateName: syndicatesTable.name,
        })
        .from(budgetsTable)
        .innerJoin(
          buildingsTable,
          eq(budgetsTable.buildingId, buildingsTable.id),
        )
        .leftJoin(
          syndicatesTable,
          eq(buildingsTable.syndicateId, syndicatesTable.id),
        );

      const budgetData =
        req.user!.role === "super_admin"
          ? await base
          : await base.where(
              eq(buildingsTable.syndicateId, req.user!.syndicateId!),
            );

      const alertsCreated: any[] = [];
      for (const budget of budgetData) {
        const reserve = parseFloat(String(budget.fondsReserve ?? 0));
        const monthly = parseFloat(String(budget.chargesAmount ?? 0)) / 12;
        const threshold = monthly * thresholdMonths;
        if (monthly > 0 && reserve < threshold) {
          const [alert] = await db
            .insert(alertsTable)
            .values({
              title: "⚠️ Fonds de réserve insuffisant",
              message: `Le fonds de réserve de ${budget.syndicateName ?? "votre syndicat"} (${reserve.toFixed(2)} MAD) est inférieur au seuil de ${thresholdMonths} mois de charges (${threshold.toFixed(2)} MAD). Une réunion extraordinaire est recommandée.`,
              type: "warning",
              date: new Date().toISOString().split("T")[0],
              target: "admin",
              syndicateId: budget.syndicateId,
            })
            .returning();
          alertsCreated.push(alert);
        }
      }
      res.json({ alerts: alertsCreated.length, data: alertsCreated });
    } catch (e) {
      req.log.error(e);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// PUT /appels-de-fonds/mark-overdue — Cron-style: mark past due as overdue
router.put(
  "/appels-de-fonds/mark-overdue",
  requireAuth,
  requireFinanceAccess,
  async (req, res) => {
    try {
      const user = req.user!;
      const today = new Date().toISOString().split("T")[0];

      const scopedBuildings = await db
        .select({ id: buildingsTable.id })
        .from(buildingsTable)
        .where(eq(buildingsTable.syndicateId, user.syndicateId!));
      const buildingIds = scopedBuildings.map((building) => building.id);
      if (buildingIds.length === 0) {
        return void res.json({ updated: 0 });
      }

      const result = await db
        .update(appelsDeFondsTable)
        .set({ status: "overdue" })
        .where(
          and(
            inArray(appelsDeFondsTable.status, ["pending", "partially_paid"]),
            sql`${appelsDeFondsTable.dueDate} < ${today}`,
            inArray(appelsDeFondsTable.buildingId, buildingIds),
          ),
        )
        .returning();

      res.json({ updated: result.length });
    } catch (e) {
      req.log.error(e);
      res.status(500).json({ error: "Server error" });
    }
  },
);

export default router;
