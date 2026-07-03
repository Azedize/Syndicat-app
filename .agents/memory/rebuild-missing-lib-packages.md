---
name: Rebuilding missing workspace lib packages
description: How to reconstruct a missing lib/db (or similar) workspace package when route/consumer code still imports it but the directory is gone from disk.
---

When a monorepo has `tsconfig.json`/`package.json` files referencing `./lib/db`, `./lib/api-zod`, etc., but those directories don't exist:

- The consuming code (e.g. `artifacts/api-server/src/routes/*.ts`) is the authoritative source of truth for table/column names and types — more reliable than an old SQL dump pasted earlier in a session, since routes reflect what the app actually expects today.
- Different consumers of the same table can disagree on column names for the same logical field (e.g. one route inserts `proofUrl`/`uploadedById`, a seed script inserts `file_url`/`user_id` for the same table). Resolution: add both columns as nullable rather than picking one — cheaper than tracing every caller, and keeps both code paths working.
- IDs in these schemas are typically `text` primary keys defaulting to `gen_random_uuid()::text`, not Postgres `uuid` type or serial ints. Enums are plain `text` columns validated at the app/zod level, not Postgres enums.
- After rebuilding schema.ts, use `drizzle-kit push --force` (not migrations) to sync a fresh Postgres DB quickly.
- Workspace `pnpm-workspace.yaml` may declare a `file:./lib/shell-quote` override stub for a blocked npm package — if that directory is also missing, recreate it as a minimal package.json + index.js implementing the real package's public API (e.g. shell-quote's `parse`/`quote`), otherwise `pnpm install` fails workspace-wide with `ERR_PNPM_LINKED_PKG_DIR_NOT_FOUND`.
- A `seed-all-tables.sql` script may only cover auxiliary/join tables and assume base entities (users, syndicates, etc.) already exist with specific hardcoded IDs — grep the seed file for all referenced foreign IDs and write a companion base-data seed script inserting exactly those IDs before running it.
- When seeding user password hashes, generate them with the exact bcrypt lib/rounds the app uses (`node -e "require('bcryptjs').hash(...)"` from inside the api-server package) rather than guessing a hash string — a wrong hash silently fails login with a generic "incorrect credentials" error.
