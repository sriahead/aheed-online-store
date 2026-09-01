# Storefront browsing affordances — validation

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

This slice is UI and routing only — no schema change, no migration, no new repository function, no
new write path. The risk sits in four places: the browse-versus-search branch passing the same
options down both paths, the `featured` param surviving both pagination and a filter-form submit
(a plain `GET` form replaces the entire query string, so a dropped hidden field is silent),
`/bundles` agreeing with the shop page's row about which bundles are renderable, and the seed
actually producing featured products for the featured listing to show.

**Setup every route row below depends on.**

- `BASE` means the merge-base with `origin/staging`, i.e. `git merge-base origin/staging HEAD`.
  Where a row says "the diff against the base branch", run `git diff "$(git merge-base origin/staging HEAD)"..HEAD`.
- **Re-seed before the live rows.** R7 changes `prisma/seed.ts`; the featured rows cannot pass
  against a database seeded before this slice. Run the seed against the **dev** database and
  confirm the resolved host first (`CLAUDE.md`'s config-precedence rule — `.env` wins for plain
  Node scripts, `.dev.vars` wins under preview, and the two have pointed at different Neon projects
  before).
- **Every route check runs under `npm run preview`, not `npm run dev`.** All four pages touched here
  are `force-dynamic` and DB-touching; plain `next dev` cannot load `@prisma/client/wasm` and
  renders an error state with no crash and no obvious signal. The preview server listens on
  `http://localhost:8787`. After stopping it, kill the orphaned `node.exe`/`workerd.exe` chain
  before the next build or the rebuild fails with `EBUSY` on `.open-next\assets`.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Regression | Read `app/(storefront)/search/page.tsx`: one call to `products.list(...)` and one to `products.search(...)`, selected by whether the trimmed `q` is empty, with an identical options object (`take`, `cursor`, `minPricePence`, `maxPricePence`, `inStockOnly`, `isHalal`, `isFresh`, `isOrganic`) passed to both. |
