-- #1278 — hand-authored per CLAUDE.md (#895: prisma migrate dev refuses on shared dev DB due to historical checksum drift).
-- Additive nullable column on Category for the per-vendor realistic photography object key.

-- AlterTable
ALTER TABLE "Category" ADD COLUMN "imageKey" TEXT;

-- Backfill seeded top-level categories with default relative photography keys (fill-only)
UPDATE "Category"
SET "imageKey" = 'categories/' || "slug" || '.jpg'
WHERE "imageKey" IS NULL AND "parentId" IS NULL;
