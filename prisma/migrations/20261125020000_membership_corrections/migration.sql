-- Membership history verification and correction: two people, a permanent
-- record, and database protections (as for the MC Points ledger).

ALTER TABLE "MembershipAccrual" ADD COLUMN "approvedBy" TEXT;

-- Real staff accounts. NOT VALID checks new and changed rows only, so
-- an earlier enrolment cannot stop the migration.
ALTER TABLE "MembershipAccrual" ADD CONSTRAINT "MembershipAccrual_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "MembershipAccrual" ADD CONSTRAINT "MembershipAccrual_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "MembershipAccrual" ADD CONSTRAINT "MembershipAccrual_maker_checker" CHECK ("approvedBy" IS NULL OR "approvedBy" <> "verifiedBy");
-- Verified days can never exceed the days that have passed since the join date.
ALTER TABLE "MembershipAccrual" ADD CONSTRAINT "MembershipAccrual_days_within_elapsed" CHECK ("eligibleDays" <= ("checkpoint" - "joinDate")) NOT VALID;

-- An accrual is never deleted or emptied (it is changed only by the status trigger and an approved correction).
CREATE FUNCTION membership_accrual_reject_removal() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'MembershipAccrual rows cannot be removed: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER membership_accrual_no_delete
  BEFORE DELETE ON "MembershipAccrual"
  FOR EACH ROW EXECUTE FUNCTION membership_accrual_reject_removal();
CREATE TRIGGER membership_accrual_no_truncate
  BEFORE TRUNCATE ON "MembershipAccrual"
  FOR EACH STATEMENT EXECUTE FUNCTION membership_accrual_reject_removal();

CREATE TABLE "MembershipAccrualCorrection" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "previousEligibleDays" INTEGER,
  "newEligibleDays" INTEGER NOT NULL,
  "previousJoinDate" DATE,
  "newJoinDate" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "proposedBy" TEXT NOT NULL,
  "approvedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipAccrualCorrection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MembershipAccrualCorrection_kind" CHECK ("kind" IN ('enroll', 'adjust', 'sync_join_date', 'adjust_and_sync')),
  CONSTRAINT "MembershipAccrualCorrection_days" CHECK ("newEligibleDays" >= 0 AND ("previousEligibleDays" IS NULL OR "previousEligibleDays" >= 0)),
  CONSTRAINT "MembershipAccrualCorrection_reason" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 300),
  CONSTRAINT "MembershipAccrualCorrection_maker_checker" CHECK ("approvedBy" <> "proposedBy"),
  CONSTRAINT "MembershipAccrualCorrection_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MembershipAccrualCorrection_proposedBy_fkey" FOREIGN KEY ("proposedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MembershipAccrualCorrection_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "MembershipAccrualCorrection_memberId_createdAt_idx" ON "MembershipAccrualCorrection"("memberId", "createdAt");

-- Append-only, like the audit log.
CREATE FUNCTION membership_correction_reject_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'MembershipAccrualCorrection is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER membership_correction_no_update_delete
  BEFORE UPDATE OR DELETE ON "MembershipAccrualCorrection"
  FOR EACH ROW EXECUTE FUNCTION membership_correction_reject_change();
CREATE TRIGGER membership_correction_no_truncate
  BEFORE TRUNCATE ON "MembershipAccrualCorrection"
  FOR EACH STATEMENT EXECUTE FUNCTION membership_correction_reject_change();
