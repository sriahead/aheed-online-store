# P2.6 slice 5 — search autocomplete and filter panel with chips and drill-down (requirements)

Closes `#568` (P2.6 slice 5 of 6), and folds in `#512`. Builds on `#564` (tokenised matching and
`rankSearchCandidates`), `#565` (the zero-result ladder and `SearchQueryLog`), `#566` (the approved
synonym dictionary and `expandSearchTerms`) and `#489`/`#496` (nested categories and subcategory
navigation). It changes how a shopper **steers** search — visible and removable filters, category
drill-down that keeps the query, context-aware facets, and typed suggestions — while leaving
`searchProducts`'s matching, ranking and recovery ladder untouched. See `plan.md` for why the mobile
panel is a `details` disclosure rather than a modal drawer, and why the suggest route deliberately
does not reuse the search pipeline.

Throughout: "the two browse pages" means `app/(storefront)/search/page.tsx` and
`app/(storefront)/categories/[slug]/page.tsx`, the only two consumers of `ProductFilterForm`.

## Filter panel

R1. `components/product/FilterPanel.tsx` exists, contains no `"use client"` directive, and renders
    `ProductFilterForm` exactly twice: once inside a `details` element carrying class `md:hidden`,
    and once inside a container carrying classes `hidden` and `md:block`.

R2. Both browse pages render `FilterPanel` instead of a bare `ProductFilterForm`, and neither page
    retains a direct `ProductFilterForm` import.

R3. `FilterPanel`'s `details` element is closed by default: the rendered markup for both browse pages
    contains no `open` attribute on that element.

R4. `FilterPanel` renders no `aria-modal` attribute, no focus-trap keyboard handler, and no
    `usePathname` import — the disclosure closes by page navigation alone.

R5. With JavaScript disabled at a viewport width of 375px, the filter controls on both browse pages
    are reachable and a filter can be applied.

## Applied-filter chips and clear-all

R6. `components/product/filter-chips.ts` exists and exports two pure functions,
    `activeFilterChips(basePath, params)` returning an array of objects each carrying `key`, `label`
    and `href`, and `clearAllHref(basePath, params)` returning a string.

R7. Every `href` returned by `activeFilterChips` omits the parameter that chip represents, preserves
    every other active filter parameter, preserves `q`, and omits both `cursor` and `back`.

R8. `clearAllHref` returns a path that preserves `q` and omits every filter parameter
    (`minPrice`, `maxPrice`, `inStock`, `isHalal`, `isFresh`, `isOrganic`, `featured`, `category`),
    `cursor` and `back`.

R9. `activeFilterChips` returns an empty array when no filter parameter is active, and in that case
    neither browse page renders a chip row or a "Clear all" control.

R10. Both browse pages render one chip per active filter above the product grid, and a "Clear all"
     link whenever at least one chip is present.

## Category drill-down

R11. `ProductFilters` in `lib/repositories/products.ts` carries an optional `categoryIds` field, and
     `buildFilterWhere` emits `categoryId: { in: [...] }` when that field is a non-empty array and
     emits no `categoryId` key at all when it is absent or an empty array.

R12. In `listProductsByCategory`, the explicit `categoryId` clause is applied after the
     `buildFilterWhere(filters)` spread, so a `categoryIds` value present in `filters` cannot
     override the category the page is displaying.

R13. `/search?category=<slug>` restricts results to that category and its direct children, in both
     search mode (a `q` is present) and browse mode (no `q`).

R14. `/search?q=<term>&category=<slug>` applies both predicates together: the result set is the
     intersection, not either one alone.

R15. `/search?category=<unknown-or-inactive-slug>` returns HTTP 200, applies no category predicate,
     and renders no category chip.

R16. `/search` renders a category drill-down control listing the vendor's top-level categories, and,
     when a category is selected, that category's children; each entry is an anchor whose href sets
     `category`, preserves `q` and every other active filter, and omits `cursor`.

R17. The selected category renders as a removable chip like any other filter, whose href omits
     `category`.

## Context-aware facets

R18. `getAvailableSpecialities` accepts the current result context (search term groups, category ids,
     price bounds and in-stock flag) in addition to `prisma` and `vendorId`.

R19. Each of the three speciality probes excludes all three speciality filters from its own context,
     so a speciality that is currently active is always reported available.

R20. The direct-search `where` builder used by `searchProducts` is an exported pure function named
     `buildDirectSearchWhere`, and the facet probe composes its term predicate by calling that same
     function rather than a separate copy of the predicate.

R21. On `/search?q=<term>`, a speciality toggle is rendered only when at least one product matching
     that query carries the corresponding flag.

## Autocomplete route

R22. `app/api/search/suggest/route.ts` exists, exports a `GET` handler, and contains no
     `export const runtime` declaration of any kind.

R23. The route resolves the vendor from the request host and returns HTTP 200 with empty `products`,
     `categories` and `terms` arrays when no vendor resolves — never a 5xx.

R24. The route parses `q` with `parseSearchQuery`; when that yields zero terms it returns HTTP 200
     with all three arrays empty and issues no database query.

R25. Product suggestions match on product `name` only (never `description`), require every parsed
     term, and are expanded through the vendor's approved alias map via `expandSearchTerms`.

R26. Product suggestions are ordered by `rankSearchCandidates` and the response carries at most 6
     products, at most 3 categories and at most 3 terms.

R27. The route's product query passes an explicit `take` no greater than a named candidate-limit
     constant declared in the route's module.

R28. The route writes no `SearchQueryLog` row: a request to it leaves that table's row count
     unchanged.

R29. The route's response carries a `Cache-Control` header containing `public` and a `max-age`
     greater than zero.

R30. Two requests to the route with the same query string but different vendor hosts return that
     vendor's own products, on a deployed environment where Cloudflare edge caching is active.

## Autocomplete client

R31. `components/layout/SearchSuggest.tsx` exists, carries `"use client"`, and is rendered inside the
     header's existing `form method="GET" action="/search"` without changing that form's `method` or
     `action`.

R32. The input carries `role="combobox"`, `aria-expanded`, `aria-controls` and
     `aria-autocomplete="list"`; the suggestion list carries `role="listbox"` and each suggestion
     carries `role="option"`.

R33. ArrowDown and ArrowUp move the active suggestion and update `aria-activedescendant`, Enter
     activates the active suggestion, and Escape closes the list without submitting the form.

R34. The component debounces requests by at least 200ms and aborts the in-flight request when a new
     keystroke supersedes it.

R35. With JavaScript disabled, the header search form still submits to `/search` and returns results.

## Hygiene

R36. `components/product/ProductFilterForm.tsx` contains no raw hex colour literal, and its submit
     button uses the action design token (`#512`).

R37. `prisma/schema.prisma` is unchanged by this slice and no new directory is added under
     `prisma/migrations/`.

R38. Every new or changed function in `lib/repositories/` takes its Prisma client and `vendorId` as
     explicit parameters; `tests/repository-purity.test.ts` and
     `tests/repository-client-injection.test.ts` both pass.

R39. `npm run kms:validate` exits 0, and `npm run kms:assemble:internal` followed by a
     `kms/site-internal` build succeeds.

R40. `CHANGELOG.md` updated (Gate 4).

R41. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
