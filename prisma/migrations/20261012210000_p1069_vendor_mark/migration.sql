-- #1069: the vendor's square mark. Nullable, additive, no backfill: a vendor with no mark
-- renders exactly as before. Generated with `prisma migrate diff` between the previous and the new
-- schema (no DB reset); contains no DROP and touches no pg_trgm index.

-- AlterTable
ALTER TABLE "VendorBranding" ADD COLUMN     "markStorageKey" TEXT;
