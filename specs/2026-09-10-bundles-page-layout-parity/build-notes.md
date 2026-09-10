# Bundles page layout parity (build notes)

Written at the end of Build, before the Clear. Closes `#701`.

## What changed and why

**`app/(storefront)/bundles/page.tsx`** gains the same `<div className="mt-6 flex flex-col gap-6
md:flex-row">` two-column wrapper `/search` and `/categories/[slug]` already use.
`CollectionNav` moves into a `md:w-60 md:shrink-0` left column (alone — no `FilterPanel`, per the
page's own pre-existing, deliberate reasoning that `Bundle` has no filterable predicates); the
heading, subtitle and bundle grid move into a `flex-1` right column. The grid's className changes
from `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` to `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`,
matching `ProductRow`'s and `/search`'s product grid exactly.

Nothing else moved: `DepartmentScroller` stays outside and above the wrapper, unchanged; the
empty-case branch (`renderable.length === 0`) and its message are relocated but not edited;
`BundleCard`, `BundleRow`, and every repository/service function are untouched.

## Decisions taken during the build

**No `FilterPanel` was added**, even though `/search`'s left column has one and `/bundles`'s now
looks comparatively sparse. This was the explicit scope boundary from `plan.md`: `Bundle` has no
`categoryId` and none of the filter form's predicates (price, stock, halal, origin, brand, pack
size) exist on a bundle, because a bundle is a curated set spanning departments (`#347`). Adding
filter controls with nothing to filter would be a worse defect than an asymmetric sidebar.

## Deviations from the spec

None. The build matches `plan.md`/`requirements.md` as written.

## Known-shaky areas

**R5 (the empty-case message) was validated by code identity, not a live empty-DB fetch** — see
the Validation notes below for why that's the deliberate choice, not a gap. If a reviewer wants it
forced live anyway, deactivating every bundle for the vendor under test (and reactivating
afterward) is the way to do it; nothing else in this slice needs that.

**Not visually screenshotted through a browser** — every claim in the Validation notes below comes
from the raw rendered HTML (`curl` + grep/python extraction) under `npm run preview`, not from a
Chrome screenshot, because no browser-automation tool was available in this session. The HTML-level
checks are exact (class lists, element counts, landmark counts) rather than approximate, so this is
a lower risk than it would be for a purely visual claim, but a screenshot comparison against the
store owner's own reference images is still worth doing at `/validate` if a browser tool is
available there.

## Validation notes

Live-verified under `npm run preview` against the dev database: the two-column wrapper, single
`CollectionNav` (no `FilterPanel`), the `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` grid class, and
three real bundles (`Weekly Halal Meat Box`, `Breakfast Basics`, `Store Cupboard Starter`) rendering
inside it were all confirmed from the raw HTML rather than assumed from the diff.

R5 (the empty-case message) was **not** forced live by emptying the bundles table — the conditional
branch and its message string were relocated into the new wrapper unmodified, not edited, so the
property is provable by reading the diff (nothing inside the `renderable.length === 0` branch
changed) rather than by a live empty-DB fetch. Recorded here as a deliberate choice, not a gap: `R6`
and `R7`'s zero-diff checks on `BundleCard.tsx`/`BundleRow.tsx`/the repository/service files back
the same claim from the data side.

`npx vitest run`: 117 files / 1557 tests, all passed (no flake reproduction this run).
