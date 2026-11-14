-- #1578 staff stock import: per-store import settings and stored import runs.
-- Hand-authored (#895: migrate dev --create-only refuses on dev). The DDL is Prisma's own output from
-- `prisma migrate diff --from-schema-datamodel <staging schema> --to-schema-datamodel prisma/schema.prisma`,
-- checked to contain only CREATE TYPE / CREATE TABLE / CREATE INDEX / ADD FOREIGN KEY for the new
-- StockImport* tables; nothing existing is altered or dropped.

-- CreateEnum
CREATE TYPE "StockImportHeaderRow" AS ENUM ('AUTO', 'NONE');

-- CreateEnum
CREATE TYPE "StockImportPreset" AS ENUM ('GENERAL', 'SPICES', 'RICE', 'FISH');

-- CreateEnum
CREATE TYPE "StockImportWordKind" AS ENUM ('IGNORE', 'NOISE', 'PRESERVE');

-- CreateEnum
CREATE TYPE "StockImportCategoryTextKind" AS ENUM ('SECTION', 'COLUMN');

-- CreateEnum
CREATE TYPE "StockImportRunStatus" AS ENUM ('OPEN', 'UNDONE');

-- CreateEnum
CREATE TYPE "StockImportDecision" AS ENUM ('UPDATE', 'CREATE', 'REVIEW', 'SKIP', 'DUPLICATE', 'HOLD');

-- CreateEnum
CREATE TYPE "StockImportConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'NONE');

-- CreateEnum
CREATE TYPE "StockImportLineStatus" AS ENUM ('OPEN', 'APPLYING', 'APPLIED', 'FAILED', 'UNDONE');

-- CreateEnum
CREATE TYPE "StockImportResult" AS ENUM ('CREATED', 'UPDATED', 'UNCHANGED');

-- CreateTable
CREATE TABLE "StockImportSettings" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "headerRow" "StockImportHeaderRow" NOT NULL DEFAULT 'NONE',
    "nameColumn" TEXT NOT NULL,
    "sizeColumn" TEXT,
    "priceColumn" TEXT,
    "pluColumn" TEXT,
    "barcodeColumn" TEXT,
    "brandColumn" TEXT,
    "categoryColumn" TEXT,
    "descriptionColumn" TEXT,
    "wasPriceColumn" TEXT,
    "multiBuyColumn" TEXT,
    "bundleColumn" TEXT,
    "bundleQuantityColumn" TEXT,
    "promotionColumn" TEXT,
    "vatColumn" TEXT,
    "originColumn" TEXT,
    "defaultCategoryId" TEXT NOT NULL,
    "nameTemplate" TEXT NOT NULL DEFAULT '{brand} {name} – {size}',
    "keepTillWords" BOOLEAN NOT NULL DEFAULT true,
    "renameMatched" BOOLEAN NOT NULL DEFAULT true,
    "moveMatchedToCategory" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockImportSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockImportSettingsPreset" (
    "settingsId" TEXT NOT NULL,
    "preset" "StockImportPreset" NOT NULL,

    CONSTRAINT "StockImportSettingsPreset_pkey" PRIMARY KEY ("settingsId","preset")
);

-- CreateTable
CREATE TABLE "StockImportBrandAlias" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,

    CONSTRAINT "StockImportBrandAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockImportSpelling" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "wrong" TEXT NOT NULL,
    "replacement" TEXT NOT NULL,

    CONSTRAINT "StockImportSpelling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockImportSynonymGroup" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StockImportSynonymGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockImportSynonymWord" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "word" TEXT NOT NULL,

    CONSTRAINT "StockImportSynonymWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockImportWord" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "kind" "StockImportWordKind" NOT NULL,
    "word" TEXT NOT NULL,

    CONSTRAINT "StockImportWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockImportCategoryText" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "kind" "StockImportCategoryTextKind" NOT NULL,
    "text" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "StockImportCategoryText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockImportFileRule" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "brandId" TEXT,
    "categoryId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StockImportFileRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockImportRun" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "status" "StockImportRunStatus" NOT NULL DEFAULT 'OPEN',
    "batchId" TEXT NOT NULL,
    "settingsVersion" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockImportCell" (
    "runId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "columnIndex" INTEGER NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "StockImportCell_pkey" PRIMARY KEY ("runId","rowIndex","columnIndex")
);

