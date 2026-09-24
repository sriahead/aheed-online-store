-- #890 / #889 (specs/2026-09-24-p613-delivery-areas-ranges-fees-refusals/).
-- Generated with `prisma migrate diff --from-schema-datamodel <origin/staging schema>
-- --to-schema-datamodel prisma/schema.prisma --script` and read before committing: additive only,
-- no DROP, nothing touching the hand-authored pg_trgm indexes.

-- CreateEnum
CREATE TYPE "DeliveryRefusalSource" AS ENUM ('HEADER', 'CHECKOUT');

-- AlterTable
ALTER TABLE "VendorDeliveryArea" ADD COLUMN     "deliveryFeePence" INTEGER,
ADD COLUMN     "freeDeliveryThresholdPence" INTEGER,
ADD COLUMN     "minimumOrderPence" INTEGER;

-- CreateTable
CREATE TABLE "DeliveryRefusalCount" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "source" "DeliveryRefusalSource" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DeliveryRefusalCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRefusalCount_vendorId_district_day_source_key" ON "DeliveryRefusalCount"("vendorId", "district", "day", "source");

-- AddForeignKey
ALTER TABLE "DeliveryRefusalCount" ADD CONSTRAINT "DeliveryRefusalCount_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
