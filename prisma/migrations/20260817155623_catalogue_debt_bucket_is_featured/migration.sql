-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Product_vendorId_isActive_isFeatured_idx" ON "Product"("vendorId", "isActive", "isFeatured");
