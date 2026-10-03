-- F-11: transfers from clearing accounts to the bank, and monthly bank
-- reconciliations. Both are evidence: never changed or deleted.
CREATE TABLE "ClearingTransfer" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "fromAccount" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "bankDate" DATE NOT NULL,
    "reference" TEXT,
    "collector" TEXT,
    "note" TEXT,
    "journalEntry" TEXT NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClearingTransfer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClearingTransfer_account_check" CHECK ("fromAccount" IN ('1010', '1020', '1030')),
    CONSTRAINT "ClearingTransfer_amount_check" CHECK ("amountCents" > 0),
    CONSTRAINT "ClearingTransfer_collector_check" CHECK ("fromAccount" <> '1030' OR "collector" IS NOT NULL)
);

CREATE UNIQUE INDEX "ClearingTransfer_transferId_key" ON "ClearingTransfer"("transferId");
CREATE INDEX "ClearingTransfer_fromAccount_bankDate_idx" ON "ClearingTransfer"("fromAccount", "bankDate");

CREATE TABLE "BankReconciliation" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "period" TEXT NOT NULL,
    "statementDate" DATE NOT NULL,
    "statementBalanceCents" BIGINT NOT NULL,
    "ledgerBalanceCents" BIGINT NOT NULL,
    "items" JSONB NOT NULL,
    "differenceCents" BIGINT NOT NULL,
    "note" TEXT,
    "preparedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BankReconciliation_period_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);

CREATE UNIQUE INDEX "BankReconciliation_seq_key" ON "BankReconciliation"("seq");
CREATE INDEX "BankReconciliation_period_seq_idx" ON "BankReconciliation"("period", "seq");

CREATE FUNCTION reconciliation_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be changed or deleted', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clearing_transfer_immutable BEFORE UPDATE OR DELETE ON "ClearingTransfer"
  FOR EACH ROW EXECUTE FUNCTION reconciliation_immutable();
CREATE TRIGGER clearing_transfer_no_truncate BEFORE TRUNCATE ON "ClearingTransfer"
  FOR EACH STATEMENT EXECUTE FUNCTION reconciliation_immutable();
CREATE TRIGGER bank_reconciliation_immutable BEFORE UPDATE OR DELETE ON "BankReconciliation"
  FOR EACH ROW EXECUTE FUNCTION reconciliation_immutable();
CREATE TRIGGER bank_reconciliation_no_truncate BEFORE TRUNCATE ON "BankReconciliation"
  FOR EACH STATEMENT EXECUTE FUNCTION reconciliation_immutable();
