-- Prisma's schema-diff engine proposed DROP INDEX for the three hand-authored pg_trgm indexes
-- from 20260820143949_p7_5de_order_search_trigram (Order_guestEmail_trgm_idx,
-- Order_orderNumber_trgm_idx, User_email_trgm_idx) because those indexes are not expressible in
-- prisma/schema.prisma and so read as drift to a diff that only sees the schema. This is #508's
-- documented, recurring false-drift risk (CLAUDE.md, GAP-011) — adding ANY unrelated model is
-- enough to trigger it. Deliberately removed here; keep them.

-- CreateTable
CREATE TABLE "SearchQueryLog" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "directResultCount" INTEGER NOT NULL,
    "recoveryRung" TEXT,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchQueryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchQueryLog_vendorId_directResultCount_createdAt_idx" ON "SearchQueryLog"("vendorId", "directResultCount", "createdAt");

-- AddForeignKey
ALTER TABLE "SearchQueryLog" ADD CONSTRAINT "SearchQueryLog_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
