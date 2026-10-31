import { db } from "@workspace/db";
import {
  appelsDeFondsTable,
  lotOwnershipsTable,
  lotsTable,
  membersTable,
  tenantsTable,
} from "@workspace/db/schema";
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { JwtPayload } from "../middleware/auth.js";
import { localToday } from "./charge-time.js";

/**
 * Ownership & occupancy rules of a lot (unit).
 *
 * - Ownership lives in lot_ownerships: one row per owner and period, with a
 *   share in percent. A period is current when start_date <= today and
 *   (end_date IS NULL OR end_date > today). A transfer closes rows; it never
 *   rewrites them.
 * - lots.owner_id is the main owner (largest current share), kept in sync for
 *   the code that addresses one person (charge generation, letters).
 * - Calls for funds keep the owner they were issued to. A co-owner sees a call
 *   when they owned the lot at the time it was issued.
 * - Occupancy: lots.status occupied | rented | vacant, with the current
 *   tenancy in lots.tenant_id (tenants row with lease dates).
 */

type Executor = Pick<typeof db, "select" | "update">;

export function todayIso(): string {
  return localToday();
}

/** Condition "this ownership row is current today". */
export function currentOwnershipSql(on = todayIso()): SQL {
  return and(
    lte(lotOwnershipsTable.startDate, on),
    or(isNull(lotOwnershipsTable.endDate), gt(lotOwnershipsTable.endDate, on)),
  )!;
}

/** members.id records of the signed-in person in their syndicate (+ users.id for legacy rows). */
export async function memberIdsOf(user: JwtPayload): Promise<string[]> {
  if (!user.syndicateId) return [user.userId];
  const rows = await db
    .select({ id: membersTable.id })
    .from(membersTable)
    .where(
      and(
        sql`lower(${membersTable.email}) = lower(${user.email})`,
        eq(membersTable.syndicateId, user.syndicateId),
      ),
    );
  return [user.userId, ...rows.map((r) => r.id)];
}

/** Lots the person currently owns (any share), in their syndicate. */
export async function currentlyOwnedLotIds(user: JwtPayload): Promise<string[]> {
  if (!user.syndicateId) return [];
  const ids = await memberIdsOf(user);
  const rows = await db
    .select({ lotId: lotOwnershipsTable.lotId })
    .from(lotOwnershipsTable)
    .where(
      and(
        inArray(lotOwnershipsTable.memberId, ids),
        eq(lotOwnershipsTable.syndicateId, user.syndicateId),
        currentOwnershipSql(),
      ),
    );
  return [...new Set(rows.map((r) => r.lotId))];
}

export async function isCurrentLotOwner(user: JwtPayload, lotId: string): Promise<boolean> {
  return (await currentlyOwnedLotIds(user)).includes(lotId);
}

/** Lots the tenant currently occupies (active lease, not ended). */
export async function currentlyRentedLotIds(user: JwtPayload): Promise<string[]> {
  if (!user.syndicateId) return [];
  const today = todayIso();
  const rows = await db
    .select({ lotId: tenantsTable.lotId })
    .from(tenantsTable)
    .where(
      and(
        or(eq(tenantsTable.id, user.userId), sql`lower(${tenantsTable.email}) = lower(${user.email})`),
        eq(tenantsTable.syndicateId, user.syndicateId),
        eq(tenantsTable.status, "active"),
        or(isNull(tenantsTable.leaseStart), eq(tenantsTable.leaseStart, ""), lte(tenantsTable.leaseStart, today)),
        or(isNull(tenantsTable.leaseEnd), eq(tenantsTable.leaseEnd, ""), sql`${tenantsTable.leaseEnd} >= ${today}`),
      ),
    );
  return [...new Set(rows.map((r) => r.lotId).filter((v): v is string => !!v))];
}

/**
 * Calls for funds a resident may see and pay: those whose debtors (the
 * co-owners recorded when the call was issued) include one of their member
 * records. The snapshot is immutable: a later sale never moves a debt to the
 * buyer, and a seller keeps their own calls.
 */
export function chargesOfPersonSql(memberIds: string[]): SQL {
  const list = sql`ARRAY[${sql.join(memberIds.map((m) => sql`${m}`), sql`, `)}]::text[]`;
  return or(
    inArray(appelsDeFondsTable.ownerId, memberIds),
    sql`${appelsDeFondsTable.debtorMemberIds} && ${list}`,
  )!;
}

