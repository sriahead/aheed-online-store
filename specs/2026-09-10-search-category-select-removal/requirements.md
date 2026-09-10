# Search category select removal (requirements / acceptance criteria)

Closes `#704`. No schema change, no migration.

R1. `components/product/ProductFilterForm.tsx` renders no `<select name="category">` element under
any circumstance.

R2. `components/product/ProductFilterForm.tsx` no longer imports `toCategoryOptionGroups` or
`StorefrontCategoryNode`, and its exported prop type carries no `categories` field.

R3. `components/product/ProductFilterForm.tsx` renders a hidden `<input type="hidden"
name="category" value={searchParams.category}>` whenever `searchParams.category` is truthy —
mirroring the existing `featured` hidden field exactly — and renders no such element when it is
absent. `category` therefore stays in the form's `searchParams` type (as passthrough data, not a
control).

R4. Applying any other filter (e.g. submitting the form with `minPrice` set) while
`searchParams.category` is present does not drop `category` from the resulting query string — the
hidden field survives the same "Apply" that would otherwise replace it.

R5. `app/(storefront)/search/page.tsx` fetches categories via `categoryRepo.listTopLevel()`, not
`categoryRepo.listTree()`, and passes no `categories` prop to `FilterPanel`.

R6. `app/(storefront)/search/page.tsx`'s `DepartmentScroller`, `SearchRecoveryNotice` and
`SearchSuggestionsNotice` all continue to receive the top-level category list, unchanged in
content and shape from before this slice.

R7. A request to `/search?category=<valid-slug>` still returns HTTP 200, still narrows results to
that category (and its children), and `FilterChips` still renders a removable chip for it — the
underlying filter is untouched, only the panel's own selector is gone.

R8. `app/(storefront)/categories/[slug]/page.tsx` is unchanged by this slice —
`git diff origin/staging` shows no modification to it.

R9. `lib/catalogue-form.ts`'s `toCategoryOptionGroups` export is unchanged, and
`components/staff/ProductForm.tsx`/`app/(admin)/staff/products/page.tsx` still import and use it —
`git diff origin/staging` shows no modification to any of the three.

R10. `git diff --name-only origin/staging` for this slice shows no change to
`prisma/schema.prisma` and adds no directory under `prisma/migrations/`.

R11. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice.

R12. `CHANGELOG.md` updated (Gate 4).
