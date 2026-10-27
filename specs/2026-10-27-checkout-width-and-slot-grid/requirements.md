# Cart and checkout Continue shopping, shared standard width, orders 2-up and the 7-day slot grid (requirements / acceptance criteria)

Closes `#1305`. Follow-up to `#1302` (`specs/2026-10-27-orders-grid-quickshop-cart/`). See `plan.md`
for the reasoning. "The slot picker" is `components/checkout/SlotPicker.tsx`. "A cell" is one radio
input in the slot grid. A "day" is a `YYYY-MM-DD` calendar day. "Page" below means one week page of
the slot grid, at most seven days.

**Cart header**

R1. On `/cart` the "Continue shopping" link and the "Smart Lists" link have byte-identical
    `className` values, and that value contains `rounded-full`, `border`, `border-primary`,
    `text-primary` and `font-bold`.
R2. On `/cart`, for an empty cart and for a cart with lines, "Continue shopping" has href
    `/categories` and "Smart Lists" has href `/shop-your-list`.

**Continue shopping beside the primary button**

R3. `CartContents` has an optional prop `continueShoppingHref`; rendered without it, the footer
    contains no "Continue shopping" text and `git diff origin/staging -- components/layout/Header.tsx`
    is empty.
R4. `/cart` passes `continueShoppingHref="/categories"`; for a cart with lines the "Continue
    shopping" link (href `/categories`, the first child) and the "Proceed to checkout" link (href
    `/checkout`, the second child) sit in one element whose `className` contains `flex-col-reverse`
    and `sm:flex-row`.
R5. `CheckoutForm` renders a link "Continue shopping" with href `/categories` and the submit button
    "Continue to payment" as children of one element whose `className` contains `flex-col-reverse`
    and `sm:flex-row`; the link is an `<a>`, not a `<button>`.
R6. Clicking the checkout "Continue shopping" link in a rendered `CheckoutForm` does not fire the
    form's `submit` event.

**Orders list and shared width**

R7. The order list's `<ul>` `className` contains `grid` and `sm:grid-cols-2` and contains neither
    `lg:grid-cols-3` nor `xl:grid-cols-3`.
R8. The order list page, `app/(storefront)/checkout/page.tsx`,
    `app/(storefront)/checkout/[orderNumber]/page.tsx` and
    `app/(storefront)/checkout/[orderNumber]/cancel/page.tsx` each use `PageContainer` with
    `width="standard"`, and `tests/page-container.test.ts` records `standard` for each, with their
    existing `padY` unchanged.
R9. `specs/design-system.md`'s page-width table lists checkout in the `standard` row and no longer
    in the `narrow` row.

**Slot grid: layout logic**

R10. `lib/slot-grid.ts` exports `slotBand(startTime)` returning `"morning"` for a start before
     `12:00`, `"afternoon"` for `12:00` to `16:59` and `"evening"` for `17:00` and later.
R11. `lib/slot-grid.ts` exports `pageDays(days, page, size = 7)` returning the days of that page and
     returning `[]` past the last page.
R12. `lib/slot-grid.ts` exports `buildSlotGrid(days, slotsByDay)` returning bands in the order
     morning, afternoon, evening, omitting a band with no rows; within a band, one row per distinct
     start/end pair across all given days, sorted by start then end; each row's `cells` array has
     the same length and order as `days`, holding the slot (id, capacity, available) that day or
     `null` when that weekday has no slot at that time.

**Slot grid: data**

R13. `features/checkout/slots.ts` exports an async `getAvailableSlotsForWeek(vendorId, method, days)`
     that returns one `{ day, slots }` entry per valid input day in input order, ignores days after
     the seventh, drops an input that is not a valid calendar day, and gets each day's slots from
     the existing `getAvailableSlotsForVendor`; `getAvailableSlotsForDate` is still exported there;
     the file exports only async functions.
R14. `lib/repositories/fulfilment-slots.ts`, `features/checkout/place-order.ts`, everything under
     `prisma/`, `package.json` and `package-lock.json` are unchanged:
     `git diff origin/staging --stat` for those paths is empty.

**Slot grid: the picker**

R15. The slot picker renders a `<table>` whose header row has one cell per day of the current page
     (at most seven) reading the weekday and the day number (for example "Thu 29"), plus a first
     header cell containing the month abbreviation of the page's first day; and it renders the
     band headings "Morning", "Afternoon" and "Evening" only for bands that have rows.
R16. In the grid a slot with `available > 3` shows the text "Free" in an enabled radio input named
     `fulfilmentSlotId` whose value is the slot id; `1 <= available <= 3` shows "N left" (for
     example "2 left") in an enabled radio; `available === 0` shows "Full" in a disabled radio; a
     time with no slot that weekday shows "–" and has no input.
R17. Every cell radio has an `aria-label` naming the weekday, day, month, start time, end time and
     state, for example "Thu 29 Oct, 05:30 to 06:30, free".
R18. Selecting a cell checks that radio, and the form's data then contains `fulfilmentSlotId` equal
     to that slot's id and `fulfilmentDate` equal to that cell's day; with no selection
     `fulfilmentDate` equals today's day in the vendor's time zone.
R19. With Express collection switched on, every cell radio is disabled and the `fulfilmentDate` input
     is disabled, as before this slice.
R20. The previous-week control has `aria-label` "Previous week" and is disabled on the first page;
     the next-week control has `aria-label` "Next week" and is disabled when no day of
     `bookingWindowDays` remains after the current page; activating either shows the adjacent page
     and clears any selected cell (no radio checked, `fulfilmentSlotId` absent from the form data).
R21. The picker calls `getAvailableSlotsForWeek` once per page shown, with that page's days, and
     shows "Loading slots…" while it is pending and "No slots available for these dates." when every
     day of the page returned no slots.
R22. The first page's days are counted from today in the vendor's time zone using
     `calendarDayInZone` and `addCalendarDays`: with the system time fixed at 2026-10-27T23:30:00Z a
     vendor zone of `Pacific/Auckland` shows 2026-10-28 as its first day and `UTC` shows 2026-10-27.
R23. The table is inside an element with `overflow-x-auto`, and its first column cells have class
     `sticky` with `left-0`; the page has no horizontal scroll at a 390px viewport (browser check).
R24. The picker no longer contains the text "Select Date" or "Select Time Slot".
R25. `SlotPicker.tsx` and `lib/slot-grid.ts` contain none of "Christmas", "Super Saver", "Book Now",
     "truck", and no raw colour literal (`#` followed by 3 to 6 hex digits, or `bg-[#`).
R26. Every icon the picker uses exists in `components/icons/registry.ts`, and `git diff
     origin/staging -- components/icons` is empty.

**Gates**

R27. The new and changed copy contains no vendor name or product-category word, and
     `tests/vendor-neutral-copy.test.ts` passes.
R28. Tests cover R1, R2, R4, R5, R7, R10-R13, R15-R22 and R24, and each fails if its behaviour is
     reverted.
R29. `CHANGELOG.md` updated (Gate 4).
R30. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice, as do
     `kms:validate`, `kms:coverage` and `kms:check-generated`.
