import { Router, type Request } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  lotsTable,
  buildingsTable,
  membersTable,
  tenantsTable,
  appelsDeFondsTable,
  travauxTable,
  sinistresTable,
  documentsTable,
  lotOwnershipsTable,
  auditLogsTable,
} from "@workspace/db/schema";
import {
  eq,
  and,
  desc,
  asc,
  sql,
  count,
  inArray,
  isNull,
  isNotNull,
  or,
  ilike,
  type SQL,
} from "drizzle-orm";
import { requireAuth, isSyndicateTeamRole } from "../../middleware/auth.js";
import { getUserLotIds } from "../../lib/scope.js";
import { serverAuditLog } from "../../lib/audit.js";
import { getPagination } from "../../lib/paginate.js";
import {
  FinanceError,
  fromCents,
  isoDateSchema,
  sendFinanceError,
  toCents,
  moneyDiff,
} from "../../lib/treasury.js";
import {
  chargesOfPersonSql,
  currentOwnersOf,
  memberIdsOf,
  syncMainOwner,
  todayIso,
} from "../../lib/units.js";
import {
  loadScopedLot,
  assertBuildingOfSyndicate,
  outstandingOf,
  firstIssue,
  assertMembersOfSyndicate,
  referenceConflict,
  insertLot,
} from "./lots.service.js";
import {
  LOT_TYPES,
  FLOORLESS_TYPES,
  ownersSchema,
  lotFieldsSchema,
  createLotSchema,
} from "./lots.validation.js";

/**
 * Units (lots) of the syndicate: register, ownership (co-owners, shares,
 * history), occupancy (tenancies) and lifecycle (archive instead of delete).
 *
 * Hierarchy in this application: syndicate (the copropriété, tenant of the
 * platform) → building → floor → lot.
 *
 * Permissions (always checked here, on the server):
 *  - read: syndicate team; a co-owner reads the lots they currently own; a
 *    tenant reads the lot they currently rent. Super admin only in
 *    supervision of a target syndicate.
 *  - register (create / edit / import): syndicate_admin, secretary.
 *  - tenancy (move in / out): syndicate_admin, secretary.
 *  - ownership changes, archive, restore, delete: syndicate_admin.
 */
const router = Router();

const REGISTER_EDITORS = ["syndicate_admin", "secretary"];
const OWNERSHIP_MANAGERS = ["syndicate_admin"];

// ─── Scope helpers ────────────────────────────────────────────────────────────

/** Syndicate the request acts on: the caller's, or the supervised one for super admin. */
function scopeSyndicateId(req: Request): string {
  const user = req.user!;
  if (user.role === "super_admin") {
    const target = typeof req.query.syndicateId === "string" ? req.query.syndicateId : "";
    if (req.query.supervision !== "true" || !target) {
      throw new FinanceError(403, "SUPERVISION_REQUIRED", "La supervision et un syndicat cible sont requis.");
    }
    return target;
  }
  if (!user.syndicateId) throw new FinanceError(403, "NO_SYNDICATE", "Syndicat non défini dans le token");
  return user.syndicateId;
}

function requireRoles(req: Request, roles: string[]): void {
  const role = req.user!.role;
  if (role === "super_admin") return; // supervised, checked by scopeSyndicateId
  if (!roles.includes(role)) throw new FinanceError(403, "FORBIDDEN", "Action réservée au syndic");
}

// ─── List ─────────────────────────────────────────────────────────────────────

const SORTS: Record<string, SQL[]> = {
  reference: [asc(lotsTable.number)],
  floor: [asc(lotsTable.floor), asc(lotsTable.number)],
  type: [asc(lotsTable.type), asc(lotsTable.number)],
  tantiemes: [desc(lotsTable.tantiemes), asc(lotsTable.number)],
  recent: [desc(lotsTable.createdAt)],
};

