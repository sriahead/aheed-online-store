-- ADR-004 slice 3b — host→tenant resolution. New table only (no backfill; hosts are seeded
-- per environment from SEED_*_HOST env vars). A plain additive migration.

-- CreateTable
CREATE TABLE "VendorDomain" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "isCanonical" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorDomain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorDomain_host_key" ON "VendorDomain"("host");

-- CreateIndex
CREATE INDEX "VendorDomain_vendorId_idx" ON "VendorDomain"("vendorId");

-- AddForeignKey
ALTER TABLE "VendorDomain" ADD CONSTRAINT "VendorDomain_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
