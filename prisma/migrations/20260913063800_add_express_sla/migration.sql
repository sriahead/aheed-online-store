-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "isExpress" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "targetFulfilmentTime" TIMESTAMPTZ(3);
