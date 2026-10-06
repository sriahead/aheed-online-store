-- #987 / #988 (specs/2026-10-06-p991-987-988-referral-code-integrity). Additive only: no DROP.
-- Generated with `prisma migrate diff --from-schema-datasource --to-schema-datamodel` against dev
-- (migrate dev --create-only wanted to reset dev over an unrelated old checksum), read before
-- applying, then the backfill below was appended by hand.

-- AlterTable
ALTER TABLE "DiscountCode" ADD COLUMN     "referrerUserId" TEXT;

-- CreateTable
CREATE TABLE "DiscountCodeAttempt" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountCodeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscountCodeAttempt_vendorId_ipHash_createdAt_idx" ON "DiscountCodeAttempt"("vendorId", "ipHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCode_vendorId_referrerUserId_key" ON "DiscountCode"("vendorId", "referrerUserId");

-- AddForeignKey
ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCodeAttempt" ADD CONSTRAINT "DiscountCodeAttempt_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- BACKFILL BEGIN
-- #987 — give every existing referral row its real owner, read once from the description that
-- `ensureReferralDiscountCode` used to write (`Referral from user <id>`), then drop the user id from
-- the free text. Only `REF-` rows naming a user that EXISTS are touched; a row naming a missing user
-- and any non-REF row are left exactly as they are. Codes are never changed, so links already
-- shared keep working. DISTINCT ON keeps the earliest row if one user somehow has two REF rows in
-- a vendor, so the new (vendorId, referrerUserId) unique index cannot fail this migration.
UPDATE "DiscountCode" AS dc
SET "referrerUserId" = m."userId",
    "description" = 'Customer referral code'
FROM (
    SELECT DISTINCT ON (c."vendorId", u."id") c."id" AS "codeId", u."id" AS "userId"
    FROM "DiscountCode" AS c
    JOIN "User" AS u ON c."description" = 'Referral from user ' || u."id"
    WHERE c."code" LIKE 'REF-%'
    ORDER BY c."vendorId", u."id", c."createdAt", c."id"
) AS m
WHERE dc."id" = m."codeId";
-- BACKFILL END
