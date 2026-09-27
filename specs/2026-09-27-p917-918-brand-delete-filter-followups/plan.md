---
id: p917-918-brand-delete-filter-followups-plan
title: "#917/#918 — Brand deletion and vendor-filter follow-ups (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-27
visibility: internal
summary: Staff can delete a brand (with an in-use confirmation). Vendor filters gain multi-select, number ranges, an opt-in display on product cards, and text search over their values. One additive migration.
tags: [catalogue, filters, facets, brands, search, multi-tenancy, p10]
related: [architecture, p912-vendor-defined-filters-plan]
---

# #917/#918 — Brand deletion and vendor-filter follow-ups (plan)

`requirements.md` holds the checkable criteria; this file holds the reasoning. Gate 1 was approved by
the owner on 2026-09-27; the approved scope is a comment on both `#917` and `#918`.

**Goal:** close the one documented staff capability that does not exist (brand removal), and make
`#912`'s vendor filters good enough for a non-grocery catalogue: a shopper can tick several values,
narrow by a number range, see chosen values on the product card, and find a product by typing a value
it carries.

## Why this exists

- **`#917`.** `docs/staff-playbook/staff-tabs-guide.md` promises "Add a brand, rename it, and remove
  one." No delete exists anywhere (`lib/repositories/brands.ts`, `features/admin/brands.ts`,
  `components/staff/BrandManager.tsx`). `CLAUDE.md` requires every capability sentence to trace to a
  real control. Building the control, not deleting the sentence, keeps brands at parity with
  `/staff/attributes`, which already deletes filters and values.
- **`#918`.** `#912` shipped pick-one-from-a-list filters, deliberately narrow. Items 1–4 of `#918`
  are the four limits a real electronics tenant hits first. Item 5 (entering SriMart's production
  data) is an owner action, split to `#922`.

## Scope (this slice)

1. **Carry-forward first.** The branch's first commit adds the roadmap change-log row for PR #921
   (`#912`'s promotion) and corrects `docs/model-handoff.md`, which still said `#912` was staging-only.

2. **Brand deletion (`#917`).**
   - `deleteBrandForVendor(prisma, vendorId, { id, confirmed })` copies `deleteAttributeForVendor`:
     not found, or in use without confirmation, is refused. Otherwise it runs `brand.deleteMany`
     scoped by `vendorId` on the HTTP client (`deleteMany` is safe there per `CLAUDE.md`).
   - The existing foreign key `Product_brandId_fkey ... ON DELETE SET NULL` (migration
     `20260905130349_p2_6_catalogue_filter_facets`) turns every affected product's brand to "none".
     No product is deleted.
   - A `deleteBrand` action and a delete form on each brand row, with the same "Also remove it from
     N products" required tick as `/staff/attributes`. No browser `confirm()`.
   - A shopper's old `?brand=<deleted-slug>` link already behaves like any unknown slug (no
     predicate, no chip), because `getBrandBySlug` returns `null`. Nothing new is needed; the live
     proof checks it.
   - The brand's `imageKey` object, if any, is left in storage. Nothing renders it (`#394`), keys
     are immutable, and a storage delete path is not worth building for an orphan.

3. **Schema (one additive migration).**
   - `enum AttributeKind { LIST NUMBER }`.
   - `VendorAttribute` gains `kind AttributeKind @default(LIST)`, `unit String?` and
     `showOnCard Boolean @default(false)`. Existing rows become `LIST`, no unit, hidden on cards —
     exactly today's behaviour.
   - `ProductAttributeValue.optionId` becomes nullable, and the row gains
     `numericValue Decimal? @db.Decimal(10,2)` plus `@@index([vendorId, attributeId, numericValue])`.
   - A hand-added `CHECK` makes "exactly one of `optionId` and `numericValue` is set" a database
     fact. Prisma does not model `CHECK` constraints and does not propose dropping them.
   - The composite foreign key `[optionId, attributeId]` stays. With `optionId` null, Postgres's
     default `MATCH SIMPLE` skips the check, which is the intended behaviour for a number value.
   - **Why `Decimal(10,2)` and not scaled integers:** measurements are not money, so the pence rule
     does not apply, and `13.3"` must store exactly. `Decimal` is a provider-neutral Postgres type.
   - **Why a kind column rather than a second table:** one value row per product per filter still
     holds, the unique key `(productId, attributeId)` still enforces it, and every existing join
     (counts, cascade deletes, the facet probe) keeps working with one extra condition.

4. **Staff management (`/staff/attributes`).**
   - The add-filter form gains a type choice ("Pick from a list" or "Number") and an optional unit.
     **The type cannot change after creation**: converting a list filter with values into a number
     filter has no meaningful mapping, and a filter can simply be deleted and re-created.
   - A number filter has no values list and refuses "Add value".
   - Each filter's rename form gains "Show on product cards" and, for a number filter, the unit.
   - The product form renders a number input (`attributeNumber_<id>`) for a number filter, beside
     the existing selects (`attribute_<id>`) for list filters. A separate key prefix means a submitted
     value's kind is known from the key alone, before any database read.
   - The repository's existing ownership check (`assertOwnAttributeValues`) also refuses a value whose
     kind does not match its filter's kind. That is the only defence against a number stored on a
     list filter, since the `CHECK` constrains the row, not the filter it points at.

