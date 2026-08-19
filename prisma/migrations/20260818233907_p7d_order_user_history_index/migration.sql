-- CreateIndex
CREATE INDEX "Order_vendorId_userId_createdAt_idx" ON "Order"("vendorId", "userId", "createdAt");
