# Storefront browse discovery completion (requirements / acceptance criteria)

Closes `#694` (CollectionNav absent from category pages), the pack-size remainder of `#397`
(catalogue filters — every other facet it asks for already shipped in `#569`), and `#608` (six of
`#569`'s facet fields never reach a product card or detail page). Builds on `#681` (CollectionNav),
`#569` (the dietary, brand and origin facets) and `#398` (`netContentAmount`/`netContentUnit`). The
one-line version: a shopper can reach the collections from every browse page, filter by pack size,
and see the facets they can already filter on. No schema change and no migration.

Throughout: "the browse pages" means `app/(storefront)/search/page.tsx` and
`app/(storefront)/categories/[slug]/page.tsx`.

## Part A — CollectionNav on category pages (`#694`)

R1. `app/(storefront)/categories/[slug]/page.tsx` imports `CollectionNav` from
`@/components/product/CollectionNav` and renders it exactly once.

R2. On that page, `CollectionNav` and `FilterPanel` are wrapped together in a single element
carrying the classes `md:w-60` and `md:shrink-0`, matching `app/(storefront)/search/page.tsx`'s
existing wrapper, and `CollectionNav` precedes `FilterPanel` in document order.

R3. `CollectionNav` is rendered on the category page with no `activeHref` value, so a rendered
category page contains no `aria-current="page"` attribute inside its Collections nav.

R4. A rendered category page contains exactly one element matching `nav[aria-label="Collections"]`,
confirming the nav sits outside `FilterPanel` (which renders its form twice).

R5. `components/product/CollectionNav.tsx`'s `COLLECTIONS` array is unchanged by this slice — the
same four entries with the same `href` values, including New Arrivals pointing at plain `/search`.

## Part B — the pack-size facet (`#397` remainder)

R6. `components/product/unit-price.ts` exports a pure function that formats a net-content amount and
unit into a shopper-facing pack-size label, mapping `GRAM` to a `g` suffix, `KILOGRAM` to `kg`,
`MILLILITRE` to `ml`, `LITRE` to `L` and `EACH` to an `each` suffix.

R7. A pure exported parser accepts `string | string[] | undefined` and returns a pack-size value only
for a single string matching `^[0-9]{1,6}-(GRAM|KILOGRAM|MILLILITRE|LITRE|EACH)$` with a non-zero
amount; for an array, for `undefined`, for an unknown unit, for a non-numeric amount, for an amount
of `0`, and for any other malformed input it returns `undefined`.

R8. `ProductFilters` in `lib/repositories/products.ts` carries an optional pack-size field holding
both an amount and a unit, and `buildFilterWhere` narrows on `netContentAmount` **and**
`netContentUnit` together, never on one alone.

R9. `AvailableFacets` in `lib/repositories/products.ts` carries a `packSizes` array, and
`getAvailableFacets` populates it from a `prisma.product.findMany` call using
`distinct: ["netContentAmount", "netContentUnit"]` restricted to rows where both columns are
non-null, narrowed to the same result context as the existing origin and brand facets.

R10. `packSizes` is ordered deterministically: grouped by the reference unit that
`components/product/unit-price.ts` already maps each `NetContentUnit` onto, then ascending by
converted reference amount, so a `500` `GRAM` entry sorts before a `1` `KILOGRAM` entry.

R11. `components/product/ProductFilterForm.tsx` renders a pack-size `select` named `packSize` when
`packSizes` is non-empty and renders no pack-size control at all when it is empty, matching the
existing origin and brand controls.

R12. That `select` is labelled by a **wrapping `label`** element and carries **no `id` attribute**,
matching every other control in `ProductFilterForm` — the form is rendered twice per page by
`FilterPanel`, so an `id` would duplicate in one document.

R13. `components/product/filter-chips.ts` includes `packSize` in its `REMOVABLE` array and in
`FilterChipParams`, and a request carrying a valid `packSize` renders a removable chip whose label is
the formatted pack size from R6.

R14. `components/product/search-href.ts` includes `packSize` in both `SearchHrefParams` and
`CARRIED`, so the filter survives a "Next page" click rather than being silently dropped one click
into pagination.

R15. Both browse pages declare `packSize` in their own `SearchParams` type, read it, pass it through
the R7 parser, and forward the result to the product query. It is deliberately **not** added to
`FacetContext` and **not** passed to `availableFacets`: that type carries only `groups`,
`categoryIds`, price and in-stock, because each facet probe must exclude every other facet's own
selection (see `getAvailableFacets`) — a selected pack size narrowing the probe would hide every
other pack size from the control that offers them. `origin` and `brandId` are already excluded for
the identical reason.

R16. A request to `/search?packSize=500-GRAM` returns HTTP 200 and lists only products whose
`netContentAmount` is `500` and whose `netContentUnit` is `GRAM`.

R17. A request to `/search?packSize=500-GRAM&packSize=1-KILOGRAM` (a repeated parameter) returns HTTP
200 and applies no pack-size predicate, rather than throwing.

R18. A request to `/search?packSize=bogus` returns HTTP 200, applies no pack-size predicate, and
renders no pack-size chip.

## Part C — facet display on card and detail page (`#608`)

R19. `ProductSummary` in `lib/repositories/products.ts` carries `isVegetarian`, `isGlutenFree`,
`isHmcCertified` and `brand` (null, or an object with `id`, `name` and `slug`), and every repository
function returning a `ProductSummary` selects them.

R20. `ProductDetail` additionally carries `hmcReference`.

R21. `components/product/ProductCard.tsx` renders a distinct visible badge for each of
`isVegetarian`, `isGlutenFree` and `isHmcCertified` when true, and renders none of them when false.

R22. `components/product/ProductCard.tsx` renders the brand name when `brand` is non-null and renders
no brand element when it is null.

R23. `app/(storefront)/products/[slug]/page.tsx` renders a facet block listing every true flag among
`isHalal`, `isFresh`, `isOrganic`, `isVegetarian`, `isGlutenFree` and `isHmcCertified`, plus the
brand and origin when present.

R24. When `isHmcCertified` is true, the product detail page renders `hmcReference` alongside the HMC
claim, so the certification reference travels with the assertion (`#239`).

R25. Every badge added by R21 conveys its meaning through text content rather than colour alone, and
carries no `aria-hidden` on that text.

## Cross-cutting

R26. `git diff --name-only` for this slice shows no change to `prisma/schema.prisma` and adds no
directory under `prisma/migrations/`.

R27. The storefront renders correctly for a second vendor: with the vendor host resolved from the
`VendorDomain` table of the database actually under test, SriMart's browse page returns HTTP 200 and
renders its own facets rather than Aheed's.

R28. New pure functions from R6, R7, R10 and the R13 chip label are covered by unit tests in
`tests/`, and the full suite's file and test totals are recorded in the build notes.

R29. `CHANGELOG.md` updated (Gate 4).

R30. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.
