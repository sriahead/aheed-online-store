-- CreateEnum
CREATE TYPE "ProductImageSource" AS ENUM ('UNKNOWN', 'STAFF_UPLOAD', 'STAFF_CONFIRMED_PHOTO', 'OPEN_FOOD_FACTS', 'AI_GENERATED', 'PLACEHOLDER');

-- CreateEnum
CREATE TYPE "NetContentSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EDITED', 'REJECTED', 'NO_ANSWER');

-- CreateEnum
CREATE TYPE "NetContentEvidenceSource" AS ENUM ('PHOTO', 'NAME', 'UNIT_LABEL');

-- CreateEnum
CREATE TYPE "UnitLabelCheck" AS ENUM ('AGREES', 'DISAGREES', 'NOT_CHECKABLE');

-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN     "source" "ProductImageSource" NOT NULL DEFAULT 'UNKNOWN';

-- CreateTable
CREATE TABLE "NetContentSuggestion" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productImageId" TEXT,
    "amount" INTEGER,
    "unit" "NetContentUnit",
    "confidence" INTEGER,
    "evidenceSource" "NetContentEvidenceSource",
    "evidenceText" TEXT,
    "unitLabelCheck" "UnitLabelCheck",
    "model" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "status" "NetContentSuggestionStatus" NOT NULL,
    "finalAmount" INTEGER,
    "finalUnit" "NetContentUnit",
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetContentSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NetContentSuggestion_vendorId_status_idx" ON "NetContentSuggestion"("vendorId", "status");

-- CreateIndex
CREATE INDEX "NetContentSuggestion_productId_idx" ON "NetContentSuggestion"("productId");

-- AddForeignKey
ALTER TABLE "NetContentSuggestion" ADD CONSTRAINT "NetContentSuggestion_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetContentSuggestion" ADD CONSTRAINT "NetContentSuggestion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetContentSuggestion" ADD CONSTRAINT "NetContentSuggestion_productImageId_fkey" FOREIGN KEY ("productImageId") REFERENCES "ProductImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetContentSuggestion" ADD CONSTRAINT "NetContentSuggestion_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
