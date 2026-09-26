# 2. Existing-System Audit

Phase 0 is already largely complete. This session reviewed the code, schema, APIs, UI, deployment and dependencies, and fixed the security defects it found (see git history on this branch). This document records what was found, gives a keep / refactor / replace verdict for each area, and lists the audit work that still requires access this repository does not have.

## 1. Inventory

| Area | Current state |
|---|---|
| Application | One Next.js 16 app (App Router) holding the admin panel, member portal and REST routes under `src/app/api` |
| Language | TypeScript (`strict: true`), React 18, Tailwind 3 |
| Auth | NextAuth v4, two credential providers (admin email / member ID), JWT sessions with the roles inside the token |
| Roles | `admin`, `super_admin`, `member` |
| Data | Prisma 5; SQLite locally, PostgreSQL in production; **two hand-maintained schema files** (`schema.prisma`, `schema.postgres.prisma`) |
| Payments | Stripe Checkout with a signature-verified webhook; Zelle as a claim that an admin confirms (`PortalPayment`) |
| Email | Resend (reminders, overdue notices, admin summary) |
| Deploy | Docker Compose on one Hetzner VM (app + Postgres + Caddy) |
| Backups | Nightly `pg_dump` to `backups/` on the **same VM**, gzip only (not encrypted), 14-day retention, no restore test |
| CI | GitHub Actions: `prisma generate`, `tsc`, `next build`. **No tests exist.** |
| Data volume | 211 members, 350 contribution rows, 6 live loans, 115 historical loans, 705 yearly totals |

## 2. Findings and verdicts

Severity: **H** = can produce wrong money or unauthorised access; **M** = integrity or operational gap; **L** = quality.

### Financial core

