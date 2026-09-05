---
id: p2-6-catalogue-filter-facets-plan
title: "P2.6 slice 6 — catalogue filter facets: brand, dietary flags, country of origin, offers (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-05
visibility: internal
summary: Four new catalogue filter facets over a new Brand model, three dietary booleans, the existing origin column and an offers predicate, with HMC certification carrying provenance rather than shipping as a bare boolean.
tags: [p2-6, search, catalogue, filters, facets, brand, schema]
# related: [p2-6-search-autocomplete-and-filter-panel-plan, architecture, nfr-baseline]
---

# P2.6 slice 6 — catalogue filter facets: brand, dietary flags, country of origin, offers (plan)

The sixth and final slice of P2.6. Slices 1 to 5 changed what search **finds** (`#564` tokenised
matching, `#565` the zero-result ladder, `#566` the synonym dictionary) and how a shopper
**steers** it (`#568` autocomplete, filter panel, chips, drill-down). This slice changes what a
shopper can steer **by** — it adds facets, and the data behind them.

**Goal:** a shopper can narrow the catalogue by country of origin, dietary suitability, brand and
whether a product is on offer; and a store admin can populate every one of those fields. Shipping
this closes P2.6.

## Why the facets and the data land together

`#569` states the rule this slice is built around: **a filter over a column nobody can populate is
dead UI.** Three of the four facets need data that does not exist yet — there is no `Brand` model,
no dietary columns beyond `isHalal`/`isFresh`/`isOrganic`, and no admin control for any of it. So
each facet here is four things, not one: a column or model, an admin write surface, a seed fixture,
and only then a predicate plus a control plus a chip. Country of origin is the exception and the
cheapest win in the set — `Product.origin` already exists (`prisma/schema.prisma:419`), is already
selected (`lib/repositories/products.ts:355`) and is already admin-writable
(`components/staff/ProductForm.tsx:198`). It needs a predicate, a control and a facet only.

## Scope (this slice)

### Schema — one migration

- **`Product.isVegetarian`, `Product.isGlutenFree`, `Product.isHmcCertified`** — `Boolean`,
  `@default(false)`, the same shape as the existing `isHalal`/`isFresh`/`isOrganic`.
- **`Product.hmcReference String?`** and **`Product.hmcVerifiedAt DateTime?`** — see the HMC ruling
  below.
- **`Brand`** — vendor-scoped, `@@unique([vendorId, slug])`, carrying `name`, `slug` and
  `imageKey String?`. **`Product.brandId String?`** with a relation, nullable so the roughly 2,000
  existing products stay valid with no backfill.

`Brand` is a model rather than a denormalised `Product.brand` string for two reasons `#569` already
argues: `#394`'s mega-menu wants brand thumbnails, which needs an `imageKey` and a stable id that a
free-text column cannot carry; and free text drifts into near-duplicate spellings the moment two
staff members type it.

Dietary flags stay **booleans on `Product`** rather than becoming a generic attribute model. Seven
booleans is where that pattern starts to smell but is not past it: an attribute table would make
every facet an `EXISTS` join, harder to index, and would fork the codebase so `isHalal` and
`isVegetarian` are queried two different ways for no gain the shopper can see.

### The offers predicate, and the collision it would otherwise introduce

"On offer" is **one toggle matching either a markdown or a multi-buy tier** — `originalPrice` set,
or a `ProductPriceTier` exists. Both are genuine savings and a shopper filtering for offers wants
to see "3 for GBP 10" as much as a struck-through price. No new column.

`originalPrice: (not: null)` is **exact, not an approximation**: `lib/catalogue-form.ts:219` already
rejects a was-price at or below the current price, and both seeded offer products honour it. That
matters because Prisma cannot compare two columns in a `where` at all, so had the invariant not
already been enforced at write time this facet would have needed a stored flag.

