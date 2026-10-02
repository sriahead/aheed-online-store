-- #962 — per-vendor product listing density. Additive only: a new enum and a defaulted
-- NOT NULL column, so every existing VendorConfig row becomes STANDARD with no backfill.
-- Generated with `prisma migrate diff` (schema -> schema) and read before applying; it does
-- not touch the hand-authored pg_trgm indexes.

-- CreateEnum
CREATE TYPE "ProductGridDensity" AS ENUM ('COMPACT', 'STANDARD', 'SPACIOUS');

-- AlterTable
ALTER TABLE "VendorConfig" ADD COLUMN     "productGridDensity" "ProductGridDensity" NOT NULL DEFAULT 'STANDARD';
