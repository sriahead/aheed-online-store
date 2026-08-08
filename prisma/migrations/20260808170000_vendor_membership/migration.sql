-- ADR-004 slice 3a — per-vendor authorization. New table only (no backfill); a plain additive
-- migration Prisma could have generated.

-- CreateEnum
CREATE TYPE "VendorRole" AS ENUM ('STAFF', 'ADMIN');

-- CreateTable
CREATE TABLE "VendorMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "role" "VendorRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorMembership_userId_vendorId_key" ON "VendorMembership"("userId", "vendorId");

-- CreateIndex
CREATE INDEX "VendorMembership_vendorId_idx" ON "VendorMembership"("vendorId");

-- AddForeignKey
ALTER TABLE "VendorMembership" ADD CONSTRAINT "VendorMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorMembership" ADD CONSTRAINT "VendorMembership_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
