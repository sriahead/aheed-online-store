---
id: bundles-page-layout-parity-plan
title: "Bundles page layout parity (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-10
visibility: internal
summary: Restructure /bundles to use the same two-column layout and product-grid breakpoints as /search and /categories/[slug], so Value Bundles reads as the same page as New Arrivals and Featured Products rather than a visually distinct one.
tags: [storefront, layout, bundles]
---

# Bundles page layout parity (plan)

Closes `#701`. The store owner flagged, with screenshots, that clicking "View all" from the Value
Bundles row lands on a page (`/bundles`) that looks nothing like clicking "View all" from New
Arrivals or Featured Products (`/search`, `/search?featured=1`): single column, `CollectionNav`
full-width, a 3-column grid of large cards — versus `/search`'s two-column layout (sidebar +
content) and 4-column grid.

**Goal:** make `/bundles` read as the same page as `/search`/`/categories/[slug]`, using the exact
layout and grid classes those pages already use, so a shopper doesn't experience Value Bundles as a
bolted-on, differently-designed section.

**Scope (this slice):**
- `app/(storefront)/bundles/page.tsx` gains the same `<div className="mt-6 flex flex-col gap-6
  md:flex-row">` two-column wrapper `/search` and `/categories/[slug]` use: `CollectionNav` moves
  into a left `<div className="md:w-60 md:shrink-0">` column (matching R2 from
  `specs/2026-09-09-storefront-browse-discovery-completion/`), and the heading, subtitle and bundle
  grid move into a right `<div className="flex-1">` column.
- The bundle grid's className changes from `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3`
  to `grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4` — the exact classes `ProductRow`'s grid
  and `/search`'s product grid already use.
- `DepartmentScroller` stays full-width above the two-column area, unchanged, matching both other
  pages.

**Deliberately excluded:**
- **No `FilterPanel`.** `Bundle` has no `categoryId` and none of that form's predicates (price,
  stock, halal, origin, brand) exist on a bundle — a bundle is a curated set spanning departments
  (`#347`). This was a deliberate decision recorded in the page's own comment when `#681` gave it
  the department strip; this slice does not reopen it. The left column carries `CollectionNav`
  alone.
- **No change to `BundleCard` or `BundleRow`.** `BundleCard` already shares `ProductCard`'s
  `.skew-card` treatment and already has one price plus an "Add all to basket" action — the
  reported mismatch is the page's own layout wrapper and grid density, not the card's content or
  styling. `BundleRow` (the `/categories` row itself) is untouched; only its "View all" destination
  changes shape.
- **No change to `getBundlesForStorefront`, `hasAvailableItems`, or any repository/query.** This is
  page-layout only — no schema change, no migration.

**Open items carried forward:** none. This is fully resolved by the layout change; there is no
follow-up this slice defers.
