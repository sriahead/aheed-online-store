---
id: p9-2-storefront-browse-discovery-completion-plan
title: "Storefront browse discovery completion (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-09
visibility: internal
summary: Renders CollectionNav on category pages, adds the pack-size facet #397 still lacked, and surfaces the vegetarian, gluten-free, HMC and brand fields #569 shipped but never displayed. No schema change.
tags: [p9-2, storefront, browse, facets, discovery]
related: [architecture, roadmap, design-system]
---

# Storefront browse discovery completion (plan)

**Goal:** finish the storefront's browse surface so that a shopper can (a) reach the collections
from every browse page rather than two of the three, (b) filter by pack size, and (c) actually
_see_ the dietary and brand facets that have been filterable-but-invisible since `#569`. Shipping
this proves the browse surface is internally consistent: every facet a shopper can filter on is a
facet they can also read off a product, and every browse page offers the same entry points.

Three issues, clubbed into one slice because they land in the same five files and share one
question — "what can a shopper discover from a listing page?". Splitting them would mean two slices
editing `ProductFilterForm.tsx`, `ProductCard.tsx`, `CollectionNav.tsx` and both browse pages a day
apart.

**This slice carries NO schema change and generates NO migration.** That is deliberate and is a
large part of why these three were chosen to go together: GAP-011 has caused `prisma migrate dev`
to propose dropping the three hand-authored `pg_trgm` indexes on **seven consecutive** occasions,
so a slice that needs no migration avoids the repo's single most reliable foot-gun outright.

## The finding that sized this slice

**`#397`'s issue body is stale and describes work that has already shipped.** It was written before
`#569` and `#398`, and its gap table asserts that HMC, Vegetarian, Gluten-Free and Brand are "not in
the schema". All four are:

- `#569` (P2.6 slice 6) added `isVegetarian`, `isGlutenFree`, `isHmcCertified` (plus
  `hmcReference`/`hmcVerifiedAt`), a real `Brand` model with `Product.brandId`, and the
  `@@index([vendorId, isActive, brandId])` / `@@index([vendorId, isActive, origin])` pair.
- `lib/repositories/products.ts` applies every one of them as a query predicate
  (`buildFilterWhere`), and `getAvailableFacets` already narrows each to the current result context.
- `components/product/ProductFilterForm.tsx` already renders a control for every one of them.
- `#398` (derivation half) added `netContentAmount`/`netContentUnit` — the structured pack-size
  dimension `#397` correctly said `unitLabel` free text could never provide.

So the only part of `#397` still genuinely missing is **Pack Size**, and it is now cheap because
`#398` already built the columns it needs. Country of Origin, Brand, HMC, Vegetarian, Gluten-Free
and Organic are all done. This finding is recorded here rather than only in the issue because the
issue's own gap table would otherwise send the next reader looking for schema work that is not
there.

## Scope (this slice)

### Part A — collections reachable from every browse page (`#694`)

`components/product/CollectionNav.tsx` shipped in `#681` and renders on exactly two pages:
`app/(storefront)/search/page.tsx` and `app/(storefront)/bundles/page.tsx`.
`app/(storefront)/categories/[slug]/page.tsx` — the page a shopper reaches from the department menu,
and the most-used browse surface — renders none. So the collections are discoverable from search and
invisible the moment someone browses a department.

The fix is composition, not new behaviour: render `CollectionNav` on the category page in the **same
structural position** it occupies on `/search`. That position is not incidental. On `/search` the nav
and `FilterPanel` share a `div` with `md:w-60 md:shrink-0`; the category page currently renders
`FilterPanel` as a bare flex child, so dropping the nav in without that wrapper would give the two
pages different column behaviour at the `md` breakpoint.

`activeHref` is left **undefined** on a category page. No collection is active there — a category is
a different axis from a collection — and passing a value would mark a collection `aria-current` on a
page that is not that collection.

**On "always visible":** `CollectionNav` is already rendered _outside_ `FilterPanel`'s two branches,
which is what keeps it visible on a narrow viewport instead of collapsing behind the `details`
disclosure. That is the property the request is actually asking for, and it comes for free. See
"Deliberately excluded" for why this slice does not additionally make it scroll-following.

### Part B — the pack-size facet (`#397`'s remainder)

A new `packSize` filter, built the same way `origin` and `brand` already are:

1. **`ProductFilters.packSize`** — a `NetContent`-shaped pair of amount and unit, or absent.
   `buildFilterWhere` narrows on both columns together, never one alone: an amount without a unit is
   meaningless (`500` is not a pack size).
