#!/usr/bin/env bash
set -euo pipefail

# Idempotent Cloud Agent bootstrap for MC Admin (Next.js + Prisma + PostgreSQL).
# Uses Docker for Postgres when available, otherwise a local PostgreSQL 16.
# Loads SYNTHETIC demo data only; real member data never lives in the repo.

DB_USER=mcfinance
DB_PASS=mcfinance_dev

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker compose -f docker-compose.postgres-local.yml up -d --wait
  DB_PORT=5434
else
  if ! command -v psql >/dev/null 2>&1; then
    sudo apt-get update -qq && sudo apt-get install -y -qq postgresql >/dev/null
  fi
  sudo service postgresql start >/dev/null 2>&1 || sudo pg_ctlcluster 16 main start || true
  DB_PORT=5432
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 \
    || sudo -u postgres psql -qc "CREATE ROLE $DB_USER LOGIN CREATEDB PASSWORD '$DB_PASS'"
  for db in mcfinance mcfinance_test; do
    sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 \
      || sudo -u postgres createdb -O "$DB_USER" "$db"
  done
fi
DATABASE_URL="postgresql://$DB_USER:$DB_PASS@127.0.0.1:$DB_PORT/mcfinance?schema=public"

# 1. Local env files with fresh random secrets (never committed).
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  sed -i "s#^DATABASE_URL=.*#DATABASE_URL=\"$DATABASE_URL\"#" .env.local
  sed -i "s#^NEXTAUTH_SECRET=.*#NEXTAUTH_SECRET=\"$(openssl rand -base64 32)\"#" .env.local
  sed -i "s#^MFA_ENCRYPTION_KEY=.*#MFA_ENCRYPTION_KEY=\"$(openssl rand -base64 32)\"#" .env.local
  sed -i "s#^ADMIN_SEED_PASSWORD=.*#ADMIN_SEED_PASSWORD=\"$(openssl rand -hex 12)\"#" .env.local
  echo "Created .env.local (admin password: see ADMIN_SEED_PASSWORD in it)"
fi
# Prisma reads .env; keep it in sync with .env.local.
cp -f .env.local .env

# 2. Dependencies, migrations, demo data.
npm ci
npx prisma generate
npx prisma migrate deploy
set -a; . ./.env.local; set +a
npx prisma db seed

echo "MC Admin setup complete. Sign in as admin@millionairesclub.com; two-factor setup follows."
echo "Tests: TEST_DATABASE_URL=postgresql://$DB_USER:$DB_PASS@127.0.0.1:$DB_PORT/mcfinance_test?schema=public npm test"
