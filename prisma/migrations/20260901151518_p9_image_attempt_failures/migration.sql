-- #523 — record how many times the image pipeline has failed for a product, so the
-- bounded, newest-first selection in `getProductsWithoutImages` can give up on a product
-- Workers AI permanently refuses instead of re-selecting it on every scheduled run.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "imageAttemptFailures" INTEGER NOT NULL DEFAULT 0;

-- NOTE (CLAUDE.md, #508): `prisma migrate dev` generated three `DROP INDEX` statements
-- alongside this column — `Order_guestEmail_trgm_idx`, `Order_orderNumber_trgm_idx` and
-- `User_email_trgm_idx`, the hand-authored pg_trgm indexes from
-- `20260820143949_p7_5de_order_search_trigram`. They were REMOVED from this file before it
-- was applied. Prisma's schema language cannot express a trigram index, so `schema.prisma`
-- does not describe them and every `migrate dev` proposes dropping them as drift — even for
-- a change, like this one, that touches an unrelated table. This is the third recorded
-- occurrence; in #508 the drops actually executed before being caught. Keep them out.
