# P2b — Catalogue search & filters (requirements / acceptance criteria)

Second P2 slice per `specs/roadmap.md`, layered on P2a's schema/repositories (merged, live on
`staging`/`main`). Global search across all products, plus price/availability filters on both the
new search route and P2a's existing category page. Search matching is plain Postgres
case-insensitive `contains` — `specs/architecture.md` explicitly defers a trigram index or a
dedicated search service until the catalogue grows; not attempted here.

R1. `lib/repositories/products.ts`'s `ProductRepository` gains a `search()` method: takes a query
    string plus the same optional filter/pagination shape as `listByCategory()`
    (`minPricePence`/`maxPricePence`/`inStockOnly`, `take`, `cursor`), matches active products
    whose `name` or `description` contains the query (case-insensitive), ordered and
    cursor-paginated identically to `listByCategory()` — `(createdAt, id)` desc, never `OFFSET`.
    An empty/whitespace-only query returns an empty page, not every product.
R2. `listByCategory()` gains the same optional `minPricePence`/`maxPricePence`/`inStockOnly`
    parameters as `search()` — one shared filter shape used by both methods, not two parallel
    ones. `inStockOnly: true` filters to products whose `Inventory.quantity` is greater than 0.
R3. `app/(storefront)/search/page.tsx`: reads `q`/`minPrice`/`maxPrice`/`inStock`/`cursor` from
    `searchParams`, calls `search()`, renders results via the existing `ProductCard` grid (same
    as `/categories/[slug]`) plus a "next page" link when a cursor exists. An empty/missing `q`
    shows the search form with no results grid, not an error.
R4. `app/(storefront)/categories/[slug]/page.tsx` additionally reads `minPrice`/`maxPrice`/
    `inStock` from `searchParams` and passes them to `listByCategory()` — existing unfiltered
    behavior (no query params present) is unchanged.
R5. `components/product/ProductFilterForm.tsx`: a server component, plain `<form method="GET">`
    (no client-side JS) rendering price-min/price-max number inputs and an in-stock checkbox,
    pre-filled from the current `searchParams`. Renders an additional query text input when used
    on `/search`. Does not include a hidden cursor field, so resubmitting always starts back at
    page 1.
R6. `components/product/parse-price-input.ts` exports a pure function
    `parsePriceInput(pounds: string): number | undefined` — `"3.20"` → `320` (integer pence),
    blank or non-numeric input → `undefined` (filter not applied, not treated as zero).
    Unit-tested, no Prisma/network dependency.
R7. Presentation code (`app/`, `components/`) still never imports `@prisma/client` directly —
    filter/search logic reaches the DB only through `search()`/`listByCategory()`.
R8. Guest access: `/search` and the extended `/categories/[slug]` are reachable without
    authentication, matching P2a — no regression.
R9. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
R10. `CHANGELOG.md` updated (Gate 4).
