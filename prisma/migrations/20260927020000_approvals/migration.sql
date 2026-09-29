-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "amountCents" BIGINT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvalsRequired" INTEGER NOT NULL DEFAULT 1,
    "requestedBy" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "resultRef" TEXT,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalDecision" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "deciderId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_publicId_key" ON "ApprovalRequest"("publicId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_requestedAt_idx" ON "ApprovalRequest"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_entityType_entityId_idx" ON "ApprovalRequest"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalDecision_requestId_deciderId_key" ON "ApprovalDecision"("requestId", "deciderId");

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "ApprovalRequest"
  ADD CONSTRAINT "ApprovalRequest_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'cancelled')),
  ADD CONSTRAINT "ApprovalRequest_required_check" CHECK ("approvalsRequired" >= 1);
ALTER TABLE "ApprovalDecision"
  ADD CONSTRAINT "ApprovalDecision_decision_check" CHECK ("decision" IN ('approve', 'reject'));

-- One open request per action and entity: the same claim, withdrawal or
-- loan cannot be queued twice.
CREATE UNIQUE INDEX "ApprovalRequest_one_pending" ON "ApprovalRequest" ("action", "entityType", "entityId") WHERE "status" = 'pending';

-- The maker can never record a decision on their own request, even
-- through a bug in the application.
CREATE FUNCTION approval_decider_not_maker() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ApprovalRequest" WHERE "id" = NEW."requestId" AND "requestedBy" = NEW."deciderId") THEN
    RAISE EXCEPTION 'Maker and checker must be different people (D-06)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER approval_decision_not_maker BEFORE INSERT ON "ApprovalDecision"
  FOR EACH ROW EXECUTE FUNCTION approval_decider_not_maker();

-- Decisions are a permanent record.
CREATE TRIGGER approval_decision_append_only BEFORE UPDATE OR DELETE ON "ApprovalDecision"
  FOR EACH ROW EXECUTE FUNCTION ledger_reject_change();
