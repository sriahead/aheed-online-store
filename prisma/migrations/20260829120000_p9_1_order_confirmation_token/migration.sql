-- P9.1 (#427/#428) — a guest order's capability token.
--
-- Additive and nullable, with NO backfill: orders placed before this migration
-- keep a NULL token and their guests fall back to /orders/lookup, which proves
-- order number + email. Minting tokens for orders nobody was ever sent would buy
-- nothing. `findOrderForViewer` treats a NULL stored token as "never matches",
-- so NULL cannot be presented as a credential.
--
-- Generated from the `confirmationToken` declaration in prisma/schema.prisma via
-- `prisma migrate diff`, not hand-authored. `prisma migrate dev` could not be
-- used to produce it: it demands a full dev-database reset because an earlier
-- migration's checksum drifted (open issue #378). The same diff also reported
-- three DROP INDEX statements for the pg_trgm trigram indexes created by
-- 20260820143949_p7_5de_order_search_trigram — that is the false drift CLAUDE.md
-- predicts for hand-authored DDL the Prisma schema cannot express, so those
-- statements are deliberately NOT included here.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "confirmationToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_confirmationToken_key" ON "Order"("confirmationToken");
