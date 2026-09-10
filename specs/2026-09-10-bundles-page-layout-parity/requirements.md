# Bundles page layout parity (requirements / acceptance criteria)

Closes `#701`. No schema change, no migration.

R1. `app/(storefront)/bundles/page.tsx` wraps `CollectionNav` and the bundle listing in the same
top-level structure `/search`/`/categories/[slug]` use: a `<div>` carrying `mt-6`, `flex`,
`flex-col`, `gap-6` and `md:flex-row`, containing exactly two child `<div>`s — one carrying
`md:w-60` and `md:shrink-0` (holding `CollectionNav`), the other carrying `flex-1` (holding the
`Value Bundles` heading, subtitle, and the bundle listing).

R2. `CollectionNav` is the only content in the `md:w-60 md:shrink-0` column — no `FilterPanel` and
no other control renders there.

R3. `DepartmentScroller` remains outside and above the two-column wrapper, unchanged in props and
position relative to it.

R4. The bundle grid's non-empty-case wrapper is a `<ul>` carrying exactly the classes `grid`,
`grid-cols-2`, `gap-4`, `sm:grid-cols-3` and `lg:grid-cols-4` — the same classes `ProductRow`'s
`HorizontalScroller`-free grid equivalent (`/search`'s product grid) uses. It must not carry
`grid-cols-1` or `lg:grid-cols-3` (the removed classes).

R5. The empty-case branch (`renderable.length === 0`) is unchanged in behaviour: it renders the
existing "No bundles are available right now." message, inside the `flex-1` right column.

R6. `components/bundle/BundleCard.tsx` and `components/bundle/BundleRow.tsx` are unchanged by this
slice — `git diff origin/staging` shows no modification to either file.

R7. `lib/bundles-service.ts`, `lib/repositories/bundles.ts`, `lib/bundle-pricing.ts` and
`prisma/schema.prisma` are unchanged by this slice.

R8. A rendered `/bundles` page contains exactly one `nav[aria-label="Collections"]` element (no
duplicate landmark from the restructure).

R9. `git diff --name-only origin/staging` for this slice shows no change to `prisma/schema.prisma`
and adds no directory under `prisma/migrations/`.

R10. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.

R11. `CHANGELOG.md` updated (Gate 4).
