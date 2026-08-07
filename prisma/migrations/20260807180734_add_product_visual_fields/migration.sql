-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isFresh" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isHalal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isOrganic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "origin" TEXT,
ADD COLUMN     "originalPrice" INTEGER;
