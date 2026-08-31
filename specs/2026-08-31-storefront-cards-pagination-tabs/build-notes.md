# Storefront cards, bundles heading, keyset pagination and subcategory tabs (build notes)

Written at the end of Build, before the Clear. Closes **#498**.

## What changed and why

**`components/bundle/BundleCard.tsx`.** Restructured to use `ProductCard`'s `.skew-card-wrap` /
`.skew-card` / `.skew-card-inner` classes (`app/globals.css`, P8.5a/#345) instead of a plain flat
`<li>`. Two independent `.skew-card-inner` regions (image, content) counter-skew exactly like
`ProductCard`'s. Stayed a `<div>` rather than a `<Link>` — there's no storefront bundle detail page
to link to, and the skew CSS doesn't care what element it's applied to.

**`components/bundle/BundleRow.tsx` / `app/(storefront)/categories/page.tsx`.** Subtitle no longer
says "one meal"; the section title changed from the literal `"Meal bundles"` to `"Value Bundles"`.
Confirmed with the human that a fixed neutral default is the right scope — not a new
`VendorConfig` field.

**`lib/repositories/categories.ts`'s `getCategoryBySlug`.** Added a `parent` selection alongside the
existing `children` — `{ id, slug, name, children }`, non-null only when the category itself has a
parent. One extra nested Prisma select, no extra round-trip.

**`components/product/SubcategoryLinks.tsx`.** Reworked from `#496`'s `subcategories`/`currentSlug`
shape to `tabs`/`parentSlug`/`activeSlug`. The caller now decides which sibling set to show (a
department's own children, or — when viewing a subcategory — its parent's children) and which slug
is "current"; the component itself no longer has any department-vs-subcategory logic, just "render
this tab row, highlight this one."

**`app/(storefront)/categories/[slug]/page.tsx`.** Three changes:
- `tabParentSlug`/`tabs`/`scrollerActiveSlug` computed from `category.parent` (falls back to the
  category's own fields when there's no parent — i.e. when it IS the department).
- `DepartmentScroller`'s `activeSlug` now uses the resolved department slug, not the raw route
  param, so it stays highlighted while browsing any of that department's subcategories (closes the
  open item #494's `plan.md` recorded and never fixed).
- Pagination gained a `back` search param (comma-joined cursor stack) and a `prevPageHref`. `Next`
  now also pushes the page it's leaving onto that stack; `Previous` pops the last entry off it.

## Decisions taken during the build

- **No absolute page numbers.** `findPage` deliberately avoids a `COUNT` query (its own comment:
  over-fetch by one instead), and `specs/architecture.md` bans `OFFSET` outright. A cursor-stack
  Previous/Next is the standard compromise for keyset pagination in production (GitHub's own REST
  API does the same) and needs no new query shape at all.
- **The cursor stack lives in a URL param, not a cookie or server session.** Consistent with every
  other piece of pagination/filter state on this page (`minPrice`, `isHalal`, etc.) — plain links,
  no client JS, works with the browser's own back button for free.
- **`BundleCard` stays a `<div>`, not a `<Link>`.** Considered making the whole card link somewhere
  (matching `ProductCard`), but there's no bundle detail route to send it to, and inventing one is
  out of this slice's scope per `plan.md`.

## Deviations from the spec

None.

## Known-shaky areas

- **The `back` stack is unbounded in principle** — a shopper could in theory page through hundreds
  of pages, growing the URL. In practice `PAGE_SIZE = 12` and the catalogue tops out at a few
  thousand generated products per department at most, so the realistic stack depth is small
  (dozens, not hundreds) and the URL stays well under any browser's length limit. Not guarded
  explicitly; worth revisiting only if a future catalogue scale test shows otherwise.
- **No test exercises the `back` round-trip end-to-end** — R7/R8 are live/`npm run preview` checks,
  not unit tests, since the logic lives in the page component's own small pure functions
  (`nextPageHref`/`prevPageHref`), not an exported, independently-testable module. Extracting them
  would be a reasonable follow-up if this logic grows more cases.
