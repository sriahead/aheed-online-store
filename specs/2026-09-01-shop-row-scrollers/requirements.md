# One horizontal-scroll affordance across the shop page (requirements)

Issue **#511**, deferred from `#501`. `/categories` showed one row that scrolled (the department
strip) and three wrapping grids. The row width was the unsettled part: a scroller over `take: 4`
items has nothing to scroll, and widening changes what two queries cost on every shop-page render.
**8 was chosen** — enough to overflow a four-column desktop grid, at half the added fetch of 12.

R1. `components/layout/HorizontalScroller.tsx` exists, is a client component, and renders a left and
    a right arrow button plus a scrollable track containing its `children`.

R2. Its arrows carry accessible names derived from a required `itemLabel` prop, in the form
    `Scroll <itemLabel> left` / `right`.

R3. It renders a `<ul>` track when `as="ul"` and a `<div>` track otherwise.

R4. An arrow press scrolls by an explicit `step` when given, and otherwise by ~90% of the track's
    visible width, never less than 200px.

R5. The track keeps the hidden-scrollbar / native-scroll fallback: it carries the `no-scrollbar`
    class and `overflow-x-auto`, so it still scrolls by touch and trackpad without JavaScript.

R6. `ProductRow`, `BundleRow` and `DepartmentScroller` all render through `HorizontalScroller`;
    no second scroller implementation remains in the codebase.

R7. `BundleRow` passes `as="ul"`, so `BundleCard`'s `<li>` stays inside a list.

R8. `DepartmentScroller` passes `step={260}` and its original arrow placement, so its behaviour and
    appearance are unchanged by the extraction.

R9. `ProductRow` and `BundleRow` derive `itemLabel` from their own `title`, so no two scrollers on
    one page share an arrow name.

R10. `components/product/ProductCard.tsx` and `components/bundle/BundleCard.tsx` are unmodified by
     this slice; item width is applied by the track.

R11. `app/(storefront)/categories/page.tsx` fetches both product rows with `take: 8`.

R12. On a live render of `/categories`, all arrow accessible names are distinct, there are four
     scrollable tracks, exactly one of which is a `<ul>`, and the New Arrivals row holds 8 cards.

R13. `CHANGELOG.md` updated (Gate 4).

R14. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
