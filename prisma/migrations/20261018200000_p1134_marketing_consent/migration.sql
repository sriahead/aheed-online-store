-- #1134 - marketing consent: a per-vendor switch (off by default) and an append-only consent log.
-- Generated with prisma migrate diff from origin/staging's schema (specs/architecture.md, #895),
-- so it cannot propose dropping the hand-authored pg_trgm indexes. Read before applying.

-- CreateEnum
CREATE TYPE "MarketingConsentSource" AS ENUM ('REGISTRATION', 'ACCOUNT');

-- AlterTable
ALTER TABLE "VendorConfig" ADD COLUMN     "marketingConsentEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MarketingConsentEvent" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "statement" TEXT NOT NULL,
    "source" "MarketingConsentSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingConsentEvent_vendorId_userId_createdAt_idx" ON "MarketingConsentEvent"("vendorId", "userId", "createdAt");

-- AddForeignKey
ALTER TABLE "MarketingConsentEvent" ADD CONSTRAINT "MarketingConsentEvent_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingConsentEvent" ADD CONSTRAINT "MarketingConsentEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

