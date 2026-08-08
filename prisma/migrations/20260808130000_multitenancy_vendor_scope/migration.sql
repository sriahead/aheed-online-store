-- ADR-004 slice 1 — multi-tenancy: Vendor aggregate + required vendorId on domain tables,
-- with all existing rows backfilled to a single "Aheed Food Centre" vendor.
--
-- Hand-authored (not a plain Prisma-generated ADD COLUMN NOT NULL, which would fail on the
-- populated staging/production tables): add vendorId nullable -> backfill -> SET NOT NULL.
-- The Aheed vendor uses a fixed, well-known UUID so it is identical across environments.

-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "VendorStatus" NOT NULL DEFAULT 'ACTIVE',
    "customDomain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorBranding" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "logoStorageKey" TEXT,
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

    CONSTRAINT "VendorBranding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorConfig" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "localityName" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorDeliveryArea" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,

    CONSTRAINT "VendorDeliveryArea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_slug_key" ON "Vendor"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_customDomain_key" ON "Vendor"("customDomain");

-- CreateIndex
CREATE UNIQUE INDEX "VendorBranding_vendorId_key" ON "VendorBranding"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorConfig_vendorId_key" ON "VendorConfig"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorDeliveryArea_vendorId_prefix_key" ON "VendorDeliveryArea"("vendorId", "prefix");

-- Seed the Aheed vendor (fixed UUID) BEFORE backfilling existing rows.
INSERT INTO "Vendor" ("id", "slug", "name", "status", "createdAt", "updatedAt")
VALUES ('a4ed0000-0000-4000-a000-000000000001', 'aheed-food-centre', 'Aheed Food Centre', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable: add vendorId nullable, backfill to Aheed, then enforce NOT NULL.
ALTER TABLE "Category" ADD COLUMN "vendorId" TEXT;
ALTER TABLE "Product" ADD COLUMN "vendorId" TEXT;
ALTER TABLE "Inventory" ADD COLUMN "vendorId" TEXT;
ALTER TABLE "Review" ADD COLUMN "vendorId" TEXT;

UPDATE "Category" SET "vendorId" = 'a4ed0000-0000-4000-a000-000000000001';
UPDATE "Product" SET "vendorId" = 'a4ed0000-0000-4000-a000-000000000001';
UPDATE "Inventory" SET "vendorId" = 'a4ed0000-0000-4000-a000-000000000001';
UPDATE "Review" SET "vendorId" = 'a4ed0000-0000-4000-a000-000000000001';

ALTER TABLE "Category" ALTER COLUMN "vendorId" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "vendorId" SET NOT NULL;
ALTER TABLE "Inventory" ALTER COLUMN "vendorId" SET NOT NULL;
ALTER TABLE "Review" ALTER COLUMN "vendorId" SET NOT NULL;

-- DropIndex: replace global uniques with per-vendor composites, and old read indexes
-- with vendorId-leading ones.
DROP INDEX "Category_slug_key";
DROP INDEX "Category_parentId_isActive_idx";
DROP INDEX "Product_slug_key";
DROP INDEX "Product_categoryId_isActive_idx";
DROP INDEX "Product_isActive_basePrice_idx";
DROP INDEX "Review_userId_productId_key";
DROP INDEX "Review_productId_createdAt_idx";

-- CreateIndex: per-vendor composite uniques
CREATE UNIQUE INDEX "Category_vendorId_slug_key" ON "Category"("vendorId", "slug");
CREATE UNIQUE INDEX "Product_vendorId_slug_key" ON "Product"("vendorId", "slug");
CREATE UNIQUE INDEX "Review_vendorId_userId_productId_key" ON "Review"("vendorId", "userId", "productId");

-- CreateIndex: vendorId-leading read indexes
CREATE INDEX "Category_vendorId_parentId_isActive_idx" ON "Category"("vendorId", "parentId", "isActive");
CREATE INDEX "Product_vendorId_categoryId_isActive_idx" ON "Product"("vendorId", "categoryId", "isActive");
CREATE INDEX "Product_vendorId_isActive_basePrice_idx" ON "Product"("vendorId", "isActive", "basePrice");
CREATE INDEX "Inventory_vendorId_idx" ON "Inventory"("vendorId");
CREATE INDEX "Review_vendorId_productId_createdAt_idx" ON "Review"("vendorId", "productId", "createdAt");

-- AddForeignKey: domain tables -> Vendor (RESTRICT, matching Prisma's default for a required relation)
ALTER TABLE "Category" ADD CONSTRAINT "Category_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: satellite tables -> Vendor (CASCADE)
ALTER TABLE "VendorBranding" ADD CONSTRAINT "VendorBranding_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorConfig" ADD CONSTRAINT "VendorConfig_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorDeliveryArea" ADD CONSTRAINT "VendorDeliveryArea_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
