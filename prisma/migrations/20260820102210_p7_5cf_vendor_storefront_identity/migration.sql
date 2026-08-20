-- AlterTable
ALTER TABLE "VendorConfig" ADD COLUMN     "bannerNote" TEXT,
ADD COLUMN     "heroSubtitle" TEXT;

-- CreateTable
CREATE TABLE "VendorPromotion" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageKey" TEXT,
    "altText" TEXT,
    "linkUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorPromotion_vendorId_isActive_sortOrder_idx" ON "VendorPromotion"("vendorId", "isActive", "sortOrder");

-- AddForeignKey
ALTER TABLE "VendorPromotion" ADD CONSTRAINT "VendorPromotion_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
