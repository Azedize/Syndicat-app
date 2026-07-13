# SYNDYCAT GLOBAL CPS

A property-management platform (copropriété / syndic) with a React Native mobile app, an Express REST API, and a shared component sandbox.

## Project structure

```
artifacts/
  api-server/       Express v5 + Drizzle ORM + PostgreSQL + Redis
  mobile/           Expo (React Native) with Expo Router v6
  mockup-sandbox/   Vite + React design sandbox
lib/
  db/               Drizzle schema, migrations, seed scripts
  api-zod/          Shared Zod contracts (request/response shapes)
  api-client-react/ React Query hooks for the mobile app
scripts/
  setup-replit.sh   One-command bootstrap for fresh Replit imports
```

## First-time setup (after import or fresh clone)

Run the bootstrap script — it handles everything in order:

```bash
bash scripts/setup-replit.sh
```

Or run steps manually:

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set required secrets

Add these in Replit Secrets before starting the API:

| Secret | Required | Notes |
|---|---|---|
| `JWT_SECRET` | ✅ Yes | Min 32 chars — used for auth token signing |
| `DATABASE_URL` | ✅ Auto | Injected automatically by Replit Postgres — do not set manually |
| `REDIS_URL` | No | Enables Redis-backed rate limiting; falls back to in-memory |

### 3. Apply the database schema and seed demo data

```bash
pnpm --filter @workspace/db run db:push
pnpm --filter @workspace/scripts run seed
```

### 4. Start the workflows

Three workflows are pre-configured and start automatically:

| Workflow | Command |
|---|---|
| API Server | `pnpm --filter @workspace/api-server run dev` |
| Mobile (Expo) | `pnpm --filter @workspace/mobile run dev` |
| Component Preview | `pnpm --filter @workspace/mockup-sandbox run dev` |

## Demo credentials

Pre-filled on the login screen:

| Role | Email | Password |
|---|---|---|
| Admin Syndicat | `syndic@andalous.ma` | `password123` |
| Super Admin | `superadmin@syndycat.ma` | `password123` |
| Membre | `ahmed.benali@gmail.com` | `password123` |

## Notes

- API routes are mounted under `/api` (e.g. `/api/auth/login`), not at the bare route paths defined in `src/routes/*.ts`.
- Pre-existing TypeScript errors exist in `api-server` — runtime is unaffected but `tsc` does not pass cleanly.

## Environment setup status (2026-07-13, re-verified after zip re-import)

| Step | Status |
|---|---|
| `pnpm install` | ✅ Done |
| `JWT_SECRET` Replit Secret | ✅ Set (re-generated after re-import; secrets don't survive a zip export/import) |
| `DATABASE_URL` | ✅ Auto-injected by Replit Postgres |
| `db:push` (schema applied) | ✅ Done — all tables created |
| `seed` (demo data) | ✅ Done — all tables populated |
| API Server workflow | ✅ Running on port 8080, login verified end-to-end |
| Mobile (Expo) workflow | ✅ Running |
| Component Preview Server | ✅ Running |

## User preferences

<!-- Add any personal preferences or conventions here -->