**The clause must compose under `AND`, never as a bare top-level `OR`.** `fetchSearchCandidates`
(`lib/repositories/products.ts:593`) builds its `where` by spreading `buildFilterWhere(filters)` and
then `...predicate`. Offers is the first filter that would emit a top-level `OR` — and
`identitySearchPredicate` and `broadSearchPredicate`, the `#565` zero-result recovery rungs, also
emit a top-level `OR`, spread **second**. A shopper with "On offer" active whose query fell through
to a recovery rung would silently receive products that are not on offer, while the chip continued
to report the filter as applied. Both objects are valid `Prisma.ProductWhereInput`, so nothing in
`lint`, `typecheck`, `test` or `build` would say a word. This is the same class as the
`categoryId`-ordering trap `#568` documented four lines above the same function.

### HMC certification carries provenance

`#569` asked for `isHmcCertified` as a bare boolean. It ships instead as a flag **plus the data
that substantiates it** — `hmcReference` and `hmcVerifiedAt` — decided by the human at `/propose`.

HMC is a named third-party certifying body, and `#239` was a real incident in this codebase where
"100% Certified HMC Halal" rendered on a vendor with no basis for it. A staff-tickable boolean
re-creates that exposure per-product. The rule this slice enforces: **ticking the flag requires both
a reference and a verified date; unticking it clears both to null.** So `isHmcCertified` is never
true without provenance behind it, and the boolean stays a cheap indexed predicate.

No new RBAC tier is needed. `app/(admin)/staff/products/*` and every action in
`features/admin/catalogue.ts` already run `requireVendorRole("ADMIN")`, so certification fields are
admin-only by construction.

`hmcVerifiedAt` uses `input type="date"`, **not** `datetime-local`. That distinction is load-bearing:
`lib/local-datetime.ts` exists because a `datetime-local` input submits a naked wall-clock string
that ECMAScript interprets in the runtime's own zone, which meant a Worker and a UK laptop disagreed
by the summer offset. A **date-only** ISO string has no such ambiguity — the specification fixes it
to UTC — so this field needs no timezone machinery, and reaching for `local-datetime.ts` here would
add complexity to solve a problem this input shape does not have.

### Facets narrow to the current result context

`#568` established the pattern and the trap: each speciality probe excludes **all** speciality
filters from its own query, so ticking one never hides another and an active filter can always be
unticked. That generalises here. `SpecialityContext` becomes a facet context excluding **every**
facet field by type, and the probe set grows from three to roughly nine — six dietary and speciality
booleans, offers, distinct origins, distinct brands. They run in one `Promise.all`, so latency is
the slowest probe rather than the sum, but nine round trips through the HTTP adapter on a page that
already issues about seven sequential awaits is what makes the index review below load-bearing
rather than a formality.

`getAvailableSpecialities` is **renamed to `getAvailableFacets`** (with `AvailableSpecialities`,
`SpecialityContext` and `ProductRepository.availableSpecialities` renamed to match). It no longer
returns only specialities, and leaving the old name on a function that now reports brands and
origins would misdescribe it at every call site. `#568` set this precedent when
`directSearchPredicate` became `buildDirectSearchWhere` for the same reason.

Origin and brand are **distinct-value** facets, not booleans, so they render as `select` controls
with an "Any" default rather than checkboxes. That keeps the panel compact as a real catalogue grows
past a handful of brands, stays single-select (which is what makes one removable chip per facet
correct), and needs no client JavaScript.

### A filter key lives in three lists, and missing one strands the shopper

Found while grounding this slice, and the reason R28 to R30 exist. A filter key must be added to
**three independent lists**, none of which knows about the others:

1. `components/product/filter-chips.ts` — `FilterChipParams` and `REMOVABLE`, which decide whether
   a chip can remove it.
2. `components/product/search-href.ts` — `SearchHrefParams` and `CARRIED`, which decide whether it
   survives `/search` pagination **and** whether `categoryFilterHref` preserves it when a shopper
   drills into a department.
3. `app/(storefront)/categories/[slug]/page.tsx` — `buildHref`, a hand-written
   `if (params.X) qs.set(...)` chain that decides whether it survives category-listing pagination.

