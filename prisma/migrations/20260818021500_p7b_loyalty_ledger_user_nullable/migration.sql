-- P7b (#216) — UK GDPR erasure must sever LoyaltyLedgerEntry's personal link
-- without deleting the row.
--
-- The column was NOT NULL with ON DELETE CASCADE, so erasing a User deleted the
-- ledger entries explaining a surviving Order's discountPence — destroying a
-- financial audit trail the order itself is required to retain, and violating
-- the model's own "nothing here is ever updated or deleted" invariant.
--
-- Purely additive: no existing row changes. Every write path still supplies a
-- userId, so a NULL here means "this person was erased", never "no owner".

-- DropForeignKey
ALTER TABLE "LoyaltyLedgerEntry" DROP CONSTRAINT "LoyaltyLedgerEntry_userId_fkey";

-- AlterTable
ALTER TABLE "LoyaltyLedgerEntry" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "LoyaltyLedgerEntry" ADD CONSTRAINT "LoyaltyLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
