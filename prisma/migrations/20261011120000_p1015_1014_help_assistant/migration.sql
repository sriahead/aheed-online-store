-- CreateEnum
CREATE TYPE "AssistantTopic" AS ENUM ('DELIVERY', 'COLLECTION', 'REWARDS', 'DISCOUNT_CODES', 'STORE_QUESTION', 'ORDER_STATUS', 'ITEM_SWAP', 'CANCEL_PAID_ORDER', 'OTHER');

-- CreateEnum
CREATE TYPE "AssistantOutcome" AS ENUM ('ANSWERED', 'HANDED_OFF', 'ABANDONED');

-- AlterTable
ALTER TABLE "VendorConfig" ADD COLUMN     "assistantEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AssistantConversation" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "topic" "AssistantTopic" NOT NULL,
    "openingQuestion" TEXT NOT NULL,
    "outcome" "AssistantOutcome" NOT NULL DEFAULT 'ABANDONED',
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantConversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantConversation_vendorId_createdAt_idx" ON "AssistantConversation"("vendorId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantConversation_vendorId_ipHash_createdAt_idx" ON "AssistantConversation"("vendorId", "ipHash", "createdAt");

-- AddForeignKey
ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

