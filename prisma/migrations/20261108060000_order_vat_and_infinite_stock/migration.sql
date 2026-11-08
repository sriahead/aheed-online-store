-- Add INFINITE to StockMode enum and VAT tracking columns to Order and OrderItem
-- Hand-authored per CLAUDE.md guidelines.

-- AlterEnum
ALTER TYPE "StockMode" ADD VALUE 'INFINITE';

-- AlterTable Order
ALTER TABLE "Order" ADD COLUMN "vatTotalPence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "vatStandardPence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "vatZeroPence" INTEGER NOT NULL DEFAULT 0;

-- AlterTable OrderItem
ALTER TABLE "OrderItem" ADD COLUMN "vatRate" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "vatPence" INTEGER NOT NULL DEFAULT 0;
