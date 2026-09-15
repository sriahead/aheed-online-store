-- CreateEnum
CREATE TYPE "ReferenceSyncStatus" AS ENUM ('IDLE', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "ReferenceDataset" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "sourceVersion" TEXT,
    "sourceChecksum" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "refreshFrequencyDays" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncStatus" "ReferenceSyncStatus" NOT NULL DEFAULT 'IDLE',
    "syncError" TEXT,
    "cacheVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferenceDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceAreaCoverage" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "postcodeArea" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "materialisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceAreaCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceDataSyncRun" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "sourceVersion" TEXT,
    "requestedAreas" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "retired" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "status" "ReferenceSyncStatus" NOT NULL DEFAULT 'RUNNING',
    "errorMessage" TEXT,

    CONSTRAINT "ReferenceDataSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostcodeReference" (
    "normalisedPostcode" TEXT NOT NULL,
    "displayPostcode" TEXT NOT NULL,
    "postcodeArea" TEXT NOT NULL,
    "postcodeDistrict" TEXT NOT NULL,
    "eastings" INTEGER NOT NULL,
    "northings" INTEGER NOT NULL,
    "adminDistrictCode" TEXT,
    "adminCountyCode" TEXT,
    "countryCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PostcodeReference_pkey" PRIMARY KEY ("normalisedPostcode")
);

-- CreateTable
CREATE TABLE "PlaceReference" (
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "localType" TEXT NOT NULL,
    "eastings" INTEGER NOT NULL,
    "northings" INTEGER NOT NULL,
    "postcodeArea" TEXT,
    "postcodeDistrict" TEXT,
    "populatedPlace" TEXT,
    "districtBorough" TEXT,
    "countyUnitary" TEXT,
    "region" TEXT,
    "country" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PlaceReference_pkey" PRIMARY KEY ("sourceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceDataset_sourceKey_key" ON "ReferenceDataset"("sourceKey");

-- CreateIndex
CREATE INDEX "ReferenceAreaCoverage_sourceKey_sourceVersion_idx" ON "ReferenceAreaCoverage"("sourceKey", "sourceVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceAreaCoverage_sourceKey_postcodeArea_key" ON "ReferenceAreaCoverage"("sourceKey", "postcodeArea");

-- CreateIndex
CREATE INDEX "ReferenceDataSyncRun_datasetId_startedAt_idx" ON "ReferenceDataSyncRun"("datasetId", "startedAt");

-- CreateIndex
CREATE INDEX "PostcodeReference_postcodeArea_idx" ON "PostcodeReference"("postcodeArea");

-- CreateIndex
CREATE INDEX "PostcodeReference_postcodeDistrict_idx" ON "PostcodeReference"("postcodeDistrict");

-- CreateIndex
CREATE INDEX "PlaceReference_postcodeDistrict_eastings_northings_idx" ON "PlaceReference"("postcodeDistrict", "eastings", "northings");

-- CreateIndex
CREATE INDEX "PlaceReference_postcodeArea_idx" ON "PlaceReference"("postcodeArea");

-- AddForeignKey
ALTER TABLE "ReferenceAreaCoverage" ADD CONSTRAINT "ReferenceAreaCoverage_sourceKey_fkey" FOREIGN KEY ("sourceKey") REFERENCES "ReferenceDataset"("sourceKey") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceDataSyncRun" ADD CONSTRAINT "ReferenceDataSyncRun_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "ReferenceDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
