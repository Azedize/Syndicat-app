#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# setup-replit.sh — First-time (or post-zip-import) project bootstrap
#
# Run this once after importing the project or after a fresh clone on Replit.
# It installs dependencies, applies the database schema, and seeds demo data.
#
# Prerequisites:
#   - JWT_SECRET must be set in Replit Secrets (min 32 chars)
#   - DATABASE_URL is injected automatically by Replit Postgres
#
# Usage:
#   bash scripts/setup-replit.sh
# ---------------------------------------------------------------------------
set -euo pipefail

echo ""
echo "════════════════════════════════════════════════════"
echo "  MIZAN — Replit Setup"
echo "════════════════════════════════════════════════════"
echo ""

# ── 1. Dependencies ─────────────────────────────────────────────────────────
echo "▶ Installing dependencies..."
pnpm install
echo "✓ Dependencies installed"
echo ""

# ── 2. Check required secrets ───────────────────────────────────────────────
if [ -z "${JWT_SECRET:-}" ]; then
  echo "✗ JWT_SECRET is not set."
  echo "  Add it in Replit Secrets (min 32 characters) before starting the API server."
  echo "  The API server will refuse to start without it."
  exit 1
fi
echo "✓ JWT_SECRET is present"
echo ""

# ── 3. Apply database schema ────────────────────────────────────────────────
echo "▶ Pushing database schema..."
pnpm --filter @workspace/db run db:push
echo "✓ Schema applied"
echo ""

# ── 4. Seed demo data ───────────────────────────────────────────────────────
echo "▶ Seeding demo data..."
pnpm --filter @workspace/scripts run seed
echo "✓ Demo data seeded"
echo ""

echo "════════════════════════════════════════════════════"
echo "  Setup complete! Start the workflows to run the app."
echo ""
echo "  Demo login (pre-filled on the login screen):"
echo "    Email:    syndic@andalous.ma"
echo "    Password: password123"
echo "════════════════════════════════════════════════════"
echo ""
