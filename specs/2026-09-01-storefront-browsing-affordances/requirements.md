# Storefront browsing affordances — requirements

Addresses **parts 1 and 2 of `#501`** (slice A of the three approved at Gate 1 on 2026-09-01;
slice B was `#502`, slice C is `#503`). Bare `/search` renders no products because the query and the
grid are both gated on `q`, which makes the shop page's only "View all" a dead end; the other two
rows have no "View all" at all, and the one bundles needs has nowhere to point. This gives `/search`
a browse mode over the existing `list()` path, adds a `featured` param, wires a working "View all"
onto all three rows, and adds the `/bundles` listing page. Part 3 of `#501` (horizontal scrollers) is
**out of scope** — see `plan.md`.

R1. `app/(storefront)/search/page.tsx` resolves its products from `products.list(...)` when the
    trimmed `q` param is empty, and from `products.search(q, ...)` when it is not. Both calls pass
    the same `take`, `cursor`, `minPricePence`, `maxPricePence`, `inStockOnly`, `isHalal`,
    `isFresh` and `isOrganic` values.

R2. `lib/repositories/products.ts`'s `searchProducts` is byte-for-byte unchanged by this slice,
    including its empty-query guard, and `list()` and `search()` remain two separate functions on
    the `ProductRepository` interface in `lib/products-service.ts`.

R3. `app/(storefront)/search/page.tsx` renders the product grid and the pagination control without
    gating either on the presence of `q` — the JSX contains no `query &&` guard around the grid.

R4. Requesting `/search` with no query string returns HTTP 200 and HTML containing at least one
    product card linking to a `/products/` detail URL.

R5. The `h1` element on `/search` contains the literal text `All products` when `q` is absent or
    whitespace-only, and contains the submitted query text when `q` is non-empty.

R6. `app/(storefront)/search/page.tsx` reads a `featured` search param and passes `isFeatured: true`
    into the repository options when, and only when, its value is exactly `1` — in both the browse
    and the search branch.

R7. `prisma/seed.ts` marks a non-empty set of curated products `isFeatured: true` for each seeded
    vendor. Without this no product in any seeded environment is featured — `Product.isFeatured`
    defaults to `false` in `prisma/schema.prisma` and the seed never set it — so
    `app/(storefront)/categories/page.tsx`'s Featured Products row renders nothing at all
    (`ProductRow` returns `null` on an empty list) and R6's filter has no observable effect. The
    seeded featured count per vendor is **fewer than** the 12-item `/search` page size, so a
    featured listing is visibly a strict subset of the catalogue rather than a full page.

R8. `components/product/search-href.ts` exists and exports a pure function building the paginated
    `/search` href. It preserves `q`, `minPrice`, `maxPrice`, `inStock`, `isHalal`, `isFresh`,
    `isOrganic` and `featured` when each is set, omits each when unset, and sets `cursor` to the
    value passed in. `app/(storefront)/search/page.tsx` imports it rather than defining its own
    copy.

R9. A unit test file covering `search-href.ts` exists and asserts both the round-tripping of every
    param named in R8 and the omission of unset ones.

R10. `components/product/ProductFilterForm.tsx` renders a hidden input named `featured` with value
     `1` when its `searchParams.featured` is `1`, and renders no such input otherwise.

R11. When the resolved product list is empty, `/search` renders a visible empty-state message in the
     content column. `/search?q=zzzzznotathing` returns HTTP 200 whose HTML contains that message
     and no product card.

R12. `app/(storefront)/search/page.tsx` exports a `generateMetadata` deriving the page title from
     `getCurrentVendorProfile()` and no longer exports a hardcoded `metadata` object; the literal
     string `Search — Aheed Food Centre` does not appear in the file.

R13. `app/(storefront)/categories/page.tsx` passes `viewAllLink="/search"` on the New Arrivals
     `ProductRow`, `viewAllLink="/search?featured=1"` on the Featured Products `ProductRow`, and a
     `viewAllLink` of `/bundles` on the `BundleRow`.

R14. `components/bundle/BundleRow.tsx` accepts an optional `viewAllLink` prop and, when it is set,
     renders a "View all" link using the same element and class names `components/product/ProductRow.tsx`
     uses for its own.

R15. `app/(storefront)/bundles/page.tsx` exists, sets `export const dynamic = "force-dynamic"`,
     exports a `generateMetadata` deriving its title from `getCurrentVendorProfile()`, and renders
     bundles from `getBundlesForStorefront()` using `components/bundle/BundleCard.tsx`.

R16. `app/(storefront)/bundles/page.tsx` filters its bundles with `hasAvailableItems` from
     `lib/bundle-pricing`, the same predicate `components/bundle/BundleRow.tsx` applies, so the page
     and the shop-page row render the same set of bundles.

R17. `/bundles` returns HTTP 200 and its HTML contains a bundle card for every bundle rendered in
     `/categories`' Value Bundles row, and no bundle absent from that row.

R18. `lib/products-service.ts`'s `list()` docstring no longer asserts that an empty box on the
     `/search` page means "nothing searched yet" rather than "browse everything", and instead
     records that `/search` branches to `list()` for its browse mode while `search()`'s own
     empty-query guard is retained.

R19. This slice adds no function to `lib/repositories/*` and no Prisma migration: the diff against
     the base branch lists no file under `prisma/migrations/`, and
     `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts` both pass
     unmodified.

R20. Part 3 of `#501` is not implemented: `components/product/ProductRow.tsx` and
     `components/bundle/BundleRow.tsx` still lay their items out with their existing `grid` classes
     (no horizontal-overflow scroller), and `app/(storefront)/categories/page.tsx` still fetches
     both product rows with `take: 4`.

R21. A follow-up GitHub issue exists for `#501`'s deferred part 3 (product and bundle rows do not
     share the department strip's scroller affordance), is on delivery board project 2, and its
     number is recorded in this slice's `build-notes.md` and named in the CHANGELOG entry. The PR
     for this slice does not close `#501`.

R22. `CHANGELOG.md` updated (Gate 4).

R23. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
