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

## Validation pass 1 (2026-11-06, not independent)

This pass ran in the same session that built the slice, at the owner's choice. It is **not** an independent validation.

- **Pre-flight:** lint, format, `tsc --noEmit`, `npx vitest run --maxWorkers=4` (399 files, 5964 tests, 0 failed) and `npm run build` all passed.
- **R1:** the column is on the field line after `slotHoldDurationMinutes`, with a two-line `#1441` comment between them; `prisma validate` passed.
- **R2:** `migrate diff` from the `origin/staging` schema emits exactly the file's statement, Prisma's spacing included. `DROP` appears 0 times and the header names `#895`. `migrate status` against `ep-dry-morning` reports up to date.
- **R3, R7, R8, R10, R11, R14, R15:** checked by reading and grepping the code. One export, no clock or env reads in `lib/slot-cutoff.ts`; `SlotPicker` and `slot-grid` untouched; `isSlotBookable` comes before `tx.order.count`; bounds 0 to 1440; the field is wired through the form, the read with `?? 60`, and the update. Docs versions are bumped, and the KMS validate, check-generated, assemble and site build all pass. The CHANGELOG names `#1441`.
- **R4, R6, R9, R13:** covered by the full suite. The live-database `slot-capacity` and `concurrency-slot-booking` tests pass against the migrated dev database.
- **R5 real-adapter check:** a tsx script using `PrismaNeonHttp`, the adapter `getPrisma()` uses, against dev. It called `getAvailableSlotsForDate` for Aheed DELIVERY on Monday 2026-11-09, which has slots at 09:00, 13:00 and 18:00, with `now` = 09:00 local. It returned `13:00` and `18:00`; the next Monday returned all 3. The script was deleted.
- **R8 E2E on `npm run preview`:**
  - A temporary dev COLLECTION slot was added for Friday at 02:00 (`r8-temp-slot-1441`), at about 01:35 local, so inside the cut-off. It was inserted with a script rather than through `/staff/fulfilment`; the row allowed either.
  - As a guest, I added an item through the `addToCart` action, then submitted `placeOrderAction` as a no-JS form (`$ACTION_REF_1`) for that slot and today's date.
  - The response carried `"error":"That time slot can no longer be booked. Please choose another."`. The vendor's order count stayed at 137, with 0 on the temporary slot.
  - The slot was removed afterwards. The guest cart, holding 2 × Washing Up Liquid, remains on dev.
- **R11/R12 E2E on preview,** as the demo store admin:
  - `/staff/fulfilment` renders `id="slotBookingCutoffMinutes"` with `min="0"`, `max="1440"` and `value="60"`, after the slot hold input. The label and help text are present.
  - Saving 90 through `saveFulfilmentSettings` reloaded as `90`. Saving 60 restored it, re-sending the page's existing values for every other field.
- **R16:** the gates passed, as listed under Pre-flight.

**Result:** every row passes. Nothing is unverified.
