| Req | How to verify |
|---|---|
| R1 | Inspect `prisma/schema.prisma` for the `VendorFulfilmentSlot` model and run `npx prisma migrate diff` to verify the migration. |
| R2 | Inspect `prisma/schema.prisma` for `bookingWindowDays` and `slotHoldDurationMinutes` on `VendorConfig`. |
| R3 | Run `npm run test -- tests/slot-capacity.test.ts` to assert that available capacity correctly subtracts existing orders. |
| R4 | Ensure `tests/slot-capacity.test.ts` asserts that `CONFIRMED` and `DELIVERED` orders consume capacity. |
| R5 | Ensure `tests/slot-capacity.test.ts` asserts that a fresh `PENDING_PAYMENT` order consumes capacity. |
| R6 | Ensure `tests/slot-capacity.test.ts` asserts that a `PENDING_PAYMENT` order older than `slotHoldDurationMinutes` does NOT consume capacity. |
| R7 | In the browser, toggle Delivery and Collection methods in the checkout and verify the UI displays the respective available slots up to `bookingWindowDays` in the future. |
| R8 | Run `npm run test -- tests/concurrency-slot-booking.test.ts` to execute concurrent `placeOrderAction` requests against a real Postgres database and assert that a slot with capacity=1 only allows exactly 1 successful reservation and rejects the rest. |