-- CreateTable
CREATE TABLE "StockImportLine" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "sourceText" TEXT NOT NULL,
    "suggestion" "StockImportDecision" NOT NULL,
    "decision" "StockImportDecision" NOT NULL,
    "confidence" "StockImportConfidence" NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "cleanName" TEXT NOT NULL,
    "brandName" TEXT,
    "categoryName" TEXT NOT NULL,
    "sizeLabel" TEXT,
    "pricePence" INTEGER,
    "targetProductId" TEXT,
    "runnerUpProductId" TEXT,
    "otherSizes" TEXT NOT NULL DEFAULT '',
    "changeSummary" TEXT NOT NULL DEFAULT '',
    "tillWords" TEXT NOT NULL DEFAULT '',
    "issues" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "question" TEXT NOT NULL DEFAULT '',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "status" "StockImportLineStatus" NOT NULL DEFAULT 'OPEN',
    "claimedAt" TIMESTAMP(3),
    "result" "StockImportResult",
    "resultProductId" TEXT,
    "resultDetail" TEXT NOT NULL DEFAULT '',
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "StockImportLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockImportFieldChange" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "restoredAt" TIMESTAMP(3),

    CONSTRAINT "StockImportFieldChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockImportSettings_vendorId_key" ON "StockImportSettings"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "StockImportBrandAlias_vendorId_alias_key" ON "StockImportBrandAlias"("vendorId", "alias");

-- CreateIndex
CREATE UNIQUE INDEX "StockImportSpelling_vendorId_wrong_key" ON "StockImportSpelling"("vendorId", "wrong");

-- CreateIndex
CREATE INDEX "StockImportSynonymGroup_vendorId_idx" ON "StockImportSynonymGroup"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "StockImportSynonymWord_groupId_word_key" ON "StockImportSynonymWord"("groupId", "word");

-- CreateIndex
CREATE UNIQUE INDEX "StockImportWord_vendorId_kind_word_key" ON "StockImportWord"("vendorId", "kind", "word");

-- CreateIndex
CREATE UNIQUE INDEX "StockImportCategoryText_vendorId_kind_text_key" ON "StockImportCategoryText"("vendorId", "kind", "text");

-- CreateIndex
CREATE INDEX "StockImportFileRule_vendorId_idx" ON "StockImportFileRule"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "StockImportRun_batchId_key" ON "StockImportRun"("batchId");

-- CreateIndex
CREATE INDEX "StockImportRun_vendorId_createdAt_idx" ON "StockImportRun"("vendorId", "createdAt");

-- CreateIndex
CREATE INDEX "StockImportLine_runId_position_idx" ON "StockImportLine"("runId", "position");

-- CreateIndex
CREATE INDEX "StockImportLine_vendorId_status_idx" ON "StockImportLine"("vendorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockImportLine_runId_key_key" ON "StockImportLine"("runId", "key");

-- CreateIndex
CREATE INDEX "StockImportFieldChange_lineId_idx" ON "StockImportFieldChange"("lineId");

-- AddForeignKey
ALTER TABLE "StockImportSettings" ADD CONSTRAINT "StockImportSettings_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportSettings" ADD CONSTRAINT "StockImportSettings_defaultCategoryId_fkey" FOREIGN KEY ("defaultCategoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportSettingsPreset" ADD CONSTRAINT "StockImportSettingsPreset_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "StockImportSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportBrandAlias" ADD CONSTRAINT "StockImportBrandAlias_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportBrandAlias" ADD CONSTRAINT "StockImportBrandAlias_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportSpelling" ADD CONSTRAINT "StockImportSpelling_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportSynonymGroup" ADD CONSTRAINT "StockImportSynonymGroup_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportSynonymWord" ADD CONSTRAINT "StockImportSynonymWord_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StockImportSynonymGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportWord" ADD CONSTRAINT "StockImportWord_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportCategoryText" ADD CONSTRAINT "StockImportCategoryText_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportCategoryText" ADD CONSTRAINT "StockImportCategoryText_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportFileRule" ADD CONSTRAINT "StockImportFileRule_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportFileRule" ADD CONSTRAINT "StockImportFileRule_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportFileRule" ADD CONSTRAINT "StockImportFileRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportRun" ADD CONSTRAINT "StockImportRun_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportRun" ADD CONSTRAINT "StockImportRun_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportCell" ADD CONSTRAINT "StockImportCell_runId_fkey" FOREIGN KEY ("runId") REFERENCES "StockImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportLine" ADD CONSTRAINT "StockImportLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "StockImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportLine" ADD CONSTRAINT "StockImportLine_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportLine" ADD CONSTRAINT "StockImportLine_targetProductId_fkey" FOREIGN KEY ("targetProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportLine" ADD CONSTRAINT "StockImportLine_runnerUpProductId_fkey" FOREIGN KEY ("runnerUpProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportLine" ADD CONSTRAINT "StockImportLine_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportLine" ADD CONSTRAINT "StockImportLine_resultProductId_fkey" FOREIGN KEY ("resultProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportFieldChange" ADD CONSTRAINT "StockImportFieldChange_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "StockImportLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportFieldChange" ADD CONSTRAINT "StockImportFieldChange_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

