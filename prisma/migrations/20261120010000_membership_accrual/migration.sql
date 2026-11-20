CREATE TABLE "MembershipAccrual" (
  "memberId" TEXT NOT NULL,
  "joinDate" DATE NOT NULL,
  "eligibleDays" INTEGER NOT NULL CHECK ("eligibleDays" >= 0),
  "checkpoint" DATE NOT NULL,
  "active" BOOLEAN NOT NULL,
  "timeZone" TEXT NOT NULL,
  "verifiedBy" TEXT NOT NULL,
  "verification" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipAccrual_pkey" PRIMARY KEY ("memberId"),
  CONSTRAINT "MembershipAccrual_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Every status change (including imports and full exits) closes the previous
-- active interval atomically. A later reactivation cannot credit inactive days.
CREATE FUNCTION checkpoint_membership_accrual() RETURNS trigger AS $$
BEGIN
  UPDATE "MembershipAccrual"
  SET "eligibleDays" = "eligibleDays" + CASE WHEN active THEN
    GREATEST(0, (clock_timestamp() AT TIME ZONE "timeZone")::date - checkpoint) ELSE 0 END,
    checkpoint = GREATEST(checkpoint, (clock_timestamp() AT TIME ZONE "timeZone")::date),
    active = (NEW.status = 'Active')
  WHERE "memberId" = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER member_accrual_status AFTER UPDATE OF status ON "Member"
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION checkpoint_membership_accrual();
