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
CREATE TABLE "ReferenceDataSyncRun" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "sourceVersion" TEXT,
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
    "id" TEXT NOT NULL,
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
    "sourceVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostcodeReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceReference" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "localType" TEXT NOT NULL,
    "eastings" INTEGER NOT NULL,
    "northings" INTEGER NOT NULL,
    "postcodeDistrict" TEXT,
    "populatedPlace" TEXT,
    "districtBorough" TEXT,
    "countyUnitary" TEXT,
    "region" TEXT,
    "country" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "recipientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "county" TEXT,
    "postcode" TEXT NOT NULL,
    "notes" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceDataset_sourceKey_key" ON "ReferenceDataset"("sourceKey");

-- CreateIndex
CREATE INDEX "ReferenceDataSyncRun_datasetId_startedAt_idx" ON "ReferenceDataSyncRun"("datasetId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostcodeReference_normalisedPostcode_key" ON "PostcodeReference"("normalisedPostcode");

-- CreateIndex
CREATE INDEX "PostcodeReference_postcodeDistrict_idx" ON "PostcodeReference"("postcodeDistrict");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceReference_sourceId_key" ON "PlaceReference"("sourceId");

-- CreateIndex
CREATE INDEX "PlaceReference_postcodeDistrict_eastings_northings_idx" ON "PlaceReference"("postcodeDistrict", "eastings", "northings");

-- CreateIndex
CREATE INDEX "PlaceReference_type_idx" ON "PlaceReference"("type");

-- CreateIndex
CREATE INDEX "CustomerAddress_vendorId_userId_idx" ON "CustomerAddress"("vendorId", "userId");

-- AddForeignKey
ALTER TABLE "ReferenceDataSyncRun" ADD CONSTRAINT "ReferenceDataSyncRun_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "ReferenceDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
