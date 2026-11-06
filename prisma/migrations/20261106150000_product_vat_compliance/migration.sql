-- Product VAT compliance and audit trail:
-- 1. vatRate (0 or 20, defaults to 0).
-- 2. originalVatRate (from client spreadsheet) and suggestedVatRate (from HMRC rules engine).
-- 3. vatNeedsReview flag and vatReviewReason for client warnings / confirmation.
-- 4. vatConfirmedAt and vatConfirmedBy audit trail fields.
--
-- HAND-AUTHORED, following CLAUDE.md guidelines.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "originalVatRate" INTEGER,
ADD COLUMN     "suggestedVatRate" INTEGER,
ADD COLUMN     "vatConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "vatConfirmedBy" TEXT,
ADD COLUMN     "vatNeedsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vatRate" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vatReviewReason" TEXT;

-- CreateIndex
CREATE INDEX "Product_vendorId_vatNeedsReview_idx" ON "Product"("vendorId", "vatNeedsReview");
