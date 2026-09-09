---
id: storefront-browse-consolidation-plan
title: "Storefront browse consolidation — one filter surface, collection entry points (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-09
visibility: internal
summary: Replaces the two competing department pickers on /search with a single category control inside the filter panel, adds Value Bundles, New Arrivals and Featured entry points to that panel, and retires the hidden category passthrough field the old split required.
tags: [storefront, search, filters, categories, ux]
---

# Storefront browse consolidation — one filter surface, collection entry points (plan)

**Goal:** `/search` should offer exactly one place to choose a department, and that place should be
the filter panel the page already calls "Search and filters". Shipping this removes a duplicated
control the store owner flagged by screenshot, and makes the sidebar able to express the filter
that dominates the page.

## Why this exists

`app/(storefront)/search/page.tsx` renders **two** department pickers, one directly above the
other:

- `DepartmentScroller` (line 182) — the arrow-scrolled strip of departments.
- `CategoryDrillDown` (line 189) — a wrapping row of chips immediately below it.

Both set the same `category` query parameter. The owner's screenshot circles the second.

The panel beside them has no category control at all. `category` survives a submit only as a
**hidden passthrough field** (`components/product/ProductFilterForm.tsx:73`), added by `#568` with
a comment stating plainly why it has to exist: the choice is made from a link beside the results,
not from a control in the form, so without the hidden field pressing "Apply" would silently widen
the shopper back to the whole catalogue. That hidden field is a symptom of the split this slice
closes, not a feature.

## Scope (this slice)

**1. A real category control in the panel.** `ProductFilterForm` gains a labelled `select` element
named `category`, rendering one `optgroup` per department with the department itself selectable
("All of" the department name) followed by its subcategories — the same shape `/staff/products`
already uses for its own category filter (`#630`). Option values are category **slugs**, because
that is what `/search` reads (`categoryFilterHref` sets a slug, and `getBySlug` resolves it).

**2. The hidden `category` field is removed in the same change.** Leaving it alongside a real
control would submit the key twice. The `featured` hidden field **stays** — see Deliberately
excluded.

**3. `CategoryDrillDown` is removed from `/search`, and the component deleted.** `/search` is its
only call site. Its two-level behaviour (departments always, the selected department's children
once one is chosen) is preserved by the grouped select, which shows every department and every
subcategory at once rather than requiring a drill-down round trip.

**4. One category read, widened rather than added.** The select needs the full active tree;
`listTopLevelCategories` returns departments only (`parentId: null`). A new
`listCategoryTreeForStorefront` returns every active category with its `parentId`, and **replaces**
the `listTopLevel()` call on `/search` — `DepartmentScroller` takes the top-level rows derived from
the same result. The page's category query count is unchanged, not increased.

**5. Collection entry points in the panel.** A short navigation list at the top of the panel:
"All products" to `/search`, "New Arrivals" to `/search`, "Featured Products" to
`/search?featured=1`, "Value Bundles" to `/bundles`. These are links, not form controls — they
change which listing you are on, which a `GET` form submitting to the current path cannot do.

**6. `/bundles` gains the shared browse chrome** — `DepartmentScroller` and the same collection
list — so it stops reading as a different site. It does **not** gain `ProductFilterForm`; see
below.

**7. `toCategoryOptionGroups` becomes generic** (`lib/catalogue-form.ts`), so the storefront can
reuse it without losing `slug` at the type level. Its existing admin call sites are unchanged by a
widening from a fixed `CategoryOption` parameter to a type parameter constrained by it.

## Two things the owner asked for that the data model cannot give, stated plainly

**Bundles cannot be filtered by category, or by anything else in the panel.** `Bundle`
(`prisma/schema.prisma`) has **no** `categoryId`, and none of the panel's predicates — price,
in-stock, halal, fresh, organic, origin, brand — exist on a bundle at all. A bundle is a curated
set spanning departments; that is `#347`'s modelling decision, not an oversight. So "show the
results with the normal category filters" is not achievable for bundles without inventing a
category relation for them, which is a schema change and a merchandising decision, not a UI fix.
What `/bundles` gets instead is the same chrome and the same way back out to a filtered product
listing. If bundle-level faceting is genuinely wanted, it needs its own `/propose`.

**New Arrivals and All products are already the same query.** `findPage`
(`lib/repositories/products.ts`) orders **every** browse listing by `createdAt desc, id desc`, so
`/search` with no query is already the newest-first listing. The shop page's New Arrivals row is
`list({ take: 8 })` — the same query, capped at eight. Its "View all" pointing at `/search` is
therefore already correct; what is missing is that nothing on the destination says so.

This slice **does not invent a `collection=new` parameter**. A key that changes no predicate would
render a removable chip claiming a filter that is not running, and this codebase has an explicit
ruling against exactly that: `filter-chips.ts`'s `labelFor` withholds a `category` chip when the
slug resolved to nothing, so that a chip cannot lie, and `#568`'s R15 fixed a live instance of it.
Instead the browse heading states the ordering, so the claim the page makes is true.

A **real** New Arrivals — products created inside a recency window — is a defensible product
feature and a different thing. It is deferred, not forgotten: see Open items.

## Deliberately excluded

- **A recency-window New Arrivals filter.** Reasoning above. Deferred to a follow-up issue.
- **Bundle faceting, or adding a category relation to `Bundle`.** Schema change plus a
  merchandising decision.
- **The `featured` hidden passthrough field.** It stays exactly as `#501` wrote it. No visible
  control owns `featured` — the collection link is a navigation, not a form input — so removing
  the hidden field would reintroduce the precise bug `#501` fixed. Only `category` changes here,
  because only `category` gains a control.
- **`#601`, the three unsynchronised filter-key lists.** Flagged as possibly load-bearing at
  `/propose`, on the assumption this slice would add a query key. **It does not** — the category
  control reuses the existing `category` key, and the collection links reuse `featured` and a
  route. With no new key the trap is not triggered, and fixing it here would be unrelated work.
  Recorded so the deferral is a decision rather than an omission.
- **A category control on `/categories/[slug]`.** There the category is the **route**, not a
  parameter, and a `GET` form cannot navigate to a different path. That page keeps
  `SubcategoryLinks`, which duplicates nothing: it is the only category control on it. The two
  browse pages therefore have deliberately different sidebars.
- **`#512`** (the Apply button's hardcoded hex) and **`#658`** (the price-range en-dash is not
  hidden from assistive technology). Both live in `ProductFilterForm`, which this slice edits, and
  both are real. They are separate defects with their own issues, and folding unrelated fixes into
  a slice is how a diff stops being reviewable.
- **Category read memoisation.** That is slice 2 (`#682`, `#670`). This slice is careful not to
  increase the query count, but it does not reduce it either.

## Open items carried forward

- **`#684`** — a recency-window New Arrivals collection, filed at `/build-notes`. It must be
  sequenced **after `#601`**, because unlike this slice it genuinely does introduce a new query key
  and so does hit the three-unsynchronised-lists trap.
- **`#685`** — filed at `/build-notes`, discovered rather than deferred: `hooks/pre-commit` cannot
  distinguish a generated artefact from source, so every docs-only commit needs `--no-verify`.
- `#601`, `#512` and `#658` remain open and untouched.
- `#670` and `#682` carry the read-amplification work this slice deliberately leaves alone.
