/**
 * Removes ONLY the data of one generator run, identified by its markers:
 *   syndicates.creation_key LIKE '<runKey>:%', organizations.created_by =
 *   <runKey>, users of the run's reserved e-mail sub-domain.
 * Every other row is selected by following the real foreign keys (and the
 * few user/product references the schema keeps without a foreign key) back
 * to those roots; tables are emptied children first, in one transaction.
 * Nothing is removed because it "looks" fictitious.
 */
import { pool } from "@workspace/db";
import type { TableInfo } from "./introspect.js";
import { dependencyOrder } from "./introspect.js";
import { removeUpload } from "./files.js";

/** References kept without a foreign key in the schema (column → table). */
const SOFT_REFS: Record<string, Array<[string, string]>> = {
  cart_items: [["user_id", "users"]],
  orders: [["buyer_id", "users"], ["seller_id", "users"]],
  reviews: [["reviewer_id", "users"]],
  notification_preferences: [["user_id", "users"]],
  product_comments: [["user_id", "users"]],
  product_favorites: [["user_id", "users"]],
  product_reports: [["reporter_id", "users"]],
  marketplace_promotions: [["seller_id", "users"]],
  payslips: [["user_id", "users"]],
  audit_logs: [["user_id", "users"]],
  claim_notifications: [["user_id", "users"]],
  allocation_key_versions: [["created_by", "users"]],
};

/** Root conditions of a data set: everything else is reached through foreign keys. */
export interface Roots {
  syndicates: string;
  organizations: string;
  users: string;
}
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
/** One generator run. */
export const runRoots = (runKey: string, domain: string): Roots => ({
  syndicates: `creation_key LIKE ${lit(`${runKey}:%`)}`,
  organizations: `created_by = ${lit(runKey)}`,
  users: `email LIKE ${lit(`%@${domain}`)}`,
});
/** Every generator run, whatever its seed (markers seedgen:* and *.seedgen.mizan.test). */
export const allRunsRoots = (emailRoot: string): Roots => ({
  syndicates: `creation_key LIKE 'seedgen:%'`,
  organizations: `created_by LIKE 'seedgen:%'`,
  users: `email LIKE ${lit(`%.${emailRoot}`)}`,
});

export function runPredicates(tables: TableInfo[], runKey: string, domain: string): Map<string, string> {
  return predicates(tables, runRoots(runKey, domain));
}

export function predicates(tables: TableInfo[], roots: Roots): Map<string, string> {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const memo = new Map<string, string>();
  const visiting = new Set<string>();
  const pred = (name: string): string => {
    if (memo.has(name)) return memo.get(name)!;
    if (visiting.has(name)) return "FALSE";
    visiting.add(name);
    const t = byName.get(name)!;
    const cols = new Set(t.columns.map((c) => c.name));
    const parts: string[] = [];
    if (name === "syndicates") parts.push(roots.syndicates);
    else if (name === "organizations") parts.push(roots.organizations);
    else if (name === "users") parts.push(roots.users);
    else {
      if (cols.has("syndicate_id")) parts.push(`syndicate_id IN (SELECT id FROM syndicates WHERE ${pred("syndicates")})`);
      for (const fk of t.foreignKeys) {
        if (fk.refTable === name || fk.columns.length !== 1 || fk.refTable === "syndicates") continue;
        parts.push(`${fk.columns[0]} IN (SELECT ${fk.refColumns[0]} FROM ${fk.refTable} WHERE ${pred(fk.refTable)})`);
      }
      for (const [col, ref] of SOFT_REFS[name] ?? []) if (cols.has(col)) parts.push(`${col} IN (SELECT id FROM ${ref} WHERE ${pred(ref)})`);
      // a product of the run (marketplace children)
      if (cols.has("product_id") && !t.foreignKeys.some((f) => f.columns[0] === "product_id") && name !== "products") parts.push(`product_id IN (SELECT id FROM products WHERE ${pred("products")})`);
    }
    visiting.delete(name);
    const p = parts.length ? `(${parts.join(" OR ")})` : "FALSE";
    memo.set(name, p);
    return p;
  };
  const out = new Map<string, string>();
  for (const t of tables) out.set(t.name, pred(t.name));
  return out;
}

