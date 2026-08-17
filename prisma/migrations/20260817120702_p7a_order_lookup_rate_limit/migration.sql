-- CreateTable
CREATE TABLE "OrderLookupAttempt" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderLookupAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderLookupAttempt_vendorId_ipHash_createdAt_idx" ON "OrderLookupAttempt"("vendorId", "ipHash", "createdAt");

-- AddForeignKey
ALTER TABLE "OrderLookupAttempt" ADD CONSTRAINT "OrderLookupAttempt_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