| R2  | Regression | `git diff "$(git merge-base origin/staging HEAD)"..HEAD -- lib/repositories/products.ts` shows no change to `searchProducts`. Read `lib/products-service.ts`: the `ProductRepository` interface still declares both `list` and `search`. |
| R3  | Regression | `grep -n "query &&" "app/(storefront)/search/page.tsx"` returns no hit around the product grid or the pagination link. |
| R4  | E2E | Under `npm run preview`: `curl -s http://localhost:8787/search -o search-bare.html -w "%{http_code}\n"` prints `200`, and `grep -c 'href="/products/' search-bare.html` prints a number greater than zero. |
| R5  | E2E | In `search-bare.html` from R4, the `h1` element's text is `All products`. Then `curl -s "http://localhost:8787/search?q=rice"` and confirm its `h1` text contains `rice`. |
| R6  | Integration | Read the page for the exact-`1` comparison in both branches. Then, after the re-seed, under `npm run preview`: `curl -s "http://localhost:8787/search?featured=1"` returns 200 with at least one product card, and its set of `/products/<slug>` hrefs is a **strict subset** of `search-bare.html`'s — which R7 guarantees is observable by keeping the seeded featured count below the 12-item page size. Then confirm `curl -s "http://localhost:8787/search?featured=0"` returns the same product set as bare `/search`, proving only the exact value `1` enables the filter. |
| R7  | Integration | `grep -n "isFeatured: true" prisma/seed.ts` returns at least one hit in the curated-product fixtures. After re-seeding dev, `curl -s http://localhost:8787/categories` contains a `Featured Products` heading with at least one product card beneath it (before this slice the row rendered nothing, because `ProductRow` returns `null` on an empty list). Repeat with `-H "Host: srimart-staging.nocaped.com"` to confirm the second vendor also has featured products. |
| R8  | Regression | `components/product/search-href.ts` exists and exports the href builder; `grep -n "search-href" "app/(storefront)/search/page.tsx"` shows the page importing it, and the page file no longer defines its own `nextPageHref`. |
| R9  | Unit | `npx vitest run tests/search-href.test.ts` exits 0, with assertions covering every param in R8 both set and unset. |
| R10 | Unit | `npx vitest run` includes a test rendering `ProductFilterForm` with `featured: "1"` and asserting a hidden input named `featured` with value `1` is present, and rendering it without `featured` and asserting no such input exists. |
| R11 | E2E | Under `npm run preview`: `curl -s "http://localhost:8787/search?q=zzzzznotathing" -o empty.html -w "%{http_code}\n"` prints `200`; `grep -c 'href="/products/' empty.html` prints `0`; and `empty.html` contains the empty-state message text the page renders. |
| R12 | Integration | `grep -n "Search — Aheed Food Centre" "app/(storefront)/search/page.tsx"` returns no hit, and the file exports `generateMetadata`. Under `npm run preview`, `curl -s http://localhost:8787/search` has a `title` containing the Aheed vendor name, and `curl -s -H "Host: srimart-staging.nocaped.com" http://localhost:8787/search` has a `title` containing SriMart's name instead — the second host is what proves the title is vendor-derived rather than merely moved. |
| R13 | Regression | Read `app/(storefront)/categories/page.tsx`: `viewAllLink="/search"` on New Arrivals, `viewAllLink="/search?featured=1"` on Featured Products, and a `/bundles` `viewAllLink` on `BundleRow`. |
| R14 | Regression | Read `components/bundle/BundleRow.tsx`: an optional `viewAllLink` prop, rendered with the same `Link` element and class list `components/product/ProductRow.tsx` uses for its "View all". Under preview, `curl -s http://localhost:8787/categories` contains `href="/bundles"`. |
| R15 | E2E | Under `npm run preview`: `curl -s http://localhost:8787/bundles -o bundles.html -w "%{http_code}\n"` prints `200` and `bundles.html` contains bundle cards. Read the file for `export const dynamic = "force-dynamic"` and `generateMetadata`. |
| R16 | Regression | Read `app/(storefront)/bundles/page.tsx`: it filters with `hasAvailableItems` imported from `@/lib/bundle-pricing`, matching `components/bundle/BundleRow.tsx`. |
| R17 | E2E | Extract the bundle names from `bundles.html` (R15) and from `curl -s http://localhost:8787/categories`, sort both, and confirm the two lists are identical — the row already renders every active bundle, so any difference means the two disagree about renderability. |
| R18 | Regression | Read `lib/products-service.ts`: the `list()` docstring no longer contains the phrase asserting an empty box means nothing searched yet, and states that `/search` branches to `list()` while `search()` keeps its own empty-query guard. |
| R19 | Regression | `git diff --name-only "$(git merge-base origin/staging HEAD)"..HEAD` lists nothing under `prisma/migrations/` and no new file under `lib/repositories/`. `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` exits 0, and the same diff shows no change to either test file. |
| R20 | Regression | Read `components/product/ProductRow.tsx` and `components/bundle/BundleRow.tsx`: both still use their `grid` class lists with no `overflow-x-auto` scroller. `grep -n "take: 4" "app/(storefront)/categories/page.tsx"` still shows both product-row reads. |
| R21 | Acceptance | Read this slice's `build-notes.md` for the follow-up issue number, then `gh issue view <that number>` shows it open and `gh project item-list 2 --owner sriahead --format json` includes it. The `CHANGELOG.md` entry for this slice names it, and the PR body contains no `Closes #501`. |
| R22 | Acceptance | `git diff "$(git merge-base origin/staging HEAD)"..HEAD -- CHANGELOG.md` is non-empty and describes this slice (Gate 4). |
| R23 | Release | `npm run lint`, `npm run typecheck`, `npx vitest run` and `npm run format:check` each exit 0. CI on the PR is the authority, not local output. |
