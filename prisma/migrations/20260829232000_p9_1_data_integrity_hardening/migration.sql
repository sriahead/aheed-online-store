/*
  Warnings:

  - A unique constraint covering the columns `[id,vendorId]` on the table `Category` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_categoryId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "Category_id_vendorId_key" ON "Category"("id", "vendorId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_vendorId_fkey" FOREIGN KEY ("categoryId", "vendorId") REFERENCES "Category"("id", "vendorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Commercial CHECK Constraints (#433)
-- Prisma cannot model table-level CHECK constraints natively in schema.prisma.
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_quantity_check" CHECK (quantity >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_basePrice_check" CHECK ("basePrice" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_originalPrice_check" CHECK ("originalPrice" >= 0);
ALTER TABLE "ProductPriceTier" ADD CONSTRAINT "ProductPriceTier_groupQuantity_check" CHECK ("groupQuantity" >= 2);
ALTER TABLE "ProductPriceTier" ADD CONSTRAINT "ProductPriceTier_groupPricePence_check" CHECK ("groupPricePence" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_quantity_check" CHECK (quantity > 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_unitPricePence_check" CHECK ("unitPricePence" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amountPence_check" CHECK ("amountPence" >= 0);
