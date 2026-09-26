-- One sequence orders every repayment, fee and waiver as recorded, so a
-- loan's history replays in exactly the order it happened.
-- (Wrapped in a function so Prisma does not mistake it for an autoincrement.)
CREATE SEQUENCE "loan_event_seq";
CREATE FUNCTION next_loan_event() RETURNS BIGINT AS $$ SELECT nextval('loan_event_seq') $$ LANGUAGE sql;

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "applicationFeeCents" BIGINT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "chargeOffEntry" TEXT,
ADD COLUMN     "chargedOffOn" DATE,
ADD COLUMN     "daysPastDue" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "delinquency" TEXT,
ADD COLUMN     "disbursedAmountCents" BIGINT,
ADD COLUMN     "disbursedBy" TEXT,
ADD COLUMN     "disbursedOn" DATE,
ADD COLUMN     "disbursementEntry" TEXT,
ADD COLUMN     "disbursementMethod" TEXT,
ADD COLUMN     "disbursementReference" TEXT,
ADD COLUMN     "dueDay" INTEGER,
ADD COLUMN     "graceDays" INTEGER,
ADD COLUMN     "lifecycle" TEXT NOT NULL DEFAULT 'disbursed',
ADD COLUMN     "policyVersion" TEXT,
ADD COLUMN     "principalCents" BIGINT,
ADD COLUMN     "servicedOn" DATE;

-- AlterTable
ALTER TABLE "LoanAgreement" ADD COLUMN     "amountPaidOut" DOUBLE PRECISION,
ADD COLUMN     "borrowerSignedHash" TEXT,
ADD COLUMN     "cosignerSignedHash" TEXT,
ADD COLUMN     "lenderSignedHash" TEXT,
ADD COLUMN     "termsHash" TEXT;

-- AlterTable
ALTER TABLE "LoanPayment" ADD COLUMN     "eventSeq" BIGINT NOT NULL DEFAULT next_loan_event(),
ADD COLUMN     "journalEntry" TEXT;

