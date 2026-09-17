-- AlterEnum
ALTER TYPE "LoyaltyEntryKind" ADD VALUE 'EARN_REVERSAL';

-- AlterTable
ALTER TABLE "DiscountRedemption" ADD COLUMN     "reversedAt" TIMESTAMP(3);
