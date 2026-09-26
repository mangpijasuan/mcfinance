#!/bin/bash
set -e

echo ""
echo "================================================"
echo "  Millionaires Club Admin — Setup"
echo "================================================"
echo ""

# Needs Node.js 22+ and Docker (for the local PostgreSQL database).
command -v docker >/dev/null 2>&1 || { echo "Docker is required: https://docs.docker.com/get-docker/"; exit 1; }

# 1. Env files
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  if command -v openssl >/dev/null 2>&1; then
    secret=$(openssl rand -base64 32)
    sed -i.bak "s#^NEXTAUTH_SECRET=\"\"#NEXTAUTH_SECRET=\"$secret\"#" .env.local && rm -f .env.local.bak
    mfa_key=$(openssl rand -base64 32)
    sed -i.bak "s#^MFA_ENCRYPTION_KEY=\"\"#MFA_ENCRYPTION_KEY=\"$mfa_key\"#" .env.local && rm -f .env.local.bak
  fi
  echo "✓ Created .env.local"
else
  echo "✓ .env.local already exists"
fi

# Prisma's CLI reads .env, the app reads .env.local
if [ ! -f .env ]; then
  cp .env.local .env
  echo "✓ Created .env for Prisma"
else
  echo "✓ .env already exists"
fi

# 2. Install dependencies
echo ""
echo "Installing packages (this takes ~1 min)..."
npm install

# 3. Database: start PostgreSQL and apply migrations
echo ""
echo "Starting PostgreSQL and applying migrations..."
npm run db:up
npx prisma migrate deploy

# 4. Seed data
if [ -z "$ADMIN_SEED_PASSWORD" ]; then
  echo ""
  read -r -s -p "Choose a password for admin@millionairesclub.com (12+ characters): " ADMIN_SEED_PASSWORD
  echo ""
  export ADMIN_SEED_PASSWORD
fi
echo ""
echo "Loading club data..."
npx prisma db seed

echo ""
echo "================================================"
echo "  ✅  All done!"
echo ""
echo "  Run:  npm run dev"
echo "  Open: http://localhost:3000"
echo ""
echo "  Login: admin@millionairesclub.com"
echo "         with the password you just chose."
echo "  You will set up two-factor authentication (an"
echo "  authenticator app on your phone) at first sign-in."
echo "================================================"
echo ""
