-- CreateTable
CREATE TABLE "LedgerAccount" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "normalBalance" TEXT NOT NULL,
    "subledger" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "reversesEntryId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdBy" TEXT,
    "approvedBy" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "accountCode" TEXT NOT NULL,
    "memberId" TEXT,
    "loanId" TEXT,
    "debitCents" BIGINT NOT NULL DEFAULT 0,
    "creditCents" BIGINT NOT NULL DEFAULT 0,
    "memo" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerPeriod" (
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,

    CONSTRAINT "LedgerPeriod_pkey" PRIMARY KEY ("period")
);

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_entryNumber_key" ON "JournalEntry"("entryNumber");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_idempotencyKey_key" ON "JournalEntry"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversesEntryId_key" ON "JournalEntry"("reversesEntryId");

-- CreateIndex
CREATE INDEX "JournalEntry_effectiveDate_idx" ON "JournalEntry"("effectiveDate");

-- CreateIndex
CREATE INDEX "JournalEntry_sourceType_sourceId_idx" ON "JournalEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "JournalLine_accountCode_memberId_idx" ON "JournalLine"("accountCode", "memberId");

-- CreateIndex
CREATE INDEX "JournalLine_memberId_idx" ON "JournalLine"("memberId");

-- CreateIndex
CREATE INDEX "JournalLine_loanId_idx" ON "JournalLine"("loanId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalLine_entryId_lineNo_key" ON "JournalLine"("entryId", "lineNo");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversesEntryId_fkey" FOREIGN KEY ("reversesEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountCode_fkey" FOREIGN KEY ("accountCode") REFERENCES "LedgerAccount"("code") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Ledger invariants, enforced by the database (docs/architecture/04 §4) ──

ALTER TABLE "LedgerAccount"
  ADD CONSTRAINT "LedgerAccount_type_check" CHECK ("type" IN ('asset', 'contra_asset', 'liability', 'equity', 'income', 'expense')),
  ADD CONSTRAINT "LedgerAccount_normalBalance_check" CHECK ("normalBalance" IN ('debit', 'credit')),
  ADD CONSTRAINT "LedgerAccount_subledger_check" CHECK ("subledger" IS NULL OR "subledger" IN ('member', 'loan')),
  ADD CONSTRAINT "LedgerAccount_status_check" CHECK ("status" IN ('proposed', 'approved', 'retired')),
  ADD CONSTRAINT "LedgerAccount_code_check" CHECK ("code" ~ '^[0-9]{4}$');

-- Each line is a debit or a credit: exactly one positive amount (invariant 1).
ALTER TABLE "JournalLine"
  ADD CONSTRAINT "JournalLine_amounts_check" CHECK ("debitCents" >= 0 AND "creditCents" >= 0 AND (("debitCents" > 0) <> ("creditCents" > 0)));

ALTER TABLE "JournalEntry"
  ADD CONSTRAINT "JournalEntry_currency_check" CHECK ("currency" = 'USD'),
  ADD CONSTRAINT "JournalEntry_not_self_reversal" CHECK ("reversesEntryId" IS NULL OR "reversesEntryId" <> "id");

ALTER TABLE "LedgerPeriod"
  ADD CONSTRAINT "LedgerPeriod_period_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ADD CONSTRAINT "LedgerPeriod_status_check" CHECK ("status" IN ('open', 'closed'));

CREATE SEQUENCE journal_entry_number_seq;

-- Posted entries and lines are final (invariant 2, D-05).
CREATE FUNCTION ledger_reject_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'The ledger is append-only: % on % is not allowed; post a reversing entry instead', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entry_no_update_delete BEFORE UPDATE OR DELETE ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION ledger_reject_change();
CREATE TRIGGER journal_entry_no_truncate BEFORE TRUNCATE ON "JournalEntry"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_reject_change();
CREATE TRIGGER journal_line_no_update_delete BEFORE UPDATE OR DELETE ON "JournalLine"
  FOR EACH ROW EXECUTE FUNCTION ledger_reject_change();
CREATE TRIGGER journal_line_no_truncate BEFORE TRUNCATE ON "JournalLine"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_reject_change();

-- Every entry balances and has at least two lines, checked at COMMIT so an
-- entry and its lines can be inserted in one transaction (invariant 1).
CREATE FUNCTION ledger_check_entry_balanced() RETURNS trigger AS $$
DECLARE
  -- One function for both tables: read the entry id by name, since each
  -- table's row has a different shape.
  entry_id TEXT := CASE TG_TABLE_NAME WHEN 'JournalLine' THEN to_jsonb(NEW)->>'entryId' ELSE to_jsonb(NEW)->>'id' END;
  debits NUMERIC;
  credits NUMERIC;
  line_count INT;
BEGIN
  SELECT COALESCE(SUM("debitCents"), 0), COALESCE(SUM("creditCents"), 0), COUNT(*)
    INTO debits, credits, line_count
    FROM "JournalLine" WHERE "entryId" = entry_id;
  IF line_count < 2 OR debits <> credits OR debits = 0 THEN
    RAISE EXCEPTION 'Journal entry % does not balance (% lines, debits %, credits %)', entry_id, line_count, debits, credits
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER journal_entry_balanced AFTER INSERT ON "JournalEntry"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_check_entry_balanced();
CREATE CONSTRAINT TRIGGER journal_line_balanced AFTER INSERT ON "JournalLine"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_check_entry_balanced();

-- Lines post only to approved accounts, and name the member / loan the
-- account's sub-ledger needs.
CREATE FUNCTION ledger_check_line_account() RETURNS trigger AS $$
DECLARE
  acct RECORD;
BEGIN
  SELECT "status", "subledger" INTO acct FROM "LedgerAccount" WHERE "code" = NEW."accountCode";
  IF acct."status" IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Account % is not approved for posting (status: %). The chart of accounts needs the accountant''s confirmation first.', NEW."accountCode", COALESCE(acct."status", 'missing')
      USING ERRCODE = 'check_violation';
  END IF;
  IF acct."subledger" IN ('member', 'loan') AND NEW."memberId" IS NULL THEN
    RAISE EXCEPTION 'Account % needs a member on every line', NEW."accountCode" USING ERRCODE = 'check_violation';
  END IF;
  IF acct."subledger" = 'loan' AND NEW."loanId" IS NULL THEN
    RAISE EXCEPTION 'Account % needs a loan on every line', NEW."accountCode" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_line_account_rules BEFORE INSERT ON "JournalLine"
  FOR EACH ROW EXECUTE FUNCTION ledger_check_line_account();

-- Nothing posts into a closed period; closed periods stay closed.
CREATE FUNCTION ledger_check_open_period() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "LedgerPeriod" WHERE "period" = to_char(NEW."effectiveDate", 'YYYY-MM') AND "status" = 'closed') THEN
    RAISE EXCEPTION 'Period % is closed; post the correction in the current period', to_char(NEW."effectiveDate", 'YYYY-MM')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entry_open_period BEFORE INSERT ON "JournalEntry"
  FOR EACH ROW EXECUTE FUNCTION ledger_check_open_period();

