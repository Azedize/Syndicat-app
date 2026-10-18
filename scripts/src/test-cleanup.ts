import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";

/**
 * Removes the allocations (charge-allocation runs) matched by `where` — a
 * condition on the "allocations" row alias `a` — with their lines and
 * sources. Test suites call it before deleting their calls for funds and
 * lots, which the allocation lines reference.
 */
export async function purgeAllocations(where: SQL): Promise<void> {
  await db.transaction(async (tx) => {
    const ids = sql`(SELECT a.id FROM allocations a WHERE ${where})`;
    const calls = sql`(SELECT id FROM appels_de_fonds WHERE allocation_id IN ${ids})`;
    await tx.execute(sql`DELETE FROM appel_reminders WHERE appel_id IN ${calls}`);
    await tx.execute(sql`DELETE FROM appel_adjustments WHERE appel_id IN ${calls}`);
    await tx.execute(sql`UPDATE allocations SET correction_of = NULL WHERE correction_of IN ${ids} OR id IN ${ids}`);
    await tx.execute(sql`DELETE FROM allocation_lines WHERE allocation_id IN ${ids}`);
    await tx.execute(sql`DELETE FROM allocation_sources WHERE allocation_id IN ${ids}`);
    await tx.execute(sql`DELETE FROM allocations WHERE id IN ${ids}`);
  });
}

/** Allocations of these periods (seeded buildings used by the suites). */
export async function purgeAllocationsOfPeriods(periods: string[]): Promise<void> {
  const list = sql.join(periods.map((p) => sql`${p}`), sql`, `);
  await purgeCallTrail(sql`period IN (${list})`);
  await purgeAllocations(sql`a.period IN (${list})`);
}

/**
 * Reminders and adjustments of the calls for funds matched by `where` (a
 * condition on appels_de_fonds). They reference the calls (restrict), and the
 * hourly upkeep job may remind an overdue test call: suites deleting calls
 * call this first.
 */
export async function purgeCallTrail(where: SQL): Promise<void> {
  const calls = sql`(SELECT id FROM appels_de_fonds WHERE ${where})`;
  await db.execute(sql`DELETE FROM appel_reminders WHERE appel_id IN ${calls}`);
  await db.execute(sql`DELETE FROM appel_adjustments WHERE appel_id IN ${calls}`);
}

/** Allocations and keys of these condominiums (suites that create their own). */
export async function purgeAllocationsOfSyndicates(syndicateIds: string[]): Promise<void> {
  if (syndicateIds.length === 0) return;
  const list = sql.join(syndicateIds.map((s) => sql`${s}`), sql`, `);
  await db.execute(sql`DELETE FROM appel_reminders WHERE syndicate_id IN (${list})`);
  await db.execute(sql`DELETE FROM appel_adjustments WHERE syndicate_id IN (${list})`);
  await purgeAllocations(sql`a.syndicate_id IN (${list})`);
  await db.execute(sql`DELETE FROM allocation_key_shares WHERE version_id IN (SELECT v.id FROM allocation_key_versions v JOIN allocation_keys k ON k.id = v.key_id WHERE k.syndicate_id IN (${list}))`);
  await db.execute(sql`DELETE FROM allocation_key_versions WHERE key_id IN (SELECT id FROM allocation_keys WHERE syndicate_id IN (${list}))`);
  await db.execute(sql`DELETE FROM allocation_keys WHERE syndicate_id IN (${list})`);
}
