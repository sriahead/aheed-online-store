-- #918 — vendor filters gain a kind (LIST or NUMBER), an optional unit and a show-on-card flag;
-- a product's value is either an option (LIST) or a number (NUMBER).
-- Generated with `prisma migrate diff` from origin/staging's schema (never `migrate dev`, #895),
-- plus the hand-written CHECK at the end, which Prisma cannot declare.

-- CreateEnum
CREATE TYPE "AttributeKind" AS ENUM ('LIST', 'NUMBER');

-- AlterTable
ALTER TABLE "VendorAttribute" ADD COLUMN     "kind" "AttributeKind" NOT NULL DEFAULT 'LIST',
ADD COLUMN     "showOnCard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unit" TEXT;

-- AlterTable
ALTER TABLE "ProductAttributeValue" ADD COLUMN     "numericValue" DECIMAL(10,2),
ALTER COLUMN "optionId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ProductAttributeValue_vendorId_attributeId_numericValue_idx" ON "ProductAttributeValue"("vendorId", "attributeId", "numericValue");

-- Hand-written: exactly one of optionId and numericValue is set. Every existing row has an optionId
-- and no numericValue, so it already satisfies this.
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_one_value_check" CHECK (("optionId" IS NULL) <> ("numericValue" IS NULL));
