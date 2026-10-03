-- M5: the nightly comparison of the ledger with the old records.
CREATE TABLE "LedgerComparison" (
    "id" TEXT NOT NULL,
    "runDate" DATE NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "differences" INTEGER NOT NULL,
    "details" JSONB NOT NULL,
    "emailedTo" TEXT,

    CONSTRAINT "LedgerComparison_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LedgerComparison_runDate_idx" ON "LedgerComparison"("runDate");

-- Evidence for the M5 exit criterion: never changed or deleted.
CREATE FUNCTION ledger_comparison_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'LedgerComparison rows cannot be changed or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_comparison_immutable
  BEFORE UPDATE OR DELETE ON "LedgerComparison"
  FOR EACH ROW EXECUTE FUNCTION ledger_comparison_immutable();

CREATE TRIGGER ledger_comparison_no_truncate
  BEFORE TRUNCATE ON "LedgerComparison"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_comparison_immutable();
