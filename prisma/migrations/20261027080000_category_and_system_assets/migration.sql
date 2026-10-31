-- HAND-AUTHORED per CLAUDE.md (#895: prisma migrate dev refuses on dev DB due to historical checksum drift).
-- #1285: Multi-candidate category and UI system icon assets (review, select, delete, dedicated gallery).

-- CreateTable
CREATE TABLE "CategoryAsset" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "categoryId" TEXT,
    "slot" TEXT,
    "storageKey" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategoryAsset_vendorId_categoryId_idx" ON "CategoryAsset"("vendorId", "categoryId");

-- CreateIndex
CREATE INDEX "CategoryAsset_vendorId_slot_idx" ON "CategoryAsset"("vendorId", "slot");

-- AddForeignKey
ALTER TABLE "CategoryAsset" ADD CONSTRAINT "CategoryAsset_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryAsset" ADD CONSTRAINT "CategoryAsset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill existing categories with imageKey into CategoryAsset as selected candidates
INSERT INTO "CategoryAsset" ("id", "vendorId", "categoryId", "storageKey", "style", "isSelected", "createdAt")
SELECT
    gen_random_uuid()::text,
    "vendorId",
    "id",
    "imageKey",
    'photo',
    true,
    CURRENT_TIMESTAMP
FROM "Category"
WHERE "imageKey" IS NOT NULL;
