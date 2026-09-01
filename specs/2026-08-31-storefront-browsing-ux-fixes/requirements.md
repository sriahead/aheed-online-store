# Storefront browsing UX fixes — requirements / acceptance criteria

Closes **#496**. Four related storefront browsing gaps found by live review after #494/#489
shipped. See `plan.md` for what is and isn't in scope.

R1. `lib/repositories/products.ts`'s `listProductsByCategory` accepts `categoryIds: string[]` and
    filters on `categoryId: { in: categoryIds }`. Its `ProductRepository.listByCategory` interface
    method and `lib/products-service.ts`'s pass-through are updated to match.

R2. `app/(storefront)/categories/[slug]/page.tsx` calls `listByCategory` with
    `[category.id, ...category.children.map(c => c.id)]`. Visiting a top-level department that has
    subcategories with products shows products from both the department itself and every one of its
    children, in one paginated list.

R3. `components/product/SubcategoryLinks.tsx` renders a leading "All" link (visible text "All"),
    `href="/categories/{currentSlug}"`, `aria-current="page"`, before the existing per-child links —
    only when `subcategories.length > 0` (unchanged empty-state behaviour from #494).

R4. `prisma/seed.ts`'s `CATALOGUE` array gains exactly four new top-level department entries —
    `frozen-foods`, `health-beauty`, `baby-kids`, `pet-supplies` — each with at least one curated
    product and no `children`. After a clean seed run, Aheed has 13 top-level categories (9 + 4).

R5. `components/layout/Header.tsx` renders a link to `/categories` with visible text "Shop",
    visible whenever `!isPortal` — including on the landing page (`isLanding === true`), where no
    other persistent link to `/categories` exists today.

R6. `app/(landing)/page.tsx`'s hero grid uses an even two-column split (`lg:grid-cols-2`) instead of
    a fixed-width second column, at viewports `lg` and above.

R7. `tests/subcategory-links.test.tsx` covers R3: the "All" link's `href` and `aria-current`, and
    that it doesn't appear when there are no subcategories.

R8. This slice makes no schema or migration change. `git diff --stat <base>...HEAD -- prisma/schema.prisma`
    is empty and `git diff --name-only <base>...HEAD -- prisma/migrations/` lists nothing.

R9. `CHANGELOG.md` updated (Gate 4).

R10. `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run format:check` all pass.
