# Orders grid, Quick Shop orders tile and cart Continue shopping (build notes)

## What changed and why

Source (commit `96ad89c`):
- `app/(storefront)/quick-shop/page.tsx`: fifth tile "Your orders" (`/account/orders`, icon
  `package`), appended last; intro line is now "Quick ways to fill your basket without browsing from
  scratch."
- `app/(storefront)/account/orders/page.tsx`: `PageContainer width="wide"`; `<ul>` is
  `grid gap-3 sm:grid-cols-2 xl:grid-cols-3`. Each `<li class="flex">` holds a `div.flex-1.flex-col`
  card: a `Link` (details, preview `line-clamp-2`) above a `mt-auto` action row of two forms
  (`reorderItems`, `saveOrderAsList` with hidden `from=orders-list`). The page reads `?list=` and
  renders saved / capped / empty `role="status"` paragraphs.
- `features/lists/save-order-as-list.ts`: `base` is `/account/orders` when `from === "orders-list"`,
  else the detail page; all three redirects use it.
- `app/(storefront)/cart/page.tsx`: "Continue shopping" link to `/categories` beside the `<h1>`, outside
  any condition on cart contents.

Tests: new `tests/orders-list-grid.test.tsx` and `tests/cart-continue-shopping.test.tsx`; updated
`quick-shop-hub`, `save-list-actions`, `page-container` (orders page now `wide`). `CHANGELOG.md` has the
Gate 4 entry under `[Unreleased] / Changed`.

## Decisions taken during the build

- Cart link placed next to the heading (left), not next to the existing "Smart Lists" button on the
  right, so it reads as navigation rather than a second action. Rejected: below the cart card (off
  screen on a long cart).
- The orders-list test mocks the two server actions as stubs; the actions themselves are covered by
  `tests/save-list-actions.test.ts`.
- The cart test stubs `CartContents` (shared with the drawer, untouched) so it asserts only the page's
  own link.
- The "empty" message copy ("There is nothing in that order to save.") is new; the spec fixed its text
  in R11.

## Deviations from the spec

None.

## Known-shaky areas

- **No browser check was done.** The 1/2/3-column behaviour, equal-height cards and button alignment are
  asserted only by class names in jsdom. The spec's visual step (`npm run preview`, widths 390 / 800 /
  1400) is the real test. `line-clamp-2` is already used elsewhere (`ProductCard`), so the utility
  exists in this Tailwind build.
- **Not run in this context:** the full `npx vitest run`, `kms:*`, `build`. Only the six affected test
  files, `typecheck`, ESLint on the touched areas and `format:check` were run, all green.
- **Not independent:** the build and these notes were written on Sonnet 5.5 in one session, not Opus 5,
  so the usual model separation did not happen.
- **Server action in a list of forms:** `reorderItems` and `saveOrderAsList` are imported into a page
  that previously imported neither. They are `"use server"` modules, so check a real click in preview
  (Reorder lands on `/cart` with the restore notice; Save as list returns to `/account/orders?list=saved`).
- A page-two Save as list returns to page one (cursor not carried) — deliberate, recorded in `plan.md`.
