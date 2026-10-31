/**
 * Bulk insertion helpers on the postgres-js client: rows are grouped by
 * column set (absent columns keep their database DEFAULT), chunked under the
 * 65 535-parameter limit and inserted inside the caller's transaction.
 */
import { pool } from "@workspace/db";

export type Row = Record<string, unknown>;
// postgres-js client or transaction (both are tagged-template SQL functions).
export type Tx = any;

/** Collects rows per table while a tenant's graph is built in memory. */
export class Batch {
  readonly tables = new Map<string, Row[]>();
  add(table: string, row: Row): Row {
    const list = this.tables.get(table) ?? [];
    list.push(row);
    this.tables.set(table, list);
    return row;
  }
  count(table: string) {
    return this.tables.get(table)?.length ?? 0;
  }
}

export async function insertRows(tx: Tx, table: string, rows: Row[]): Promise<number> {
  if (!rows.length) return 0;
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const clean: Row = {};
    // drizzle replaces postgres-js date serializers: send ISO strings.
    for (const [k, v] of Object.entries(r)) if (v !== undefined) clean[k] = v instanceof Date ? v.toISOString() : v;
    const key = Object.keys(clean).sort().join(",");
    const g = groups.get(key) ?? [];
    g.push(clean);
    groups.set(key, g);
  }
  let n = 0;
  for (const [key, group] of groups) {
    const cols = key.split(",");
    const size = Math.max(1, Math.floor(60_000 / cols.length));
    for (let i = 0; i < group.length; i += size) {
      const chunk = group.slice(i, i + size);
      try {
        await (tx as any)`INSERT INTO ${(tx as any)(table)} ${(tx as any)(chunk, cols)}`;
      } catch (err) {
        (err as Error).message = `[${table}] ${(err as Error).message}`;
        throw err;
      }
      n += chunk.length;
    }
  }
  return n;
}

/** Inserts a batch following the database dependency order (parents first). */
export async function flush(tx: Tx, batch: Batch, order: string[], counts: Map<string, number>) {
  const known = new Set(order);
  for (const t of batch.tables.keys()) if (!known.has(t)) throw new Error(`Unknown table in batch: ${t}`);
  for (const table of order) {
    const rows = batch.tables.get(table);
    if (!rows?.length) continue;
    const n = await insertRows(tx, table, rows);
    counts.set(table, (counts.get(table) ?? 0) + n);
  }
  batch.tables.clear();
}
