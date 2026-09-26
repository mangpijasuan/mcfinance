# 20–22. Database, API and Repository Architecture

## 1. Database architecture

<a id="d-02"></a>
### D-02 — PostgreSQL in every environment

**DECISION:** Use PostgreSQL for local development, CI and production. Retire SQLite and `prisma/schema.postgres.prisma`. Keep one schema and use `prisma migrate` (not `db push`) with committed migration history.
**WHY:** E-2 and E-3. Two hand-synced schemas drift. The ledger needs Postgres features: `CHECK` constraints, triggers that block updates to posted rows, deferred constraints, row-level permissions for the app user. Production has no migration history today.
**ALTERNATIVES:** Keep SQLite for dev and accept drift.
**BENEFITS:** Dev and production parity; real constraints; auditable schema history. `docker-compose.postgres-local.yml` already exists.
**RISKS:** Developers need Docker, which the repository already assumes.
**REVERSIBILITY:** easy
**REQUIRES LEGAL REVIEW:** no
**REQUIRES FOUNDER APPROVAL:** no

### Principles

1. Money is `BIGINT` cents with a `currency` column (D-03).
2. Posted financial rows are **insert-only**. The application's database role has no `UPDATE`/`DELETE` on `journal_entries`/`journal_lines` where `status = 'posted'`; a trigger enforces this.
3. Enumerations are Postgres enums or check-constrained text, never free text (statuses today are free strings).
4. Every table has `created_at`, and mutable tables have `updated_at`. Every financially relevant change writes `audit_log`.
5. Opaque UUID primary keys; human-facing numbers (`MC-10001`, `JE-2026-000123`, `L-2026-0007`) are separate unique columns.
6. No derived balance is authoritative. Cached aggregates must be rebuildable and are checked nightly.

### Entities

| Group | Tables | New / changed |
|---|---|---|
| Identity & access | `users`, `credentials`, `mfa_factors`, `sessions`, `roles`, `permissions`, `role_permissions`, `user_roles` | **New**; replaces `Admin` and the portal password fields on `Member` |
| Membership | `members`, `member_profiles`, `membership_status_events`, `member_documents`, `member_notes` | `Member` split; status history new |
| Contributions | `contribution_plans`, `dues_obligations` | **New** |
| Payments | `payments`, `payment_allocations`, `portal_payments` (existing, kept as the online-initiation record) | `Contribution` and `LoanPayment` become `payments` + allocations |
| Lending | `loan_applications`, `loans`, `loan_installments`, `loan_events`, `loan_agreements`, `agreement_signatures`, `loan_policy_versions` | Schedule, events, policy versions new; `HistoricalLoan` merged into `loans` with `origin = 'legacy_import'` |
| Ledger | `ledger_accounts`, `journal_entries`, `journal_lines`, `accounting_periods`, `bank_statement_lines`, `reconciliation_matches` | **New** |
| Controls | `approval_requests`, `audit_log`, `idempotency_keys` | **New** |
| Comms | `notifications`, `email_log` | `EmailLog` kept |
| Rewards (Phase 10) | `reward_rules`, `reward_events`, `points_accounts`, `points_entries` | New, later |
| Web3 (Phase 12+) | `wallet_links`, `chain_contracts`, `token_transfers` (indexed mirror), `treasury_proposals` (mirror) | New, later |
| Legacy (read-only until removed) | `YearlyTotal`, member balance fields | Kept for reconciliation during migration, then dropped |

### Core ledger schema (sketch)

```prisma
model LedgerAccount {
  id        String  @id @default(uuid())
  code      String  @unique            // "2000"
  name      String
  type      AccountType                // ASSET | LIABILITY | EQUITY | INCOME | EXPENSE
  subledger SubledgerKind?             // MEMBER | LOAN | COLLECTOR | BANK
  active    Boolean @default(true)
}

model JournalEntry {
  id                String   @id @default(uuid())
  entryNumber       String   @unique        // JE-2026-000123
  effectiveDate     DateTime @db.Date
  type              EntryType
  status            EntryStatus               // DRAFT | PENDING_APPROVAL | POSTED | REJECTED
  description       String
  reference         String?
  sourceType        String?
  sourceId          String?
  idempotencyKey    String   @unique
  reversesEntryId   String?  @unique
  createdById       String
  approvedById      String?                   // CHECK approvedById <> createdById
  approvalRequestId String?
  createdAt         DateTime @default(now())
  postedAt          DateTime?
  lines             JournalLine[]
}

model JournalLine {
  id          String @id @default(uuid())
  entryId     String
  accountId   String
  memberId    String?
  loanId      String?
  debitCents  BigInt @default(0)              // CHECK exactly one of debit/credit > 0
  creditCents BigInt @default(0)
  currency    String @default("USD")
  memo        String?
  entry       JournalEntry  @relation(fields: [entryId], references: [id])
  account     LedgerAccount @relation(fields: [accountId], references: [id])
  @@index([accountId, memberId])
  @@index([loanId])
}

model AuditLog {
  id         BigInt   @id @default(autoincrement())
  at         DateTime @default(now())
  actorId    String?
  action     String                           // "loan.approve", "member.status.change"
  entityType String
  entityId   String
  before     Json?
  after      Json?
  requestId  String?
  ip         String?
}
```

Balance-check trigger (Postgres, sketch): on commit of a transaction that inserts `journal_lines`, assert `SUM(debit_cents) = SUM(credit_cents)` per `entry_id` (a deferred constraint trigger). A second trigger rejects `UPDATE`/`DELETE` of lines whose entry is `POSTED`.

### Performance note