CREATE FUNCTION ledger_period_no_reopen() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'closed' THEN
    RAISE EXCEPTION 'Period % is closed and cannot be changed', OLD."period" USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_period_closed_is_final BEFORE UPDATE OR DELETE ON "LedgerPeriod"
  FOR EACH ROW EXECUTE FUNCTION ledger_period_no_reopen();

-- Once approved, an account's meaning is frozen: its type, normal balance
-- and sub-ledger rule cannot change, and it cannot go back to "proposed".
-- (Renaming, or retiring it, remains possible.)
CREATE FUNCTION ledger_account_frozen() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'proposed' OR EXISTS (SELECT 1 FROM "JournalLine" WHERE "accountCode" = OLD."code") THEN
      RAISE EXCEPTION 'Account % is approved or in use and cannot be deleted; retire it instead', OLD."code" USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" <> 'proposed' AND (
       NEW."code" <> OLD."code" OR NEW."type" <> OLD."type" OR NEW."normalBalance" <> OLD."normalBalance"
       OR NEW."subledger" IS DISTINCT FROM OLD."subledger" OR NEW."status" = 'proposed') THEN
    RAISE EXCEPTION 'Account % is approved: its code, type, normal balance and sub-ledger cannot change', OLD."code"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_account_frozen_when_approved BEFORE UPDATE OR DELETE ON "LedgerAccount"
  FOR EACH ROW EXECUTE FUNCTION ledger_account_frozen();

-- ── Proposed chart of accounts (docs/architecture/04 §4) ──
-- Inserted as "proposed". Nothing can be posted until the club's
-- accountant confirms it and the Treasurer records that (Gate #1 A13).
INSERT INTO "LedgerAccount" ("code", "name", "type", "normalBalance", "subledger", "description") VALUES
  ('1000', 'Bank — operating', 'asset', 'debit', NULL, 'The club''s operating bank account'),
  ('1010', 'Stripe clearing', 'asset', 'debit', NULL, 'Card payments received by Stripe, not yet paid out to the bank'),
  ('1020', 'Zelle / bank transfer clearing', 'asset', 'debit', NULL, 'Transfers confirmed but not yet matched to the bank statement'),
  ('1030', 'Cash held by collectors', 'asset', 'debit', NULL, 'Cash collected by officers and not yet deposited'),
  ('1100', 'Loans receivable — principal', 'asset', 'debit', 'loan', 'Principal owed by borrowers, per member and loan'),
  ('1110', 'Fees receivable', 'asset', 'debit', 'member', 'Fees charged and not yet paid, per member'),
  ('1190', 'Allowance for loan losses', 'contra_asset', 'credit', NULL, 'Expected losses on loans receivable'),
  ('2000', 'Member capital accounts', 'liability', 'credit', 'member', 'Contributions, per member. Liability or equity: to be classified by the accountant and counsel (Gate #1 A13)'),
  ('2100', 'Unapplied member payments', 'liability', 'credit', 'member', 'Money received from a member that is not yet allocated (e.g. loan overpayments)'),
  ('2200', 'Withdrawals payable', 'liability', 'credit', 'member', 'Approved withdrawals not yet paid out'),
  ('3000', 'Club surplus / retained', 'equity', 'credit', NULL, 'Accumulated surplus of the club'),
  ('4000', 'Loan application fee income', 'income', 'credit', NULL, 'Application fees, netted from disbursements (Gate #1 A8)'),
  ('4010', 'Late fee income', 'income', 'credit', NULL, 'Late fees (Gate #1 A7; charging switched off until counsel confirms limits)'),
  ('4900', 'Other income', 'income', 'credit', NULL, 'Future: sponsorship, interest on deposits'),
  ('5000', 'Payment processing fees', 'expense', 'debit', NULL, 'Stripe and bank fees on member payments'),
  ('5010', 'Operating expenses', 'expense', 'debit', NULL, 'Hosting, email, bank fees'),
  ('5100', 'Loan losses', 'expense', 'debit', NULL, 'Loans written off'),
  ('9000', 'Opening balance equity', 'equity', 'credit', NULL, 'Migration only (step M4); must be explained and cleared before the ledger becomes the system of record');
