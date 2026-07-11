#!/bin/bash
set -e

echo ""
echo "================================================"
echo "  Millionaires Club Admin — Setup"
echo "================================================"
echo ""

# 1. Copy env file
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "✓ Created .env.local"
else
  echo "✓ .env.local already exists"
fi

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

# 3. Generate Prisma client
echo ""
echo "Setting up database..."
npx prisma generate
npx prisma db push

# 4. Seed data
echo ""
echo "Loading your club data (211 members, loans, history)..."
npx tsx prisma/seed.ts

echo ""
echo "================================================"
echo "  ✅  All done!"
echo ""
echo "  Run:  npm run dev"
echo "  Open: http://localhost:3000"
echo ""
echo "  Login:"
echo "    Email:    admin@millionairesclub.com"
echo "    Password: admin123"
echo "================================================"
echo ""
