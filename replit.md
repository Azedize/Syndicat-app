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

Three workflows are pre-configured:

| Workflow | Command |
|---|---|
| API Server | `pnpm --filter @workspace/api-server run dev` |
| Mobile (Expo) | `pnpm --filter @workspace/mobile run dev` |
| Component Preview | `pnpm --filter @workspace/mockup-sandbox run dev` |

### Prerequisites before starting

1. **PostgreSQL** — provision a database and set `DATABASE_URL`.
2. **Redis** — optional; set `REDIS_URL` to enable Redis-backed rate limiting (falls back to in-memory if unset).
3. **Run migrations** — `pnpm --filter @workspace/db run db:push` then optionally seed with `pnpm --filter @workspace/db run seed`.
4. **Secrets** — the following must be set as Replit secrets:
   - `SESSION_SECRET` — already present
   - `JWT_SECRET` — required for API auth token signing (min 32 characters)

## User preferences

<!-- Add any personal preferences or conventions here -->
