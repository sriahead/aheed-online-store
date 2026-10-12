-- CreateEnum
CREATE TYPE "PaymentBadgeMethod" AS ENUM ('VISA', 'MASTERCARD', 'AMEX', 'APPLE_PAY', 'GOOGLE_PAY');

-- AlterTable
ALTER TABLE "VendorConfig" ADD COLUMN     "companyNumber" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "openingHoursNote" TEXT,
ADD COLUMN     "registeredOffice" TEXT,
ADD COLUMN     "showSecureCheckoutNote" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vatNumber" TEXT;

-- CreateTable
CREATE TABLE "VendorOpeningHours" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "hours" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "VendorOpeningHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorPaymentBadge" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "method" "PaymentBadgeMethod" NOT NULL,

    CONSTRAINT "VendorPaymentBadge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorOpeningHours_vendorId_sortOrder_idx" ON "VendorOpeningHours"("vendorId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VendorPaymentBadge_vendorId_method_key" ON "VendorPaymentBadge"("vendorId", "method");

-- AddForeignKey
ALTER TABLE "VendorOpeningHours" ADD CONSTRAINT "VendorOpeningHours_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorPaymentBadge" ADD CONSTRAINT "VendorPaymentBadge_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

