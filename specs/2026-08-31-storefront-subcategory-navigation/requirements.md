# Storefront subcategory navigation — requirements / acceptance criteria

Closes **#494**. Fixes the gap #489's own live validation surfaced: `getCategoryBySlug` already
fetches a category's `children`, but no page renders them and nothing links to a subcategory's
page, so anything assigned to a subcategory — via #489's seed or the already-working staff-panel
`CategoryForm` — is unreachable by a shopper browsing normally. See `plan.md` for what is and isn't
in scope.

R1. `components/product/SubcategoryLinks.tsx` exists, exporting a component taking
    `subcategories: CategorySummary[]` (the same type `lib/repositories/categories.ts` already
    exports) and rendering nothing (`null`, not an empty wrapper element) when
    `subcategories.length === 0`.

R2. When given a non-empty array, `SubcategoryLinks` renders exactly one link per entry, each with
    `href="/categories/{slug}"` and visible text equal to that entry's `name`.

R3. `app/(storefront)/categories/[slug]/page.tsx` passes `category.children` as
    `SubcategoryLinks`'s `subcategories` prop and renders it above the product grid.

R4. This slice makes **no change** to `lib/repositories/categories.ts`, `lib/categories-service.ts`,
    `lib/repositories/products.ts`, `lib/products-service.ts`, or `prisma/schema.prisma`. Verified by
    `git diff --name-only` against the base branch.

R5. `tests/subcategory-links.test.tsx` unit-tests `SubcategoryLinks` in isolation (jsdom): renders
    one link per child with the correct `href` and visible name; renders nothing at all
    (`container.firstChild === null`) for an empty array.

R6. Live, under `npm run preview`: visiting a top-level category that has subcategories (e.g.
    Aheed's `groceries`) shows clickable links to each subcategory; clicking one navigates to that
    subcategory's own page and shows its products (unchanged from #489's already-verified behaviour
    — this slice only makes that page reachable, not different).

R7. Live, under `npm run preview`: visiting a category with no subcategories of its own — every
    subcategory itself qualifies, since the tree is capped at two levels (e.g. `rice-grains`, a
    child of `groceries`) — renders no empty subcategory section and no visual regression versus
    today's layout.

R8. `CHANGELOG.md` updated (Gate 4).

R9. `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run format:check` all pass.
