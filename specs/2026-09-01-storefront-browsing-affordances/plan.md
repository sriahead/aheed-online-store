---
id: storefront-browsing-affordances
title: "Storefront browsing affordances — a browse mode for /search, working View all links, a /bundles page (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-01
visibility: internal
summary: Bare /search renders nothing because the whole grid is gated on a query, so the shop page's only View all is a dead end; this gives /search a browse mode, wires a View all onto every row, and adds the /bundles page one of them needs.
tags: [storefront, search, browsing, bundles, navigation]
related: [roadmap, storefront-browsing-ux-fixes, storefront-cards-pagination-tabs, architecture]
---

# Storefront browsing affordances (plan)

**Goal:** make every "View all" on the shop page reach a page that actually lists what it promised,
and stop an empty search box from producing a blank screen. Shipping this removes the last
navigational dead end found walking `/categories` on staging.

This is **slice A** of the three approved at Gate 1 on 2026-09-01 for the defects found reviewing
staging. Slice B was `#502` (product image integrity, shipped). Slice C is `#503` (admin catalogue
filter and latency). This slice closes **parts 1 and 2 of `#501` only** — see "Deliberately
excluded" for part 3.

## What is actually broken

Three findings, each confirmed against the code rather than taken from the issue text.

**1. Bare `/search` renders nothing at all.** `app/(storefront)/search/page.tsx` issues its query
inside `if (query)` and gates the result grid on `query &&`. With no `q`, no query runs and no grid
renders — the page returns 200 with the department strip, the filter sidebar and an empty content
column. `app/(storefront)/categories/page.tsx` passes `viewAllLink="/search"` on New Arrivals, a
bare URL with no `q`, so the shop page's one "View all" leads straight into that empty column. The
same dead end is reachable from the header: `components/layout/Header.tsx`'s `SearchForm` is a
`GET` form to `/search` carrying only `q`, so submitting it empty lands in exactly the same place.

**2. Only one of the three rows has a "View all" at all.** `categories/page.tsx` omits
`viewAllLink` on Featured Products, and `components/bundle/BundleRow.tsx` has no such prop to pass.
A shopper sees four featured products and a handful of bundles with no route to the rest.

**3. There is nowhere for the bundles "View all" to point.** No `/bundles` route exists.

**4. Nothing is featured, so the Featured Products row renders nothing.** Found while writing this
spec, not present in `#501`: `Product.isFeatured` is `@default(false)` in `prisma/schema.prisma`
and `prisma/seed.ts` never sets it — `isFeatured: true` appears zero times in the seed. `ProductRow`
returns `null` on an empty list, so in **any freshly seeded environment** the Featured Products row
is absent from `/categories` entirely, and a "View all" pointing at a featured listing would lead
to an empty page. `#501`'s text describes seeing four featured products on staging, which is
consistent with someone having toggled the flag through the admin panel there; that could not be
confirmed from this workstation, which has no network egress to the staging host. Either way the
seed is the thing that makes this row exist reproducibly, so this slice seeds featured products
rather than shipping a link into an empty listing.

## The decision that shaped this, and the one it had to overturn

The `ProductRepository.list` docstring in `lib/repositories/products.ts` records a decision from
**`#211`**:
`list()` was deliberately kept separate from `search()` rather than teaching `search()` to treat an
empty string as "no text filter", and the docstring justifies that by asserting that on the
`/search` page "an empty box means 'nothing searched yet', not 'browse everything'".

The **structural** half of that decision is correct and is preserved exactly: `searchProducts` in
`lib/repositories/products.ts` is not touched, its empty-query guard stays, and `list()` and
`search()` remain two functions. What changes is only the **page's** interpretation of an empty box
— `/search` now branches to `list()` instead of returning early. So the repository split survives
literally while the dead end goes away, and the docstring sentence asserting the opposite is
rewritten rather than left to contradict the code it sits next to.

The alternative considered and rejected at Gate 1 was a separate `/products` browse route, which
honours `#211`'s wording to the letter. It lost because it would duplicate the filter sidebar and
cursor pagination already working on `/search`, leave two near-identical listing pages to keep in
sync, and do nothing about the header's empty-submit dead end.

## Scope (this slice)

- **`app/(storefront)/search/page.tsx` gains a browse mode.** No `q` calls `products.list(...)`;
  a `q` calls `products.search(q, ...)`. Both pass the identical filter and cursor options, so
  price, stock and speciality filters plus keyset pagination work the same either way. The grid and
  the pagination control stop being gated on `query`. The heading distinguishes the two modes.
- **A `featured` search param**, threaded into the `isFeatured` field `ProductFilters` already
  carries, so Featured Products has a destination that lists featured products rather than
  everything.
