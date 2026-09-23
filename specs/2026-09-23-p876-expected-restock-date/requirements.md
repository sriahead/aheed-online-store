# P876 — Expected Restock Date on Out-of-Stock Products (requirements / acceptance criteria)

Closes `#876` (expected restock date, split from `#400`) and `#878` (product-create client), which is
folded in as a prerequisite. `#400` stays open (per-store counts, blocked on `#422`). Staff record an
optional expected-back day on the product form. Shoppers see `Back in stock <date>` on the card,
quick view and product page, only while the product is out of stock and only until that day has
passed in the vendor's timezone. Async stock loading is **not** part of this slice (dropped on
measurement; see `plan.md`).

Terms used below: a **day** is a `YYYY-MM-DD` string. **Vendor today** is
`calendarDayInZone(new Date(), timezone)` from `lib/local-datetime.ts`, where `timezone` is
`getCurrentVendorProfile()`'s `timezone`, or `STORE_TIMEZONE` when the profile is null.

## Prerequisite — product-create client (#878)

R1. Before the client change in R2 is made, a product create through `/staff/products/new` is
    attempted under `npm run preview` against the dev database. The observed outcome (the error
    text, or the fact that it succeeded) is recorded verbatim in this slice's `build-notes.md`.

R2. In `lib/products-service.ts`, `createProductForVendor` passes `getPrismaWs()` (not
    `getPrisma()`) to the repository's `createProductForVendor`, and the function sits below the
    file's `transaction-bearing writes: WebSocket client only (#382)` banner.

R3. Under `npm run preview`, submitting `/staff/products/new` with a quantity of `0` and an expected
    restock day creates the product. Afterwards both the `Product` row and its `Inventory` row exist,
    and `Inventory.expectedRestockDate` equals the UTC midnight of the entered day.

## Schema

R4. `prisma/schema.prisma`'s `Inventory` model has a nullable field `expectedRestockDate DateTime?`
    with an adjacent comment stating it holds the UTC midnight of a vendor-local calendar day (the
    `Order.fulfilmentDate` convention).

R5. This slice adds exactly one directory under `prisma/migrations/`. Its `migration.sql` adds the
    `expectedRestockDate` column to `"Inventory"` and contains no `DROP` statement.

## Staff write surface

R6. `components/staff/ProductForm.tsx` renders an `<input type="date">` with `name` and `id`
    `expectedRestockDay` and an associated visible `<label>`. On the edit page it is prefilled with
    the stored day, and on the new-product page it is empty.

R7. `parseProductForm` in `lib/catalogue-form.ts` returns `expectedRestockDay: null` for an empty
    value, returns the day unchanged for a valid day (e.g. `2026-10-01`), and returns a field error
    whose field is `expectedRestockDay` for an impossible or non-day value (`2026-02-31`,
    `tomorrow`). `tests/catalogue-form.test.ts` asserts all three.

R8. Both repository write paths (`createProductForVendor`'s nested inventory create, and the
    `inventory.upsert` in `updateProductForVendor`, both its `create` and `update` branches) write
    `expectedRestockDate` as `calendarDayToUtcMidnight(day)` when a day is given and `null` when
    `expectedRestockDay` is null.

## Storefront read

R9. `ProductSummary` in `lib/repositories/products.ts` has a field `expectedRestockDay: string | null`.
    Both `toProductSummary` and `getProductBySlug` populate it as the day of the joined
    `Inventory.expectedRestockDate` (UTC calendar day of the stored instant), or `null`. No new
    query is added.

R10. `lib/restock.ts` exports two pure functions with no request-context or `process.env` access:
     - `currentRestockDay(day, today)` returns `day` when `day` is non-null and `day >= today`,
       and `null` otherwise.
     - `formatRestockDay(day)` formats the day with `Intl.DateTimeFormat("en-GB", { weekday:
       "short", day: "numeric", month: "short", timeZone: "UTC" })`.

     `tests/restock.test.ts` asserts `currentRestockDay` for yesterday, today, tomorrow and `null`.
     It also asserts that `formatRestockDay("2026-09-28")` contains both `Mon` and `28`.

R11. In `lib/products-service.ts`, every `ProductSummary` returned by `getProductRepository()`'s
     `list`, `listByCategory`, `search` and `getBySlug` has `expectedRestockDay` replaced by
     `currentRestockDay(expectedRestockDay, vendorToday)`, where vendorToday is defined above.

## Display

R12. `components/product/ProductCard.tsx` renders the text `Back in stock ` followed by
     `formatRestockDay(expectedRestockDay)` if and only if `inStock` is `false` and
     `expectedRestockDay` is non-null. `tests/restock-notice.test.tsx` (or an extension of an
     existing ProductCard test file) asserts it is present in that case. It also asserts it is
     absent when `inStock` is `true` with a day set, and absent when the day is `null`.

R13. `components/product/QuickViewDrawer.tsx` renders the same text under the same condition, next
     to its existing `Out of stock` text. A test asserts the present case and the day-null absent
     case.

R14. `app/(storefront)/products/[slug]/page.tsx` renders the same text under the same condition,
     next to its existing `Out of stock` text.

R15. The markup this slice adds in the three files named in R12–R14 contains no raw hex colour
     (no `#` followed by hex digits inside a `className`) and no `text-primary/` alpha modifier.

## End-to-end

R16. Under `npm run preview` against the dev database, signed in with a role that can open
     `/staff/products`:
     - (a) After editing an in-stock product to quantity `0` with a restock day of vendor today + 3,
       its card on its category page, its quick view, and its product page each show `Back in stock`
       with that date.
     - (b) After changing the day to vendor today − 1, none of the three shows `Back in stock`,
       and the database still holds the date.
     - (c) After changing the quantity to `5` with the day set back to vendor today + 3, none of the
       three shows `Back in stock`.
     - (d) After saving with the day field empty, `Inventory.expectedRestockDate` is `NULL`.

## Operator documentation

R17. `docs/staff-playbook/staff-tabs-guide.md`:
     - Its Catalogue section names the expected restock date field and states both display
       conditions: shown only while the product is out of stock, and only until the date has passed.
     - Its Live Inventory section's advice about switching a product off rather than setting it to
       zero now also names setting a restock date as the option for a product that is coming back.
     - Its front-matter `version` is bumped and `updated` is set to the change date.

R18. `npm run kms:validate` exits 0 with zero failing documents. `npm run kms:assemble:internal`
     followed by `npx next build --webpack` in `kms/site-internal` both exit 0.

## Gates

R19. `CHANGELOG.md` has an entry under `## [Unreleased]` citing `#876` and `#878` (Gate 4).

R20. `npm run lint`, `npm run typecheck`, `npm run format:check` and `npx vitest run` (run alone)
     all exit 0 (Gate 3).
