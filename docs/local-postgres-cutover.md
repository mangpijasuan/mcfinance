# Local PostgreSQL Verification

This repo still defaults to SQLite for day-to-day local development. Use this flow when you want to verify the PostgreSQL cutover locally without replacing the SQLite setup immediately.

## Files

- `prisma/schema.postgres.prisma`
- `docker-compose.postgres-local.yml`
- `.env.postgres.local.example`

## 1. Start PostgreSQL locally

```bash
docker compose -f docker-compose.postgres-local.yml up -d
```

## 2. Create a PostgreSQL env file

```bash
cp .env.postgres.local.example .env.postgres.local
```

## 3. Generate Prisma Client for PostgreSQL

```bash
cp .env.postgres.local .env.local
npm run db:generate:postgres
```

## 4. Push the schema and seed data

```bash
npm run db:push:postgres
npm run db:seed:postgres
```

## 5. Start the app

```bash
npm run dev
```

## Notes

- This flow overwrites `.env.local` with the PostgreSQL version for the test session.
- To go back to SQLite, restore your normal `.env.local` and run:

```bash
npx prisma generate
```

- The production Hetzner setup should use PostgreSQL as the long-term source of truth.