Omit a key from list 2 or 3 and the filter is silently dropped one click into "Next page", leaving
the shopper on a wider result set than the chips claim is applied. That is not hypothetical: it is
exactly the bug `#501` fixed for `featured` and `#568` fixed for `category`, and this slice adds six
keys at once. R30 pins lists 1 and 2 against each other with a test so the next facet cannot repeat
it. Consolidating all three into one definition is the obvious follow-up and is deliberately **not**
attempted here — it would touch both browse pages' pagination in a slice already carrying a new
model.

### Admin write surface

`components/staff/ProductForm.tsx` gains the three dietary checkboxes, the two HMC provenance fields
and a brand picker; `lib/catalogue-form.ts` parses and validates them, including the HMC rule above.
`Brand` gets its own CRUD at `/staff/brands` — create, rename, set image — backed by
`lib/repositories/brands.ts` with a `lib/brands-service.ts` sibling, per the repository split every
module in `lib/repositories/` follows: every repository export takes `prisma` and `vendorId`
explicitly and reads no request context, so `tests/repository-purity.test.ts` and
`tests/repository-client-injection.test.ts` both pass without an allowlist entry. The page is linked
from the staff hub (`app/(admin)/staff/page.tsx`) and refuses non-admins with `PanelRefusal`.

### Seed and measurement

`prisma/seed.ts` populates brands and sets the new flags on enough products that every facet is
reachable in a freshly seeded database — a facet with no qualifying row is invisible by design, so
an unseeded flag is indistinguishable from a broken one at `/validate`.

`scripts/measure-catalogue-queries.ts` already imports `getAvailableSpecialities`. It is extended to
cover the widened facet probe set, and `docs/developer-portal/nfr-baseline.md` records the
re-measurement against its existing 95.4 ms p95 figure for `searchProducts` at roughly 2,000
products, under the 400 ms target from `specs/mission.md`.

## Deliberately excluded

- **Pack size and weight as a facet.** The same modelling question as scaled weights and unit
  pricing, tracked as `#398` (P9.3). `unitLabel` is free text and unusable as a facet; guessing at a
  unit model here would have to be redone.
- **Brand landing pages and mega-menu thumbnails** — `#394`, P10. This slice adds `Brand.imageKey`
  so that work has somewhere to put an image, and nothing that renders one on the storefront.
- **Brand or dietary badges on `ProductCard`.** This slice is about filtering, not about what a card
  displays. Adding badges would change every storefront grid's visual density, which is a design
  decision nobody has made.
- **Backfilling brand or dietary data across the existing catalogue.** The seed covers new data; a
  real catalogue import is its own decision. Every new column is nullable or defaults to false
  precisely so no backfill is required.
- **Multi-select facets.** Origin and brand are single-select. Multi-select needs a different chip
  model (one chip per value, not per key) and a different predicate shape, and no evidence yet says
  a shopper wants two brands at once.
- **Separate "Reduced" and "Multi-buy" toggles.** Considered and rejected at `/propose` — a
  distinction most shoppers will not draw, at the cost of two more probes and two more chips.
- **A discoverability link for `/staff/search-synonyms`.** Found while grounding this slice: that
  page, shipped in `#566`, is reachable only by typing its URL — nothing in
  `app/(admin)/staff/page.tsx` links it. Real, but it belongs to that slice's surface, not this one.
  Raised separately rather than absorbed.

## Open items carried forward

- **`#397`** stays open for its pack-size analysis; this slice supersedes its filter half only.
- **`#583`** — `lib/search-synonym-proposals.ts` still carries the unfixed Workers AI
  `result.response` shape assumption that `#567` fixed in its own module. Untouched here.
- **`#599`** — `/api/search/suggest` is not actually edge-cached. This slice adds no facet awareness
  to the suggest route, so it neither helps nor worsens that finding.

## Risk this slice knowingly accepts

A split into a columns-only slice and a Brand-only slice was offered at `/propose` and **declined**;
`#569` ships whole. Recorded here so it does not have to be re-derived: this is the largest slice in
P2.6 — a new model with its own admin CRUD, three new columns, two provenance fields, four new
predicates, six new facet probes and a migration, in one pass — and with the HMC provenance ruling
it is larger than the issue body describes. `validation.md` is correspondingly long, and more than
one `/validate` round trip should be expected rather than read as slippage.
