-- #1083 / #1078 - two additive VendorConfig columns. Generated with prisma migrate diff from
-- origin/staging's schema (migrate dev demands a dev reset, see specs/architecture.md, #895).
-- collectionMinimumOrderPence: Click & Collect's own minimum, 0 = none (owner ruling, #1083).
-- bannerHeadline: the header banner's first line; null keeps the derived line (#1078).

-- AlterTable
ALTER TABLE "VendorConfig" ADD COLUMN     "bannerHeadline" TEXT,
ADD COLUMN     "collectionMinimumOrderPence" INTEGER NOT NULL DEFAULT 0;

