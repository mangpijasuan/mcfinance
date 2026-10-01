-- CreateTable
CREATE TABLE "RateLimitAttempt" (
    "id" BIGSERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateLimitAttempt_key_at_idx" ON "RateLimitAttempt"("key", "at");

-- CreateIndex
CREATE INDEX "RateLimitAttempt_at_idx" ON "RateLimitAttempt"("at");

