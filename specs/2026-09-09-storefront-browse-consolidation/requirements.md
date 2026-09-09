# Storefront browse consolidation (requirements / acceptance criteria)

Closes `#681`. `/search` currently renders two department pickers that set the same `category`
parameter, while the filter panel beside them has no category control and carries a hidden
passthrough field instead. This slice moves category selection into the panel, deletes the
duplicate picker, and adds collection entry points for Value Bundles, New Arrivals and Featured
Products. It introduces no new query-string key, changes no schema, and adds no database round
trip. Full reasoning, and the two asks the data model cannot satisfy, are in `plan.md`.

R1. `lib/repositories/categories.ts` exports `listCategoryTreeForStorefront(prisma, vendorId)`,
    returning every category for that vendor with `isActive: true`, each carrying at least `id`,
    `slug`, `name`, `parentId` and `isActive`. It takes `prisma` and `vendorId` as explicit
    parameters and calls neither `getPrisma()` nor `getCurrentVendorId()`.

R2. `lib/categories-service.ts` exposes that read through the request-scoped factory
    `getCategoryRepository()`, alongside the existing members.

R3. `toCategoryOptionGroups` in `lib/catalogue-form.ts` is generic over its element type,
    constrained to the existing `CategoryOption` shape, and returns groups whose `parent` and
    `children` carry that same element type — so a caller passing rows with a `slug` gets `slug`
    back without a cast.

R4. `components/product/ProductFilterForm.tsx` renders a `select` element named `category` with an
    accessible name (a wrapping `label` carrying visible text, matching the other controls in that
    form), containing an "All categories" option with an empty value, then one `optgroup` per
    department containing a selectable option for the department itself followed by one option per
    subcategory. Every option value is the category's **slug**.

R5. That select's current selection reflects `searchParams.category`, so a page loaded with an
    active category filter re-renders with that category selected rather than reset.

R6. The hidden input named `category` is gone from `components/product/ProductFilterForm.tsx`. The
    hidden input named `featured` is still present and unchanged.

R7. `components/product/CategoryDrillDown.tsx` no longer exists, and no file in `app/`,
    `components/`, `features/` or `lib/` imports or references `CategoryDrillDown`.

R8. `app/(storefront)/search/page.tsx` obtains its categories from the storefront tree read (R1/R2)
    and no longer calls `listTopLevel()`. The number of category queries that page issues is not
    greater than before this slice.

R9. `DepartmentScroller` on `/search` receives only top-level categories, derived from the tree
    read rather than from a second query.

R10. A collection navigation renders in the filter-panel column on `/search`, offering exactly four
     destinations: "All products" to `/search`, "New Arrivals" to `/search`, "Featured Products" to
     `/search?featured=1`, and "Value Bundles" to `/bundles`. They are anchor elements, not form
     controls, and are rendered by a single component shared with `/bundles` rather than duplicated.

R10a. That navigation renders **exactly once** per page. `FilterPanel` renders `ProductFilterForm`
     twice — once inside the below-`md` `details` disclosure and once inside the `md`-and-above
     `aside` — which is safe for the form because it uses no `id` attributes, but would produce two
     `nav` landmarks with identical links. The collection navigation therefore sits outside both
     branches and stays visible on narrow viewports rather than collapsing behind the disclosure.

R11. `app/(storefront)/bundles/page.tsx` renders `DepartmentScroller` and the same collection
     navigation component used in R10, and does **not** render `ProductFilterForm`.

R12. `/search` in browse mode (no `q`) renders a heading or sub-heading containing the word
     "Newest" (any case), stating the listing's ordering truthfully. No query-string key named
     `collection` is introduced anywhere in the repository.

R13. Each rendered copy of the filter form contains exactly one control named `category`, and none
     of them is a hidden input — so a submit can emit the key only once. Requesting `/search` with
     a real department slug returns only products belonging to that department or its children.

R14. Selecting "All categories" and submitting produces a URL with no `category` key, and the
     resulting page lists products from every department.

R15. A category slug that names no active category for the current vendor still applies no
     predicate, renders no chip, and does not produce a 404 — the behaviour `#568` established is
     unchanged by the new control.

R16. A pure unit test covers the grouped-option construction: departments in the repository's
     order, each department's own children beneath it, and a child whose parent is absent from the
     list promoted to its own group rather than dropped.

R17. `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts` both pass
     with the new repository export in place.

R18. `CHANGELOG.md` updated (Gate 4).

R19. `npm run kms:validate` and `npm run kms:check-generated` both exit 0, with this slice's
     `plan.md` indexed.

R20. `npm run lint`, `npm run typecheck`, `npm run format:check` and `npx vitest run` all remain
     green after this slice.
