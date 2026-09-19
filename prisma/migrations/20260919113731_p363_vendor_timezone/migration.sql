-- AlterTable
ALTER TABLE "VendorConfig" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/London';

-- #811 — normalise historical Order.fulfilmentDate to UTC midnight of its intended calendar day.
--
-- Until this slice, components/checkout/SlotPicker.tsx submitted the customer's BROWSER-local
-- midnight as an instant. During BST that is 23:00 on the PRECEDING day, so a row for Saturday
-- 19 September was stored as 2026-09-18 23:00:00. From here on the stored form is always the UTC
-- midnight of the vendor-local calendar day, and the capacity queries in
-- lib/repositories/fulfilment-slots.ts and lib/repositories/orders.ts match on exact equality —
-- so a skewed historical row would stop counting against its own day.
--
-- fulfilmentDate is TIMESTAMP(3) WITHOUT time zone holding a UTC wall-clock, so the value is
-- re-read as UTC, converted to the zone every existing row was actually entered in (Europe/London:
-- both seeded vendors are UK and the platform has never traded outside them), truncated to that
-- calendar day, and left as the naive UTC midnight the application now writes.
--
-- IDEMPOTENT. A row already at UTC midnight maps to itself under both GMT and BST, so re-running
-- this statement changes no further rows. The WHERE clause makes that observable in the row count.
UPDATE "Order"
SET "fulfilmentDate" =
      date_trunc('day', ("fulfilmentDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/London')
WHERE "fulfilmentDate" IS NOT NULL
  AND "fulfilmentDate" <>
      date_trunc('day', ("fulfilmentDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/London');
