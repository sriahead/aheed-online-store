-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "allowsCustomNote" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "allowsCustomNote" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "customNote" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "customNote" TEXT;

