-- P5a — loyalty points (specs/2026-08-11-p5a-loyalty-points/, issue #135).
--
-- Purely additive: one new enum, three new tables, one new Order column and six
-- new VendorConfig columns. No DROP, no SET NOT NULL on anything existing, and no
-- ALTER TYPE against an enum that already existed — so there is no window where a
-- running app is inconsistent with the schema, and no backfill.
--
-- Order.discountPence defaults to 0, which is exactly right for every pre-P5a
-- order: they carried no discount, and the money identity
-- subtotalPence - discountPence + deliveryFeePence = totalPence holds for them
-- unchanged the moment the column exists.
--
-- VendorConfig's loyalty columns all carry defaults and loyaltyEnabled defaults
-- FALSE, so every existing vendor row stays valid and the feature is dark until a
-- vendor is deliberately opted in.
--
-- LoyaltyLedgerEntry's UNIQUE(orderId, kind) is load-bearing, not hygiene: it is
-- what makes a duplicate Stripe webhook delivery (a second EARN) and a
-- double-submitted checkout (a second REDEEM) impossible at the database level
-- rather than dependent on application-side checks.
--
-- ON DELETE CASCADE from User is deliberate and differs from P4b's SET NULL on
-- OrderStatusEvent: a status event is a record of what a staff member did to
-- someone else's order and must outlive their account, whereas a loyalty balance
-- is the user's own property and has no meaning once the user is gone.

-- CreateEnum
CREATE TYPE "LoyaltyEntryKind" AS ENUM ('EARN', 'REDEEM', 'REVERSAL');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "discountPence" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VendorConfig" ADD COLUMN     "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minRedeemPoints" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "pencePerPointRedeemed" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "pointsExpiryMonths" INTEGER,
ADD COLUMN     "pointsPerPoundEarned" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "tierWindowDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "VendorLoyaltyTier" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "thresholdPence" INTEGER NOT NULL,
    "multiplierBps" INTEGER NOT NULL DEFAULT 10000,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorLoyaltyTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyLedgerEntry" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "LoyaltyEntryKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "tierKey" TEXT,
    "multiplierBps" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyAccount" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balancePoints" INTEGER NOT NULL DEFAULT 0,
    "lifetimePoints" INTEGER NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorLoyaltyTier_vendorId_thresholdPence_idx" ON "VendorLoyaltyTier"("vendorId", "thresholdPence");

-- CreateIndex
CREATE UNIQUE INDEX "VendorLoyaltyTier_vendorId_key_key" ON "VendorLoyaltyTier"("vendorId", "key");

-- CreateIndex
CREATE INDEX "LoyaltyLedgerEntry_vendorId_userId_createdAt_idx" ON "LoyaltyLedgerEntry"("vendorId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyLedgerEntry_orderId_kind_key" ON "LoyaltyLedgerEntry"("orderId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyAccount_vendorId_userId_key" ON "LoyaltyAccount"("vendorId", "userId");

-- AddForeignKey
ALTER TABLE "VendorLoyaltyTier" ADD CONSTRAINT "VendorLoyaltyTier_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyLedgerEntry" ADD CONSTRAINT "LoyaltyLedgerEntry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyLedgerEntry" ADD CONSTRAINT "LoyaltyLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyLedgerEntry" ADD CONSTRAINT "LoyaltyLedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

