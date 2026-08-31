---
id: storefront-subcategory-navigation
title: "Storefront subcategory navigation: making an admin-created subcategory reachable (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-31
visibility: internal
summary: Renders a category's existing children (already fetched by getCategoryBySlug) as clickable subcategory links on its own storefront page, so subcategories and the products assigned to them — whether from #489's seed or created live via the staff panel — are actually reachable by a shopper browsing normally.
tags: [storefront, catalogue, navigation, ux]
related: [roadmap]
---

# Storefront subcategory navigation (plan)

**Goal:** make a category's subcategories — and anything an admin assigns to them — reachable by a
shopper clicking through the site normally, not only by typing a URL or using search.

## What is actually true today

Verified against the repo and live staging on 2026-08-31, not assumed:

- `lib/repositories/categories.ts`'s `getCategoryBySlug` already fetches `children` and its own
  comment says this two-level fetch **"is the only shape the storefront can render."** The data has
  always been available to the page.
- `app/(storefront)/categories/[slug]/page.tsx` never reads `category.children`. Confirmed by
  reading the file: it destructures `category.name` and passes `category.id` to
  `products.listByCategory`, and nothing else.
- No component anywhere renders a link to a subcategory's `/categories/{slug}` URL.
  `DepartmentScroller` (the only site-wide category nav) takes `listTopLevel()`'s output, which is
  `parentId: null` only, by design.
- `listProductsByCategory` filters on an exact `categoryId` — not recursive into children. This
  is deliberate and unchanged: a department's own directly-assigned products and a subcategory's
  products are two different, correctly-scoped result sets.
- Confirmed live on staging after #489 seeded 27 Aheed subcategories + 2,000 generated products:
  `/categories/groceries` (reachable via the department scroller) shows its 2 curated products only;
  `/categories/rice-grains` (one of its children) correctly shows 12 products — but nothing links to
  it. `/search?q=noodles` does surface generated products correctly, since search is not
  category-scoped.
- The admin side already works: `components/staff/CategoryForm.tsx` has a working parent picker
  (`<select name="parentId">`), so staff can already create a subcategory and assign products to it
  today. The gap is entirely on the storefront read side.
- The page is `export const dynamic = "force-dynamic"` and staging's actual response headers carry
  `cache-control: private, no-cache, no-store, max-age=0, must-revalidate` with no `cf-cache-status`
  — there is no caching layer to invalidate. Anything an admin saves is live on the next request.
  So "dynamically refresh in the UI" is already true structurally; the missing piece is purely that
  the UI never renders the data it already has.

## Scope (this slice)

**Render `category.children` as a subcategory navigation section** on
`app/(storefront)/categories/[slug]/page.tsx`, positioned above the product grid, only when
`children.length > 0`. Each entry links to `/categories/{child.slug}`.

Extracted into its own small presentational component,
`components/product/SubcategoryLinks.tsx` (`subcategories: CategorySummary[]` — named
`subcategories`, not `children`, to avoid aliasing React's special `children` prop), matching the
existing pattern of `DepartmentScroller`/`DepartmentHero` — server-fetched data passed down as
props, unit tested in isolation. No repository, service or schema change: `getCategoryBySlug`
already returns exactly what the component needs.

A subcategory itself has no children of its own (the tree is capped at two levels), so this can't
recurse and doesn't need to guard against it structurally — the type it receives is already one
level of `CategorySummary[]` (`CategoryWithChildren.children`, not `CategoryWithChildren[]`).

## Deliberately excluded

- **The persistent-header mega-menu (#394).** That is sitewide navigation chrome shown on every
  page; this is one page's own content area, rendering data that page already fetches. Landing this
  does not reduce #394's scope or duplicate its eventual work — a mega-menu will still be built on
  top of `listTopLevel()`/`getBySlug()` the same way this does.
- **Making `listProductsByCategory` recursive into children.** A department page showing its own
  direct products is correct, existing, tested behaviour; blending in every child's products would
  double-count relative to visiting the child directly and would change what R5 of #489 already
  verified live. The fix here is discoverability, not a different product-listing semantic.
- **Breadcrumbs from a subcategory back to its parent.** A real UX improvement, but not required to
  fix "subcategory content is unreachable" — the department scroller already stays visible on the
  subcategory page (same layout, `activeSlug` highlights the parent-less child correctly as
  "no active department" today, which is a separate, smaller cosmetic gap not blocking this fix).
- **Any change to the admin/staff panel.** `CategoryForm`'s parent picker already works; this slice
  touches the storefront read path only.

## Open items carried forward

- **`DepartmentScroller`'s `activeSlug` doesn't highlight anything when viewing a subcategory page**
  (it only matches a top-level slug). Minor and cosmetic — noted here rather than silently left
  unrecorded, not filed as its own issue since it's a one-line, low-value follow-up a future slice
  touching that component can pick up incidentally.
