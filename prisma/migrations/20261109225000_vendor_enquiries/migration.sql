-- CreateTable
CREATE TABLE "VendorEnquiry" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "senderName" TEXT,
    "senderEmail" TEXT NOT NULL,
    "senderPhone" TEXT,
    "toAddress" TEXT,
    "orderNumber" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "replyBody" TEXT,
    "repliedAt" TIMESTAMP(3),
    "repliedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorEnquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorEnquiry_vendorId_createdAt_idx" ON "VendorEnquiry"("vendorId", "createdAt");

-- CreateIndex
CREATE INDEX "VendorEnquiry_vendorId_status_idx" ON "VendorEnquiry"("vendorId", "status");

-- AddForeignKey
ALTER TABLE "VendorEnquiry" ADD CONSTRAINT "VendorEnquiry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
