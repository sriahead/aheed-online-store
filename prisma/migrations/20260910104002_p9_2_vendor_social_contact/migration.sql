-- P9.2 (#407, #405) — per-vendor social and contact identity.
--
-- All three columns are nullable with no default: a NULL HIDES that link on the storefront
-- rather than falling back to a platform value (#239). Existing rows therefore need no backfill.
--
-- NOTE FOR THE NEXT MIGRATION AUTHOR: `prisma migrate dev` generated three `DROP INDEX`
-- statements above this ALTER TABLE — for `Order_guestEmail_trgm_idx`, `Order_orderNumber_trgm_idx`
-- and `User_email_trgm_idx` — and they have been deliberately removed. Those are the hand-authored
-- pg_trgm indexes from `20260820143949_p7_5de_order_search_trigram`. Prisma's schema language
-- cannot express a trigram index, so `schema.prisma` does not describe them and every `migrate dev`
-- run since #508 proposes dropping them (GAP-011). This is the seventh occurrence. Keep them, and
-- keep deleting the generated drops — `--create-only` followed by reading this file is the
-- procedure, not a precaution.

-- AlterTable
ALTER TABLE "VendorConfig" ADD COLUMN     "facebookUrl" TEXT,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "whatsappNumber" TEXT;
