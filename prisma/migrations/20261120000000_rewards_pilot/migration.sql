CREATE TABLE "RewardEntry" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "points" INTEGER NOT NULL CHECK ("points" <> 0),
    "reference" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RewardEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RewardEntry_memberId_reference_key" ON "RewardEntry"("memberId", "reference");
CREATE INDEX "RewardEntry_memberId_createdAt_idx" ON "RewardEntry"("memberId", "createdAt");
ALTER TABLE "RewardEntry" ADD CONSTRAINT "RewardEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