-- CreateTable
CREATE TABLE "LoanInstallment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "principalCents" BIGINT NOT NULL,
    "interestCents" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanFee" (
    "id" TEXT NOT NULL,
    "feeId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'late_fee',
    "amountCents" BIGINT NOT NULL,
    "assessedOn" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'charged',
    "journalEntry" TEXT,
    "waivedOn" DATE,
    "waivedAt" TIMESTAMP(3),
    "waivedBy" TEXT,
    "waiverReason" TEXT,
    "waiverEntry" TEXT,
    "eventSeq" BIGINT NOT NULL DEFAULT next_loan_event(),
    "waiverSeq" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanFee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoanInstallment_loanId_number_key" ON "LoanInstallment"("loanId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "LoanFee_feeId_key" ON "LoanFee"("feeId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanFee_loanId_installmentNumber_kind_key" ON "LoanFee"("loanId", "installmentNumber", "kind");

-- CreateIndex
CREATE INDEX "Loan_lifecycle_idx" ON "Loan"("lifecycle");

-- AddForeignKey
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("loanId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanFee" ADD CONSTRAINT "LoanFee_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("loanId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Hand-written: lifecycle backfill and rules the database enforces ──

-- Loans made before the lifecycle existed: an active loan has been paid
-- out, so it is "disbursed"; paid-off and cancelled loans keep that state.
UPDATE "Loan" SET "lifecycle" = CASE
  WHEN "status" = 'Paid Off' THEN 'paid_off'
  WHEN "status" = 'Cancelled' THEN 'cancelled'
  ELSE 'disbursed'
END;

ALTER TABLE "Loan"
  ADD CONSTRAINT "Loan_lifecycle_check" CHECK ("lifecycle" IN ('approved', 'agreement_signed', 'disbursed', 'paid_off', 'charged_off', 'cancelled')),
  ADD CONSTRAINT "Loan_delinquency_check" CHECK ("delinquency" IS NULL OR "delinquency" IN ('current', 'delinquent')),
  ADD CONSTRAINT "Loan_cents_check" CHECK (
    ("principalCents" IS NULL OR "principalCents" > 0)
    AND ("applicationFeeCents" IS NULL OR "applicationFeeCents" >= 0)
    AND ("disbursedAmountCents" IS NULL OR "disbursedAmountCents" > 0)
  ),
  ADD CONSTRAINT "Loan_days_past_due_check" CHECK ("daysPastDue" >= 0);

ALTER TABLE "LoanInstallment"
  ADD CONSTRAINT "LoanInstallment_amounts_check" CHECK ("principalCents" > 0 AND "interestCents" = 0 AND "number" >= 1);

ALTER TABLE "LoanFee"
  ADD CONSTRAINT "LoanFee_kind_check" CHECK ("kind" IN ('late_fee')),
  ADD CONSTRAINT "LoanFee_status_check" CHECK ("status" IN ('charged', 'waived')),
  ADD CONSTRAINT "LoanFee_amount_check" CHECK ("amountCents" > 0),
  ADD CONSTRAINT "LoanFee_waiver_check" CHECK (
    ("status" = 'charged' AND "waivedOn" IS NULL)
    OR ("status" = 'waived' AND "waivedOn" IS NOT NULL AND "waivedAt" IS NOT NULL AND "waiverReason" IS NOT NULL)
  );

-- Only the documented lifecycle moves are possible (docs/architecture/04 §2).
-- Cancellation only before disbursement; after it, only payoff or charge-off.
CREATE FUNCTION loan_check_lifecycle() RETURNS trigger AS $$
BEGIN
  IF NEW."lifecycle" = OLD."lifecycle" THEN RETURN NEW; END IF;
  IF (OLD."lifecycle", NEW."lifecycle") IN (
    ('approved', 'agreement_signed'), ('approved', 'cancelled'),
    ('agreement_signed', 'disbursed'), ('agreement_signed', 'cancelled'),
    ('disbursed', 'paid_off'), ('disbursed', 'charged_off')
  ) THEN
    RETURN NEW;
  END IF;
  -- Loans made before the loan engine (no stored schedule) were all marked
  -- "disbursed"; one with no repayment may still be cancelled (Gate #1 A9,
  -- checked by the application).
  IF OLD."lifecycle" = 'disbursed' AND NEW."lifecycle" = 'cancelled' AND OLD."principalCents" IS NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Loan % cannot move from % to %', OLD."loanId", OLD."lifecycle", NEW."lifecycle"
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER loan_lifecycle BEFORE UPDATE OF "lifecycle" ON "Loan"
  FOR EACH ROW EXECUTE FUNCTION loan_check_lifecycle();

-- A stored schedule never changes.
CREATE FUNCTION loan_installment_reject_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Loan schedules cannot be changed or deleted' USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER loan_installment_immutable BEFORE UPDATE OR DELETE ON "LoanInstallment"
  FOR EACH ROW EXECUTE FUNCTION loan_installment_reject_change();

-- A fee is never deleted or re-priced. The only changes: charged → waived,
-- and recording the journal entry numbers once posted.
CREATE FUNCTION loan_fee_check_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Loan fees cannot be deleted; waive them instead' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW."feeId", NEW."loanId", NEW."installmentNumber", NEW."kind", NEW."amountCents", NEW."assessedOn")
     IS DISTINCT FROM (OLD."feeId", OLD."loanId", OLD."installmentNumber", OLD."kind", OLD."amountCents", OLD."assessedOn")
     OR (OLD."status" = 'waived' AND NEW."status" <> 'waived')
     OR (OLD."journalEntry" IS NOT NULL AND NEW."journalEntry" IS DISTINCT FROM OLD."journalEntry")
     OR (OLD."waiverEntry" IS NOT NULL AND NEW."waiverEntry" IS DISTINCT FROM OLD."waiverEntry")
     OR NEW."eventSeq" IS DISTINCT FROM OLD."eventSeq"
     OR (OLD."waiverSeq" IS NOT NULL AND NEW."waiverSeq" IS DISTINCT FROM OLD."waiverSeq") THEN
    RAISE EXCEPTION 'Loan fee % can only be waived, not changed', OLD."feeId" USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."status" = 'charged' AND NEW."status" = 'waived' THEN
    NEW."waiverSeq" := next_loan_event();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER loan_fee_guard BEFORE UPDATE OR DELETE ON "LoanFee"
  FOR EACH ROW EXECUTE FUNCTION loan_fee_check_change();
