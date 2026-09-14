-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "fulfilmentDate" TIMESTAMP(3),
ADD COLUMN     "fulfilmentSlotId" TEXT;

-- AlterTable
ALTER TABLE "VendorConfig" ADD COLUMN     "bookingWindowDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "offerDeliverySlots" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slotHoldDurationMinutes" INTEGER NOT NULL DEFAULT 15;

-- CreateTable
CREATE TABLE "VendorFulfilmentSlot" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "method" "FulfilmentMethod" NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "VendorFulfilmentSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorFulfilmentSlot_vendorId_method_dayOfWeek_idx" ON "VendorFulfilmentSlot"("vendorId", "method", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "VendorFulfilmentSlot" ADD CONSTRAINT "VendorFulfilmentSlot_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_fulfilmentSlotId_fkey" FOREIGN KEY ("fulfilmentSlotId") REFERENCES "VendorFulfilmentSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
