# MIZAN

A syndicate management SaaS platform (pnpm monorepo) with an Express API backend and an Expo React Native mobile app.

## Project structure

| Directory | Purpose |
|---|---|
| `artifacts/api-server` | Express.js REST API (Node 24, TypeScript, Drizzle ORM, PostgreSQL) |
| `artifacts/mobile` | Expo React Native mobile app (Expo Router, React Native) |
| `artifacts/mockup-sandbox` | Vite component preview sandbox (design tooling) |
| `lib/db` | Shared Drizzle ORM schema + database client |
| `lib/api-zod` | Shared Zod validation schemas |
| `scripts` | Seed scripts and post-merge setup |

## How to run

All services start via Replit workflows. After a fresh clone:

```bash
# 1. Install dependencies
pnpm install

# 2. Build shared libs
pnpm run typecheck:libs

# 3. Push database schema (first time only, or after schema changes)
cd lib/db && pnpm run db:push

# 4. (Optional) Seed the database
pnpm --filter @workspace/scripts run seed
```

Then start the workflows from the Replit UI:
- **API Server** — `pnpm --filter @workspace/api-server run dev` (port 8082)
- **Expo** — `pnpm --filter @workspace/mobile run dev` (port 18115)
- **Mockup Sandbox** — `pnpm --filter @workspace/mockup-sandbox run dev` (port 8081)

## Environment variables

Set in Replit Secrets / Env Vars (shared environment):

| Key | Notes |
|---|---|
| `DATABASE_URL` | Runtime-managed by Replit — do not set manually |
| `JWT_SECRET` | Already configured |
| `SESSION_SECRET` | Already configured (secret) |
| `SMTP_HOST / SMTP_PORT / SMTP_USER` | Gmail SMTP configured |
| `SMTP_PASS` | Must be set as a secret for email sending to work |
| `APP_URL` | Public URL of the app |

## User preferences

- Keep pnpm workspace structure; do not restructure.
- Maintain existing role-based access control (super_admin / syndicate_admin / member / tenant).
- French is the primary UI language.