| # | Finding | Sev | Verdict |
|---|---|:-:|---|
| F-1 | No ledger. Balances are stored fields that route handlers overwrite (`contributions2026`, `overallContributions`, `currentLoanBalance`, `totalPaid`, `balanceRemaining`, `eligible`, `thisMonth`). They agree with the rows today; nothing enforces it. | H | **Replace** with a double-entry ledger (D-04) |
| F-2 | Every money column is `Float`. The monthly payment is `Math.round(amount / term * 100) / 100`, so $10,000 / 24 is scheduled as 24 × $416.67 = $10,000.08. Loan L05 is this case. | H | **Replace** with integer cents (D-03) |
| F-3 | Cancelling or deleting a loan agreement hard-deletes the loan and all of its repayments (`loanPayment.deleteMany`). | H | **Replace** with void and reversal (D-05) |
| F-4 | Loan disbursements are never recorded as money leaving the club. | H | **Missing** |
| F-5 | Application fees are computed and printed on the agreement ("collect this separately") but never recorded. The $5 late fee in the policy is never applied. Stripe processing fees are not recorded; payments are booked gross. | M | **Missing** |
| F-6 | `overdue` is never set by any code. It is only read, so delinquency reflects the seed data or manual edits. | H | **Replace** with computed delinquency |
| F-7 | Loans have one `nextDueDate` and a `monthlyDue`. There is no repayment schedule, so missed installments cannot be identified. | M | **Missing** |
| F-8 | Two loan sources of truth. `HistoricalLoan` rows (2021–2025) link to members by normalised name. 2 pairs of members share a legal name; 12 of 66 historical borrower names match no member. 30 historical loans are still "Active" ($70,343) and are excluded from the dashboard's outstanding figure. `scripts/sync-active-historical-loans.js` bridges the two tables with substring name matching. | H | **Refactor**: link by member ID, reconcile balances |
| F-9 | $164,790 (95.8%) of all recorded contributions exist only as per-member yearly totals, with no transaction detail. | M | **Keep** as opening balances in the ledger migration |
| F-10 | The payment date is used as the period the payment covers (`monthYear` is derived from `paymentDate`). Prepayments are therefore recorded with future payment dates (rows exist dated Oct–Dec 2026). | M | **Refactor**: separate the payment date from the period covered |
| F-11 | Cash is collected by individuals (`receivedBy`: collectors' names) with no record of when it was deposited into the bank. | M | **Missing**: cash custody and deposit reconciliation |
| F-12 | Admin `PATCH /api/loans/:id` can set `status` and `overdue` directly, e.g. mark a loan "Paid Off" with no payment. | H | **Replace** with event-driven state changes |
| F-13 | Member withdrawals (`Full Exit`, `Partial`) change status but post no balance movement. | M | **Refactor** into the ledger |

### Access and security

| # | Finding | Sev | Verdict |
|---|---|:-:|---|
| S-1 | The role lives inside a 30-day JWT (NextAuth default). Demoting or deleting an admin does not take effect until the token expires. | H | **Refactor**: database-backed session checks (D-07) |
| S-2 | Two roles only. Every admin can record, edit and confirm any financial event alone. | H | **Replace** with RBAC plus maker/checker (D-06, D-07) |
| S-3 | No MFA for staff. | H | **Missing** |
| S-4 | No audit log of who changed what. | H | **Missing** |
| S-5 | Login rate limiting is in-memory: it resets on restart and is per process. | M | **Refactor** to database- or Redis-backed |
| S-6 | Backups sit on the same VM as the database, are unencrypted, and have never had a restore tested. | H | **Refactor** |
| S-7 | Real member names and financial history are committed to git in `prisma/seed-data.json` and `historical-loans.json`. The repository is private. | M | **Refactor**: move to an encrypted import, anonymise dev fixtures |
| S-8 | No Content-Security-Policy. Other security headers were added this session. | L | **Refactor** |
| S-9 | Previously found and fixed this session: Next.js critical CVEs, mass assignment, portal brute force, stray routes, a root Docker user, unescaped email HTML. | — | Done |

### Engineering

| # | Finding | Sev | Verdict |
|---|---|:-:|---|
| E-1 | Zero automated tests. CI checks types and build only. | H | **Missing** |
| E-2 | Two Prisma schema files maintained by hand. | M | **Replace** with Postgres everywhere (D-02) |
| E-3 | Prisma `db push` instead of migrations: there is no migration history for production. | H | **Replace** with `prisma migrate` |
| E-4 | Business logic lives inside route handlers. The shared `paymentActions.ts` is the first extraction. | M | **Refactor** into modules (D-01) |
| E-5 | New member IDs are random (`MC-3F9A…`) while existing ones are sequential (`MC-10001`). | L | **Refactor** |
| E-6 | No input schema validation library; validation is hand-written per route. | M | **Refactor** (zod) |

### What should remain

- The Next.js app, its routing, the admin and portal UI, and the mobile layouts.
- The loan-eligibility rules in `src/lib/loanPolicy.ts`. They become versioned policy that reads ledger balances.
- The agreement e-signature flow; add a content hash of the signed version.
- The Stripe Checkout and webhook design, and the Zelle claim-and-confirm pattern. Both become ledger postings.
- Docker, Caddy and Hetzner hosting at this scale.

## 3. Remaining audit work (requires access outside this repository)

| # | Task | Why it matters | Owner |
|---|---|---|---|
| A-1 | Snapshot the production database and run the same consistency checks run here against the seed (stored balances versus rows, loan totals, name matches) | Production may have drifted from the seed; the ledger's opening balances depend on it | Engineering + Treasurer |
| A-2 | Confirm whether `sync-active-historical-loans.js` has been run in production, and reconcile the 30 "Active" historical loans with the treasurer's records | Up to $70k of receivables may be missing from, or duplicated in, the live portfolio | Treasurer |
| A-3 | Obtain bank statements for the club accounts and reconcile them to recorded contributions, loans and withdrawals for at least the last 12 months | Establishes the true cash position for the ledger's opening balance | Treasurer |
| A-4 | Document the real-world cash process: who collects, how often it is deposited, who holds bank access | Defines the cash-custody controls and maker/checker roles | Founder + Treasurer |
| A-5 | Inventory everyone with admin access, bank access or server access | Least-privilege baseline for RBAC | Founder |
| A-6 | Review the Google Sheets import process referenced in `docs/deploy-hetzner-postgres.md` | A second, unaudited write path into financial data | Engineering |
| A-7 | Verify that production backups exist, and perform one restore into a scratch database | S-6 | Engineering |
| A-8 | Identify the club's legal entity, governing documents, and any written loan or membership policy | Every compliance question depends on it | Founder |
