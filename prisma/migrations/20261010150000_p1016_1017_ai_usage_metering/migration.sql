-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('LIST_NORMALISATION', 'SEARCH_SYNONYMS', 'NET_CONTENT', 'PRODUCT_IMAGE', 'CAMPAIGN_IMAGE');

-- CreateEnum
CREATE TYPE "AiNeuronSource" AS ENUM ('REPORTED', 'ESTIMATED');

-- AlterTable
ALTER TABLE "VendorConfig" ADD COLUMN     "aiDailyNeuronBudget" INTEGER NOT NULL DEFAULT 3000;

-- CreateTable
CREATE TABLE "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "milliNeurons" INTEGER NOT NULL,
    "neuronSource" "AiNeuronSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsageEvent_vendorId_createdAt_idx" ON "AiUsageEvent"("vendorId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

