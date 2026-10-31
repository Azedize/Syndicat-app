/**
 * Schema introspection from the live PostgreSQL catalog — never from a
 * hand-written list: every table of the `public` schema is discovered with
 * its columns, keys, constraints, indexes, triggers and exact row count.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
}
export interface ForeignKey {
  name: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete: string;
}
export interface TableInfo {
  name: string;
  rows: number;
  columns: ColumnInfo[];
  primaryKey: string[];
  foreignKeys: ForeignKey[];
  uniques: { name: string; definition: string }[];
  checks: { name: string; definition: string }[];
  indexes: { name: string; definition: string }[];
  triggers: string[];
}

const ON_DELETE: Record<string, string> = { a: "no action", r: "restrict", c: "cascade", n: "set null", d: "set default" };

export async function introspect(): Promise<TableInfo[]> {
  const tables = (await db.execute(sql`
    SELECT c.oid, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname NOT LIKE '\\_\\_%' ORDER BY c.relname`)) as unknown as { oid: number; name: string }[];
  const cols = (await db.execute(sql`
    SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default, ordinal_position
    FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`)) as unknown as Record<string, any>[];
  const cons = (await db.execute(sql`
    SELECT con.conname, con.contype, rel.relname AS table_name, frel.relname AS ref_table, con.confdeltype,
           pg_get_constraintdef(con.oid) AS def,
           ARRAY(SELECT a.attname FROM unnest(con.conkey) k JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k ORDER BY array_position(con.conkey, k)) AS cols,
           ARRAY(SELECT a.attname FROM unnest(con.confkey) k JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k ORDER BY array_position(con.confkey, k)) AS ref_cols
    FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid JOIN pg_namespace n ON n.oid = rel.relnamespace
    LEFT JOIN pg_class frel ON frel.oid = con.confrelid
    WHERE n.nspname = 'public'`)) as unknown as Record<string, any>[];
  const idx = (await db.execute(sql`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`)) as unknown as Record<string, any>[];
  const trg = (await db.execute(sql`
    SELECT c.relname AS table_name, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal`)) as unknown as Record<string, any>[];

  const out: TableInfo[] = [];
  for (const t of tables) {
    const [{ n }] = (await db.execute(sql.raw(`SELECT COUNT(*)::int AS n FROM "${t.name}"`))) as unknown as { n: number }[];
    const mine = cons.filter((c) => c.table_name === t.name);
    out.push({
      name: t.name,
      rows: n,
      columns: cols
        .filter((c) => c.table_name === t.name)
        .map((c) => ({ name: c.column_name, type: c.data_type === "USER-DEFINED" || c.data_type === "ARRAY" ? c.udt_name : c.data_type, nullable: c.is_nullable === "YES", default: c.column_default })),
      primaryKey: (mine.find((c) => c.contype === "p")?.cols ?? []) as string[],
      foreignKeys: mine
        .filter((c) => c.contype === "f")
        .map((c) => ({ name: c.conname, columns: c.cols, refTable: c.ref_table, refColumns: c.ref_cols, onDelete: ON_DELETE[c.confdeltype] ?? c.confdeltype })),
      uniques: mine.filter((c) => c.contype === "u").map((c) => ({ name: c.conname, definition: c.def })),
      checks: mine.filter((c) => c.contype === "c").map((c) => ({ name: c.conname, definition: c.def })),
      indexes: idx.filter((i) => i.tablename === t.name).map((i) => ({ name: i.indexname, definition: i.indexdef })),
      triggers: trg.filter((x) => x.table_name === t.name).map((x) => x.tgname),
    });
  }
  return out;
}

/** Parents first (Kahn), self-references ignored; cycles reported last. */
export function dependencyOrder(tables: TableInfo[]): { order: string[]; cycles: string[] } {
  const deps = new Map(tables.map((t) => [t.name, new Set(t.foreignKeys.map((f) => f.refTable).filter((r) => r !== t.name))]));
  const order: string[] = [];
  const done = new Set<string>();
  let progress = true;
  while (progress) {
    progress = false;
    for (const [name, d] of deps) {
      if (done.has(name)) continue;
      if ([...d].every((r) => done.has(r) || !deps.has(r))) {
        order.push(name);
        done.add(name);
        progress = true;
      }
    }
  }
  const cycles = [...deps.keys()].filter((n) => !done.has(n));
  return { order: [...order, ...cycles], cycles };
}
