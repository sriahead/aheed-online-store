# Storefront browsing UX fixes (build notes)

Written at the end of Build, before the Clear. Closes **#496**.

## What changed and why

**`lib/repositories/products.ts`'s `listProductsByCategory`.** Widened its category parameter from
a single `categoryId: string` to `categoryIds: string[]`, filtering with `categoryId: { in: ... }`.
This function has exactly one real caller (`app/(storefront)/categories/[slug]/page.tsx` via
`ProductRepository.listByCategory`, confirmed by grep before changing the signature), so this was a
signature widening, not a new parallel function — `lib/products-service.ts`'s pass-through and
`scripts/measure-catalogue-queries.ts`'s harness call both updated to match in the same commit.

**`app/(storefront)/categories/[slug]/page.tsx`.** One line: the category-id array passed to
`listByCategory` is now `[category.id, ...category.children.map(c => c.id)]` instead of just
`category.id`. A subcategory has no children of its own (two-level cap), so this collapses to a
one-element array there and its behaviour is unchanged from #494.

**`components/product/SubcategoryLinks.tsx`.** Gained a `currentSlug` prop and a leading "All" pill
(`aria-current="page"`, linking to the page currently being viewed) so the new aggregation is
visible rather than a silent behaviour change — a shopper can now see they're looking at everything
in the department, not guess it from an empty-feeling absence of tabs.

**`prisma/seed.ts`.** Four new `CATALOGUE` entries — Frozen Foods, Health & Beauty, Baby & Kids, Pet
Supplies — each a plain department with two curated products and no `children`, matching what the
original nine looked like before #489. Purely to give `DepartmentScroller` enough rows to need its
scroll arrows; not wired into the generated-catalogue scale test.

**`components/layout/Header.tsx`.** One new persistent link, `/categories` labelled "Shop", visible
on every non-portal route including the landing page — the one route that previously had no path
into the catalogue at all (its "Shop List" link is deliberately hidden there per P8.5f).

**`app/(landing)/page.tsx`.** The hero's grid template changed from
`lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]` to `lg:grid-cols-2` — an even split instead of a
fixed-width second column. `DepartmentHero` itself needed no change; every panel is already
`w-full` inside an `overflow-hidden` container, so it scales with whatever column width it's given.

## Decisions taken during the build

- **New departments get no `children`.** Considered giving them subcategories matching #489's
  pattern, but that would mean extending `generate-catalogue.ts`'s round-robin category pool too —
  a bigger, separate change this slice's `plan.md` deliberately excludes. Plain curated departments
  (like the original nine before #489) are enough to make the scroller need to scroll.
- **`listProductsByCategory`'s signature was widened in place, not duplicated.** A grep before
  changing it confirmed exactly one real caller; adding a second function
  (`listProductsByCategoryAndDescendants`) alongside the original would have left an unused,
  never-called single-id path for no reason.
- **The "All" pill links to the current page itself**, not to a query-param toggle. The page never
  had a "filtered to one subcategory, shown inline" mode — clicking a subcategory pill already
  navigates to that subcategory's own dedicated page (unchanged from #494) — so "All" needs no new
  state, only a link back to where you already are, marked current.

## Deviations from the spec

None.

## Known-shaky areas

- **The four new departments have no live NFR re-measurement.** #489's catalogue-scale numbers
  don't include them (they're plain curated rows, not part of that generated set), so nothing here
  changes that measurement's validity — but a future reader shouldn't assume 13 departments were
  what was measured.
- **`DepartmentScroller`'s `activeSlug` still doesn't highlight a subcategory page** — a pre-existing
  gap noted in #494's `plan.md`, unrelated to and not fixed by this slice.
