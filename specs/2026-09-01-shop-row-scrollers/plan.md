---
id: shop-row-scrollers
title: "One horizontal-scroll affordance across the shop page (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-01
visibility: internal
summary: The shop page had one row that scrolled and three wrapping grids; the department strip's scroller is extracted and shared, and the product rows widen from 4 to 8 items so there is something to scroll.
tags: [storefront, ui, a11y, page-cost]
related: [roadmap, design-system]
---

# One horizontal-scroll affordance across the shop page (plan)

**Goal:** make `/categories` read as one page. `DepartmentScroller` was a horizontal arrow-scrolled
strip while the two product rows and the bundle row were wrapping grids, so the page showed one row
that scrolled and three that did not.

Issue **#511**, deferred from `#501` at Gate 1 precisely because it is not a component change on its
own.

## The decision this slice needed, and what was chosen

`app/(storefront)/categories/page.tsx` fetched both product rows with `take: 4`, and the grid was
four columns at `lg` — so a scroller over four items would have had nothing to scroll. Delivering
the affordance meant **also widening the rows**, which changes what those two queries cost on every
shop-page render. `#511` recorded 12 as discussed but explicitly **not settled**.

**Chosen: 8.** It still overflows a four-column desktop grid, so the scroller is real, at half the
added fetch of 12. The decision was the user's, taken explicitly rather than assumed — the issue is
clear that this is a page-cost question, not a styling one.

## Scope (this slice)

**`components/layout/HorizontalScroller.tsx`** (new) — the behaviour extracted from
`DepartmentScroller`: arrow buttons driving `scrollBy`, a hidden scrollbar, native touch/trackpad
scrolling as the no-JS fallback. It knows nothing about what it scrolls.

**A client component taking `children`.** `ProductRow` and `BundleRow` stay server components; their
cards are rendered on the server and passed through the boundary, so no card is pulled into the
browser bundle by this.

**`as: "div" | "ul"`.** `BundleCard` renders an `<li>`, so its track must be a `<ul>`. The scroll
container and the items' parent are necessarily the same element, so this cannot be solved by
nesting a list inside a scrolling div — and a `<li>` outside a list is the invalid-content-model
class of defect `#351` already tracks.

**Item width lives on the track, not the cards.** `[&>*]:w-…` on the track means `ProductCard` and
`BundleCard` are untouched by this slice.

**`itemLabel` is required, and each row passes its own title.** Three scrollers render on this page.
A fixed label gave two of them identically-named arrow pairs — see "What the live check caught".

**`DepartmentScroller` is refactored onto the shared component** rather than left alongside it,
which is the whole point: one affordance, one implementation. It passes its original `step={260}`
and arrow placement explicitly, so its feel is unchanged by the extraction.

## What the live check caught

The unit tests passed and the markup looked right, but fetching the real rendered page under
`npm run preview` showed **both product rows emitting `Scroll products left` / `right`** — two
identically-named arrow pairs on one page, indistinguishable to a screen reader. That is exactly the
ambiguity `itemLabel` was introduced to prevent, and the test asserting "names its arrows after what
they scroll" passed anyway, because it renders one scroller in isolation.

Fixed by deriving the label from each row's title, giving `Scroll new arrivals …`,
`Scroll featured products …`, `Scroll value bundles …` and `Scroll departments …`. Re-verified live:
all eight labels distinct.

**The transferable point: a per-component test cannot see a collision between two instances on a
page.** Only rendering the page can.

## Deliberately excluded

- **12 items.** Considered and rejected on cost — see above.
- **Any change to `ProductCard` or `BundleCard`.** Sizing is applied by the track.
- **Scroll-position affordances** — fading edges, arrows that disable at the ends, scroll-snap.
  `DepartmentScroller` never had them and adding them here would be new design, not a shared one.
- **The category-spotlight rows and `/bundles`.** This slice covers `/categories`' three rows plus
  the department strip.

## Open items carried forward

- The six S3/CDN secrets for the `production` GitHub environment, outstanding from `#518`.
- **`#351`** — the product card nests interactive controls inside an `<a>`. Untouched here, and the
  reason `as="ul"` was worth getting right rather than approximating.
