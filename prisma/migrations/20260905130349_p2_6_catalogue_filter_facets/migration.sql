-- P2.6 slice 6 (#569) — catalogue filter facets: brand, dietary flags, HMC provenance.
--
-- HAND-EDITED, DELIBERATELY. `prisma migrate dev` generated three `DROP INDEX`
-- statements at the top of this file, against the pg_trgm trigram indexes created by
-- 20260820143949_p7_5de_order_search_trigram. They were REMOVED before this migration
-- was ever applied.
--
-- Why it keeps happening (GAP-011, and this is the sixth occurrence — #508, then once
-- per P2.6 slice carrying a migration): a trigram index cannot be expressed in Prisma's
-- schema language, so schema.prisma does not describe it, so every `migrate dev` run
-- sees an object in the database with no declaration behind it and proposes dropping it.
-- Adding ANY unrelated model is enough to trigger it. In #508 the drop actually executed
-- against the dev database before anyone read the generated SQL.
--
-- Nothing below this line touches those indexes. Read every generated migration.sql
-- before letting it apply.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "brandId" TEXT,
ADD COLUMN     "hmcReference" TEXT,
ADD COLUMN     "hmcVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "isGlutenFree" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isHmcCertified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isVegetarian" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "imageKey" TEXT,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Brand_vendorId_name_idx" ON "Brand"("vendorId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_vendorId_slug_key" ON "Brand"("vendorId", "slug");

-- CreateIndex
CREATE INDEX "Product_vendorId_isActive_brandId_idx" ON "Product"("vendorId", "isActive", "brandId");

-- CreateIndex
CREATE INDEX "Product_vendorId_isActive_origin_idx" ON "Product"("vendorId", "isActive", "origin");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
