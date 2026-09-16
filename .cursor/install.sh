#!/usr/bin/env bash
set -euo pipefail

# Idempotent Cloud Agent bootstrap for the MC Admin (Next.js + Prisma/SQLite) app.

# 1. Ensure local env files exist (SQLite dev config, no external services needed).
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  # Use a known local-only admin seed password so the seeded admin can log in.
  sed -i 's/^ADMIN_SEED_PASSWORD=.*/ADMIN_SEED_PASSWORD="admin123"/' .env.local
  echo "Created .env.local"
fi

# Prisma reads .env; keep it in sync with .env.local.
cp -f .env.local .env

# 2. Install dependencies from the lockfile.
npm ci

# 3. Generate the Prisma client and apply the SQLite schema.
npx prisma generate
npx prisma db push

# 4. Seed club data (upserts, safe to re-run).
npx tsx prisma/seed.ts

echo "MC Admin setup complete."
