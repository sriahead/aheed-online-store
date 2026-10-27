# Cart and checkout Continue shopping, shared standard width, orders 2-up and the 7-day slot grid (validation)

Run from the repo root on branch `feature/1305-checkout-width-slot-grid`. Run
`npx vitest run` alone with `--maxWorkers=4` (CLAUDE.md, "Windows shell"). Browser rows need
`npm run preview`, never `npm run dev`; stop the whole `node`/`workerd` chain afterwards. A browser
row you cannot run is reported as **unverified, with the reason**, not as passing.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `npx vitest run tests/cart-continue-shopping.test.tsx --maxWorkers=4` passes; its test renders `/cart` and asserts the two links' `className` strings are equal and contain `rounded-full`, `border`, `border-primary`, `text-primary`, `font-bold`. |
| R2  | Unit | Same file: href `/categories` and `/shop-your-list` asserted for an empty cart and for a cart with lines. |
| R3  | Unit + diff | `npx vitest run tests/cart-checkout-continue-shopping.test.tsx --maxWorkers=4` passes; its case renders `CartContents` without the prop and asserts no "Continue shopping" text. `git diff origin/staging --stat -- components/layout/Header.tsx` prints nothing. |
| R4  | Unit | Same file: renders `/cart` with lines and asserts the two links are the first and second children of one element whose className has `flex-col-reverse` and `sm:flex-row`. |
| R5  | Unit | Same file: renders `CheckoutForm` and asserts the `<a href="/categories">` and the "Continue to payment" button share a parent with `flex-col-reverse` and `sm:flex-row`, and that the link's tag name is `A`. |
| R6  | Unit | Same file: attaches a `submit` listener to the form, clicks the link, asserts the listener was not called. |
| R7  | Unit | `npx vitest run tests/orders-list-grid.test.tsx --maxWorkers=4` passes; its test asserts `grid` and `sm:grid-cols-2` are present and `lg:grid-cols-3` / `xl:grid-cols-3` are absent. |
| R8  | Unit | `npx vitest run tests/page-container.test.ts --maxWorkers=4` passes; `grep -n "checkout\|account/orders/page" tests/page-container.test.ts` shows `width: "standard"` for the four pages with their old `padY` values; `grep -n "PageContainer width" "app/(storefront)/checkout/page.tsx" "app/(storefront)/checkout/[orderNumber]/page.tsx" "app/(storefront)/checkout/[orderNumber]/cancel/page.tsx" "app/(storefront)/account/orders/page.tsx"` shows `standard` four times. |
| R9  | Docs | `grep -n "checkout" specs/design-system.md` shows checkout on the `standard` table row and not on the `narrow` row. |
| R10 | Unit | `npx vitest run tests/slot-grid.test.ts --maxWorkers=4` passes; its `slotBand` cases include `11:59`→morning, `12:00`→afternoon, `16:59`→afternoon, `17:00`→evening. |
| R11 | Unit | Same file: `pageDays` cases for page 0, a short last page, and a page past the end (`[]`). |
| R12 | Unit | Same file: `buildSlotGrid` cases for band order, an omitted empty band, a union of rows across weekdays with different times, row sort order, `cells.length === days.length`, and `null` cells. |
| R13 | Unit | `npx vitest run tests/slot-week-action.test.ts --maxWorkers=4` passes (mocks `@/lib/fulfilment-slots-service`): 7 valid days → 7 entries in order; 9 days → 7; `"not-a-day"` dropped; `getAvailableSlotsForDate` still exported; every export of the module is an async function. |
| R14 | Diff | `git diff origin/staging --stat -- lib/repositories/fulfilment-slots.ts features/checkout/place-order.ts prisma package.json package-lock.json` prints nothing. |
| R15 | Unit | `npx vitest run tests/slot-picker-grid.test.tsx --maxWorkers=4` passes; its test renders the picker with mocked week data and asserts the header cells ("Wed 28" style, at most 7), the month cell, and the band headings shown or omitted. |
| R16 | Unit | Same file: one slot per state (`available` 9, 2, 0) and a weekday with no slot; asserts "Free", "2 left", "Full" (radio disabled) and "–" (no input in that cell). |
| R17 | Unit | Same file: asserts a cell radio's `aria-label` equals the documented example for a known slot. |
| R18 | Unit | Same file: clicks a cell in the third column, builds `new FormData(form)`, asserts `fulfilmentSlotId` and `fulfilmentDate`; a second case with no click asserts `fulfilmentDate` is today's vendor-zone day. |
| R19 | Unit | Same file: renders with Express available and switched on and asserts every cell radio and `fulfilmentDate` are disabled. |
| R20 | Unit | Same file: previous disabled on page 0; next disabled with `bookingWindowDays` 7; with 14, next shows days 8-14 and clears a selected cell (`fulfilmentSlotId` absent from FormData). |
| R21 | Unit | Same file: asserts one `getAvailableSlotsForWeek` call per page with that page's days, "Loading slots…" while the mock is unresolved, and "No slots available for these dates." for an all-empty week. |
| R22 | Unit | Same file: `vi.setSystemTime("2026-10-27T23:30:00Z")`; zone `Pacific/Auckland` → first header "Wed 28", zone `UTC` → "Tue 27". |
| R23 | Unit + browser | Unit: the same file asserts the table's wrapper has `overflow-x-auto` and first-column cells have `sticky` and `left-0`. Browser: `npm run preview`, signed in with items in the cart, `/checkout` at 390px: `document.documentElement.scrollWidth <= window.innerWidth` is true. Report unverified if no signed-in session is available. |
| R24 | Unit | Same file: asserts the rendered text contains neither "Select Date" nor "Select Time Slot". |
| R25 | Grep | `grep -nE "Christmas|Super Saver|Book Now|truck|[\"'\`]#[0-9a-fA-F]{3,8}[\"'\`]|-\[#" components/checkout/SlotPicker.tsx lib/slot-grid.ts` prints nothing (issue references like `#1305` in comments are deliberately not matched). |
| R26 | Diff | `git diff origin/staging --stat -- components/icons` prints nothing; each `name="..."` in `SlotPicker.tsx` appears as a key in `components/icons/registry.ts`; `npm run icons:build` leaves `git status` clean. |
| R27 | Unit | `npx vitest run tests/vendor-neutral-copy.test.ts --maxWorkers=4` passes; read the diff's new strings and confirm no vendor or grocery word. |
| R28 | Unit | Temporarily revert one change at a time (cart pill class, `sm:flex-row` pair, `sm:grid-cols-2`, a `slotBand` threshold, the week action's 7-day cap, the selection-clearing on paging, the vendor-zone day) and confirm the matching test fails; restore and confirm `git status` is clean. |
| R29 | Docs | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#1305`. |
| R30 | CI | `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4`, `npm run format:check`, `npm run kms:validate`, `npm run kms:coverage`, `npm run kms:check-generated` all exit 0; confirm the GitHub `gates` checks on the PR also pass. |
