---
name: Database seed script
description: Where test data lives and how to reseed the SYNDYCAT dev database
---

`pnpm --filter @workspace/scripts run seed` (scripts/src/seed.ts) inserts realistic test
data for all 4 roles (super_admin, syndicate_admin, member, tenant) across the full
Drizzle schema (2 syndicates, 2 buildings, marketplace, ideas, transparency, rankings,
subscriptions, auth tokens, etc.). All demo accounts use password `password123`.

**Why:** replit.md referenced a `seed` script that didn't exist; `lib/db` has no seed
script of its own, so it was added under `scripts/` (depends on `@workspace/db`).

**How to apply:** Not idempotent — fixed ids will collide on rerun. To reseed, drop/recreate
the public schema, run `pnpm --filter @workspace/db run db:push`, then run the seed script.
When adding new tables to schema.ts, prefer linking `userId`-style columns to real
`users.id` values (not member/salary-record ids) even where the column lacks an FK, so
API code that filters by authenticated user id works against seed data.