2. **`AvailableFacets.packSizes`** — distinct amount/unit pairs present in the current result
   context, via `distinct: ["netContentAmount", "netContentUnit"]`, matching the
   `distinct`-not-`groupBy` ruling `getAvailableFacets` already documents for origins and brands (the
   facet needs values, not counts).
3. **Deterministic ordering.** Pack sizes are sorted by reference-unit family and then by ascending
   reference amount, reusing `components/product/unit-price.ts`'s existing conversion table, so
   `500g` sorts before `1kg` rather than lexically after it. Sorting happens in TypeScript over the
   already-fetched distinct rows, not in SQL — the list is small and the comparison is a unit
   conversion Postgres has no reason to know about.
4. **A select control** in `ProductFilterForm`, rendered only when `packSizes` is non-empty, exactly
   like the origin and brand selects — and, like every other control in that form, labelled by a
   **wrapping `label`** with no `id` attribute. That is not a style preference: `FilterPanel`
   renders `ProductFilterForm` twice (a `details` disclosure below `md`, a static `aside` above it),
   which is safe only because the form uses no `id`s. A `label htmlFor` plus `select id` would put
   two identical ids in one document and bind half the labels to the wrong control.
5. **A removable chip** in `components/product/filter-chips.ts`.
6. **Wired on both browse pages** — `/search` and `/categories/[slug]`.

**A new filter key must be added to THREE lists, not two, and the third is the one that bites.**
Beside `filter-chips.ts`'s `REMOVABLE` and each page's own `SearchParams` type, there is
`components/product/search-href.ts`'s `CARRIED` — the list of keys that survive a "Next page"
click. Its own comment states the failure mode exactly: "a key present in the chips but missing here
is dropped one click into pagination, leaving the shopper on a wider result set than the chips
claim." `tests/filter-chips.test.ts` pins `CARRIED` against `REMOVABLE`, so missing that one fails a
test; nothing pins either against the two pages' `SearchParams` types, which is the unguarded third
list **`#601`** is filed for. This slice adds `packSize` to all three and does not attempt to fix
`#601`'s structural problem — but it is a live demonstration of it, and that belongs in `#601`.

**URL encoding.** `packSize=<amount>-<unit>`, for example `packSize=500-GRAM`. One key, because both
halves must travel together to mean anything, and a single key cannot be half-supplied.

