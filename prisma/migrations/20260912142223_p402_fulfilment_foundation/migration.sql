-- CreateEnum
CREATE TYPE "FulfilmentMethod" AS ENUM ('DELIVERY', 'COLLECTION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'READY_FOR_COLLECTION';
ALTER TYPE "OrderStatus" ADD VALUE 'COLLECTED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "fulfilmentMethod" "FulfilmentMethod" NOT NULL DEFAULT 'DELIVERY';

-- AlterTable
ALTER TABLE "VendorConfig" ADD COLUMN     "offerCollection" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "VendorLocation" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorLocation_vendorId_key" ON "VendorLocation"("vendorId");

-- AddForeignKey
ALTER TABLE "VendorLocation" ADD CONSTRAINT "VendorLocation_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
