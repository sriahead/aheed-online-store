-- #1012 (specs/2026-10-10-p1013-1012-help-facts-faq-corpus). Additive only: no DROP.
-- Generated with `prisma migrate diff --from-schema-datasource --to-schema-datamodel` against dev
-- and read before applying, because `migrate dev --create-only` still wants to reset dev over the
-- unrelated `20260820200500_p8_image_needs_review` checksum drift (#895) — the same route the
-- previous migration took. Verified to contain no `DROP INDEX` against the hand-authored pg_trgm
-- indexes, which Prisma has proposed dropping on every migration since #508.
--
-- NO SEED DATA. The rows are vendor-authored content (#1021); ADR-004 and #239 forbid the platform
-- writing an answer on a vendor's behalf, so this migration creates the table and nothing else.

-- CreateTable
CREATE TABLE "VendorFaq" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorFaq_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorFaq_vendorId_isActive_sortOrder_idx" ON "VendorFaq"("vendorId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VendorFaq_vendorId_question_key" ON "VendorFaq"("vendorId", "question");

-- AddForeignKey
ALTER TABLE "VendorFaq" ADD CONSTRAINT "VendorFaq_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

