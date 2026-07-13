# SYNDYCAT GLOBAL CPS

A French-language co-ownership / syndicate management platform.

## Stack

- **Mobile app**: Expo React Native (`artifacts/mobile/`) — main user-facing UI
- **API server**: Express + TypeScript + Drizzle ORM (`artifacts/api-server/`) — REST API
- **Database**: PostgreSQL (via `lib/db/`)
- **Shared types**: `lib/api-zod/` (Zod schemas shared between mobile and API)
- **Canvas/mockup sandbox**: `artifacts/mockup-sandbox/` (design tooling)

## Running the project

### Prerequisites (secrets required)

| Secret | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret for auth |
| `REDIS_URL` | Redis for rate limiting (optional in dev) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` | Email (optional) |
| `SESSION_SECRET` | Already configured |

### Start workflows

- **API Server**: `pnpm --filter @workspace/api-server run dev`
- **Mobile (Expo)**: `pnpm --filter @workspace/mobile run dev`

### Database setup

```bash
# Run migrations
pnpm --filter @workspace/db run migrate

# Seed initial data
pnpm --filter @workspace/scripts run seed
```

## Project structure

```
artifacts/
  api-server/   — Express API (routes, middleware, schedulers)
  mobile/       — Expo React Native app (100+ screens)
  mockup-sandbox/ — Design/canvas tooling
lib/
  db/           — Drizzle schema + migrations
  api-zod/      — Shared Zod validation schemas
scripts/        — DB seed and utility scripts
```

## User preferences
