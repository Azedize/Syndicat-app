/**
 * Reference data only (2026-11-09): the subscription plans the application
 * and the test-data generator (seedgen) rely on. Unlike src/seed.ts it creates
 * no demo account and no demo condominium.
 *
 *   node --env-file=../.env --import=tsx src/seed-reference.ts
 *
 * Idempotent (fixed ids, existing rows kept). Local, non-production database only.
 * Values: the same as src/seed.ts (monthly prices in MAD).
 */
import { db, pool } from "@workspace/db";
import { subscriptionPlansTable } from "@workspace/db/schema";

const target = (() => { try { return new URL(process.env.DATABASE_URL ?? ""); } catch { return null; } })();
if (process.env.NODE_ENV === "production" || !target || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(target.hostname)) {
  console.error("seed-reference: refused — local development or test database only.");
  process.exit(1);
}

const inserted = await db
  .insert(subscriptionPlansTable)
  .values([
    { id: "plan_basic", name: "Basique", price: "299.00", interval: "monthly", features: JSON.stringify(["Gestion des charges", "1 bâtiment", "Support email"]) },
    { id: "plan_pro", name: "Pro", price: "699.00", interval: "monthly", features: JSON.stringify(["Multi-bâtiments", "Marketplace", "Support prioritaire", "Transparence financière", "Audit logs"]) },
    { id: "plan_premium", name: "Premium", price: "1299.00", interval: "monthly", features: JSON.stringify(["Multi-syndicats", "API access", "Tableau national", "SLA 99.9%", "Account manager dédié"]) },
  ] as any)
  .onConflictDoNothing()
  .returning({ id: subscriptionPlansTable.id });
console.log(`subscription plans: ${inserted.length} inserted (${inserted.map((r) => r.id).join(", ") || "already present"})`);
await pool.end();