/** True when the person may act on this call for funds as its debtor. */
export async function isDebtorOfCharge(user: JwtPayload, appelId: string): Promise<boolean> {
  const ids = await memberIdsOf(user);
  const [row] = await db
    .select({ id: appelsDeFondsTable.id })
    .from(appelsDeFondsTable)
    .where(and(eq(appelsDeFondsTable.id, appelId), chargesOfPersonSql(ids)))
    .limit(1);
  return !!row;
}

export interface CurrentOwner {
  ownershipId: string;
  lotId: string;
  memberId: string;
  name: string;
  email: string;
  phone: string | null;
  sharePercent: string;
  startDate: string;
}

/** Current owners of the given lots, largest share first. */
export async function currentOwnersOf(lotIds: string[]): Promise<Map<string, CurrentOwner[]>> {
  const map = new Map<string, CurrentOwner[]>();
  if (lotIds.length === 0) return map;
  const rows = await db
    .select({
      ownershipId: lotOwnershipsTable.id,
      lotId: lotOwnershipsTable.lotId,
      memberId: lotOwnershipsTable.memberId,
      name: membersTable.name,
      email: membersTable.email,
      phone: membersTable.phone,
      sharePercent: lotOwnershipsTable.sharePercent,
      startDate: lotOwnershipsTable.startDate,
    })
    .from(lotOwnershipsTable)
    .innerJoin(membersTable, eq(membersTable.id, lotOwnershipsTable.memberId))
    .where(and(inArray(lotOwnershipsTable.lotId, lotIds), currentOwnershipSql()))
    .orderBy(desc(lotOwnershipsTable.sharePercent), asc(lotOwnershipsTable.startDate));
  for (const r of rows) {
    const list = map.get(r.lotId) ?? [];
    list.push(r);
    map.set(r.lotId, list);
  }
  return map;
}

/** Re-points lots.owner_id to the current main owner (largest share, then earliest). */
export async function syncMainOwner(executor: Executor, lotId: string): Promise<string | null> {
  const [main] = await executor
    .select({ memberId: lotOwnershipsTable.memberId })
    .from(lotOwnershipsTable)
    .where(and(eq(lotOwnershipsTable.lotId, lotId), currentOwnershipSql()))
    .orderBy(desc(lotOwnershipsTable.sharePercent), asc(lotOwnershipsTable.startDate), asc(lotOwnershipsTable.memberId))
    .limit(1);
  const ownerId = main?.memberId ?? null;
  await executor.update(lotsTable).set({ ownerId }).where(eq(lotsTable.id, lotId));
  return ownerId;
}

/**
 * Re-derives a lot's occupancy from its tenancies: the current active,
 * unexpired lease (if any) becomes lots.tenant_id and the lot is "rented";
 * a lot that was rented without a current lease becomes "vacant".
 */
export async function syncLotOccupancy(executor: Executor, lotId: string): Promise<void> {
  const today = todayIso();
  const [current] = await executor
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(
      and(
        eq(tenantsTable.lotId, lotId),
        eq(tenantsTable.status, "active"),
        or(isNull(tenantsTable.leaseEnd), eq(tenantsTable.leaseEnd, ""), sql`${tenantsTable.leaseEnd} >= ${today}`),
      ),
    )
    .orderBy(desc(tenantsTable.createdAt))
    .limit(1);
  const [lot] = await executor.select({ status: lotsTable.status, tenantId: lotsTable.tenantId }).from(lotsTable).where(eq(lotsTable.id, lotId));
  if (!lot) return;
  const tenantId = current?.id ?? null;
  const status = tenantId ? "rented" : lot.status === "rented" ? "vacant" : lot.status;
  if (tenantId === lot.tenantId && status === lot.status) return;
  await executor
    .update(lotsTable)
    .set({ tenantId, status, version: sql`${lotsTable.version} + 1`, updatedAt: new Date() })
    .where(eq(lotsTable.id, lotId));
}

/** True when another active, unexpired lease already occupies the lot. */
export async function lotHasOtherActiveTenancy(lotId: string, exceptTenantId?: string): Promise<boolean> {
  const today = todayIso();
  const rows = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(
      and(
        eq(tenantsTable.lotId, lotId),
        eq(tenantsTable.status, "active"),
        or(isNull(tenantsTable.leaseEnd), eq(tenantsTable.leaseEnd, ""), sql`${tenantsTable.leaseEnd} >= ${today}`),
      ),
    );
  return rows.some((r) => r.id !== exceptTenantId);
}