At the club's volume (hundreds of entries a year, not millions), balances can be computed with `SUM` over indexed lines on every request. Materialised snapshots are unnecessary until well past 100,000 lines.

## 2. API architecture

### Conventions

| Topic | Rule |
|---|---|
| Versioning | New endpoints under `/api/v1/…`. Existing `/api/*` routes stay until their UI moves, then are removed. Webhooks stay unversioned under `/api/webhooks/*` |
| Framework | Next.js 16 Route Handlers, kept thin: parse → authorise → call a module → map to DTO |
| Authorisation | One Data Access Layer: `requirePermission(session, 'loans.approve')` reads the user and roles from the database (D-07). `proxy.ts` (Next 16's renamed middleware) may do *optimistic* redirects only, per the Next.js auth guide |
| Validation | `zod` schemas per endpoint, shared with the UI forms. Unknown fields are rejected (prevents mass assignment by construction) |
| DTOs | Responses are explicit objects, never raw Prisma rows (the current `sanitizeMember` is the first example) |
| Idempotency | Every financial `POST` requires an `Idempotency-Key` header, stored with a request hash and the response. A replay returns the stored response; a different body with the same key returns `409` |
| Errors | RFC 9457 problem-details JSON (`type`, `title`, `status`, `detail`, `errors[]`) |
| Pagination | Cursor-based (`?cursor=…&limit=…`) for ledger, payments and audit; offset stays acceptable for small admin lists |
| Rate limits | Persistent (database or Redis) per user and IP; stricter on auth and payment initiation |
| Money in JSON | Integer cents as strings (`"amountCents": "41666"`), avoiding JavaScript number precision issues at scale |

### Domains

| Prefix | Examples | Replaces today |
|---|---|---|
| `/api/v1/members` | list, get, create, `POST /:id/status-transitions` | `/api/members`, `PATCH` edits |
| `/api/v1/contributions` | plans, obligations, arrears | `/api/contributions` (read side) |
| `/api/v1/payments` | record, allocate, void (reversal), receipts | `/api/contributions` POST, `/api/loan-payments` POST |
| `/api/v1/loans` | applications, approve, disburse, schedule, payoff quote | `/api/loans`, `/api/agreements` |
| `/api/v1/accounting` | accounts, journal entries (propose / approve), trial balance, periods, reconciliation | **new** |
| `/api/v1/approvals` | queue, approve, reject | **new** (Zelle confirm moves here) |
| `/api/v1/reports` | member statement, portfolio, cash flow — as of any date | `/api/dashboard` |
| `/api/v1/admin` | users, roles, audit log | `/api/admins` |
| `/api/v1/me` | member-scoped: profile, statements, loans, payments, points | `/api/portal/*` |
| `/api/v1/rewards`, `/api/v1/wallets`, `/api/v1/mctn`, `/api/v1/treasury` | Phase 10+ | — |
| `/api/v1/umi` | **not created** (D-15) | — |

## 3. Repository architecture

<a id="d-01"></a>
### D-01 — Modular monolith, not a monorepo (yet)

**DECISION:** Keep the single Next.js application and organise it into domain modules. Do not split into `apps/*`, `services/*` or a separate NestJS/Fastify backend now. Add a `contracts/` Foundry workspace only when contract work is approved (Gate #2).
**WHY:** One small team, one deployable, and about 200 members. The §44 monorepo solves problems (many teams, independent deploys, shared SDKs) the club does not have, and would multiply CI, deployment and security surface.
**ALTERNATIVES:** Monorepo with `apps/member-web`, `apps/admin-web` and `apps/api` (§44); a separate backend service (§36).
**BENEFITS:** Incremental modernisation of working code; one build; one security perimeter.
**RISKS:** Module boundaries can erode. The mitigation is an import-boundary lint rule and each module exposing only `index.ts`.
**REVERSIBILITY:** easy. Modules can later become packages without changing their code.
**REQUIRES LEGAL REVIEW:** no
**REQUIRES FOUNDER APPROVAL:** yes

### Target structure

```
mc-management/
├── src/
│   ├── app/                    # Next.js routes: UI pages + thin /api/v1 handlers
│   ├── modules/
│   │   ├── identity/           # users, sessions, MFA, RBAC, DAL (requirePermission)
│   │   ├── membership/         # members, status machine, documents
│   │   ├── contributions/      # plans, obligations, arrears
│   │   ├── payments/           # payments, allocations, Stripe/Zelle adapters
│   │   ├── lending/            # applications, engine/ (pure), schedules, delinquency job
│   │   ├── ledger/             # accounts, posting service, invariants, periods, reconciliation
│   │   ├── approvals/          # maker/checker requests
│   │   ├── audit/
│   │   ├── reporting/          # read-only queries over ledger + domain
│   │   ├── notifications/
│   │   └── rewards/            # Phase 10 (MC Points)
│   ├── lib/                    # money, validation, db client, http helpers
│   └── components/
├── prisma/                     # single schema + migrations/
├── tests/                      # integration + e2e (unit tests sit next to modules)
├── scripts/                    # ops scripts, models/
├── contracts/                  # Foundry workspace — Phase 12 only
├── docs/                       # architecture/ (this), and the §42 documents over time
└── infrastructure/             # compose files, Caddy, backup + restore scripts
```

**Module rules:** a module owns its tables; other modules call its exported functions; only `ledger` writes journal entries; `lending/engine` and `ledger/invariants` are pure functions with no I/O.

**When to become a monorepo:** a second independently deployed artefact appears, such as a separate indexer service, a mobile app sharing an SDK, or published contract ABIs consumed by third parties.
