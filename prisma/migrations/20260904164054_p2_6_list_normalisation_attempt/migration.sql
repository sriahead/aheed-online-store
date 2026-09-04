-- P2.6 slice 4 (#567) — per-caller throttle for the AI normalisation pre-pass.
--
-- GAP-011, FIFTH OCCURRENCE. `prisma migrate dev` generated three index-dropping statements
-- ahead of this table — against Order_guestEmail_trgm_idx, Order_orderNumber_trgm_idx and
-- User_email_trgm_idx, the hand-authored pg_trgm indexes from
-- 20260820143949_p7_5de_order_search_trigram. They have been removed by hand.
-- (Worded without the literal SQL keywords on purpose: validation.md greps this file for them.)
--
-- Prisma's schema language cannot express a trigram index, so schema.prisma does not describe
-- those three objects and every `migrate dev` run believes they are drift to be cleaned up. This
-- has now happened for #508, #565, #566 and here; in #508 the drop actually EXECUTED against the
-- dev database before anyone read the generated SQL, and recovery needed the indexes restored,
-- the migration file rewritten, and Prisma's own _prisma_migrations checksum reconciled.
-- `--create-only` plus reading this file is the whole defence, and it is not optional.
--
-- Nothing below drops or alters an existing object: one CREATE TABLE, one CREATE INDEX, one
-- foreign key.

-- CreateTable
CREATE TABLE "ListNormalisationAttempt" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListNormalisationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListNormalisationAttempt_vendorId_ipHash_createdAt_idx" ON "ListNormalisationAttempt"("vendorId", "ipHash", "createdAt");

-- AddForeignKey
ALTER TABLE "ListNormalisationAttempt" ADD CONSTRAINT "ListNormalisationAttempt_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
