# Slot booking cut-off (requirements / acceptance criteria)

This closes `#1441`. Checkout offered, and `placeOrder` accepted, delivery and collection slots whose start time had already passed today. After this slice, a slot can be booked only if it starts more than the store's cut-off from now. The cut-off is a per-store setting that defaults to 60 minutes. `plan.md` holds the reasoning and the owner rulings.

**Definitions used below:**
- **Slot start instant:** the slot's `startTime` (`HH:mm`), read as wall-clock time on the booking's calendar day (`YYYY-MM-DD`) in `VendorConfig.timezone`.
- **Bookable:** the slot start instant minus `now` is **strictly greater than** `slotBookingCutoffMinutes` minutes.

## Data

R1. `prisma/schema.prisma` `VendorConfig` has `slotBookingCutoffMinutes Int @default(60)`, directly after `slotHoldDurationMinutes`. The model has a comment citing `#1441`.

R2. `prisma/migrations/20261106120000_slot_booking_cutoff/migration.sql` exists.
- It is hand-authored, and its header says why: `#895`.
- Its only statement is `ALTER TABLE "VendorConfig" ADD COLUMN "slotBookingCutoffMinutes" INTEGER NOT NULL DEFAULT 60;`, matching `prisma migrate diff` output from the `origin/staging` schema.
- It contains no `DROP`.

## The rule

R3. `lib/slot-cutoff.ts` exports `isSlotBookable(day: string, startTime: string, timeZone: string, cutoffMinutes: number, now: Date): boolean`.
- It returns `true` exactly when the slot is bookable as defined above.
- It returns `false` when `day` or `startTime` cannot be parsed.
- It builds the slot start instant with `parseLocalInput` from `lib/local-datetime.ts`.
- It reads no request context and no global clock.

R4. The unit tests for `isSlotBookable` cover at least:
- 13:00 start, 60-minute cut-off, Europe/London in GMT (`2026-11-06`):
  - `now` = 11:59 local → `true`;
  - `now` = 12:00 local → `false` (exactly at the cut-off);
  - `now` = 14:00 local → `false` (the slot has started).
- The same 13:00 start on a BST date (`2026-07-10`), where `now` = 11:59 local (10:59Z) → `true` and 12:00 local (11:00Z) → `false`.
- A cut-off crossing midnight: a `00:30` slot on `2026-11-07` with `now` = `2026-11-06` 23:45 local → `false`, and with `now` = 23:29 local → `true`.
- Cut-off 0: `now` one minute before the start → `true`, and `now` at the start → `false`.
- A future day well outside the cut-off → `true`.
- Unparsable `day` or `startTime` → `false`.

## The slot list

R5. `getAvailableSlotsForDate(prisma, vendorId, method, day, now = new Date())` in `lib/repositories/fulfilment-slots.ts` omits every slot for which `isSlotBookable(day, slot.startTime, config.timezone, config.slotBookingCutoffMinutes, now)` is `false`. Capacity handling for the slots it keeps is unchanged.

R6. Repository tests, with a fake Prisma client and a fixed `now`, show three things:
- On today's date, a slot that has started and a slot inside the cut-off are omitted, while a later slot is returned with its capacity.
- On a later date, every slot is returned.
- A vendor with `slotBookingCutoffMinutes: 0` gets a slot that starts one minute from `now`.

R7. `components/checkout/SlotPicker.tsx` and `lib/slot-grid.ts` are not modified. `git diff origin/staging --stat` lists neither.

## Placing an order

R8. Inside `placeOrder`'s transaction (`lib/repositories/orders.ts`), when `input.fulfilmentSlotId` and `input.fulfilmentDate` are set and both the slot and `VendorConfig` are found, the slot's bookability is checked **before** the capacity count.
- The check calls `isSlotBookable` with the UTC calendar day of `input.fulfilmentDate` (`toISOString().slice(0, 10)`), the slot's `startTime`, `config.timezone`, `config.slotBookingCutoffMinutes` and `new Date()`.
- If the slot is not bookable, `placeOrder` throws `CheckoutError` with code `SLOT_CLOSED` and message `That time slot can no longer be booked. Please choose another.`
- `"SLOT_CLOSED"` is added to `CheckoutError`'s code union.

R9. A test drives `placeOrder` with a closed slot and shows two things: it rejects with `SLOT_CLOSED` and that message, and it counts no orders and creates none. A slot outside the cut-off still reaches the existing capacity check: the existing `SLOT_FULL` tests still pass.

## The staff setting

R10. `lib/fulfilment-form.ts`:
- exports `MAX_SLOT_BOOKING_CUTOFF_MINUTES = 1440`;
- adds `slotBookingCutoffMinutes: number` to `FulfilmentSettingsInput`;
- `parseFulfilmentSettings` accepts a raw `slotBookingCutoffMinutes` string, parsed as an integer from **0** to 1440;
- anything else is rejected on field `slotBookingCutoffMinutes`, with a message beginning `The booking cut-off`.

R11. The setting is wired through:
- `features/admin/fulfilment.ts` reads `slotBookingCutoffMinutes` from the form.
- `getFulfilmentSettingsForVendor` returns it, defaulting to 60 when there is no config row.
- `updateFulfilmentSettingsForVendor` writes it, and only the columns it already writes plus this one.

R12. `components/staff/FulfilmentManager.tsx` renders a number input with:
- `id` and `name` = `slotBookingCutoffMinutes`, `min={0}`, `max={MAX_SLOT_BOOKING_CUTOFF_MINUTES}`, `required`;
- label `Booking cut-off (minutes)`;
- help text `How close to a slot's start time customers can still book it. 0 lets them book until it starts.`
It sits directly after the **Slot hold** field.

R13. Form-parser tests cover:
- `0`, `60` and `1440` accepted;
- `-1`, `1441`, `1.5` and blank rejected, on field `slotBookingCutoffMinutes`.
The existing `tests/fulfilment-form.test.ts` fixtures include the new field.

## Docs, changelog, gates

R14. Docs updated:
- `docs/store-admin-guide/admin-tabs-guide.md`'s fulfilment settings paragraph, next to the slot hold sentence, explains the booking cut-off and its default of 60 minutes.
- `docs/operations-research/order-fulfilment-core.md` §1 gains a **Booking cut-off** bullet saying a slot starting within the cut-off, or already started, is not offered and cannot be booked.
- Each file's front-matter `version` and `updated` are bumped.

R15. `CHANGELOG.md` has an `[Unreleased]` entry naming `#1441` (Gate 4).

R16. `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm run build` exit 0. `npx vitest run --maxWorkers=4`, run alone, reports 0 failed (Gate 3).
