---
id: storefront-cards-pagination-tabs
title: "Storefront cards, bundles heading, keyset pagination and subcategory tabs everywhere (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-31
visibility: internal
summary: Four more storefront browsing gaps found by live review right after #496 shipped -- BundleCard doesn't share ProductCard's visual treatment, the bundles section heading assumes food, category-page pagination has no way back, and a subcategory's own page loses all tab navigation.
tags: [storefront, catalogue, navigation, ux, pagination]
related: [roadmap, storefront-browsing-ux-fixes]
---

# Storefront cards, bundles heading, keyset pagination and subcategory tabs (plan)

**Goal:** close four more gaps found by actually clicking through staging right after #496 shipped
— make the bundle rail look like it belongs on the same site as the product grids, stop naming one
vendor's trade in shared copy, let a shopper go back a page, and stop losing subcategory navigation
the moment you click into one.

## What is actually true today

Verified against the repo and a live review of staging on 2026-08-31, after #496 shipped:

- **`BundleCard` shares none of `ProductCard`'s visual treatment.** `ProductCard` (P8.5a, #345) uses
  a deliberate `.skew-card`/`.skew-card-inner` hover-tilt effect defined in `app/globals.css`, applied
  to every product card on the site. `BundleCard` is a plain flat `<li>` with slightly different
  padding (`p-4` vs `p-3.5`) and no hover interaction at all — the only card style on the storefront
  that doesn't match.
- **The bundles section is hardcoded "Meal bundles"**, with a hardcoded subtitle "Everything for one
  meal...". `app/(storefront)/categories/page.tsx` passes `title="Meal bundles"` as a literal string;
  there is no `VendorConfig` field for it. The seeded "Kitchen Pack" bundle (cleaning/kitchen items,
  not food) is already wrong under this heading, and SriMart's bundles (electronics) would be wrong
  entirely — the same defect class as #239's per-vendor hardcoded copy audit, just not caught by it
  because bundles didn't exist yet at that time.
- **Category-page pagination has no way back.** `lib/repositories/products.ts` uses keyset (cursor)
  pagination exclusively — `findPage`'s own comment states "never OFFSET, per
  specs/architecture.md's pagination strategy" — and over-fetches by one row specifically to avoid a
  separate COUNT query. `app/(storefront)/categories/[slug]/page.tsx` only ever rendered a "Next
  page" link; there was no "Previous page" and no absolute page numbers were ever computed.
- **A subcategory's own page renders no subcategory tabs at all.** `SubcategoryLinks` (added in #494,
  extended in #496) only ever received a category's own `children`, which the schema guarantees is
  empty for a subcategory (the tree is capped at two levels). Clicking a subcategory link from a
  department's page lands you somewhere with zero way to switch to a sibling subcategory except
  navigating back to the department first.

## Scope (this slice)

**1. `BundleCard` gets `ProductCard`'s `.skew-card` treatment** — same wrapper structure
(`.skew-card-wrap` → `.skew-card` → two `.skew-card-inner` regions for the image and the content),
same border/radius/hover-border tokens, same `p-3.5` padding. Unlike `ProductCard`, the skewed
element stays a `<div>`, not a `<Link>` — there is no storefront bundle detail page to link to.

**2. The bundles section heading changes to a neutral default**, "Value Bundles", and its subtitle
drops the "one meal" framing. No `VendorConfig` field added — confirmed with the human that a fixed,
accurate default is the right scope here, not new per-vendor configurability (a bigger change: a
migration plus a staff-panel field, for one heading string).

**3. Keyset-compatible "Previous page"**, not absolute page numbers. The category page now tracks
the stack of cursors used to reach every prior page in a `back` query parameter (comma-joined,
page 1 represented as an empty segment) — no OFFSET query, no COUNT query, no server-side session
state, just URL-carried history. "Previous" pops the last entry off that stack; "Next" (unchanged
mechanically) pushes the current cursor onto it. Numbered pages (`1 2 3 … 8`) are deliberately not
built — see Deliberately excluded.

**4. `SubcategoryLinks` always renders the FULL sibling tab row.** `lib/repositories/categories.ts`'s
`getCategoryBySlug` now also selects `parent: { slug, name, children }` — non-null only when the
category itself is a subcategory. The page computes `tabs`/`parentSlug` from whichever is present
(a department's own `children`, or a subcategory's `parent.children`), and `activeSlug` from whatever
page is actually being viewed, so the same tab row renders on both a department's page and every one
of its subcategories' pages, with exactly one pill ever highlighted.

## Deliberately excluded

- **Absolute page numbers (`1 2 3 … 8`).** This app's pagination is keyset-only by architectural
  decision (`specs/architecture.md`), specifically to avoid the cost of `OFFSET` at scale and a
  separate `COUNT(*)` query per page load — the exact query pattern #489's 2,000-product catalogue
  exists to make expensive-at-scale queries observable. Computing "page 6 of 12" needs a total count
  a keyset page never fetches. Next/Previous is the standard compromise for keyset pagination in
  production systems (e.g. GitHub's own REST API), and is what "whichever option is feasible" (the
  human's own framing) resolves to here.
- **Making the bundles heading per-vendor configurable.** Confirmed with the human: a neutral fixed
  default is the right scope; a `VendorConfig` field is a separate, larger change if a real need for
  per-vendor bundle branding shows up later.
- **A storefront bundle detail page.** Not needed for the skew-card treatment (a `<div>` gets it just
  as well as a `<Link>`), and out of scope for this slice regardless.
- **Any change to `listProductsByCategory`'s aggregation itself** (#496's own scope) — this slice only
  changes how pagination and subcategory tabs are presented around it.

## Open items carried forward

- None blocking.
