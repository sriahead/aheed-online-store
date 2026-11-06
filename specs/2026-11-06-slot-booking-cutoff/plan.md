---
id: 2026-11-06-slot-booking-cutoff-plan
title: "Slot booking cut-off: stop offering slots that have started or start too soon (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-11-06
visibility: internal
summary: Checkout stops offering, and placing an order refuses, any delivery or collection slot that starts within a per-store cut-off (default 60 minutes, set at /staff/fulfilment). Today's passed slots can no longer be booked.
tags: [checkout, fulfilment, slots, timezone]
related: [2026-11-05-order-updates-notifications-plan]
---

# Slot booking cut-off (plan)

Issue `#1441`. Reported by the owner on 2026-11-06 while testing `#1435`'s Telegram alerts on staging. Proposal approved the same day.

**The problem:**
- `getAvailableSlotsForDate` (`lib/repositories/fulfilment-slots.ts`) returns every `VendorFulfilmentSlot` for the day's weekday, filtered by capacity only.
- The slot picker (`components/checkout/SlotPicker.tsx`) starts its grid at today in the vendor's zone.
- So at 16:00 a shopper can choose today's 13:00–15:00 slot, and `placeOrder` (`lib/repositories/orders.ts`) accepts it.

**Owner rulings (2026-11-06):**
- Store staff need time to pick an order, so booking closes **before** a slot starts.
- The cut-off is **configurable per store**, defaulting to **1 hour**.

**Goal:** a shopper can only book a slot that starts more than the store's cut-off from now. That holds whichever page they are on, and however stale it is.

## Scope (this slice)

- **New setting.** `VendorConfig.slotBookingCutoffMinutes` is an integer that defaults to 60. It is added by a hand-authored migration (`#895`).
  - Staff edit it at `/staff/fulfilment`, beside **Slot hold**, through the existing settings form (`lib/fulfilment-form.ts`, `features/admin/fulfilment.ts`, `components/staff/FulfilmentManager.tsx`).
  - It accepts 0 to 1440 minutes. 0 means booking stays open until the slot starts.
- **One rule.** A new pure module `lib/slot-cutoff.ts` exports `isSlotBookable(day, startTime, timeZone, cutoffMinutes, now)`.
  - A slot is bookable only when its start, read as wall-clock time on `day` in the vendor's zone, is **more than** `cutoffMinutes` after `now`.
  - Reading the start through `parseLocalInput` makes the clock change work: a 09:00 slot is 09:00 local time in both BST and GMT.
  - The rule applies to **every** day, not only today. A 00:30 slot tomorrow is also closed at 23:45 tonight with a 60-minute cut-off.
- **Slot list.** `getAvailableSlotsForDate` drops slots that `isSlotBookable` rejects, using the vendor's `timezone` and `slotBookingCutoffMinutes`.
  - It takes an optional `now` (default `new Date()`) so tests can fix the clock.
  - The picker needs no change: a dropped slot already renders as the grid's existing `–` cell, and a day with nothing left shows `–` throughout.
- **Placing an order.** `placeOrder` applies the same rule inside its transaction, before the capacity check.
  - A closed slot throws `CheckoutError("SLOT_CLOSED", "That time slot can no longer be booked. Please choose another.")`.
  - `features/checkout/place-order.ts` already returns a `CheckoutError`'s message to the form, so the shopper sees it there.
  - This catches a grid that was loaded before the cut-off passed, and a direct server-action call.
- **Docs:**
  - the store-admin guide's fulfilment settings paragraph;
  - the order and fulfilment operations guide's "Fulfilment Slots & Capacity" section;
  - `CHANGELOG.md`.

## Deliberately excluded

- **Express collection.** It already uses its own opening-hours window (`zoneWallClock` in `SlotPicker`) and books no slot.
- **Existing orders.** Orders already placed for a slot inside the cut-off are untouched, and nobody is notified.
- **A minimum lead time in days, or per-method cut-offs** (a separate value for delivery and collection). The owner asked for one value. A second value can be proposed later if stores need it.
- **Hiding a slot only once it ends.** The owner ruled that booking closes before the start.
- **Pre-filtering in the browser.** The server is the authority. The grid re-reads the server on every page, and `placeOrder` refuses whatever slips through.

## Why this shape

- **The rule is a pure function.** The list and the order placement must agree exactly; two copies of the comparison would drift. A pure function is tested once against a fixed clock, in both GMT and BST.
- **It is server-side only.** The shopper's browser clock and zone are the wrong authority (`#811`). The vendor's `timezone` already decides which day "today" is.
- **0 to 1440 minutes.** 0 keeps today's behaviour, apart from passed slots, for a store that wants it. One day is a generous ceiling; a longer notice period belongs to the booking window, not this setting.

## Open items carried forward

None.
