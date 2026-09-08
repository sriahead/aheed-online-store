# P9.3 — Panel refusal enforcement & admin catalogue category filter (requirements / acceptance criteria)

Two independent halves, no shared code. **Half A** closes `#350`: its code fix already landed in
`e3c9642` without the issue being closed, and walking every `app/(admin)` page at `/propose` found
a fourth instance (`/staff/discounts` hand-rolls the refusal markup) that the issue never mentions
— so this half converts that page, replaces the hand-maintained prose list with a mechanical check,
and corrects three stale records. **Half B** closes `#503` on its part 1 only: a hierarchy-aware
category filter on the admin product list, reusing `listCategoriesForAdmin` (`#627` ordering) and
`toCategoryOptionGroups` (`#630`). `#503`'s parts 2 and 3 were split to `#670`. No schema change,
no migration. See `plan.md` for why each decision beat its alternative.

## Half A — refusal-branch enforcement (`#350`)

R1. `app/(admin)/staff/discounts/page.tsx`'s `!auth.ok` branch renders a `<PanelRefusal>` element
    imported from `@/components/staff/PanelRefusal`, and the file contains no hand-written
    `<h1>` refusal heading.

R2. `/staff/discounts`' refusal output is unchanged for a signed-in non-admin: the page still
    returns HTTP 200 carrying the heading text `Store admins only` and the body text beginning
    `You're signed in, but`.

R3. A new test file `tests/panel-refusal-coverage.test.ts` exists and discovers the `page.tsx`
    files it checks by walking the `app/(admin)/` directory on the filesystem. It contains no
    hardcoded list of page paths and no allowlist or exclusion list of files exempt from the rule.

R4. That test fails when any discovered `page.tsx` whose source calls `requireVendorRole(` does
    not render a `PanelRefusal` JSX element. With the repository in its post-`R1` state, the test
    passes.

R5. That test's detection is AST-based: it parses each file with the `typescript` package and
    matches JSX element names, so an occurrence of the text `PanelRefusal` appearing only inside a
    comment or a string literal does not satisfy the check.

R6. `components/staff/PanelRefusal.tsx`'s docstring no longer states that `/staff/loyalty` and
    `/staff/discounts` keep their own copies of the refusal markup.

R7. `CLAUDE.md`'s "Staff panel pages" section lists both `storefront` and `discounts` among the
    pages using `<PanelRefusal>`, and names `tests/panel-refusal-coverage.test.ts` as the check
    that now enforces it.

R8. `specs/roadmap.md`'s P9.3 entry for `#350` no longer contains the words `Still open`, and
    records `#350` as closed by this slice.

## Half B — admin catalogue category filter (`#503` part 1)

R9. `lib/staff-products-query.ts` exports a constant `CATEGORY_ALL` whose value is the string
    `"all"` — the sentinel meaning "no category filter", matching the existing
    `PRODUCT_STATUS_ALL` convention in the same module — and `parseStaffProductsQuery` accepts a
    **required** second argument holding the vendor's categories.

R10. `lib/staff-products-query.ts` performs no I/O: the module imports nothing from `@/lib/db`,
     `@/lib/repositories/*`, `next/headers`, `@/lib/tenant`, `@/lib/auth` or `@/lib/auth-rbac`.

R11. `parseStaffProductsQuery` returns a `category` field equal to the selected category's id when
     that id appears in the supplied categories, and equal to `CATEGORY_ALL` when the input is
     absent, blank, or an id not present in the supplied categories.

R12. `parseStaffProductsQuery` returns a `categoryIds` field which is: `undefined` when `category`
     is `CATEGORY_ALL`; `[id]` when the selected category has a non-null `parentId`; and, when the
     selected category has a null `parentId`, an array containing that id plus the id of every
     supplied category whose `parentId` equals it.

R13. `categoryIds` is never an empty array — a state meaning "match nothing" is unreachable from
     any query-string input.

R14. `staffProductsHref` includes a `category` parameter carrying the selected id when `category`
     is not `CATEGORY_ALL`, and omits the parameter entirely when it is.

R15. `listProductsForAdmin` in `lib/repositories/products.ts` accepts an optional `categoryIds`
     argument: when it is `undefined` the query applies no category condition, and when it is a
     non-empty array the query restricts `categoryId` to those ids. Its first two parameters
     remain an explicitly passed Prisma client and `vendorId`.

R16. `/staff/products` renders a `<select name="category">` inside its existing GET form,
     containing an "All categories" option plus one `<optgroup>` per department produced by
     `toCategoryOptionGroups`, with each department itself present as a selectable option within
     its own group.

R17. On `/staff/products`, selecting a department returns products belonging to that department
     and to its subcategories; selecting a subcategory returns only that subcategory's products.

R18. The category filter survives pagination: the "Older products" link's href carries the
     `category` parameter when one is selected.

R19. A `category` value that does not match any of the vendor's categories yields the unfiltered
     product list, a `category` select showing "All categories", and an "Older products" href
     carrying no `category` parameter.

R20. The empty-result message on `/staff/products` shows the filtered-view wording ("No products
     match this view…") when a category filter is active and no products match.

R21. `prisma/schema.prisma` is unchanged by this slice and no new directory is added under
     `prisma/migrations/`.

R22. `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts` both still
     pass, unmodified.

## Gates

R23. `CLAUDE.md`'s vitest baseline line records the file and test totals measured from a clean
     `npx vitest run` on this branch.

R24. `CHANGELOG.md` updated (Gate 4).

R25. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
