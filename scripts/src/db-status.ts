import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

try {
  const [{ currentDatabase }] = await db.execute<{ currentDatabase: string }>(sql`
    SELECT current_database() AS "currentDatabase"
  `);
  const [{ tableCount }] = await db.execute<{ tableCount: string }>(sql`
    SELECT count(*)::text AS "tableCount"
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);

  console.log(`Database: ${currentDatabase}`);
  console.log(`Public tables: ${tableCount}`);
} finally {
  await pool.end();
}