// GET /lots — search & filter: q (reference, owner, tenant, titre foncier),
// buildingId, floor, type, status (occupancy), ownerId, archived=exclude|include|only,
// sort, page, limit.
router.get("/lots", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const syndicateId = user.role === "super_admin" && typeof req.query.syndicateId !== "string" ? null : scopeSyndicateId(req);
    if (user.role === "super_admin" && !syndicateId) {
      throw new FinanceError(403, "SUPERVISION_REQUIRED", "La supervision et un syndicat cible sont requis.");
    }
    const q = req.query as Record<string, string | undefined>;
    const conditions: SQL[] = [eq(buildingsTable.syndicateId, syndicateId!)];

    if (user.role === "member" || user.role === "tenant") {
      const own = await getUserLotIds(user);
      if (own.length === 0) return void res.json({ data: [], total: 0, page: 1, limit: 0, pages: 0 });
      conditions.push(inArray(lotsTable.id, own));
    } else if (!isSyndicateTeamRole(user.role) && user.role !== "super_admin") {
      throw new FinanceError(403, "FORBIDDEN", "Accès refusé");
    }
    if (q.buildingId) conditions.push(eq(lotsTable.buildingId, q.buildingId));
    if (q.type) conditions.push(eq(lotsTable.type, q.type));
    if (q.status) conditions.push(eq(lotsTable.status, q.status));
    if (q.floor !== undefined && q.floor !== "" && Number.isInteger(Number(q.floor))) conditions.push(eq(lotsTable.floor, Number(q.floor)));
    if (q.ownerId) {
      conditions.push(sql`EXISTS (SELECT 1 FROM lot_ownerships o WHERE o.lot_id = ${lotsTable.id} AND o.member_id = ${q.ownerId} AND o.start_date <= ${todayIso()} AND (o.end_date IS NULL OR o.end_date > ${todayIso()}))`);
    }
    const archived = q.archived ?? "exclude";
    if (archived === "exclude") conditions.push(isNull(lotsTable.archivedAt));
    else if (archived === "only") conditions.push(isNotNull(lotsTable.archivedAt));
    if (q.q && q.q.trim()) {
      const term = `%${q.q.trim().replace(/[%_\\]/g, "\\$&")}%`;
      conditions.push(
        or(
          ilike(lotsTable.number, term),
          ilike(lotsTable.titreFoncier, term),
          sql`EXISTS (SELECT 1 FROM lot_ownerships o JOIN members m ON m.id = o.member_id
                      WHERE o.lot_id = ${lotsTable.id} AND o.end_date IS NULL AND (m.name ILIKE ${term} OR m.email ILIKE ${term}))`,
          sql`EXISTS (SELECT 1 FROM tenants t WHERE t.id = ${lotsTable.tenantId} AND t.name ILIKE ${term})`,
        )!,
      );
    }

    const where = and(...conditions);
    const pagination = getPagination(req, 100);
    const [rows, [{ value: total }], statusRows] = await Promise.all([
      db
        .select({ lot: lotsTable, buildingName: buildingsTable.name })
        .from(lotsTable)
        .innerJoin(buildingsTable, eq(buildingsTable.id, lotsTable.buildingId))
        .where(where)
        .orderBy(...(SORTS[q.sort ?? "floor"] ?? SORTS.floor))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db
        .select({ value: count() })
        .from(lotsTable)
        .innerJoin(buildingsTable, eq(buildingsTable.id, lotsTable.buildingId))
        .where(where),
      // Counts over the whole filter (not just the loaded page).
      db
        .select({ status: lotsTable.status, n: sql<number>`COUNT(*)::int` })
        .from(lotsTable)
        .innerJoin(buildingsTable, eq(buildingsTable.id, lotsTable.buildingId))
        .where(where)
        .groupBy(lotsTable.status),
    ]);

    const lotIds = rows.map((r) => r.lot.id);
    const tenantIds = rows.map((r) => r.lot.tenantId).filter((v): v is string => !!v);
    const isTeam = user.role !== "member" && user.role !== "tenant";
    const [owners, tenants, charges] = await Promise.all([
      currentOwnersOf(lotIds),
      tenantIds.length ? db.select().from(tenantsTable).where(inArray(tenantsTable.id, tenantIds)) : [],
      lotIds.length && user.role !== "tenant"
        ? db
            .select({
              lotId: appelsDeFondsTable.lotId,
              status: appelsDeFondsTable.status,
              amount: appelsDeFondsTable.amount,
              amountPaid: appelsDeFondsTable.amountPaid,
            })
            .from(appelsDeFondsTable)
            .where(
              and(
                inArray(appelsDeFondsTable.lotId, lotIds),
                ...(isTeam ? [] : [chargesOfPersonSql(await memberIdsOf(user))]),
              ),
            )
        : [],
    ]);
    const tenantMap = new Map(tenants.map((t) => [t.id, t]));
    const statsByLot = new Map<string, { pending: number; overdue: number; pendingAmount: number }>();
    for (const c of charges) {
      const agg = statsByLot.get(c.lotId) ?? { pending: 0, overdue: 0, pendingAmount: 0 };
      const outstanding = moneyDiff(c.amount, c.amountPaid);
      if (["pending", "partially_paid", "pending_validation", "rejected"].includes(c.status ?? "")) {
        agg.pending++;
        agg.pendingAmount += outstanding;
      }
      if (c.status === "overdue") {
        agg.overdue++;
        agg.pendingAmount += outstanding;
      }
      statsByLot.set(c.lotId, agg);
    }

    const data = rows.map(({ lot, buildingName }) => {
      const lotOwners = owners.get(lot.id) ?? [];
      const main = lotOwners[0];
      const tenant = lot.tenantId ? tenantMap.get(lot.tenantId) ?? null : null;
      return {
        ...lot,
        buildingName,
        archived: !!lot.archivedAt,
        owners: lotOwners.map((o) => ({ memberId: o.memberId, name: o.name, sharePercent: o.sharePercent, ...(isTeam ? { email: o.email, phone: o.phone } : {}) })),
        owner: main ? { id: main.memberId, name: main.name, email: isTeam ? main.email : undefined, phone: isTeam ? main.phone : undefined } : null,
        tenant: tenant && (isTeam || user.role === "member") ? { id: tenant.id, name: tenant.name, leaseStart: tenant.leaseStart, leaseEnd: tenant.leaseEnd, ...(isTeam ? { email: tenant.email, phone: tenant.phone } : {}) } : null,
        chargeStats: user.role === "tenant" ? undefined : statsByLot.get(lot.id) ?? { pending: 0, overdue: 0, pendingAmount: 0 },
      };
    });
    const statusCounts = Object.fromEntries(statusRows.map((r) => [r.status ?? "unknown", r.n]));
    res.json({ data, total: Number(total), statusCounts, page: pagination.page, limit: pagination.limit, pages: Math.ceil(Number(total) / pagination.limit) });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

// GET /lots/my-lot — the resident's current lot (declared before /lots/:id)
router.get("/lots/my-lot", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const own = await getUserLotIds(user);
    if (own.length === 0) return void res.status(404).json({ error: "Aucun lot associé à votre compte" });
    const [row] = await db
      .select({ lot: lotsTable, buildingName: buildingsTable.name, buildingAddress: buildingsTable.address })
      .from(lotsTable)
      .innerJoin(buildingsTable, eq(buildingsTable.id, lotsTable.buildingId))
      .where(and(inArray(lotsTable.id, own), eq(buildingsTable.syndicateId, user.syndicateId!)))
      .orderBy(asc(lotsTable.number))
      .limit(1);
    if (!row) return void res.status(404).json({ error: "Aucun lot associé à votre compte" });
    res.json({ data: { ...row.lot, buildingName: row.buildingName, buildingAddress: row.buildingAddress, lotIds: own } });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

// ─── Detail ───────────────────────────────────────────────────────────────────

router.get("/lots/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const syndicateId = scopeSyndicateId(req);
    const { lot, buildingName } = await loadScopedLot(String(req.params.id), syndicateId);
    const isTeam = user.role !== "member" && user.role !== "tenant";
    if (!isTeam) {
      const own = await getUserLotIds(user);
      if (!own.includes(lot.id)) throw new FinanceError(403, "FORBIDDEN", "Accès refusé");
    } else if (!isSyndicateTeamRole(user.role) && user.role !== "super_admin") {
      throw new FinanceError(403, "FORBIDDEN", "Accès refusé");
    }

    const [building] = await db.select().from(buildingsTable).where(eq(buildingsTable.id, lot.buildingId));
    const owners = (await currentOwnersOf([lot.id])).get(lot.id) ?? [];
    const tenant = lot.tenantId
      ? (await db.select().from(tenantsTable).where(eq(tenantsTable.id, lot.tenantId)))[0] ?? null
      : null;

    // A tenant sees the lot, the building and their own lease only.
    if (user.role === "tenant") {
      return void res.json({
        lot,
        building: building ?? null,
        owner: owners[0] ? { name: owners[0].name } : null,
        owners: [],
        tenant,
        tenancies: tenant ? [tenant] : [],
        charges: [],
        travaux: [],
      });
    }

    const memberIds = isTeam ? [] : await memberIdsOf(user);
    const chargeScope = isTeam ? [] : [chargesOfPersonSql(memberIds)];
    const [ownershipHistory, tenancies, charges, travaux, sinistres, documents, history, outstanding] = await Promise.all([
      db
        .select({
          id: lotOwnershipsTable.id,
          memberId: lotOwnershipsTable.memberId,
          name: membersTable.name,
          sharePercent: lotOwnershipsTable.sharePercent,
          startDate: lotOwnershipsTable.startDate,
          endDate: lotOwnershipsTable.endDate,
          endReason: lotOwnershipsTable.endReason,
        })
        .from(lotOwnershipsTable)
        .innerJoin(membersTable, eq(membersTable.id, lotOwnershipsTable.memberId))
        .where(
          and(
            eq(lotOwnershipsTable.lotId, lot.id),
            // A co-owner sees their own periods; the team sees the whole register.
            ...(isTeam ? [] : [inArray(lotOwnershipsTable.memberId, memberIds)]),
          ),
        )
        .orderBy(desc(lotOwnershipsTable.startDate)),
      isTeam
        ? db.select().from(tenantsTable).where(eq(tenantsTable.lotId, lot.id)).orderBy(desc(tenantsTable.createdAt))
        : tenant
          ? [{ id: tenant.id, name: tenant.name, leaseStart: tenant.leaseStart, leaseEnd: tenant.leaseEnd, status: tenant.status }]
          : [],
      db
        .select()
        .from(appelsDeFondsTable)
        .where(and(eq(appelsDeFondsTable.lotId, lot.id), ...chargeScope))
        .orderBy(desc(appelsDeFondsTable.createdAt))
        .limit(50),
      db.select().from(travauxTable).where(eq(travauxTable.lotId, lot.id)).orderBy(desc(travauxTable.createdAt)).limit(20),
      db
        .select({ id: sinistresTable.id, type: sinistresTable.type, description: sinistresTable.description, date: sinistresTable.date, status: sinistresTable.status })
        .from(sinistresTable)
        .where(eq(sinistresTable.lotId, lot.id))
        .orderBy(desc(sinistresTable.createdAt))
        .limit(20),
      db
        .select({
          id: documentsTable.id,
          title: documentsTable.title,
          category: documentsTable.category,
          status: documentsTable.status,
          subjectUserId: documentsTable.subjectUserId,
          createdAt: documentsTable.createdAt,
        })
        .from(documentsTable)
        .where(
          and(
            eq(documentsTable.syndicateId, syndicateId),
            eq(documentsTable.isDeleted, false),
            sql`${documentsTable.generationParams}->>'lotId' = ${lot.id}`,
            // Residents: published documents, general or about themselves.
            ...(isTeam
              ? []
              : [eq(documentsTable.status, "published"), or(isNull(documentsTable.subjectUserId), eq(documentsTable.subjectUserId, user.userId))!]),
          ),
        )
        .orderBy(desc(documentsTable.createdAt))
        .limit(30),
      isTeam
        ? db
            .select({ action: auditLogsTable.action, details: auditLogsTable.details, userName: auditLogsTable.userName, createdAt: auditLogsTable.createdAt })
            .from(auditLogsTable)
            .where(and(eq(auditLogsTable.entity, "lot"), eq(auditLogsTable.entityId, lot.id)))
            .orderBy(desc(auditLogsTable.createdAt))
            .limit(50)
        : [],
      outstandingOf(lot.id),
    ]);

    const financial = {
      called: fromCents(charges.filter((c) => c.status !== "cancelled").reduce((s, c) => s + toCents(c.amount), 0)),
      paid: fromCents(charges.reduce((s, c) => s + toCents(c.amountPaid), 0)),
      // Team: every debtor of the lot (previous owners included). Owner: their own.
      outstanding: isTeam
        ? outstanding
        : {
            total: fromCents(charges.filter((c) => !["paid", "cancelled"].includes(c.status ?? "")).reduce((s, c) => s + toCents(c.amount) - toCents(c.amountPaid), 0)),
          },
    };

    res.json({
      lot: { ...lot, buildingName, archived: !!lot.archivedAt },
      building: building ?? null,
      owners: owners.map((o) => ({ ...o, ...(isTeam ? {} : { email: undefined, phone: undefined }) })),
      owner: owners[0] ? { id: owners[0].memberId, name: owners[0].name, email: isTeam ? owners[0].email : undefined } : null,
      ownershipHistory,
      tenant: tenant ? (isTeam ? tenant : { id: tenant.id, name: tenant.name, leaseStart: tenant.leaseStart, leaseEnd: tenant.leaseEnd }) : null,
      tenancies,
      charges,
      financial,
      travaux,
      sinistres,
      documents,
      history,
      permissions: {
        canEdit: user.role === "super_admin" || REGISTER_EDITORS.includes(user.role),
        canManageTenancy: user.role === "super_admin" || REGISTER_EDITORS.includes(user.role),
        canManageOwnership: user.role === "super_admin" || OWNERSHIP_MANAGERS.includes(user.role),
      },
    });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

// ─── Create ───────────────────────────────────────────────────────────────────

router.post("/lots", requireAuth, async (req, res) => {
  try {
    requireRoles(req, REGISTER_EDITORS);
    const syndicateId = scopeSyndicateId(req);
    const parsed = createLotSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json(firstIssue(parsed.error));
    const input = parsed.data;
    await assertBuildingOfSyndicate(input.buildingId, syndicateId);
    const ownerIds = input.owners?.map((o) => o.memberId) ?? (input.ownerId ? [input.ownerId] : []);
    await assertMembersOfSyndicate(ownerIds, syndicateId);
    if (input.ownershipStartDate && input.ownershipStartDate > todayIso()) {
      throw new FinanceError(400, "DATE_IN_FUTURE", "La date de début de propriété ne peut pas être dans le futur");
    }

    const lot = await db.transaction((tx) => insertLot(tx, input, syndicateId, req.user!.userId));
    await serverAuditLog(req, {
      action: "LOT_CREATED",
      entity: "lot",
      entityId: lot.id,
      syndicateId,
      details: JSON.stringify({ number: lot.number, type: lot.type, owners: ownerIds.length }),
    });
    // Legacy clients read the lot at the top level, newer ones under data.
    res.status(201).json({ ...lot, data: lot });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

// ─── Edit (identity fields, optimistic concurrency) ──────────────────────────

const updateLotSchema = lotFieldsSchema
  .partial()
  .extend({
    // The version read by the client: a concurrent edit is refused (409).
    version: z.number().int().min(0),
    // Occupancy by the owner vs vacant. "rented" goes through the tenancy workflow.
    status: z.enum(["occupied", "vacant"]).optional(),
  })
  .strict();

router.put("/lots/:id", requireAuth, async (req, res) => {
  try {
    requireRoles(req, REGISTER_EDITORS);
    const syndicateId = scopeSyndicateId(req);
    if (req.body && ("ownerId" in req.body || "tenantId" in req.body || "owners" in req.body)) {
      throw new FinanceError(400, "USE_WORKFLOW", "Les propriétaires et locataires se modifient via leurs actions dédiées");
    }
    const parsed = updateLotSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json(firstIssue(parsed.error));
    const { version, ...patch } = parsed.data;

    const updated = await db.transaction(async (tx) => {
      const { lot } = await loadScopedLot(String(req.params.id), syndicateId, tx);
      if (lot.archivedAt) throw new FinanceError(409, "LOT_ARCHIVED", "Lot archivé : restaurez-le avant de le modifier");
      if (lot.version !== version) {
        throw new FinanceError(409, "LOT_VERSION_CONFLICT", "Ce lot a été modifié entre-temps : rechargez-le avant de l'enregistrer");
      }
      if (patch.status && lot.status === "rented") {
        throw new FinanceError(409, "TENANCY_ACTIVE", "Lot loué : terminez d'abord le bail en cours");
      }
      const type = patch.type ?? lot.type ?? "appartement";
      const floor = patch.floor !== undefined ? patch.floor : lot.floor;
      if (!FLOORLESS_TYPES.has(type) && (floor === null || floor === undefined)) {
        throw new FinanceError(400, "INVALID_LOT", "L'étage est obligatoire pour ce type de lot");
      }
      if (patch.number) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"lots:" + lot.buildingId}))`);
      try {
        const [row] = await tx
          .update(lotsTable)
          .set({
            ...patch,
            surfaceM2: patch.surfaceM2 === undefined ? undefined : patch.surfaceM2 === null ? null : patch.surfaceM2.toFixed(2),
            surfaceCadastrale:
              patch.surfaceCadastrale === undefined ? undefined : patch.surfaceCadastrale === null ? null : patch.surfaceCadastrale.toFixed(2),
            version: lot.version + 1,
            updatedAt: new Date(),
          })
          .where(and(eq(lotsTable.id, lot.id), eq(lotsTable.version, version)))
          .returning();
        if (!row) throw new FinanceError(409, "LOT_VERSION_CONFLICT", "Ce lot a été modifié entre-temps");
        return row;
      } catch (err) {
        if (err instanceof FinanceError) throw err;
        referenceConflict(err);
      }
    });
    await serverAuditLog(req, {
      action: "LOT_UPDATED",
      entity: "lot",
      entityId: updated.id,
      syndicateId,
      details: JSON.stringify(patch),
    });
    res.json({ ...updated, data: updated });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

// ─── Ownership changes ────────────────────────────────────────────────────────

const ownershipChangeSchema = z
  .object({
    owners: ownersSchema,
    effectiveDate: isoDateSchema.optional(),
    reason: z.string().trim().min(3, "Indiquez le motif (vente, succession, donation…)").max(300),
    // Required when the lot still has unpaid calls: they stay with their debtors.
    acknowledgeOutstanding: z.boolean().optional(),
  })
  .strict();

/**
 * Sets the current owners of a lot (sale, inheritance, new co-owner, share
 * change). Periods of owners who leave or whose share changes are closed on
 * the effective date; new periods start that day. Calls for funds already
 * issued keep their debtor — they are never moved to the new owner.
 */
router.put("/lots/:id/owners", requireAuth, async (req, res) => {
  try {
    requireRoles(req, OWNERSHIP_MANAGERS);
    const syndicateId = scopeSyndicateId(req);
    const parsed = ownershipChangeSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json(firstIssue(parsed.error));
    const { owners, reason, acknowledgeOutstanding } = parsed.data;
    const effectiveDate = parsed.data.effectiveDate ?? todayIso();
    if (effectiveDate > todayIso()) throw new FinanceError(400, "DATE_IN_FUTURE", "La date d'effet ne peut pas être dans le futur");
    await assertMembersOfSyndicate(owners.map((o) => o.memberId), syndicateId);
    const outstanding = await outstandingOf(String(req.params.id));

    const result = await db.transaction(async (tx) => {
      const { lot } = await loadScopedLot(String(req.params.id), syndicateId, tx);
      if (lot.archivedAt) throw new FinanceError(409, "LOT_ARCHIVED", "Lot archivé");
      const current = await tx
        .select()
        .from(lotOwnershipsTable)
        .where(and(eq(lotOwnershipsTable.lotId, lot.id), isNull(lotOwnershipsTable.endDate)))
        .for("update");
      const latestStart = current.reduce((m, r) => (r.startDate > m ? r.startDate : m), "0000-00-00");
      if (effectiveDate < latestStart) {
        throw new FinanceError(400, "DATE_BEFORE_CURRENT", `La date d'effet précède le début de la propriété actuelle (${latestStart})`);
      }
      const byMember = new Map(current.map((r) => [r.memberId, r]));
      const leaving = current.filter((r) => !owners.some((o) => o.memberId === r.memberId));
      if (leaving.length && toCents(outstanding.total) > 0 && !acknowledgeOutstanding) {
        throw Object.assign(
          new FinanceError(
            409,
            "OUTSTANDING_BALANCE",
            `Le lot a ${outstanding.total} MAD d'impayés : ils restent dus par leurs débiteurs actuels. Confirmez pour poursuivre.`,
          ),
          { details: outstanding },
        );
      }
      if (outstanding.underReview > 0 && leaving.length) {
        throw new FinanceError(409, "PAYMENT_UNDER_REVIEW", "Un paiement est en cours de validation sur ce lot : traitez-le d'abord");
      }

      const ended: string[] = [];
      const started: string[] = [];
      for (const row of current) {
        const next = owners.find((o) => o.memberId === row.memberId);
        if (next && toCents(row.sharePercent) === next.sharePercent) continue; // unchanged
        await tx
          .update(lotOwnershipsTable)
          .set({ endDate: effectiveDate, endReason: next ? `Quote-part modifiée — ${reason}` : reason })
          .where(eq(lotOwnershipsTable.id, row.id));
        ended.push(row.memberId);
      }
      for (const o of owners) {
        const prev = byMember.get(o.memberId);
        if (prev && toCents(prev.sharePercent) === o.sharePercent) continue;
        await tx.insert(lotOwnershipsTable).values({
          syndicateId,
          lotId: lot.id,
          memberId: o.memberId,
          sharePercent: fromCents(o.sharePercent),
          startDate: effectiveDate,
          createdBy: req.user!.userId,
        });
        started.push(o.memberId);
      }
      if (ended.length === 0 && started.length === 0) {
        throw new FinanceError(409, "NO_CHANGE", "Les propriétaires sont déjà ceux-là");
      }
      const mainOwner = await syncMainOwner(tx, lot.id);
      await tx.update(lotsTable).set({ version: lot.version + 1, updatedAt: new Date() }).where(eq(lotsTable.id, lot.id));
      return { ended, started, mainOwner };
    });

    await serverAuditLog(req, {
      action: "LOT_OWNERSHIP_CHANGED",
      entity: "lot",
      entityId: String(req.params.id),
      syndicateId,
      details: JSON.stringify({ effectiveDate, reason, ended: result.ended, started: result.started, outstandingAtChange: outstanding.total }),
    });
    const owners_ = (await currentOwnersOf([String(req.params.id)])).get(String(req.params.id)) ?? [];
    res.json({ data: { owners: owners_, mainOwnerId: result.mainOwner, outstandingKeptWithDebtors: outstanding }, message: "Propriétaires mis à jour" });
  } catch (e: any) {
    if (e instanceof FinanceError && (e as any).details) {
      return void res.status(e.status).json({ error: e.message, code: e.code, details: (e as any).details });
    }
    sendFinanceError(res, req, e);
  }
});

// ─── Tenancy (occupancy) ──────────────────────────────────────────────────────

const moveInSchema = z
  .object({
    tenantId: z.string().min(1).optional(),
    tenant: z
      .object({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().email().optional(),
        phone: z.string().trim().max(30).optional(),
      })
      .optional(),
    leaseStart: isoDateSchema.optional(),
    leaseEnd: isoDateSchema.optional(),
    monthlyRent: z.number().nonnegative().max(10_000_000).optional(),
  })
  .strict()
  .refine((d) => !!d.tenantId !== !!d.tenant, { message: "Choisissez un locataire existant ou saisissez-en un nouveau" })
  .refine((d) => !d.leaseEnd || !d.leaseStart || d.leaseEnd >= d.leaseStart, { message: "La fin du bail précède son début", path: ["leaseEnd"] });

router.post("/lots/:id/tenancy", requireAuth, async (req, res) => {
  try {
    requireRoles(req, REGISTER_EDITORS);
    const syndicateId = scopeSyndicateId(req);
    const parsed = moveInSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json(firstIssue(parsed.error));
    const d = parsed.data;
    const leaseStart = d.leaseStart ?? todayIso();

    const tenant = await db.transaction(async (tx) => {
      const { lot } = await loadScopedLot(String(req.params.id), syndicateId, tx);
      if (lot.archivedAt) throw new FinanceError(409, "LOT_ARCHIVED", "Lot archivé");
      if (lot.tenantId) throw new FinanceError(409, "TENANCY_ACTIVE", "Un bail est déjà en cours : enregistrez d'abord le départ du locataire");
      let row;
      if (d.tenantId) {
        const [existing] = await tx
          .select()
          .from(tenantsTable)
          .where(and(eq(tenantsTable.id, d.tenantId), eq(tenantsTable.syndicateId, syndicateId)))
          .for("update");
        if (!existing) throw new FinanceError(404, "TENANT_NOT_FOUND", "Locataire introuvable dans ce syndicat");
        if (existing.status === "active" && existing.lotId && existing.lotId !== lot.id) {
          throw new FinanceError(409, "TENANT_ALREADY_HOUSED", "Ce locataire occupe déjà un autre lot");
        }
        [row] = await tx
          .update(tenantsTable)
          .set({ lotId: lot.id, buildingId: lot.buildingId, leaseStart, leaseEnd: d.leaseEnd ?? null, monthlyRent: d.monthlyRent != null ? String(d.monthlyRent) : existing.monthlyRent, status: "active" })
          .where(eq(tenantsTable.id, existing.id))
          .returning();
      } else {
        [row] = await tx
          .insert(tenantsTable)
          .values({
            name: d.tenant!.name,
            email: d.tenant!.email?.toLowerCase() ?? null,
            phone: d.tenant!.phone ?? null,
            lotId: lot.id,
            buildingId: lot.buildingId,
            syndicateId,
            leaseStart,
            leaseEnd: d.leaseEnd ?? null,
            monthlyRent: d.monthlyRent != null ? String(d.monthlyRent) : null,
            status: "active",
          })
          .returning();
      }
      await tx
        .update(lotsTable)
        .set({ tenantId: row.id, status: "rented", version: lot.version + 1, updatedAt: new Date() })
        .where(eq(lotsTable.id, lot.id));
      return row;
    });
    await serverAuditLog(req, {
      action: "LOT_TENANCY_STARTED",
      entity: "lot",
      entityId: String(req.params.id),
      syndicateId,
      details: JSON.stringify({ tenantId: tenant.id, name: tenant.name, leaseStart, leaseEnd: d.leaseEnd ?? null }),
    });
    res.status(201).json({ data: tenant, message: "Locataire installé" });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

const moveOutSchema = z
  .object({
    endDate: isoDateSchema.optional(),
    nextStatus: z.enum(["vacant", "occupied"]).default("vacant"),
    reason: z.string().trim().max(300).optional(),
  })
  .strict();

router.post("/lots/:id/tenancy/end", requireAuth, async (req, res) => {
  try {
    requireRoles(req, REGISTER_EDITORS);
    const syndicateId = scopeSyndicateId(req);
    const parsed = moveOutSchema.safeParse(req.body ?? {});
    if (!parsed.success) return void res.status(400).json(firstIssue(parsed.error));
    const endDate = parsed.data.endDate ?? todayIso();
    if (endDate > todayIso()) throw new FinanceError(400, "DATE_IN_FUTURE", "La date de départ ne peut pas être dans le futur");

    const ended = await db.transaction(async (tx) => {
      const { lot } = await loadScopedLot(String(req.params.id), syndicateId, tx);
      if (!lot.tenantId) throw new FinanceError(409, "NO_ACTIVE_TENANCY", "Aucun bail en cours sur ce lot");
      const [tenant] = await tx.select().from(tenantsTable).where(eq(tenantsTable.id, lot.tenantId)).for("update");
      if (tenant?.leaseStart && endDate < tenant.leaseStart) {
        throw new FinanceError(400, "END_BEFORE_START", `La date de départ précède le début du bail (${tenant.leaseStart})`);
      }
      // The tenant keeps their history (lot, dates) but no longer has access.
      if (tenant) {
        await tx.update(tenantsTable).set({ status: "expired", leaseEnd: endDate }).where(eq(tenantsTable.id, tenant.id));
      }
      await tx
        .update(lotsTable)
        .set({ tenantId: null, status: parsed.data.nextStatus, version: lot.version + 1, updatedAt: new Date() })
        .where(eq(lotsTable.id, lot.id));
      return tenant;
    });
    await serverAuditLog(req, {
      action: "LOT_TENANCY_ENDED",
      entity: "lot",
      entityId: String(req.params.id),
      syndicateId,
      details: JSON.stringify({ tenantId: ended?.id, endDate, nextStatus: parsed.data.nextStatus, reason: parsed.data.reason }),
    });
    res.json({ data: { tenantId: ended?.id, endDate }, message: "Départ du locataire enregistré" });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

// ─── Archive / restore / delete ───────────────────────────────────────────────

router.post("/lots/:id/archive", requireAuth, async (req, res) => {
  try {
    requireRoles(req, OWNERSHIP_MANAGERS);
    const syndicateId = scopeSyndicateId(req);
    const parsed = z
      .object({ reason: z.string().trim().min(3, "Indiquez le motif de l'archivage").max(300), acknowledgeOutstanding: z.boolean().optional() })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) return void res.status(400).json(firstIssue(parsed.error));
    const outstanding = await outstandingOf(String(req.params.id));
    const lot = await db.transaction(async (tx) => {
      const { lot } = await loadScopedLot(String(req.params.id), syndicateId, tx);
      if (lot.archivedAt) throw new FinanceError(409, "LOT_ARCHIVED", "Lot déjà archivé");
      if (lot.tenantId) throw new FinanceError(409, "TENANCY_ACTIVE", "Enregistrez d'abord le départ du locataire");
      if (outstanding.underReview > 0) throw new FinanceError(409, "PAYMENT_UNDER_REVIEW", "Un paiement est en cours de validation sur ce lot");
      if (toCents(outstanding.total) > 0 && !parsed.data.acknowledgeOutstanding) {
        throw new FinanceError(409, "OUTSTANDING_BALANCE", `Le lot a ${outstanding.total} MAD d'impayés (ils restent dus). Confirmez pour archiver.`);
      }
      const [row] = await tx
        .update(lotsTable)
        .set({ archivedAt: new Date(), archivedBy: req.user!.userId, archiveReason: parsed.data.reason, version: lot.version + 1, updatedAt: new Date() })
        .where(eq(lotsTable.id, lot.id))
        .returning();
      return row;
    });
    await serverAuditLog(req, { action: "LOT_ARCHIVED", entity: "lot", entityId: lot.id, syndicateId, details: parsed.data.reason });
    res.json({ data: lot, message: "Lot archivé (historique conservé)" });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

router.post("/lots/:id/restore", requireAuth, async (req, res) => {
  try {
    requireRoles(req, OWNERSHIP_MANAGERS);
    const syndicateId = scopeSyndicateId(req);
    const lot = await db.transaction(async (tx) => {
      const { lot } = await loadScopedLot(String(req.params.id), syndicateId, tx);
      if (!lot.archivedAt) throw new FinanceError(409, "LOT_NOT_ARCHIVED", "Ce lot n'est pas archivé");
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"lots:" + lot.buildingId}))`);
      try {
        const [row] = await tx
          .update(lotsTable)
          .set({ archivedAt: null, archivedBy: null, archiveReason: null, version: lot.version + 1, updatedAt: new Date() })
          .where(eq(lotsTable.id, lot.id))
          .returning();
        return row;
      } catch (err) {
        referenceConflict(err);
      }
    });
    await serverAuditLog(req, { action: "LOT_RESTORED", entity: "lot", entityId: lot.id, syndicateId });
    res.json({ data: lot, message: "Lot restauré" });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

/**
 * Hard delete only for a lot created by mistake, with no life at all: no call
 * for funds, tenancy, ownership history, work, claim, document, vehicle or
 * parking spot. Anything else must be archived (history is never destroyed).
 */
router.delete("/lots/:id", requireAuth, async (req, res) => {
  try {
    requireRoles(req, OWNERSHIP_MANAGERS);
    const syndicateId = scopeSyndicateId(req);
    const lotId = String(req.params.id);
    const { lot } = await loadScopedLot(lotId, syndicateId);
    const counts = await db.execute<Record<string, number>>(sql`
      SELECT
        (SELECT COUNT(*)::int FROM appels_de_fonds WHERE lot_id = ${lotId}) AS "callsForFunds",
        (SELECT COUNT(*)::int FROM tenants WHERE lot_id = ${lotId}) AS "tenancies",
        (SELECT COUNT(*)::int FROM lot_ownerships WHERE lot_id = ${lotId} AND end_date IS NOT NULL) AS "pastOwnerships",
        (SELECT COUNT(*)::int FROM travaux WHERE lot_id = ${lotId}) AS "works",
        (SELECT COUNT(*)::int FROM sinistres WHERE lot_id = ${lotId}) AS "claims",
        (SELECT COUNT(*)::int FROM documents WHERE generation_params->>'lotId' = ${lotId}) AS "documents",
        (SELECT COUNT(*)::int FROM vehicles WHERE lot_id = ${lotId}) AS "vehicles",
        (SELECT COUNT(*)::int FROM parking_spots WHERE lot_id = ${lotId}) AS "parkingSpots",
        (SELECT COUNT(*)::int FROM debt_escalations WHERE lot_id = ${lotId}) AS "debtEscalations"
    `);
    const deps = (counts as unknown as Record<string, number>[])[0] ?? {};
    const blocking = Object.entries(deps).filter(([, n]) => Number(n) > 0);
    if (blocking.length) {
      return void res.status(409).json({
        error: "Ce lot a un historique : archivez-le au lieu de le supprimer.",
        code: "LOT_HAS_HISTORY",
        dependencies: Object.fromEntries(blocking),
      });
    }
    await db.transaction(async (tx) => {
      await tx.delete(lotOwnershipsTable).where(eq(lotOwnershipsTable.lotId, lotId));
      await tx.delete(lotsTable).where(eq(lotsTable.id, lotId));
      await tx
        .update(buildingsTable)
        .set({ totalLots: sql`GREATEST(${buildingsTable.totalLots} - 1, 0)` })
        .where(eq(buildingsTable.id, lot.buildingId));
    });
    await serverAuditLog(req, { action: "LOT_DELETED", entity: "lot", entityId: lotId, syndicateId, details: lot.number });
    res.json({ success: true });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

// ─── Import ───────────────────────────────────────────────────────────────────

const importRowSchema = lotFieldsSchema.extend({
  type: z.enum(LOT_TYPES).default("appartement"),
  ownerEmail: z.string().trim().email().optional(),
});

/**
 * Bulk import of lots into one building. Every row is validated; duplicates
 * (already in the building, or twice in the file) and unknown owners are
 * reported with their row number. Valid rows are created together; with
 * dryRun nothing is written.
 */
router.post("/lots/import", requireAuth, async (req, res) => {
  try {
    requireRoles(req, REGISTER_EDITORS);
    const syndicateId = scopeSyndicateId(req);
    const body = z
      .object({ buildingId: z.string().min(1), dryRun: z.boolean().default(false), rows: z.array(z.unknown()).min(1).max(1000) })
      .strict()
      .safeParse(req.body);
    if (!body.success) return void res.status(400).json(firstIssue(body.error));
    await assertBuildingOfSyndicate(body.data.buildingId, syndicateId);

    const existing = await db
      .select({ number: lotsTable.number })
      .from(lotsTable)
      .where(and(eq(lotsTable.buildingId, body.data.buildingId), isNull(lotsTable.archivedAt)));
    const taken = new Set(existing.map((l) => l.number.trim().toLowerCase()));
    const members = await db
      .select({ id: membersTable.id, email: membersTable.email })
      .from(membersTable)
      .where(eq(membersTable.syndicateId, syndicateId));
    const memberByEmail = new Map(members.map((m) => [m.email.toLowerCase(), m.id]));

    const errors: { row: number; number?: string; reason: string }[] = [];
    const valid: { row: number; input: z.infer<typeof createLotSchema> }[] = [];
    const seen = new Set<string>();
    body.data.rows.forEach((raw, i) => {
      const rowNo = i + 1;
      const parsed = importRowSchema.safeParse(raw);
      const number = typeof (raw as any)?.number === "string" ? (raw as any).number : undefined;
      if (!parsed.success) return void errors.push({ row: rowNo, number, reason: parsed.error.issues[0]?.message ?? "Ligne invalide" });
      const r = parsed.data;
      const key = r.number.toLowerCase();
      if (taken.has(key)) return void errors.push({ row: rowNo, number: r.number, reason: "Référence déjà utilisée dans cet immeuble" });
      if (seen.has(key)) return void errors.push({ row: rowNo, number: r.number, reason: "Référence en double dans le fichier" });
      if (!FLOORLESS_TYPES.has(r.type) && (r.floor === undefined || r.floor === null)) {
        return void errors.push({ row: rowNo, number: r.number, reason: "Étage obligatoire pour ce type de lot" });
      }
      let ownerId: string | undefined;
      if (r.ownerEmail) {
        ownerId = memberByEmail.get(r.ownerEmail.toLowerCase());
        if (!ownerId) return void errors.push({ row: rowNo, number: r.number, reason: `Propriétaire inconnu : ${r.ownerEmail} (créez d'abord le copropriétaire)` });
      }
      seen.add(key);
      const { ownerEmail: _e, ...fields } = r;
      valid.push({ row: rowNo, input: { ...fields, buildingId: body.data.buildingId, ownerId } as z.infer<typeof createLotSchema> });
    });

    let created: { row: number; id: string; number: string }[] = [];
    if (!body.data.dryRun && valid.length) {
      created = await db.transaction(async (tx) => {
        const out: { row: number; id: string; number: string }[] = [];
        for (const v of valid) {
          const lot = await insertLot(tx, v.input, syndicateId, req.user!.userId);
          out.push({ row: v.row, id: lot.id, number: lot.number });
        }
        return out;
      });
      await serverAuditLog(req, {
        action: "LOTS_IMPORTED",
        entity: "building",
        entityId: body.data.buildingId,
        syndicateId,
        details: `${created.length} lot(s) importé(s), ${errors.length} ligne(s) refusée(s)`,
      });
    }
    res.status(body.data.dryRun ? 200 : 201).json({
      data: { dryRun: body.data.dryRun, valid: valid.length, created, errors },
      message: body.data.dryRun
        ? `${valid.length} ligne(s) valide(s), ${errors.length} en erreur`
        : `${created.length} lot(s) importé(s), ${errors.length} ligne(s) refusée(s)`,
    });
  } catch (e) {
    sendFinanceError(res, req, e);
  }
});

export default router;
