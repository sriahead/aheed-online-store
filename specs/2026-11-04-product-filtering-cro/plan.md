---
id: 2026-11-04-product-filtering-cro-plan
title: "Product Filtering Component CRO & UX Improvements (Plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-11-04
visibility: internal
summary: Overhaul storefront product filtering and discovery using ethical consumer psychology and CRO. Adds storefront sorting, quick filter pills, price ranges, live counts, and zero-result relaxation with no-JS fallback.
tags: [storefront, filters, cro, ux, psychology, sorting, facets]
related: [2026-08-07-p2a-catalogue-browsing, 2026-08-07-p2b-catalogue-search]
---

# Product Filtering Component CRO & UX Improvements (Plan)

Issue `#1424`. Approved by the user on 2026-11-04.

**Goal:** Create an intuitive, high-converting, and consumer-psychology-led product discovery experience across `/categories/[slug]` and `/search`. Shoppers can sort products (by price, best value, customer rating, or newest/relevance), toggle high-intent quick filters with one tap, select intuitive price brackets, see live product availability counts, and recover gracefully from over-constrained zero-result states — all with 100% no-JavaScript progressive enhancement fallback.

## Four-Phase Scope

1. **Phase 1: Storefront Sorting (CRO Core)**
   - Add `sort` parameter to repository `ProductFilters`, `findPage`, `list`, and `search`.
   - Support `newest`, `relevance`, `price_asc` (Price: Low to High), `price_desc` (Price: High to Low), `unit_price_asc` (Best Value: per unit), `rating_desc` (Customer Rating).
   - Add accessible `<ProductSortSelect />` component on both category and search pages.
   - Preserve `sort` across pagination and active filter changes.

2. **Phase 2: Quick Filter Bar & Price Presets (Behavioural Economics)**
   - Responsive horizontal 1-tap quick filter pill rail above products for high-intent grocery attributes: *On Offer*, *In Stock*, *Halal*, *Organic*, *Fresh*, *Vegetarian*.
   - Preset price anchors (*Under £2*, *£2 – £5*, *£5 – £10*, *£10+*) in the filter panel to relieve decision fatigue.

3. **Phase 3: Live Facet Product Counts (Density Foresight)**
   - Update `getAvailableFacets()` to compute genuine product counts for boolean facets.
   - Display counts in `ProductFilterForm` (e.g., `Halal (14)`, `On offer (6)`).

4. **Phase 4: Zero-Result Smart Relaxation**
   - Provide an intelligent recovery banner when an active filter combination produces 0 items.
   - Offer 1-click links to relax the most restrictive filter (e.g. price range or brand) or clear all filters.
