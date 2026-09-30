-- CreateEnum
CREATE TYPE "PaymentReconciliationOutcome" AS ENUM ('DEFERRED', 'RETRYABLE_ERROR', 'PERMANENT_ERROR', 'REFUSED', 'CONFIRMED', 'RELEASED', 'ALREADY_HANDLED');

-- CreateTable
CREATE TABLE "PaymentReconciliation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL,
    "lastOutcome" "PaymentReconciliationOutcome",
    "lastErrorStatus" INTEGER,
    "exhaustedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReconciliation_orderId_key" ON "PaymentReconciliation"("orderId");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_vendorId_exhaustedAt_idx" ON "PaymentReconciliation"("vendorId", "exhaustedAt");

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

