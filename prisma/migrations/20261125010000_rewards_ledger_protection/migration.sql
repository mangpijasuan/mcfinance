-- MC Points ledger protection. The application checks these rules, and the
-- database now enforces them too, so a bug or a direct connection cannot
-- break them. The table is append-only, like the audit log: a wrong entry
-- is corrected with a new entry that offsets it.

-- Who approved the entry (the second person; null for entries made before approvals).
ALTER TABLE "RewardEntry" ADD COLUMN "approvedBy" TEXT;

-- The staff accounts are real accounts. NOT VALID checks new rows only, so an entry made before this change cannot stop the migration.
ALTER TABLE "RewardEntry" ADD CONSTRAINT "RewardEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "RewardEntry" ADD CONSTRAINT "RewardEntry_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
-- Never the same person on both sides.
ALTER TABLE "RewardEntry" ADD CONSTRAINT "RewardEntry_maker_checker" CHECK ("approvedBy" IS NULL OR "approvedBy" <> "actorId");

ALTER TABLE "RewardEntry" ADD CONSTRAINT "RewardEntry_points_range" CHECK ("points" BETWEEN -1000 AND 1000);
ALTER TABLE "RewardEntry" ADD CONSTRAINT "RewardEntry_reference_length" CHECK (char_length(btrim("reference")) BETWEEN 1 AND 100);
ALTER TABLE "RewardEntry" ADD CONSTRAINT "RewardEntry_reason_length" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 300);

-- Append-only: entries can be added and read, never changed, removed or emptied.
CREATE FUNCTION reward_entry_reject_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'RewardEntry is append-only: % is not allowed (record an offsetting entry instead)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reward_entry_no_update_delete
  BEFORE UPDATE OR DELETE ON "RewardEntry"
  FOR EACH ROW EXECUTE FUNCTION reward_entry_reject_change();

CREATE TRIGGER reward_entry_no_truncate
  BEFORE TRUNCATE ON "RewardEntry"
  FOR EACH STATEMENT EXECUTE FUNCTION reward_entry_reject_change();

-- A member's balance stays between 0 and 1,000,000 points. Entries for one
-- member are checked one at a time, so two at once cannot both pass.
CREATE FUNCTION reward_entry_check_balance() RETURNS trigger AS $$
DECLARE
  total BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('RewardEntry:' || NEW."memberId", 0));
  SELECT COALESCE(SUM("points"), 0) INTO total FROM "RewardEntry" WHERE "memberId" = NEW."memberId";
  IF total + NEW."points" < 0 OR total + NEW."points" > 1000000 THEN
    RAISE EXCEPTION 'RewardEntry: the balance must stay between 0 and 1,000,000 points'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reward_entry_balance
  BEFORE INSERT ON "RewardEntry"
  FOR EACH ROW EXECUTE FUNCTION reward_entry_check_balance();
