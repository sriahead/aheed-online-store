/*
  Warnings:

  - You are about to drop the `PlaceReference` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PostcodeReference` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ReferenceDataSyncRun` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ReferenceDataset` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ReferenceDataSyncRun" DROP CONSTRAINT "ReferenceDataSyncRun_datasetId_fkey";

-- DropTable
DROP TABLE "PlaceReference";

-- DropTable
DROP TABLE "PostcodeReference";

-- DropTable
DROP TABLE "ReferenceDataSyncRun";

-- DropTable
DROP TABLE "ReferenceDataset";

-- DropEnum
DROP TYPE "ReferenceSyncStatus";
