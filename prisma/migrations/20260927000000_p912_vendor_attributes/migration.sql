-- CreateTable
CREATE TABLE "VendorAttribute" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorAttributeOption" (
    "id" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VendorAttributeOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAttributeValue" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "ProductAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorAttribute_vendorId_slug_key" ON "VendorAttribute"("vendorId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "VendorAttribute_id_vendorId_key" ON "VendorAttribute"("id", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorAttributeOption_attributeId_slug_key" ON "VendorAttributeOption"("attributeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "VendorAttributeOption_id_attributeId_key" ON "VendorAttributeOption"("id", "attributeId");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_vendorId_optionId_productId_idx" ON "ProductAttributeValue"("vendorId", "optionId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAttributeValue_productId_attributeId_key" ON "ProductAttributeValue"("productId", "attributeId");

-- AddForeignKey
ALTER TABLE "VendorAttribute" ADD CONSTRAINT "VendorAttribute_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorAttributeOption" ADD CONSTRAINT "VendorAttributeOption_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "VendorAttribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_attributeId_vendorId_fkey" FOREIGN KEY ("attributeId", "vendorId") REFERENCES "VendorAttribute"("id", "vendorId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_optionId_attributeId_fkey" FOREIGN KEY ("optionId", "attributeId") REFERENCES "VendorAttributeOption"("id", "attributeId") ON DELETE CASCADE ON UPDATE CASCADE;

