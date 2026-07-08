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

Already done in this environment: dependencies installed, schema pushed to the
provisioned Postgres database, and demo data seeded (re-seeded 2026-07-08 after
re-import). Demo login on the mobile app's login screen:
`syndic@andalous.ma` / `password123` (pre-filled). Note: API routes are
mounted under `/api` (e.g. `/api/auth/login`), not at the route paths defined
in `src/routes/*.ts` directly.

### 4. Start the workflows

Three workflows are pre-configured and start automatically:

| Workflow | Command |
|---|---|
| API Server | `pnpm --filter @workspace/api-server run dev` |
| Mobile (Expo) | `pnpm --filter @workspace/mobile run dev` |
| Component Preview | `pnpm --filter @workspace/mockup-sandbox run dev` |

## User preferences

<!-- Add any personal preferences or conventions here -->