export async function cleanupRun(tables: TableInfo[], runKey: string, domain: string, log: (m: string) => void): Promise<Map<string, number>> {
  return removeSet(tables, predicates(tables, runRoots(runKey, domain)), log);
}

/** Rows (per table) and files a removal would touch, without changing anything. */
export async function planRemoval(tables: TableInfo[], preds: Map<string, string>): Promise<{ rows: Map<string, number>; files: string[] }> {
  const rows = new Map<string, number>();
  for (const name of dependencyOrder(tables).order.reverse()) {
    const p = preds.get(name)!;
    if (p === "FALSE") continue;
    const [r] = (await pool.unsafe(`SELECT COUNT(*)::int AS n FROM "${name}" WHERE ${p}`)) as unknown as { n: number }[];
    if (r.n) rows.set(name, r.n);
  }
  return { rows, files: await filesOf(preds) };
}

/**
 * Files that belong to the set: registered in storage_objects by a row of the
 * set, under the local uploads folder, and referenced by no row outside it.
 */
async function filesOf(preds: Map<string, string>): Promise<string[]> {
  const inSet = (t: string) => `(SELECT id FROM "${t}" WHERE ${preds.get(t)})`;
  const rows = (await pool.unsafe(`
    SELECT DISTINCT s.object_path FROM storage_objects s
    WHERE s.id IN ${inSet("storage_objects")} AND s.object_path LIKE '/objects/uploads/%'
      AND NOT EXISTS (SELECT 1 FROM storage_objects o WHERE o.object_path = s.object_path AND o.id NOT IN ${inSet("storage_objects")})
      AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.file_url = s.object_path AND d.id NOT IN ${inSet("documents")})`)) as unknown as { object_path: string }[];
  return rows.map((r) => r.object_path);
}

/** Deletes a set children first in one transaction, then its files. */
export async function removeSet(tables: TableInfo[], preds: Map<string, string>, log: (m: string) => void): Promise<Map<string, number>> {
  const order = dependencyOrder(tables).order.reverse();
  const removed = new Map<string, number>();
  // files of the set (deleted from disk once the rows are gone)
  const files = await filesOf(preds);
  await pool.begin(async (tx) => {
    await tx.unsafe("SET LOCAL mizan.ledger_maintenance = 'on'");
    // self references first (corrections, reversals) so rows can go in any order
    await tx.unsafe(`UPDATE allocations SET correction_of = NULL WHERE ${preds.get("allocations")}`);
    // The set is fixed BEFORE the first deletion: a reference kept without a
    // foreign key (orders.buyer_id → users…) gives no deletion order, and its
    // condition would match nothing once the parent rows are gone.
    const snap = new Map<string, string>();
    for (const [i, t] of tables.entries()) {
      const p = preds.get(t.name)!;
      if (p === "FALSE" || !t.columns.some((c) => c.name === "id")) continue;
      const tmp = `_seedgen_rm_${i}`;
      await tx.unsafe(`CREATE TEMP TABLE ${tmp} ON COMMIT DROP AS SELECT id FROM "${t.name}" WHERE ${p}`);
      snap.set(t.name, `id IN (SELECT id FROM ${tmp})`);
    }
    for (const name of order) {
      const p = snap.get(name) ?? preds.get(name)!;
      if (p === "FALSE") continue;
      const res = await tx.unsafe(`DELETE FROM "${name}" WHERE ${p}`);
      if (res.count) {
        removed.set(name, res.count);
        log(`  ${name}: ${res.count}`);
      }
    }
  });
  for (const f of files) await removeUpload(f);
  removed.set("(fichiers)", files.length);
  return removed;
}
