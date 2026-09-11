
-- CreateTable
CREATE TABLE "VendorTheme" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandGreenDark" TEXT NOT NULL,
    "brandGreen" TEXT NOT NULL,
    "brandOrange" TEXT NOT NULL,
    "brandRed" TEXT NOT NULL,
    "brandCream" TEXT NOT NULL,
    "brandGreenTint" TEXT NOT NULL,
    "brandOrangeTint" TEXT NOT NULL,
    "brandRedTint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorTheme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorTheme_vendorId_idx" ON "VendorTheme"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorTheme_vendorId_name_key" ON "VendorTheme"("vendorId", "name");

-- AddForeignKey
ALTER TABLE "VendorTheme" ADD CONSTRAINT "VendorTheme_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
