-- Treasury (Gate #1 A10): bank balances recorded by the Treasurer.
CREATE TABLE "TreasuryBankBalance" (
    "id" TEXT NOT NULL,
    "balanceId" TEXT NOT NULL,
    "statementDate" DATE NOT NULL,
    "balanceCents" BIGINT NOT NULL,
    "note" TEXT,
    "recordedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreasuryBankBalance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TreasuryBankBalance_balanceId_key" ON "TreasuryBankBalance"("balanceId");
CREATE INDEX "TreasuryBankBalance_statementDate_idx" ON "TreasuryBankBalance"("statementDate");

-- A recorded balance is evidence: it is never edited or deleted. A
-- mistake is corrected by recording the right balance again.
CREATE FUNCTION treasury_bank_balance_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'TreasuryBankBalance rows cannot be changed or deleted; record a new balance instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER treasury_bank_balance_immutable
  BEFORE UPDATE OR DELETE ON "TreasuryBankBalance"
  FOR EACH ROW EXECUTE FUNCTION treasury_bank_balance_immutable();
