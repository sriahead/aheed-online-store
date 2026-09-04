-- CreateEnum
CREATE TYPE "SearchSynonymStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SearchSynonymSource" AS ENUM ('SEED', 'STAFF', 'AI');

-- NOTE (P2.6 slice 3, #566). `prisma migrate dev` generated three DROP INDEX statements here, for
-- Order_guestEmail_trgm_idx, Order_orderNumber_trgm_idx and User_email_trgm_idx. They were REMOVED
-- before this migration was ever applied. They are not drift: those pg_trgm indexes are
-- hand-authored in 20260820143949_p7_5de_order_search_trigram because Prisma's schema language
-- cannot express a trigram index, so schema.prisma does not describe them and every migrate dev
-- proposes dropping them — whatever table the real change touches. Nothing in this migration
-- relates to Order or User at all. This is the FOURTH recorded occurrence (see CLAUDE.md GAP-011;
-- #508 is the one where the drops actually executed before anyone noticed).
-- Keep these indexes; do not re-add the drops.

-- AlterTable
ALTER TABLE "SearchQueryLog" ADD COLUMN     "directNameMatch" BOOLEAN;

-- CreateTable
CREATE TABLE "SearchSynonym" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "status" "SearchSynonymStatus" NOT NULL DEFAULT 'PENDING',
    "source" "SearchSynonymSource" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchSynonym_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchSynonym_vendorId_status_idx" ON "SearchSynonym"("vendorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SearchSynonym_vendorId_alias_key" ON "SearchSynonym"("vendorId", "alias");

-- CreateIndex
CREATE INDEX "SearchQueryLog_vendorId_directNameMatch_createdAt_idx" ON "SearchQueryLog"("vendorId", "directNameMatch", "createdAt");

-- AddForeignKey
ALTER TABLE "SearchSynonym" ADD CONSTRAINT "SearchSynonym_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
