# Hetzner + PostgreSQL Deployment

PostgreSQL is the database in every environment. Schema changes ship as Prisma migrations in `prisma/migrations/`. Keep Google Sheets only for import/export workflows.

## Recommended architecture

- 1 Hetzner Cloud VM for the app stack
- Docker Compose for `app`, `postgres`, and `caddy`
- PostgreSQL as the production database
- Optional later: move PostgreSQL to a second VM or managed provider

## Why PostgreSQL

- Better fit for concurrent writes and relational data
- Better production choice for members, loans, payments, and agreements
- Works directly with Prisma

## Files added for production

- `Dockerfile`
- `docker-compose.hetzner.yml`
- `Caddyfile`
- `.env.production.example`

## 1. Create a Hetzner server

Recommended starting point:

- Ubuntu 24.04
- 2 vCPU
- 4 GB RAM
- 80 GB SSD

Open inbound ports:

- `22` for SSH
- `80` for HTTP
- `443` for HTTPS

## 2. Point your domain

Create DNS records pointing your domain to the Hetzner server IP.

Example:

- `A` record for `admin.your-domain.example`

## 3. Install Docker on the server

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

## 4. Upload the project

Copy the repo to the server, then enter the project directory.

## 5. Create the production env file

```bash
cp .env.production.example .env.production
```

Update these values:

- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `DATABASE_URL`
- `ADMIN_EMAIL`
- `EMAIL_FROM`

Also export the domain used by Caddy:

```bash
export DOMAIN=admin.your-domain.example
```

## 6. Bring up the stack

```bash
docker compose -f docker-compose.hetzner.yml up -d --build
```

## 7. Initialize the database

**New installation** (empty database):

```bash
docker compose -f docker-compose.hetzner.yml exec app npx prisma migrate deploy
docker compose -f docker-compose.hetzner.yml exec -e ADMIN_SEED_PASSWORD='a long passphrase' app npx prisma db seed
```

**Existing installation created with `prisma db push`** (before migrations existed) — baseline it once. Take a backup first (`scripts/backup-postgres.sh`), then check that the live schema matches the baseline:

```bash
docker compose -f docker-compose.hetzner.yml exec app \
  sh -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script'
```

- If it prints only an empty migration, mark the baseline as applied:
  ```bash
  docker compose -f docker-compose.hetzner.yml exec app npx prisma migrate resolve --applied 20260926000000_init
  ```
- If it prints SQL (for example `CREATE TABLE "PortalPayment"`, when the server predates online payments), review it, apply it with `npx prisma db execute --stdin < diff.sql`, re-run the check until it is empty, then run the `migrate resolve` command above.

**Every deploy after that:**

```bash
./scripts/backup-postgres.sh
docker compose -f docker-compose.hetzner.yml up -d --build
docker compose -f docker-compose.hetzner.yml exec app npx prisma migrate deploy
```

Never run `prisma db push` or `prisma migrate reset` against production.

**Admin password reset** (no default passwords exist):

```bash
docker compose -f docker-compose.hetzner.yml exec \
  -e ADMIN_EMAIL_TO_RESET=admin@millionairesclub.com -e NEW_ADMIN_PASSWORD='a long passphrase' \
  app npm run admin:reset-password
```

## 8. Verify

Check:

- `https://admin.your-domain.example/login`
- `https://admin.your-domain.example/api/health`

## 9. Set up nightly backups

Run `scripts/backup-postgres.sh` on a schedule (writes a timestamped, gzipped `pg_dump` to `backups/` and prunes anything older than 14 days):

```bash
crontab -e
# add:
0 3 * * * cd /path/to/mc-management && ./scripts/backup-postgres.sh >> /var/log/mc-backup.log 2>&1
```

Also take a Hetzner server snapshot before any upgrade.

## Google Sheets recommendation

Use Google Sheets only for:

- member import
- monthly contribution import
- reporting export

Do not use Google Sheets as the primary database for:

- loans
- loan payments
- agreements
- balance calculations

