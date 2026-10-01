-- AlterTable
ALTER TABLE "Contribution" ADD COLUMN     "amountCents" BIGINT,
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'dues',
ADD COLUMN     "journalEntry" TEXT,
ADD COLUMN     "receiptCovers" TEXT,
ADD COLUMN     "receiptNumber" TEXT,
ADD COLUMN     "reversalEntry" TEXT,
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "reversedBy" TEXT;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "duesThrough" TEXT;

-- CreateTable
CREATE TABLE "DuesPlan" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "startPeriod" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuesPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuesObligation" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuesObligation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DuesPlan_memberId_startPeriod_key" ON "DuesPlan"("memberId", "startPeriod");

-- CreateIndex
CREATE INDEX "DuesObligation_period_idx" ON "DuesObligation"("period");

-- CreateIndex
CREATE UNIQUE INDEX "DuesObligation_memberId_period_key" ON "DuesObligation"("memberId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "Contribution_receiptNumber_key" ON "Contribution"("receiptNumber");

-- CreateIndex
CREATE INDEX "Contribution_memberId_paymentDate_idx" ON "Contribution"("memberId", "paymentDate");

-- AddForeignKey
ALTER TABLE "DuesPlan" ADD CONSTRAINT "DuesPlan_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuesObligation" ADD CONSTRAINT "DuesObligation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Hand-written: backfill, checks and rules the database enforces ──

-- Existing rows in exact cents. Every legacy amount is a whole number of
-- cents (checked by scripts in Stage 3 foundation); ROUND guards float noise.
UPDATE "Contribution" SET "amountCents" = ROUND("amount"::numeric * 100)::bigint;
ALTER TABLE "Contribution" ALTER COLUMN "amountCents" SET NOT NULL;

CREATE SEQUENCE "receipt_number_seq";

-- New rows must be positive. NOT VALID leaves any odd historical row (a
-- $0 or negative correction) in place for the migration review (A14);
-- dues coverage counts only positive payments.
ALTER TABLE "Contribution"
  ADD CONSTRAINT "Contribution_amount_cents_check" CHECK ("amountCents" > 0) NOT VALID;

ALTER TABLE "Contribution"
  ADD CONSTRAINT "Contribution_category_check" CHECK ("category" IN ('dues', 'voluntary')),
  ADD CONSTRAINT "Contribution_reversal_check" CHECK (
    ("reversedAt" IS NULL AND "reversalReason" IS NULL)
    OR ("reversedAt" IS NOT NULL AND "reversalReason" IS NOT NULL)
  );

ALTER TABLE "DuesPlan"
  ADD CONSTRAINT "DuesPlan_amount_check" CHECK ("amountCents" >= 0),
  ADD CONSTRAINT "DuesPlan_period_check" CHECK ("startPeriod" ~ '^\d{4}-(0[1-9]|1[0-2])$');

ALTER TABLE "DuesObligation"
  ADD CONSTRAINT "DuesObligation_amount_check" CHECK ("amountCents" > 0),
  ADD CONSTRAINT "DuesObligation_period_check" CHECK ("period" ~ '^\d{4}-(0[1-9]|1[0-2])$');

ALTER TABLE "Member"
  ADD CONSTRAINT "Member_dues_through_check" CHECK ("duesThrough" IS NULL OR "duesThrough" ~ '^\d{4}-(0[1-9]|1[0-2])$');

-- A recorded contribution is never deleted and its money never changes.
-- Allowed: descriptive fields (comments, monthYear, …), filling in the
-- receipt and journal references once, and recording a reversal once.
CREATE FUNCTION contribution_check_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Contributions cannot be deleted; reverse them instead' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW."transactionId", NEW."memberId", NEW."amount", NEW."amountCents", NEW."paymentDate", NEW."category")
       IS DISTINCT FROM (OLD."transactionId", OLD."memberId", OLD."amount", OLD."amountCents", OLD."paymentDate", OLD."category")
     OR (OLD."receiptNumber" IS NOT NULL AND NEW."receiptNumber" IS DISTINCT FROM OLD."receiptNumber")
     OR (OLD."receiptCovers" IS NOT NULL AND NEW."receiptCovers" IS DISTINCT FROM OLD."receiptCovers")
     OR (OLD."journalEntry" IS NOT NULL AND NEW."journalEntry" IS DISTINCT FROM OLD."journalEntry")
     OR (OLD."reversalEntry" IS NOT NULL AND NEW."reversalEntry" IS DISTINCT FROM OLD."reversalEntry")
     OR (OLD."reversedAt" IS NOT NULL AND (NEW."reversedAt", NEW."reversedBy", NEW."reversalReason")
         IS DISTINCT FROM (OLD."reversedAt", OLD."reversedBy", OLD."reversalReason")) THEN
    RAISE EXCEPTION 'Contribution % cannot be changed; record a reversal instead', OLD."transactionId"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contribution_guard BEFORE UPDATE OR DELETE ON "Contribution"
  FOR EACH ROW EXECUTE FUNCTION contribution_check_change();

-- Dues plans and obligations are history: never changed or deleted.
CREATE FUNCTION dues_reject_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be changed or deleted', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dues_plan_immutable BEFORE UPDATE OR DELETE ON "DuesPlan"
  FOR EACH ROW EXECUTE FUNCTION dues_reject_change();
CREATE TRIGGER dues_obligation_immutable BEFORE UPDATE OR DELETE ON "DuesObligation"
  FOR EACH ROW EXECUTE FUNCTION dues_reject_change();
