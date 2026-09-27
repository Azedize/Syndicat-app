/**
 * One-time adoption of versioned migrations for a database that was created
 * with `drizzle-kit push` (before lib/db/drizzle/ existed).
 *
 * Records the baseline migration (0000) as already applied — without running
 * it — so `pnpm db:migrate` only applies later migrations. Refuses to run if
 * the schema looks empty (use `pnpm db:migrate` on a fresh database instead)
 * or if migrations were already recorded.
 *
 * Usage: pnpm --filter @workspace/db run db:mark-baseline
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { sql } from "drizzle-orm";
import { db, pool } from "./index";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle");

async function main() {
  const [baseline] = readMigrationFiles({ migrationsFolder });
  if (!baseline) throw new Error(`No migrations found in ${migrationsFolder}`);

  const tables = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = 'users'`,
  );
  if (Number(tables[0]?.n ?? 0) === 0) {
    throw new Error("Empty schema: run `pnpm db:migrate` instead of marking the baseline.");
  }

  await db.execute(sql`create schema if not exists drizzle`);
  await db.execute(sql`
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )`);
  const existing = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
  );
  if (Number(existing[0]?.n ?? 0) > 0) {
    console.log("Migrations already recorded — nothing to do.");
    return;
  }
  await db.execute(
    sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${baseline.hash}, ${baseline.folderMillis})`,
  );
  console.log("Baseline migration recorded as applied.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
