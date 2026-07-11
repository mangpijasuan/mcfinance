# Millionaires Club — Admin Panel

## ⚡ Quick Setup (3 steps, no database install needed)

### Prerequisites
You only need **Node.js** installed. Download it from [nodejs.org](https://nodejs.org) if you don't have it.

---

### Mac / Linux

Open Terminal, go into the project folder, then run:

```bash
cd mc-admin
sh setup.sh
```

That's it. When it finishes:
```bash
npm run dev
```
Open **http://localhost:3000** in your browser.

---

### Windows

1. Open the `mc-admin` folder
2. Double-click **`setup.bat`**
3. Wait for it to finish (about 1–2 minutes)
4. Then in Command Prompt:
```
npm run dev
```
Open **http://localhost:3000** in your browser.

---

### Login
| Field | Value |
|---|---|
| Email | `admin@millionairesclub.com` |
| Password | `value of ADMIN_SEED_PASSWORD` |

> ⚠️ Set `ADMIN_SEED_PASSWORD` before setup, then change the password after your first login.

---

## What setup.sh / setup.bat does
1. Copies `.env.example` → `.env.local` (your config file, no edits needed)
2. Runs `npm install` (downloads packages)
3. Creates a local SQLite database file (`prisma/dev.db`) — no server needed
4. Seeds all your club data: 211 members, 705 yearly totals, 350 contributions, 6 loans

Before first setup, add an `ADMIN_SEED_PASSWORD` value to `.env.local` so the seeded admin account does not use the local-only fallback password.

If you import or edit seed data later, run `npm run contributions:normalize` and `npm run loans:audit` to confirm the database still matches the source data.

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

---

## Ready to go online?
When you want to deploy publicly, swap SQLite for a free PostgreSQL database:
1. Create a free project at [supabase.com](https://supabase.com)
2. Copy the `DATABASE_URL` from Supabase → paste into `.env.local`
3. Change `provider = "sqlite"` to `provider = "postgresql"` in `prisma/schema.prisma`
4. Run `npm run db:push && npm run db:seed`
5. Deploy to [vercel.com](https://vercel.com) (free)

## Hetzner deployment
For a production-oriented Hetzner setup with Docker, PostgreSQL, and Caddy, use:

- [docs/deploy-hetzner-postgres.md](/Users/mangpijasuan/Projects/mc-management/docs/deploy-hetzner-postgres.md)
- `docker-compose.hetzner.yml`
- `.env.production.example`

## Local PostgreSQL verification
If you want to test the PostgreSQL cutover locally before deploying, use:

- [docs/local-postgres-cutover.md](/Users/mangpijasuan/Projects/mc-management/docs/local-postgres-cutover.md)
- `docker-compose.postgres-local.yml`
- `.env.postgres.local.example`
