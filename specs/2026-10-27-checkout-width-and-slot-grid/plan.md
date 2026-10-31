---
id: checkout-width-and-slot-grid-plan
title: "Cart and checkout Continue shopping, shared standard width, orders 2-up and the 7-day slot grid (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-27
visibility: internal
summary: "Follow-up to #1302 (#1305): pill-button cart header, Continue shopping beside the cart and checkout primary buttons, orders at 2 per row, one standard width for cart/checkout/orders, and a 7-day slot grid in the checkout slot picker."
tags: [spec, storefront, checkout, cart, orders, slots, layout]
related: [orders-grid-quickshop-cart-plan, design-system]
---

# Cart and checkout Continue shopping, shared standard width, orders 2-up and the 7-day slot grid (plan)

Issue `#1305`, a follow-up to `#1302` from owner feedback on staging. Gate 1 approved on 2026-10-27
as **one slice**. Storefront only: no schema change, no new dependency, no new icon.

**Goal:** a shopper can leave the cart or checkout for the shop in one tap from the button they were
about to press; cart, checkout and order history sit in the same page width; order history is
less crowded; and choosing a delivery or collection slot works as a week-at-a-glance grid rather than
a day strip plus a list.

**Scope (this slice):**
- **Cart header** (`app/(storefront)/cart/page.tsx`): *Continue shopping* and *Smart Lists* are the
  same outlined pill button (`rounded-full border border-primary text-primary`, bold, same padding).
  Placement is unchanged: Continue shopping beside the title, Smart Lists at the right.
- **Continue shopping beside the primary button.**
  - `/cart`: `CartContents` gains an optional `continueShoppingHref` prop. The cart page passes
    `"/categories"`; the drawer (`components/layout/Header.tsx`) does not, so the drawer's markup is
    untouched. With the prop, the footer shows *Continue shopping* and *Proceed to checkout* in one
    row from `sm` up (Continue shopping on the left) and stacked below `sm` with Proceed on top.
  - Checkout: `components/checkout/CheckoutForm.tsx` shows the same pair around *Continue to payment*
    with the same responsive rule. The link is an anchor to `/categories`, not a button, so it
    cannot submit the form.
- **Orders list** (`app/(storefront)/account/orders/page.tsx`): `grid gap-3 sm:grid-cols-2`, no third
  column, `PageContainer width="standard"`. This reverses `#1302`'s 1/2/3 columns and its `wide`
  container, by owner request.
- **One shared width**: the cart (already `standard`), the order list, and all three checkout pages
  (`checkout/page.tsx`, `checkout/[orderNumber]/page.tsx`, `checkout/[orderNumber]/cancel/page.tsx`)
  use `PageContainer width="standard"`. Checkout was `narrow` (672px), which squeezed its form and
  summary columns. `tests/page-container.test.ts` records each, and `specs/design-system.md`'s width
  table moves "checkout" from the `narrow` row to the `standard` row (a persistent doc: it is what
  later sessions read as the rule).
- **Slot picker as a 7-day grid** (`components/checkout/SlotPicker.tsx`), after the owner's reference
  image:
  - A table. The header row has one cell per day of the current week page (weekday and day number)
    and a first cell with a calendar icon and the first day's month. Rows are the distinct start and
    end times across the week, grouped under *Morning* (start before 12:00), *Afternoon* (12:00 to
    16:59) and *Evening* (17:00 on); an empty band is not shown.
  - Each cell is a radio: `Free`, `N left` (3 or fewer left), `Full` (disabled), or `–` (no slot at
    that time on that weekday, no input). A selected cell is highlighted.
  - Previous and next week arrows page through `bookingWindowDays`, seven days at a time. Paging
    clears the selection, so the form's `required` check can never be satisfied by an off-screen
    radio.
  - It submits exactly what it did: `fulfilmentSlotId` (the radio) and `fulfilmentDate` (a bare
    `YYYY-MM-DD`, now the selected cell's day; before any selection, today in the vendor's zone as
    before). Express collection keeps its switch, and Express still disables the radios and the date.
  - Days are counted in the vendor's zone with `calendarDayInZone` / `addCalendarDays` (`#811`).
  - Pure layout logic lives in new `lib/slot-grid.ts` (`slotBand`, `pageDays`, `buildSlotGrid`) so it
    is unit-testable without a DOM. A new server action `getAvailableSlotsForWeek` in
    `features/checkout/slots.ts` returns up to seven days' slots in one round trip by calling the
    existing per-day `getAvailableSlotsForVendor`; the repository is not changed. A slot row belongs
    to a weekday (`VendorFulfilmentSlot.dayOfWeek`), so each cell's day comes from the column it is in.
  - On a phone the table scrolls inside its own `overflow-x-auto` wrapper with a sticky time column;
    it does not widen the page (`#959` R18a).
- Tests: new `tests/slot-grid.test.ts`, `tests/slot-picker-grid.test.tsx`,
  `tests/cart-checkout-continue-shopping.test.tsx`; updates to `orders-list-grid`,
  `cart-continue-shopping`, `page-container`.

**Deliberately excluded:**
- **The reference image's promo banner** ("Christmas slots now available", "Book Now") and any
  seasonal copy: not a feature.
- **The "1hr / 4hr Super Saver" tab and the truck icon on some slots**: the schema has no slot length
  or slot type, so neither can come from data. Needs its own proposal and a migration decision.
- **The reference's dark theme**: the grid uses semantic tokens and follows the vendor's theme.
- **The cart drawer**: unchanged (it keeps its own "View full cart" link).
- **`lib/repositories/fulfilment-slots.ts` and `features/checkout/place-order.ts`**: unchanged.
  Capacity, cut-offs and the vendor's slot admin are not touched.
- **A "Continue shopping" link on the order confirmation page**: it already has one (`/categories`).
- **Hiding Continue shopping when the cart is below the vendor minimum**: not requested.

**Open items carried forward:** the 4hr / Super Saver slot type and the slot markers are tracked as `#1306`; it needs an owner decision before a spec.
