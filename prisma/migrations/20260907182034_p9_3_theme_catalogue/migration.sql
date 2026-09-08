-- The three DropIndex statements Prisma generated here for
-- "Order_guestEmail_trgm_idx", "Order_orderNumber_trgm_idx" and
-- "User_email_trgm_idx" were removed by hand (CLAUDE.md, "Schema rules" — GAP-011).
-- Those are hand-authored pg_trgm indexes from
-- 20260820143949_p7_5de_order_search_trigram that Prisma's schema language cannot
-- express, so an unrelated model addition (Theme, here) reads them as drift on
-- every migration since #508. Keep them; this migration only adds Theme and
-- VendorBranding.themeId.

-- AlterTable
ALTER TABLE "VendorBranding" ADD COLUMN     "themeId" TEXT;

-- CreateTable
CREATE TABLE "Theme" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Theme_name_key" ON "Theme"("name");

-- AddForeignKey
ALTER TABLE "VendorBranding" ADD CONSTRAINT "VendorBranding_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
