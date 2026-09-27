import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

export const pool = postgres(process.env.DATABASE_URL, { max: 10 });

export * from "./schema";

export const db = drizzle(pool, { schema });
