-- NOTE (#454, 2026-09-02): `prisma migrate dev` generated three DROP INDEX statements here for
-- `Order_guestEmail_trgm_idx`, `Order_orderNumber_trgm_idx` and `User_email_trgm_idx`, and they
-- were REMOVED BY HAND before this migration was ever applied.
--
-- Those are the hand-authored pg_trgm indexes from 20260820143949_p7_5de_order_search_trigram.
-- Prisma's schema language cannot express a trigram index, so `schema.prisma` does not describe
-- them and every `migrate dev` run reads them as drift to be dropped — regardless of what the
-- migration is actually for. Adding `PaymentBindingRefusal`, which has no relationship to `Order`
-- or `User` at all, was enough to trigger it. This is the same failure that executed for real in
-- #508; CLAUDE.md records it, and the `--create-only` review step this slice's validation.md
-- mandates (R2) is what stopped it here.
--
-- Keep them, and keep re-asserting this on any future generated migration that proposes the drop.

-- CreateTable
CREATE TABLE "PaymentBindingRefusal" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT,
    "orderId" TEXT,
    "orderNumber" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "claimedProviderReference" TEXT,
    "claimedAmountPence" INTEGER,
    "claimedCurrency" TEXT,
    "storedProviderReference" TEXT,
    "storedAmountPence" INTEGER,
    "storedCurrency" TEXT,
    "resolution" TEXT,
    "resolutionDetail" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentBindingRefusal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentBindingRefusal_vendorId_createdAt_idx" ON "PaymentBindingRefusal"("vendorId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentBindingRefusal_createdAt_idx" ON "PaymentBindingRefusal"("createdAt");

-- AddForeignKey
ALTER TABLE "PaymentBindingRefusal" ADD CONSTRAINT "PaymentBindingRefusal_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBindingRefusal" ADD CONSTRAINT "PaymentBindingRefusal_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
