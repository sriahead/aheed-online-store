-- CreateTable
CREATE TABLE "DepartmentCampaign" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageKey" TEXT,
    "altText" TEXT,
    "linkUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentCampaign_categoryId_key" ON "DepartmentCampaign"("categoryId");

-- CreateIndex
CREATE INDEX "DepartmentCampaign_vendorId_isActive_idx" ON "DepartmentCampaign"("vendorId", "isActive");

-- AddForeignKey
ALTER TABLE "DepartmentCampaign" ADD CONSTRAINT "DepartmentCampaign_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentCampaign" ADD CONSTRAINT "DepartmentCampaign_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