**The parser is strict and array-safe by construction.** It accepts a string, a string array or
`undefined`, and yields a filter only for a single string matching the exact shape; anything else — an
array from a repeated parameter, a malformed value, an unknown unit — applies **no predicate**,
matching the rule `origin` and `brand` already follow ("an unrecognised value legitimately matches
nothing, exactly as an over-narrow price range does"). This is deliberate: `#689` records that a
repeated query parameter arrives as a string array whatever the page's type annotation declares, and
500s the render. `#689` is not in this slice's scope and the existing keys are left alone — but a
**new** key is not going to become the sixth instance of that defect on the day it ships.

### Part C — the invisible facets become visible (`#608`)

`#569` made four fields filterable that a shopper can never see on a product. Confirmed against the
code:

- **`ProductSummary` does not carry them at all** — it has `isHalal`, `isFresh`, `isOrganic` and
  `origin`, but no `isVegetarian`, `isGlutenFree`, `isHmcCertified` or `brand`. So this is a
  repository-select and type widening, not a JSX change.
- **`ProductCard` renders only `isHalal` and `isFresh`** as badges, plus `origin` as small text.
- **The storefront product detail page renders NO facet at all** — not even Halal or Fresh, which the
  card does show. `ProductDetail extends ProductSummary` and adds only `description` and `images`, so
  the detail page is the larger of the two gaps.

This slice widens `ProductSummary` with `isVegetarian`, `isGlutenFree`, `isHmcCertified` and `brand`
(id, name and slug — the shape `getAvailableFacets` already returns), widens `ProductDetail` with
`hmcReference`, renders the new badges plus brand on the card, and gives the detail page a complete
facet block.

**On HMC specifically.** `#239` was a real incident in which this codebase asserted "100% Certified
HMC Halal" for a vendor with no basis for it, and `prisma/schema.prisma`'s own comment records that
the flag "never travels alone" — `lib/catalogue-form.ts` requires `hmcReference` whenever
`isHmcCertified` is ticked and nulls it when it is not. Displaying the badge is therefore legitimate
here in a way it was not in `#239`: there is real per-product data behind it. The detail page renders
the **reference** alongside the claim so the provenance travels with the assertion; the card renders
the badge alone, because a card has no room for provenance and the detail page is one click away.

## Deliberately excluded

- **A recency-window "New Arrivals" (`#684`).** `CollectionNav`'s New Arrivals link continues to
  point at plain `/search`, which genuinely _is_ the newest-first listing (`findPage` orders every
  browse listing `createdAt desc, id desc`). `#681`'s docstring explains at length why inventing a
  `collection=new` key would render a chip claiming a filter that is not running. Unchanged here.
- **A scroll-following or sticky CollectionNav.** `#694` raises it as a question. The answer is no
  for this slice: the nav already stays visible on narrow viewports by virtue of sitting outside the
  filter disclosure, nothing else in this app's storefront is sticky, and a sticky element competing
  with the filter panel inside a `md:w-60` column is a layout change that deserves evidence rather
  than a guess.
- **Pack size on the product card or detail page.** `#608` is about the four `#569` fields. The card
  already shows a derived unit price from the same columns (`#398`), so adding the raw pack size
  beside it is redundant display, not a gap.
- **Multi-select pack size.** One value, like `origin` and `brand`. Multi-select is a different
  interaction for every distinct-value facet at once, not a pack-size question.
- **Fixing `#689` for the existing query keys.** The new `packSize` key is array-safe by construction
  (above), but `status`, `q`, `category`, `minPrice` and the rest keep their current behaviour and
  stay `#689`'s scope.
- **Any schema change**, and therefore any migration. Every column this slice reads already exists.
- **`#397`'s already-shipped facets.** Origin, Brand, HMC, Vegetarian, Gluten-Free and Organic are
  filterable today; this slice does not rebuild them, it only makes four of them _visible_ (Part C).

## Open items carried forward

- **`#397` does not close on this slice alone** unless the reviewer agrees Pack Size was its last
  genuinely missing facet. The plan's position is that it was — the finding above walks every row of
  the issue's own gap table against the schema — but the issue's body should be corrected at
  `/document` rather than left asserting missing columns that exist.
- **`#684`** (real New Arrivals recency window) stays open and unstarted.
- **`#689`** (repeated query parameters 500 every list page) stays open; this slice neither fixes nor
  worsens it.
- **`#663`** (product variant model) remains the blocker under `#397`'s sibling `#399` and is
  untouched here — pack size as a _facet over existing net content_ is not the same thing as a
  variant model, and this slice does not pretend to advance it.
- **The pack-size predicate ships deliberately UNINDEXED, and that is a real tension with this
  slice's own "no migration" framing — so it is stated here rather than left to be discovered.**
  `#569` gave its two high-cardinality facets an index each (`@@index([vendorId, isActive, brandId])`
  and `@@index([vendorId, isActive, origin])`) while deliberately giving the dietary booleans none,
  on the reasoning its schema comment records: "a boolean splits the table roughly in half, so an
  index earns little and costs on every write." Pack size is high-cardinality and therefore looks
  like the indexed case, not the boolean one. It is left unindexed anyway because adding one means a
  migration, and a migration means GAP-011 — whose spurious `DROP INDEX` has fired on seven
  consecutive generations. At roughly 2,000 products this is the same "insurance rather than a
  present emergency" `#670` part 3 recorded for the ordering index, and the existing
  `@@index([vendorId, isActive, basePrice])` and category indexes already narrow most real queries
  before the pack-size predicate is reached.

  **MEASURED AT BUILD, and the predicted sequential scan is real — so the decision was reopened
  rather than assumed.** The dev branch carries no net content at all (`#697`), so the measurement
  needed a temporary fixture: 800 of Aheed's 2,080 active products were given net content across
  four pack sizes, `EXPLAIN (ANALYZE, BUFFERS)` was run against the exact predicate and ordering
  `findPage` uses, and every fixture row was reverted afterwards (verified: 0 products left
  carrying net content). Result for the 200-product `500-GRAM` case:

  > `Seq Scan on "Product"` … `Rows Removed by Filter: 1883`, then a `top-N heapsort`.
  > **Planning 1.291 ms, Execution 0.487 ms, `Buffers: shared hit=93`, no `read`.**

  So: a sequential scan, and **not** a performance problem. The whole table is ~87 buffers and
  entirely in cache — Postgres picks a scan here because at this size a scan genuinely is cheapest,
  and an index would very likely not be chosen even if it existed. For scale, `#670` part 3 added
  its index against a **12.063 ms** Seq Scan; this one is **25x faster than that already**. Adding a
  migration — and a GAP-011 round — to save under half a millisecond would be the worse trade.

  **The decision therefore stands, on evidence rather than on the paragraph above, and the threshold
  is now known:** execution scales roughly linearly with catalogue size from here, so ~20,000
  products puts this around 5 ms and ~200,000 around 50 ms. Revisit at the first of those, or sooner
  if a vendor's catalogue grows faster than Aheed's. A follow-up issue for the index is filed at
  `/document` carrying these numbers, so the next reader argues with the measurement rather than
  repeating it.
