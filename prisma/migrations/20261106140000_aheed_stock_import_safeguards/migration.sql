-- Aheed catalogue onboarding safeguards:
-- 1. Product PLU uniqueness per vendor (@@unique([vendorId, plu])) and barcode indexing.
-- 2. Import lineage tracking (importBatchId, importSourceRow).
-- 3. Field-level manual edit protection (isManuallyEdited, manuallyEditedFields, lastManualEditAt).
-- 4. Inventory optimistic concurrency versioning (version).
-- 5. Append-only InventoryAuditLog table and InventoryAuditSource enum.
--
-- HAND-AUTHORED, following CLAUDE.md guidelines. Output generated from `prisma migrate diff`
-- without touching production.

-- CreateEnum
CREATE TYPE "InventoryAuditSource" AS ENUM ('SYSTEM_INITIAL_RESET', 'EXCEL_IMPORT', 'STAFF_ADJUSTMENT', 'STOCKTAKE', 'ORDER_RESERVED', 'ORDER_FULFILLED', 'ORDER_CANCELLED', 'RESTOCK', 'MIGRATION_ROLLBACK');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "importSourceRow" INTEGER,
ADD COLUMN     "isManuallyEdited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastManualEditAt" TIMESTAMP(3),
ADD COLUMN     "manuallyEditedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "plu" TEXT;

-- AlterTable
ALTER TABLE "Inventory" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "InventoryAuditLog" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "previousQuantity" INTEGER NOT NULL,
    "newQuantity" INTEGER NOT NULL,
    "changeAmount" INTEGER NOT NULL,
    "previousStockMode" "StockMode" NOT NULL,
    "newStockMode" "StockMode" NOT NULL,
    "source" "InventoryAuditSource" NOT NULL,
    "reason" TEXT,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'STAFF',
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryAuditLog_vendorId_productId_createdAt_idx" ON "InventoryAuditLog"("vendorId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryAuditLog_vendorId_batchId_idx" ON "InventoryAuditLog"("vendorId", "batchId");

-- CreateIndex
CREATE INDEX "InventoryAuditLog_inventoryId_idx" ON "InventoryAuditLog"("inventoryId");

-- CreateIndex
CREATE INDEX "Product_vendorId_barcode_idx" ON "Product"("vendorId", "barcode");

-- CreateIndex
CREATE INDEX "Product_vendorId_importBatchId_idx" ON "Product"("vendorId", "importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_vendorId_plu_key" ON "Product"("vendorId", "plu");

-- AddForeignKey
ALTER TABLE "InventoryAuditLog" ADD CONSTRAINT "InventoryAuditLog_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAuditLog" ADD CONSTRAINT "InventoryAuditLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryAuditLog" ADD CONSTRAINT "InventoryAuditLog_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