- **`prisma/seed.ts` marks a few curated products featured per vendor**, for finding 4 above. Kept
  deliberately below the 12-item `/search` page size so a featured listing is visibly a subset of
  the catalogue rather than a full page that proves nothing. This follows the precedent set by
  `#496`, which added four real curated departments to the seed for the same class of reason — a
  browsing affordance that cannot be exercised because the data behind it does not exist.
- **`components/product/ProductFilterForm.tsx` carries `featured` through.** The form is a plain
  `GET` form, so submitting it replaces the whole query string with only the fields it contains.
  Without a hidden field, pressing "Apply" from a featured listing silently drops the constraint and
  dumps the shopper into the full catalogue. This is a correctness requirement of the `featured`
  param, not an optional extra.
- **An empty-state message** when a search or a filtered browse resolves to zero products. Without
  it, `/search?q=zzzz` and an over-narrow price filter both still produce the same blank content
  column this slice exists to remove — the dead end would survive via a different route.
- **`viewAllLink` on all three rows** of `/categories`: New Arrivals to `/search`, Featured Products
  to `/search?featured=1`, Value Bundles to `/bundles`. `BundleRow` gains the optional prop it
  currently lacks, rendering the same link markup `ProductRow` already uses.
- **A new `app/(storefront)/bundles/page.tsx`**, reusing `getBundlesForStorefront()` and
  `BundleCard`, and applying the same `hasAvailableItems` filter `BundleRow` applies so the page and
  the row cannot disagree about which bundles are renderable.
- **`nextPageHref` extracted** from the page into `components/product/search-href.ts` as a pure
  exported function, so the param round-tripping is unit-testable. `components/product/parse-price-input.ts`
  is the existing precedent for a pure helper living beside the components that use it.
- **`/search`'s title derived from the vendor.** The page currently exports a hardcoded
  `metadata = { title: "Search — Aheed Food Centre" }`, which renders that name under SriMart too.
  That is the same defect class `#239` spent a slice removing and that `categories/page.tsx` already
  fixed with a `generateMetadata` reading `getCurrentVendorProfile()`. It is in scope here only
  because this slice is rewriting that page's title and heading logic anyway; it is called out
  explicitly rather than folded in silently.

## Deliberately excluded

- **Part 3 of `#501` — horizontal scrollers on the product and bundle rows.** Ruled out at Gate 1.
  The two `ProductRow`s on `/categories` are fetched with `take: 4` and render in a four-column
  grid at `lg`, so a scroller over them would have nothing to scroll; delivering the department
  strip's affordance would have meant widening the rows to roughly 12 products, which is a
  page-cost change `#501` never asked for. The rows stay grids at their current width, and this
  slice therefore does **not** fully close `#501`. Filed as **`#511`**, carrying the
  row-versus-department-strip inconsistency; the PR references it rather than closing `#501` on a
  partial delivery.
- **A "Featured" checkbox in the filter sidebar.** `featured` is URL-driven only. Adding a visible
  control is a filter-UI decision `#501` did not raise, and the sidebar's contents are already
  per-vendor (`availableSpecialities`) in a way a flat "featured" toggle would cut across.
- **A bundle detail page.** `BundleCard` stays a `<div>` rather than becoming a link, exactly as
  `#498` left it. `/bundles` is a listing page whose cards add to the cart; it is not a gateway to
  per-bundle pages that do not exist.
- **Pagination on `/bundles`.** `listActiveBundles` takes no `take` or cursor and returns every
  active bundle for the vendor, so the page lists them all in one query. This is recorded because
  it is the reason `/bundles` shows the same set the row does — if the bundle count ever grows past
  a screenful, paginating it is a separate change to the repository function, not to this page.
- **`ProductFilterForm`'s hardcoded `bg-[#2E7D32]` Apply button.** A raw hex where a design token
  belongs, noticed while reading the file. Untouched — it is a token-discipline defect unrelated to
  this slice's navigation work, and changing it would need checking against `brandStyle()`'s
  per-vendor overrides (see `CLAUDE.md`'s design-tokens section). Filed as **`#512`**.
- **Any repository or schema change.** No migration, no new function in `lib/repositories/*`.
  `list()`, `searchProducts` and `listActiveBundles` are all already in use; this slice only changes
  which of them a page calls and when.

## Open items carried forward

- **`#501` stays open after this ships**, tracking its part 3 via **`#511`** — the product and
  bundle rows not sharing the department strip's scroller affordance, which needs the row width
  decided before the component work is worth doing.
- **The delivery board's `Phase` field offers only `M0` through `P8`** — no `P9`, `P9.1` to `P9.4`
  or `P10` — which is why this slice's issue reads `Phase: P8` while its GitHub milestone reads
  `P09.3`. Adding the options needs an `updateProjectV2Field` GraphQL mutation the `gh project`
  CLI does not expose. Board maintenance, not this slice; recorded so the mismatch is not read as
  this slice mis-filing its own phase. Filed as **`#513`**.
