# Storefront cards, bundles heading, keyset pagination and subcategory tabs — requirements

Closes **#498**. Four more storefront browsing gaps found by live review right after #496 shipped.
See `plan.md` for what is and isn't in scope.

R1. `components/bundle/BundleCard.tsx`'s root markup uses the same `.skew-card-wrap` /
    `.skew-card` / `.skew-card-inner` classes `components/product/ProductCard.tsx` uses, on
    structurally equivalent elements (an image region and a content region), with the same
    `rounded-2xl border border-black/10 bg-white hover:border-action/50` container classes.

R2. `app/(storefront)/categories/page.tsx` no longer passes the literal string `"Meal bundles"` as
    `BundleRow`'s `title`; `components/bundle/BundleRow.tsx`'s subtitle no longer contains the word
    "meal".

R3. `lib/repositories/categories.ts`'s `getCategoryBySlug` selects `parent: { id, slug, name,
    children }` in addition to the category's own `children`; `parent` is non-null exactly when the
    category itself has a parent (i.e. is a subcategory).

R4. `components/product/SubcategoryLinks.tsx` takes `tabs: CategorySummary[]`, `parentSlug: string`,
    and `activeSlug: string` (replacing the #496 `subcategories`/`currentSlug` shape). Exactly one
    pill — "All" when `activeSlug === parentSlug`, otherwise whichever tab's slug matches — carries
    `aria-current="page"`.

R5. `app/(storefront)/categories/[slug]/page.tsx` computes `tabs`/`parentSlug` as the category's own
    `children` when it has no parent, or its `parent.children` when it does; `activeSlug` is the
    current page's own slug. Visiting a subcategory's page (e.g. `rice-grains`, a child of
    `groceries`) renders the same tab row as visiting `groceries` itself, with `rice-grains`'s own
    pill (not "All") carrying `aria-current="page"`.

R6. The department scroller's active highlight resolves to the DEPARTMENT even when viewing one of
    its subcategories (i.e. uses `category.parent?.slug ?? category.slug`, not the raw route slug).

R7. `app/(storefront)/categories/[slug]/page.tsx` renders a "Previous page" link whenever the
    current page is not the first (`query.cursor` is present), alongside the existing "Next page"
    link. Both are derived from a `back` search param carrying the comma-joined stack of cursors used
    to reach every prior page, with no `OFFSET` and no `COUNT` query anywhere in the read path.

R8. Navigating Next then Previous from a category's first page returns to that exact first page
    (no `cursor` or `back` param), and the reverse (Previous is absent whenever `back` and `cursor`
    are both empty).

R9. `tests/subcategory-links.test.tsx` covers R4/R5's contract: the "All" pill active on the
    department's own page, a specific tab active on a subcategory's page, and never both at once.

R10. This slice makes no schema or migration change. `git diff --stat <base>...HEAD --
     prisma/schema.prisma` is empty and `git diff --name-only <base>...HEAD -- prisma/migrations/`
     lists nothing.

R11. `CHANGELOG.md` updated (Gate 4).

R12. `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run format:check` all pass.
