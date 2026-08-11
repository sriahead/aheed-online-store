-- P4b — staff order status transitions (specs/2026-08-11-p4b-order-status-transitions/, issue #125).
--
-- Purely additive: one nullable column and its foreign key. Nothing existing is
-- altered, no enum is touched (OUT_FOR_DELIVERY and DELIVERED have been in the
-- OrderStatus type since P3b's initial migration — this slice makes them
-- reachable, it does not add them), and no data backfill is required.
--
-- Nullable is load-bearing, not laziness: every OrderStatusEvent row written by
-- P3b (order placed) and P3c (payment confirmed / cancelled) has no acting user,
-- and system transitions will keep leaving this null forever.
--
-- ON DELETE SET NULL, not CASCADE: deleting a departed staff member's account
-- must not delete the audit trail of the orders they handled.

-- AlterTable
ALTER TABLE "OrderStatusEvent" ADD COLUMN "createdByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "OrderStatusEvent"
  ADD CONSTRAINT "OrderStatusEvent_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
