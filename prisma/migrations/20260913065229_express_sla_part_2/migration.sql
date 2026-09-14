-- CreateTable
CREATE TABLE "VendorExpressSchedule" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL,

    CONSTRAINT "VendorExpressSchedule_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "VendorExpressSchedule" ADD CONSTRAINT "VendorExpressSchedule_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
