# Slot booking cut-off (build notes)

**Worktree:** `E:\GitRepositories\aheed-online-store-orders`, on branch `feature/slot-booking-cutoff`. The folder name is left over from `#1435`.
- The branch was cut from local `docs/1435-post-ship`, which was `origin/staging` plus three `#1435` post-ship doc commits.
- Those three commits ride this branch under the carry-forward rule: the sanity-check guide, final documentation, and the R16 record.

**Commits:** spec `4dd50e66`; the implementation follows it.

## What changed and why

- **`lib/slot-cutoff.ts`** (new): `isSlotBookable(day, startTime, timeZone, cutoffMinutes, now)`.
  - It is pure, with the clock passed in.
  - The start goes through `parseLocalInput`, so the clock change and invalid dates (`2026-02-31`, `25:00`) are handled by the existing, tested parser.
  - A slot is bookable when `start - now > cutoff` (strict).
- **`lib/repositories/fulfilment-slots.ts`:**
  - `getAvailableSlotsForDate` gains `now: Date = new Date()`. It filters `vendor.fulfilmentSlots` with `isSlotBookable` **before** the capacity `groupBy`, which counts only the bookable IDs and is skipped when none remain.
  - `vendor.config` was already loaded with `include: { config: true }`, so `timezone` and `slotBookingCutoffMinutes` cost no new query.
  - `getFulfilmentSettingsForVendor` and `updateFulfilmentSettingsForVendor` carry the new field, defaulting to `?? 60`.
- **`lib/repositories/orders.ts`:**
  - `placeOrder` checks bookability inside the transaction, after reading the slot and config and before `tx.order.count`.
  - `SLOT_CLOSED` is added to `CheckoutError`'s code union. `features/checkout/place-order.ts` already returns a `CheckoutError`'s message to the form, so it was not touched.
- **Staff setting:**
  - `lib/fulfilment-form.ts`: `MAX_SLOT_BOOKING_CUTOFF_MINUTES = 1440`; the parser's bounds are 0 to 1440.
  - `features/admin/fulfilment.ts` reads the field.
  - `components/staff/FulfilmentManager.tsx` has the input after **Slot hold**.
- **Schema and migration:** `VendorConfig.slotBookingCutoffMinutes Int @default(60)`, and the hand-authored `20261106120000_slot_booking_cutoff`. Its DDL is Prisma's `migrate diff` output, copied verbatim.
- **Tests:**
  - new `tests/slot-cutoff.test.ts` (R4) and `tests/slot-booking-cutoff.test.ts` (R6 and R9, fake clients and a fake clock);
  - `tests/fulfilment-form.test.ts` extended (R13).
- **Docs:** the store-admin guide (fulfilment paragraph) and `docs/operations-research/order-fulfilment-core.md` §1, plus `CHANGELOG.md` under `[Unreleased]` → `Fixed`.

## Decisions taken during the build

- **The R6 and R9 tests live in a new fake-client file,** `tests/slot-booking-cutoff.test.ts`, not in `tests/slot-capacity.test.ts`. That file is a live-database test that skips in CI, so a cut-off case there would never run in CI. R6's validation row allows "the file the build adds".
- **The "bookable" `placeOrder` case asserts it reaches the capacity check** by making that check fail with `SLOT_FULL`. This proves the order of the checks without faking the whole successful order path, which `tests/orders.test.ts` already covers.
- **Added a fourth list case:** with no bookable slot, the capacity query is skipped.
- **Existing live-database tests moved to a future date.** `tests/slot-capacity.test.ts` and `tests/concurrency-slot-booking.test.ts` booked the fixed date `2026-09-14`, which is now in the past, so the new rule correctly closes it. Both now use Monday `2030-09-16`.
- **`specs/2026-09-19-p363-vendor-timezone/verify-vendor-timezone.ts`** builds a `FulfilmentSettingsInput` literal, so it failed typecheck. It now passes `slotBookingCutoffMinutes: before.slotBookingCutoffMinutes` through, as it already did for every other field.

## Deviations from the spec

- **R2's statement text.** Prisma emits `ADD COLUMN     "slotBookingCutoffMinutes"`, with five spaces, its own column alignment. R2 quotes it with one space, and it also requires the statement to match `prisma migrate diff`. The file keeps Prisma's verbatim output, with the same SQL meaning. Whitespace aside, the statement is identical.

## Known-shaky areas

- **The dev migration is not applied yet,** so three live-database tests fail locally with `The column slotBookingCutoffMinutes does not exist`:
  - `tests/slot-capacity.test.ts`
  - `tests/concurrency-slot-booking.test.ts`
  - `tests/express-sla.test.ts`
  
  They skip in CI, which has no `DATABASE_URL`. They should pass once the owner runs `migrate deploy` on dev; re-run them then. Every other test passed: 5961 of 5964.
- **R5 real-adapter check and R8 E2E** need the migrated dev database and `npm run preview`. They have not been run at Build.
- **`fulfilmentDate` → day string.** `placeOrder` uses `toISOString().slice(0, 10)`, relying on `fulfilmentDate` being the UTC midnight of the vendor-local day. The checkout passes it in that form (`calendarDayToUtcMidnight`); any caller that passes a local-midnight instant would shift by a day.
- **Behaviour change on deploy:** every existing store gets a 60-minute cut-off immediately. That is intended (owner ruling), but staging staff may notice slots disappearing earlier than before.

## Dev migration (2026-11-06)

The owner applied `20261106120000_slot_booking_cutoff` to dev (`ep-dry-morning-zab7dx08`) with `migrate deploy`. Afterwards, the three live-database tests listed under Known-shaky areas passed (3 of 3).
