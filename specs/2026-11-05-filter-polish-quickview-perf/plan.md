---
id: plan
title: "Product Filter Polish, Subcategory Icons, Quick View Performance & Filter Persistence (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-05
visibility: internal
summary: Implements four user-requested improvements to storefront product discovery — decluttering redundant filter inputs, adding visual icons to subcategories, accelerating Quick View to near-instant perceived latency, and persisting active filters and sorting across category and subcategory navigation.
tags: [storefront, filters, cro, subcategories, quickview, performance]
---

# Product Filter Polish, Subcategory Icons, Quick View Performance & Filter Persistence (plan)

## Context & Objectives

Following the storefront filtering overhaul in PR #1425, user testing identified four areas for improvement:
1. **Remove redundant filters:** Declutter the filter panel by removing duplicative search inputs and price preset pills from inside the form (now handled by `<QuickFiltersRail />`), grouping filters into clear semantic clusters.
2. **Subcategory icons:** Add semantic vector icons to subcategory pills in `<SubcategoryLinks />` matching the visual treatment of main categories in `<DepartmentScroller />`.
3. **Quick View performance:** Eliminate latency by passing `cdnBaseUrl` with initial product data (0ms instant visual render), adding in-memory caching and hover prefetching, and parallelizing `/api/products/quick-view` database queries.
4. **Category filter persistence:** Prevent active filters (dietary, price range, stock, sort) from being discarded when navigating between departments or subcategories via `<SubcategoryLinks />` and `<DepartmentScroller />`.

## Architectural Decisions

1. **`categoryNavHref` in `components/product/category-href.ts`:**
   Pure, unit-tested helper that builds `/categories/[newSlug]?${query}` retaining all active filters, dietary preferences, brand, and sort keys, while resetting `cursor` and `back` pagination offsets.
2. **Subcategory Icon Resolution in `components/product/category-icon.ts`:**
   Extends `categoryIconName` to map known subcategory slugs to semantic icons in `ICON_REGISTRY`, falling back to parent category icons or `tag`.
3. **Zero-Latency Quick View Hydration:**
   `openQuickView` accepts `(slug, initialProduct, cdnBaseUrl)`. The drawer renders immediately with full photographic packshots, price, and add-to-cart controls without waiting for network responses. Client cache stores fetched data in memory.
4. **Parallel API Execution:**
   `/api/products/quick-view` fetches product and session concurrently via `Promise.all`.
