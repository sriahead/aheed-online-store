---
id: search-category-select-removal-plan
title: "Search category select removal (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-10
visibility: internal
summary: Remove the redundant Category select from /search's filter panel, and revert the page's category read from the full tree (#681) back to top-level-only, since nothing else on the page needs the tree shape once the select is gone.
tags: [storefront, layout, search]
---

# Search category select removal (plan)

Closes `#704`. The store owner flagged the `Category` `<select>` in `/search`'s filter panel as
redundant — the department icon strip (`DepartmentScroller`) at the top of every browse page
already covers department browsing by linking to `/categories/[slug]`, and this control duplicated
that inside the panel.

**Goal:** remove the control, and undo the read-shape change it required, without touching any of
the underlying `category` query-string filtering that other entry points (recovery/suggestion
links) still rely on.

**Scope (this slice):**
- `components/product/ProductFilterForm.tsx`: remove the `Category` `<label>`/`<select>` block and
  the `categories`/`categoryGroups` plumbing that only fed it (`toCategoryOptionGroups`,
  `StorefrontCategoryNode` import, the `categories` prop). **`category` gets a hidden passthrough
  field back, mirroring `featured`'s existing one** — a plain `<form method="GET">` submits only
  the fields it contains, replacing the whole query string, and `#501`/`#568` are the standing
  record of what happens without one: a shopper who arrives at `/search?category=X` (from a
  recovery/suggestion link) and then applies any other filter would silently lose the category
  scope on the very next "Apply". The select's removal reopens exactly the case `#681`'s comment
  said had "expired" (the select owning the field made a hidden one redundant); with the select
  gone, the hidden field is what keeps the invariant true again. `category` stays in the form's
  `searchParams` type for this reason — narrowed to read-only passthrough, not a control.
- `app/(storefront)/search/page.tsx`: `#681` changed the category fetch from
  `categoryRepo.listTopLevel()` to `categoryRepo.listTree()` specifically to feed this select
  (`categoryTree`, passed to `FilterPanel` as `categories`). Every other consumer on the page
  (`DepartmentScroller`, `SearchRecoveryNotice`, `SearchSuggestionsNotice`) only ever used
  `allCategories`, the top-level-only derivation (`categoryTree.filter(c => c.parentId === null)`)
  — exactly what `listTopLevel()` already returns directly. Revert to `listTopLevel()`, drop the
  `.filter(...)` derivation, and drop the `categories={categoryTree}` prop passed to `FilterPanel`.
  This restores the pre-`#681` read shape for this one page: one category query returning
  top-level-only rows, not a tree.

**Deliberately excluded:**
- **No change to the underlying `category` query-string filtering.** `/search/page.tsx`'s
  resolution of `params.category` → `categoryIds` (via `getBySlug`), `FilterChips`'s removable
  `category` chip, and `search-href.ts`'s `categoryFilterHref` (used by
  `SearchRecoveryNotice`/`SearchSuggestionsNotice` to link into a category from within a zero- or
  weak-result search) all stay exactly as they are. A shopper who reaches `/search?category=X`
  through one of those links still gets a correctly filtered, chip-labelled result — there is
  simply no manual selector for it in the panel any more.
- **No change to `/categories/[slug]/page.tsx`.** It never passed a `categories` prop to
  `FilterPanel` in the first place (the category there is the route, not a form field), so it is
  unaffected by either edit.
- **No change to `DepartmentScroller`, `CollectionNav`, or any other browse-page chrome.**
- **No change to `lib/catalogue-form.ts`'s `toCategoryOptionGroups`.** It stays in use by
  `components/staff/ProductForm.tsx` and `app/(admin)/staff/products/page.tsx`; only its import
  into `ProductFilterForm.tsx` is removed.

**Open items carried forward:** none.
