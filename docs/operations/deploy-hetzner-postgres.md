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
- `.env.hetzner.example` (domain and database password, read by Docker Compose)
- `.env.production.example` (the app's settings)

Run every `docker compose` command below from the project directory: Compose reads `.env` from there.

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

## 4. Get the code onto the server

The repository is private, so give the server a read-only deploy key:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/mcfinance_deploy -N ""
cat ~/.ssh/mcfinance_deploy.pub
```

On GitHub, open the repository's **Settings → Deploy keys → Add deploy key**, paste the key, and leave "Allow write access" off. Then:

```bash
GIT_SSH_COMMAND='ssh -i ~/.ssh/mcfinance_deploy' git clone git@github.com:mangpijasuan/mcfinance.git ~/mcfinance
cd ~/mcfinance
git config core.sshCommand 'ssh -i ~/.ssh/mcfinance_deploy'
```

## 5. Create the two settings files

Neither file is ever committed. Keep a copy of both with the club's other secrets.

```bash
cp .env.hetzner.example .env
cp .env.production.example .env.production
openssl rand -hex 24       # database password
openssl rand -base64 32    # NEXTAUTH_SECRET
openssl rand -base64 32    # MFA_ENCRYPTION_KEY (a different value)
```

In `.env`:

- `DOMAIN`: the admin panel's address, e.g. `admin.your-domain.example`
- `POSTGRES_PASSWORD`: the database password

In `.env.production`:

- `NEXTAUTH_URL`: `https://` plus the same domain
- `NEXTAUTH_SECRET`
- `MFA_ENCRYPTION_KEY` (losing it means every staff member sets up two-factor authentication again)
- `DATABASE_URL`: replace `change-me` with the database password from `.env`
- `SECURITY_ALERT_EMAIL` (receives an alert on every Super Admin sign-in)
- `RESEND_API_KEY`, `ADMIN_EMAIL`, `EMAIL_FROM` for email
- `STRIPE_*` and `NEXT_PUBLIC_ZELLE_*` for online payments, if used
- leave `MAKER_CHECKER_ENFORCED` and `LATE_FEES_ENABLED` at `"false"` until Gate #1 A4 and A7 are settled

## 6. Bring up the stack

The domain's DNS record must already point at the server, so Caddy can obtain the HTTPS certificate.

```bash
docker compose -f docker-compose.hetzner.yml up -d --build
docker compose -f docker-compose.hetzner.yml ps    # app and postgres: "healthy"
```

The first build takes a few minutes.

## 7. Initialize the database

**New installation** (empty database):

```bash
docker compose -f docker-compose.hetzner.yml exec app npx prisma migrate deploy

# The first Super Admin (sets up two-factor authentication at first sign-in)
docker compose -f docker-compose.hetzner.yml exec \
  -e ADMIN_EMAIL_TO_RESET=you@your-domain.example -e NEW_ADMIN_PASSWORD='a long passphrase' \
  app npm run admin:reset-password
```

To load the club's records, copy the decrypted data file (README, "Real club data") in, seed from it, and delete it from the container:

```bash
docker compose -f docker-compose.hetzner.yml cp club-data.json app:/tmp/club-data.json
docker compose -f docker-compose.hetzner.yml exec \
  -e SEED_DATA_FILE=/tmp/club-data.json -e ADMIN_SEED_PASSWORD='a long passphrase' \
  app npx prisma db seed
docker compose -f docker-compose.hetzner.yml exec -u root app rm /tmp/club-data.json
```

Then delete `club-data.json` from the server too. The seed refuses to load demo data in production.

**Existing installation created with `prisma db push`** (before migrations existed) — baseline it once. Take a backup first — `scripts/ops/backup-postgres.sh` if encrypted backups are already set up (step 9), otherwise `docker compose -f docker-compose.hetzner.yml exec -T postgres pg_dump -Fc -U mcfinance mcfinance > pre-migration.dump`, kept off the server — then compare the live schema with the current one:

```bash
docker compose -f docker-compose.hetzner.yml exec app \
  sh -c 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script'
```

The output should contain **only** the `AuditLog` table and its three indexes (added by the second migration, `20260926010000_audit_log`). Do not apply those by hand: `migrate deploy` creates them together with the append-only trigger.

- If anything else appears (for example `CREATE TABLE "PortalPayment"`, when the server predates online payments), apply just those statements with `npx prisma db execute --stdin < extra.sql`, then re-run the check.
- Then mark the baseline as applied and apply the remaining migrations:
  ```bash
  docker compose -f docker-compose.hetzner.yml exec app npx prisma migrate resolve --applied 20260926000000_init
  docker compose -f docker-compose.hetzner.yml exec app npx prisma migrate deploy
  ```

**Upgrading to roles and two-factor authentication** (migration `20260926020000_rbac_mfa`): set `MFA_ENCRYPTION_KEY` in `.env.production` *before* deploying. The migration turns each existing Super Admin into a Super Admin role holder and every other admin into the transitional Club Officer role (the audit log records each one). Every staff member is asked to set up two-factor authentication at their next sign-in, so tell them to have their phone ready.

**Every deploy after that** (migrations run before the new version starts):

```bash
cd ~/mcfinance
./scripts/ops/backup-postgres.sh
git pull
docker compose -f docker-compose.hetzner.yml build app
docker compose -f docker-compose.hetzner.yml run --rm --no-deps app npx prisma migrate deploy
docker compose -f docker-compose.hetzner.yml up -d
```

Until encrypted backups are set up (step 9), use `docker compose -f docker-compose.hetzner.yml exec -T postgres pg_dump -Fc -U mcfinance mcfinance > pre-deploy.dump` instead of the backup script, and copy the file off the server.

**A server set up before `.env` existed** used the password `change-me`, and the database keeps the password it was created with. Put `POSTGRES_PASSWORD=change-me` in `.env` at first, then change it:

```bash
docker compose -f docker-compose.hetzner.yml exec postgres \
  psql -U mcfinance -d mcfinance -c "ALTER USER mcfinance PASSWORD 'the-new-password'"
```

Then put the new password in `.env` and in `DATABASE_URL` in `.env.production`, and run `docker compose -f docker-compose.hetzner.yml up -d`.

Never run `prisma db push` or `prisma migrate reset` against production.

The `AuditLog` table is append-only: a database trigger rejects `UPDATE`, `DELETE` and `TRUNCATE`. It is included in the nightly `pg_dump` backups; keep it when restoring.

**Admin password reset** (no default passwords exist):

```bash
docker compose -f docker-compose.hetzner.yml exec \
  -e ADMIN_EMAIL_TO_RESET=admin@mcfinance.local -e NEW_ADMIN_PASSWORD='a long passphrase' \
  app npm run admin:reset-password
```

Add `-e RESET_MFA=1` if the person also lost their authenticator and recovery codes. All of their sessions end; the reset is recorded in the audit log.

## 8. Verify

Check:

- `https://admin.your-domain.example/login`
- `https://admin.your-domain.example/api/health`

## 9. Set up encrypted off-site backups

Follow [backup-and-restore.md](backup-and-restore.md): create the club's backup key on an officer's computer (never on the server), create a versioned, write-only object-storage bucket, add `.env.backup`, then schedule `scripts/ops/backup-postgres.sh` nightly. An officer runs `scripts/ops/restore-postgres.sh verify` weekly to prove the newest backup restores.

Also take a Hetzner server snapshot before any upgrade.

## 10. Schedule the daily jobs

- `dues:service` bills each active member's dues for the new month (so everyone who has not prepaid starts the month unpaid), refreshes "paid this month" and arrears, and posts contributions waiting for the ledger.
- `loans:service` marks loans delinquent from their schedules, charges late fees once they are switched on (Gate #1 A7), and posts anything waiting for the ledger.

Both are safe to run more than once a day. Run `dues:service` once by hand right after deploying, so every member's dues are billed from January 2026 (`DUES_TRACKING_START`).

```bash
crontab -e
# 20 6 * * * cd /path/to/mcfinance && docker compose -f docker-compose.hetzner.yml exec -T app npm run dues:service >> /var/log/mc-dues.log 2>&1
# 30 6 * * * cd /path/to/mcfinance && docker compose -f docker-compose.hetzner.yml exec -T app npm run loans:service >> /var/log/mc-loans.log 2>&1
```

A non-zero exit means a member or loan could not be processed; the log names it.

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