5. **Multi-select within one list filter (`#918` item 1).**
   - **The URL carries a repeated parameter, not a comma list:** `attr_colour=black&attr_colour=white`.
     This is a change from the proposal's comma form, found at Spec: the filter panel is a plain
     `<form method="GET">` with no JavaScript, and ticking two checkboxes with the same name makes the
     browser submit the name twice. A comma list could only be produced with client-side JavaScript.
   - This is a deliberate exception to `#689`'s treatment of repeated parameters. `#689`'s rule is
     "narrow the runtime array, never crash". It still holds for every fixed key and for range keys,
     where an array applies nothing. For a list `attr_*` key, the array is now the meaning.
   - Values within one filter combine with OR, and filters combine with AND.
   - Every href builder switches from `URLSearchParams.set` to `append`, so a second value survives
     "Next page", chip removal and "Clear all".
   - One chip per value. Removing one value keeps the others. A chip's React key becomes
     `attr_colour=black`, since two chips can now share a query key.
   - List filters render as a checkbox group per filter, not a select.

6. **Number range filters (`#918` item 2).**
   - URL keys `attr_<slug>_min` and `attr_<slug>_max`. Attribute slugs are `[a-z0-9-]`, so the
     underscore suffix cannot collide with a slug.
   - Each bound is a separate key, a separate chip ("Power: from 15 W", "Power: up to 65 W"), and a
     separate removal — the same model as `minPrice`/`maxPrice`.
   - A bound must match the same number rule as the product form (up to 8 digits and 2 decimals,
     not negative). Anything else, including a repeated bound, applies nothing and renders no chip.
   - A list key naming a number filter, or a range key naming a list filter, resolves to nothing.
   - The facet shows a number filter only when some product in the current context carries a number
     for it — the rule every facet follows.

7. **Values on product cards (`#918` item 3).**
   - Opt-in per filter (`showOnCard`, default off). Showing every value would crowd grocery cards,
     and the vendor knows which of its filters a shopper compares at a glance.
   - `productSummarySelect` adds the flagged values, so every card path (browse, category, search,
     featured rails) gets them from the one select. Aheed defines no filters, so its queries return
     the same rows and its cards are unchanged.
   - The card shows up to three values on one line, with the full "Name: Value" list in the `title`.

8. **Text search over filter values (`#918` item 4).**
   - The direct and broad search predicates also match a product whose **list** value's option name
     contains a search term. Number values are not text-searched.
   - The identity rung (name or category name only) is unchanged. The facet probe reuses
     `buildDirectSearchWhere`, so facets stay consistent with results.
   - **`directNameMatch` widens.** Before, a result set with no name match was "thin" and
     `SearchSuggestionsNotice` told the shopper the results were "loosely related". `/search?q=wired`
     on SriMart would then say that about three products that are exactly Wired. So a candidate
     carrying a matching filter value counts as a direct match. This costs at most one extra query,
     run only when the name check has already failed and candidates exist.
     `SearchQueryLog.directNameMatch` inherits the wider meaning.
   - Ranking (`lib/search-ranking.ts`) is unchanged: a product matched only through a filter value
     ranks with description-only matches.

9. **Seed.** SriMart's `Colour` shows on cards, and a new number filter `Power` (unit `W`) is set on
   three products. That gives every live-proof row real data on the dev database.

## Deliberately excluded

- **Changing a filter's type after creation.** Delete and re-create instead.
- **Showing the observed min/max of a number filter** as placeholders or a slider. Plain inputs only.
- **Negative numbers** in number filters.
- **Ranking filter-value matches above description matches**, or any change to
  `lib/search-ranking.ts`.
- **Search autocomplete** (`ProductSuggestion`) matching filter values.
- **Number values in text search.**
- **Deleting a brand's stored image object.**
- **Variants (`#398`)** and **merging the label booleans into vendor filters** — both unchanged
  standing decisions (`specs/architecture.md`).
- **SriMart production data entry** — owner action `#922`.
- **A comma-list URL form** for multi-select — replaced by repeated parameters (scope item 5).

## Known risks and how they are handled

- **Decimal crossing the server/client boundary.** Prisma returns `Decimal` objects, which React
  cannot serialise into a client component (`ProductCard` is a client component). Every numeric value
  leaves `lib/repositories/` as a string. `formatAttributeNumber` renders it.
- **A nullable `option`** breaks every reader that assumed one: `getProductBySlug`'s specifications,
  the facet grouping, the admin product detail map and the seed. Typecheck finds most of them; the
  facet probe also needs an explicit `optionId: { not: null }`, because Prisma's `distinct` would
  otherwise return one null-option row.
- **The migration touches the option foreign key.** Making `optionId` nullable may make
  `prisma migrate diff` drop and re-create `ProductAttributeValue`'s option foreign key. That is
  allowed. Anything else dropped is not — the `pg_trgm` trap (`CLAUDE.md`) applies as always.
  Generate with `prisma migrate diff`, never `migrate dev` (`#895`), and read the SQL.
- **`URLSearchParams.set` to `append`.** Forgetting one builder silently drops a second value one
  click later, the same shape `#601` removed. `tests/filter-params.test.ts` asserts it for every
  builder.
- **Implicit transactions.** Numeric writes use the same nested create (on `getPrismaWs()`) and the
  same `upsert`/`deleteMany` inside the existing update transaction. No new `createMany` or
  `updateMany` on the HTTP client. The brand delete is a `deleteMany`, which is safe on HTTP.
- **The `showOnCard` checkbox.** The rename form is a plain form, so an unticked box submits nothing
  and saving a rename with it unticked turns card display off. That is correct for a form that shows
  the current value, and is stated in the guide.
- **SriMart sign-in locally.** Better Auth refuses `srimart.localhost`, so signed-in proof runs on
  the Aheed host locally and on SriMart's staging host after merge, as it did for `#912`.

## Open items carried forward

- **`#918`** stays open until items 1–4 are in production. It is then closed with a comment pointing
  at `#922` for item 5.
- **`#922`** — SriMart production filter data (owner action).
- **`#398`** (variants) and **`#697`** (real-product net content) are unaffected.
