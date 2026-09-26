# Millionaires Club — Admin Panel

## ⚡ Quick Setup

### Prerequisites
- **Node.js 22+** ([nodejs.org](https://nodejs.org))
- **Docker** ([docker.com](https://docs.docker.com/get-docker/)) — runs the local PostgreSQL database

---

### Mac / Linux

```bash
cd mc-management
sh setup.sh
npm run dev
```

### Windows

1. Start Docker Desktop
2. Double-click **`setup.bat`** and wait for it to finish
3. In Command Prompt: `npm run dev`

Open **http://localhost:3000**. Sign in as `admin@millionairesclub.com` with the password you chose during setup. The first sign-in asks you to set up two-factor authentication with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).

---

## What setup does
1. Copies `.env.example` → `.env.local` (and `.env`, which the Prisma CLI reads) and generates a `NEXTAUTH_SECRET`
2. Runs `npm install`
3. Starts PostgreSQL 16 in Docker (`docker-compose.postgres-local.yml`, port 5433) and applies the migrations in `prisma/migrations/`
4. Seeds the club data and the admin account (asks for the admin password; seeding refuses to run without one)

If you import or edit seed data later, run `npm run contributions:normalize` and `npm run loans:audit` to confirm the database still matches the source data.

---

## Database

PostgreSQL is used in every environment (development, CI, production). The schema lives in `prisma/schema.prisma`; every change to it ships as a migration in `prisma/migrations/`.

```bash
npm run db:up       # start local PostgreSQL (Docker)
npm run db:migrate  # after editing schema.prisma: create + apply a new migration
npm run db:deploy   # apply pending migrations (what CI and production run)
npm run db:seed     # load seed data (needs ADMIN_SEED_PASSWORD)
npm run db:reset    # drop the local database, re-apply all migrations, re-seed
npm run db:studio   # browse the database
```

Never use `prisma db push` — it changes the database without recording a migration.

## Tests

```bash
npm test          # run once
npm run test:watch
```

Tests run against a separate PostgreSQL database that is **wiped on every run**: `mc_admin_test` on the Docker database by default, or `TEST_DATABASE_URL`. The name must end in `_test`, otherwise the run refuses to start. Fixtures are synthetic; never put real member data in tests.

- `tests/authorization-matrix.test.ts` — every API route × method × caller (anonymous, member, admin, super admin). Adding a route without adding it to the matrix fails the build.
- `tests/ownership.test.ts` — members only reach their own agreements, loans and payments.
- `tests/payments.test.ts` — Zelle confirm/reject and the Stripe webhook record money exactly once, including under concurrent requests.

---

## Staff access: roles and two-factor authentication

Staff permissions come from **roles** (Loan Officer, Finance, Treasurer, Compliance, Auditor, Board, Administrator, Super Admin), assigned under **Staff & Roles**. Role definitions live in `src/modules/permissions`; who holds which role is stored in the database and checked on every request, so a change or a disabled account takes effect immediately. Every staff account must use two-factor authentication. Staff sessions end after 12 hours, or 30 minutes of inactivity.

Accounts that existed before roles were introduced have the transitional **Club Officer** role (the same access as before). Replace it with specific roles once officers are named.

**Locked out** (forgot the password, or lost both the phone and the recovery codes)? From the server shell:
```bash
ADMIN_EMAIL_TO_RESET=admin@millionairesclub.com NEW_ADMIN_PASSWORD='a long passphrase' RESET_MFA=1 npm run admin:reset-password
```
Leave out `RESET_MFA=1` to keep the existing authenticator. For anyone else, a staff administrator can reset their password or two-factor authentication under Staff & Roles.

---

## Daily use
```bash
npm run dev       # start the admin panel
npm run db:studio # browse your database visually (optional)
```

## Data checks
```bash
npm run contributions:normalize # sync contribution month labels from payment dates
npm run loans:audit             # compare historical loan data against the source JSON
```

---

## Pages
| Page | Description |
|---|---|
| `/dashboard` | KPI cards, monthly chart, active loans |
| `/members` | All 211 members — search, filter, add new |
| `/members/[id]` | Full member profile with year-by-year history |
| `/contributions` | All payments — filter by month/method, record new |
| `/loans` | Loan portfolio — create new loans |
| `/loans/[id]` | Loan detail with repayment progress bar |
| `/loan-payments` | All repayments — record new repayment |
| `/payments` | Pending Zelle claims to confirm/reject, plus card payment history |
| `/portal/pay` | Member-facing: pay a contribution or loan by card (Stripe) or Zelle |

---

## Online payments (Stripe + Zelle)

Members can pay their monthly contribution or an active loan from `/portal/pay`, by card or Zelle.

**Card payments (Stripe)** go through Stripe Checkout and are recorded automatically by a webhook —
nothing to approve. To enable them locally:
1. Create a free [Stripe](https://stripe.com) account and grab your **test** secret key.
2. Install the [Stripe CLI](https://stripe.com/docs/stripe-cli) and run:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
   Copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET` in `.env.local`.
3. Set `STRIPE_SECRET_KEY` in `.env.local` and restart `npm run dev`.

Without these two variables set, the "Card" option in the portal returns a clear error instead of
pretending to work — nothing silently fails.

**Zelle** has no payment API for merchants, so there's no way for the app to know a Zelle transfer
happened. A member submits a claim (amount + optional confirmation note) from the portal, which shows
up on the admin **Pending Payments** page (`/payments`). An admin checks the club's actual bank
activity and clicks **Confirm** (which records the payment) or **Reject**. `NEXT_PUBLIC_ZELLE_RECIPIENT_NAME`
/ `NEXT_PUBLIC_ZELLE_RECIPIENT_EMAIL` just control what instructions are shown to members.

---

## Architecture assessment

The platform modernisation plan (financial ledger, security, MCTN / rewards research, UMI feasibility) lives in [docs/architecture/](docs/architecture/README.md). Start with the executive assessment and **Founder Decision Gate #1**. The numbers in it are reproducible with `node scripts/models/tokenomics.mjs` and `node scripts/models/umi.mjs`.

## Hetzner deployment
For a production-oriented Hetzner setup with Docker, PostgreSQL, and Caddy, use:

- [docs/deploy-hetzner-postgres.md](docs/deploy-hetzner-postgres.md)
- [docs/backup-and-restore.md](docs/backup-and-restore.md) — encrypted off-site backups, weekly restore check, disaster recovery
- `docker-compose.hetzner.yml`
- `.env.production.example`
