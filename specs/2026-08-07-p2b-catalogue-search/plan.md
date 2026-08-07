---
id: p2b-catalogue-search
title: "P2b — Catalogue Search & Filters (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-08-07
visibility: internal
summary: Plan for the second P2 slice — global search across products plus price/availability filters on both search and category pages — layered on P2a's schema and repositories.
tags: [p2, catalogue, search, filters]
related: [architecture, roadmap, p2a-catalogue-browsing]
---

# P2b — Catalogue Search & Filters (plan)

**Goal:** let a visitor find products by name/description across the whole catalogue, and narrow
either search results or a category's listing by price range and availability — without adding
any search infrastructure beyond what `specs/architecture.md` already sanctions for this stage.

**Trigger — why this is split from P2a:** confirmed during `/propose`: bundling search/filters
into P2a would have made that slice too large to validate cleanly. Same reasoning as the P1a/P1b
split. Also confirmed during `/propose`: scope is **both** a global search (new route) and
filters on the existing category page, not one or the other — the issue's original wording left
that ambiguous.

**Scope (this slice):**
- `lib/repositories/products.ts`: a new `search()` method (global, across all categories, cursor
  paginated exactly like `listByCategory`) and optional filter parameters
  (`minPricePence`/`maxPricePence`/`inStockOnly`) added to *both* `search()` and the existing
  `listByCategory()` — one shared filter shape, not two parallel ones.
- Search matching: plain Postgres case-insensitive `contains` on `Product.name`/`description`
  (Prisma `mode: "insensitive"`) — no trigram index, no dedicated search service. Matches
  `specs/architecture.md`'s explicit deferral of both until the catalogue actually grows; this
  slice doesn't touch that decision, it fulfills what was already decided.
- `app/(storefront)/search` — new route, `?q=` (required to show results; empty shows just the
  form), plus the same `?minPrice=`/`?maxPrice=`/`?inStock=` filter params as below.
- `app/(storefront)/categories/[slug]` extended (not replaced) to also accept
  `?minPrice=`/`?maxPrice=`/`?inStock=`.
- **Corrected from `/propose`'s assumption**: no client component, no `features/catalogue/`
  content. P2a set a zero-client-JS precedent (plain server components, `<Link>`-based
  pagination) — a search box doesn't inherently need debounced live-search; a plain
  `<form method="GET">` matches the established pattern and is simpler. Search/filter form pieces
  land in `components/product/` alongside `ProductCard`/`ProductImageGallery`, following P2a's
  precedent, not `features/catalogue/`'s aspirational sketch. `features/catalogue/` stays an
  empty `.gitkeep` after this slice too — nothing in P2a or P2b has actually needed client-side
  interactivity yet.
- `components/product/parse-price-input.ts`: pure counterpart to the existing `formatPrice()` —
  parses a user-typed pounds string (`"3.20"`) into integer pence for the repository layer
  (`320`), or `undefined` for blank/invalid input. Unit-tested, same pattern as `formatPrice`.
- One shared `components/product/ProductFilterForm.tsx` (server component, plain GET form) used
  by both routes — price min/max, in-stock checkbox, and (only on `/search`) the query input.
  Preserves whichever of its own fields are already set; does not carry a stale pagination cursor
  forward on resubmit (a filter change naturally restarts pagination at page 1).

**Deliberately excluded:**
- Trigram/full-text search index or a dedicated search service (Meilisearch/OpenSearch) — still
  deferred per `specs/architecture.md`, not this slice's call to make.
- Sorting beyond the existing `createdAt`-based order — not requested.
- Category as a filter *on* `/search` (e.g. narrowing global search to one category) — the issue
  scoped category filtering to the existing `/categories/[slug]` route (category is implicit
  there via the URL), not as an additional `/search` filter. Can follow later if wanted.
- Any cart/checkout affordance — P3.

**Open items carried forward:** none new. Production/staging parity (secrets, seed data) is
already fully resolved as of P2a; this slice adds no new environment dependency.
