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
```

## Running the project

### 1. Install dependencies (first time / after clean clone)

```bash
pnpm install
```

### 2. Set required secrets

Add these in Replit Secrets before starting the API:

| Secret | Required | Notes |
|---|---|---|
| `JWT_SECRET` | ✅ Yes | Min 32 chars — used for auth token signing. Already set as a Replit Secret. |
| `DATABASE_URL` | ✅ Auto | Injected automatically by Replit — do not set manually |
| `REDIS_URL` | No | Enables Redis-backed rate limiting; falls back to in-memory |

### 3. Apply the database schema

```bash
pnpm --filter @workspace/db run db:push
# Seed with sample/demo data (test accounts, password: password123)
pnpm --filter @workspace/scripts run seed
```

Note: API routes are mounted under `/api` (e.g. `/api/auth/login`), not at the
route paths defined in `src/routes/*.ts` directly.

### Environment setup status (2026-07-10, zip import)

The following was completed after importing the project from zip:

| Step | Status |
|---|---|
| `pnpm install` | ✅ Done — 1151 packages installed |
| `JWT_SECRET` Replit Secret | ✅ Set |
| `DATABASE_URL` | ✅ Auto-injected by Replit Postgres |
| `db:push` (schema applied) | ✅ Done — all tables created |
| API Server workflow | ✅ Running on port 8080 |
| Mobile (Expo) workflow | ✅ Running |
| Component Preview Server | ✅ Running |

**Demo credentials** (pre-filled on the login screen): `syndic@andalous.ma` / `password123`

> ⚠️ The database has not been seeded yet. Run `pnpm --filter @workspace/scripts run seed` to populate demo data before logging in with the pre-filled credentials.

**Known issues:**
- Pre-existing typecheck errors exist in `api-server` — runtime is unaffected but `tsc` does not pass cleanly. See Task #3.
- Some mobile screens hardcode `EXPO_PUBLIC_DOMAIN` without a fallback helper. See Task #4.

### 4. Start the workflows

Three workflows are pre-configured and start automatically:

| Workflow | Command |
|---|---|
| API Server | `pnpm --filter @workspace/api-server run dev` |
| Mobile (Expo) | `pnpm --filter @workspace/mobile run dev` |
| Component Preview | `pnpm --filter @workspace/mockup-sandbox run dev` |

## User preferences

<!-- Add any personal preferences or conventions here -->
