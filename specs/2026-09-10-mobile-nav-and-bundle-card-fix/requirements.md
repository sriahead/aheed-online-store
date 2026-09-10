# Mobile nav visibility and Value Bundles card size (requirements / acceptance criteria)

Closes `#718` and `#719`. No schema change, no migration.

R1. `components/layout/Header.tsx`'s "Shop" (`/categories`) link's className contains no `hidden`
utility — it renders in the DOM (though its text label may be visually hidden) at every viewport
width, on every non-portal route.

R2. `components/layout/Header.tsx`'s "Shop List" (`/shop-your-list`) link's className contains no
`hidden` utility, on every route where it already rendered before this slice (non-portal,
non-landing).

R3. Both links' visible text (`Shop`, `Shop List`) is wrapped in an element carrying
`hidden sm:inline` — hidden below the `sm` (640px) breakpoint, visible from it up — while each
link's icon (`Store`, `ShoppingBag`) has no such wrapper and is always visible.

R4. `components/layout/PostcodeChecker.tsx`'s `badge` variant's className contains no `hidden`
utility — it renders (icon + postcode text) at every viewport width whenever `postcode` and
`deliverable` are both non-null, on every route where it already rendered before this slice
(non-portal, non-landing).

R5. `components/bundle/BundleRow.tsx`'s `itemWidthClassName` is byte-identical to
`components/product/ProductRow.tsx`'s: `[&>*]:w-40 [&>*]:shrink-0 sm:[&>*]:w-44 lg:[&>*]:w-52`.

R6. No other prop or class on `BundleCard`, `ProductCard`, `Header`, or `PostcodeChecker` changes as
part of this slice — `git diff origin/staging` for this branch touches only the specific className
strings named in R1-R5, plus `CHANGELOG.md` and this `specs/` directory.

R7. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.

R8. `CHANGELOG.md` updated (Gate 4).
