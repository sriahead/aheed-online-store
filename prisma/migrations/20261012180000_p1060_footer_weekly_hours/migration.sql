-- #1060: replaces #1055's free-text VendorOpeningHours (staging/dev only; never promoted) with
-- structured weekly hours and dated overrides. Staging's free-text rows are re-entered by hand
-- (owner decision, 2026-10-12); production never had the table.

-- DropForeignKey
ALTER TABLE "VendorOpeningHours" DROP CONSTRAINT "VendorOpeningHours_vendorId_fkey";

-- DropTable
DROP TABLE "VendorOpeningHours";

-- CreateTable
CREATE TABLE "VendorWeeklyHours" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openTime" TEXT,
    "closeTime" TEXT,
    "closed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "VendorWeeklyHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorHoursOverride" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "openTime" TEXT,
    "closeTime" TEXT,
    "closed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "VendorHoursOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorWeeklyHours_vendorId_dayOfWeek_key" ON "VendorWeeklyHours"("vendorId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "VendorHoursOverride_vendorId_date_key" ON "VendorHoursOverride"("vendorId", "date");

-- AddForeignKey
ALTER TABLE "VendorWeeklyHours" ADD CONSTRAINT "VendorWeeklyHours_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorHoursOverride" ADD CONSTRAINT "VendorHoursOverride_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

