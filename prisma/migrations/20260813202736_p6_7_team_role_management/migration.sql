-- CreateTable
CREATE TABLE "VendorRoleAuditLog" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "oldRole" TEXT,
    "newRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorRoleAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorRoleAuditLog_vendorId_createdAt_idx" ON "VendorRoleAuditLog"("vendorId", "createdAt");

-- AddForeignKey
ALTER TABLE "VendorRoleAuditLog" ADD CONSTRAINT "VendorRoleAuditLog_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRoleAuditLog" ADD CONSTRAINT "VendorRoleAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRoleAuditLog" ADD CONSTRAINT "VendorRoleAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
