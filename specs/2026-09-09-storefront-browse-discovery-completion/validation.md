# Storefront browse discovery completion (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
>
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**
   - _When needed:_ Every feature.
   - _Purpose:_ Test isolated business logic, utilities, and components.
2. **Integration Testing**
   - _When needed:_ Every feature. (Includes Contract testing).
   - _Purpose:_ Verify the component works with its immediate dependencies (e.g., database, external services).
3. **System / End-to-End Testing**
   - _When needed:_ For critical user journeys and validation testing.
   - _Purpose:_ Validate that the feature works correctly in the real system.
4. **Regression & Acceptance Testing**
   - _When needed:_ Mainly before release, or when changing core flows. (Includes Smoke and Sanity testing).
   - _Purpose:_ Ensure existing functionality remains unbroken and acceptance criteria are met.
5. **Performance & Resilience Testing**
   - _When needed:_ Mainly before release, or for performance-sensitive APIs. (Includes Load, Stress, and Spike testing).
   - _Purpose:_ Ensure the system meets throughput/latency targets and degrades gracefully.
6. **Security & Accessibility Testing**
   - _When needed:_ Mainly before release, or earlier for features involving auth, payments, or UI changes.
   - _Purpose:_ Ensure the system is safe and accessible to all users.

---

## Before you start

**Use `npm run preview`, never `npm run dev`.** Every row below that fetches a page touches Prisma.
Plain `next dev` runs in real Node, which cannot load `@prisma/client/wasm`'s WASM query engine, so a
DB-touching route silently renders an error state with no crash and no obvious signal (see
`CLAUDE.md`, Database).

**Resolve the vendor hosts from the database actually under test — do not hardcode them.** Which
hostname maps to which vendor is a property of that database's seed history, not a platform
constant; a spec that hardcoded `srimart-staging.nocaped.com` sent a previous `/validate` chasing a
`/coming-soon` redirect that was neither a bug nor a wrong feature. Write a scratch script that runs
`prisma.vendorDomain.findMany` selecting `host` and `vendorId`, save it as a real file inside the
repo, and run it with `npx tsx path/to/file.ts` — `npx tsx -e` with a multi-line script that imports
a package fails silently on this Windows setup (no stdout, no stderr, exit 0). Delete the scratch
file afterwards, and run `npx tsc --noEmit` once if you placed it at the repo root, since
`next build` type-checks it.

Below, `AHEED_HOST` and `SRIMART_HOST` mean the values that script printed. Save fetched pages to a
file and grep the file; never pipe a fetch or a live-writing script through `head`.

**A grep against rendered HTML is not a grep against source.** React escapes `&` as `&amp;`, `<` as
`&lt;` and `'` as `&#x27;`, so match the escaped form when a string contains any of them. When
grepping source, exclude `app/(admin)/staff/runbook/docs.ts` — it is the generated KMS bundle and
quotes this very spec's prose, so it matches patterns describing the thing being searched for.

**Pick real data, do not assume the seed.** Several rows below need a product with particular flags,
a product with no brand, or a category whose products have no net content. Resolve each from Prisma
against the same `DATABASE_URL` the preview server is using, rather than guessing a slug.

---

## Validation Steps

| Req | Testing Area  | How to verify                                                                                                                                                                                                                                                                                             |
| --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Integration   | `grep -c "CollectionNav" "app/(storefront)/categories/[slug]/page.tsx"` prints `2` (one import, one render), and `grep -n "components/product/CollectionNav" "app/(storefront)/categories/[slug]/page.tsx"` prints one import line.                                                                          |
| R2  | Integration   | `grep -n -B3 -A3 "md:w-60" "app/(storefront)/categories/[slug]/page.tsx"` shows one wrapper carrying both `md:w-60` and `md:shrink-0`, with the `CollectionNav` element before the `FilterPanel` element inside it. The class list must match the equivalent block in `app/(storefront)/search/page.tsx`.     |
| R3  | E2E           | `curl -s -H "Host: $AHEED_HOST" http://127.0.0.1:8787/categories/<real-slug> -o cat.html` then `grep -c 'aria-current="page"' cat.html` prints `0`. Resolve the slug from Prisma, not by guessing.                                                                                                          |
| R4  | Accessibility | Against the same `cat.html`: `grep -c 'aria-label="Collections"' cat.html` prints exactly `1`. Two would mean it was rendered inside `FilterPanel`, which renders its form twice.                                                                                                                           |
| R5  | Regression    | `git diff origin/staging -- components/product/CollectionNav.tsx` shows no change to the `COLLECTIONS` array (an untouched file is the strongest pass), and `grep -A6 "const COLLECTIONS" components/product/CollectionNav.tsx` still shows `/search` for both All products and New Arrivals.                |
| R6  | Unit          | `npx vitest run tests/unit-price.test.ts` exits 0 with cases asserting `500`+`GRAM` renders `500g`, `1`+`KILOGRAM` renders `1kg`, `500`+`MILLILITRE` renders `500ml`, `1`+`LITRE` renders `1L`, and `6`+`EACH` renders `6 each`.                                                                            |
| R7  | Unit          | The same run covers the parser: `"500-GRAM"` yields a value; each of an array of two valid strings, `undefined`, `"500-TONNE"`, `"abc-GRAM"`, `"0-GRAM"`, `"500"`, `"-GRAM"` and `""` yields `undefined`. Assert the array case explicitly — it is what R17 depends on.                                     |
| R8  | Unit          | `grep -n "netContentAmount" lib/repositories/products.ts` shows both columns set inside one guarded block in `buildFilterWhere`. A unit test asserts `buildFilterWhere` emits neither column when the pack-size filter is absent, and both when it is present.                                              |
| R9  | Integration   | `grep -n -A6 'distinct: \["netContentAmount"' lib/repositories/products.ts` shows the `findMany` restricted to both columns non-null. Live: with `npm run preview` running, fetch `/search`, then compare the rendered select's options against a direct Prisma distinct query on the same `DATABASE_URL`.  |
| R10 | Unit          | A unit test feeds an unordered array including `1`+`KILOGRAM`, `500`+`GRAM`, `2`+`EACH`, `1`+`LITRE`, `500`+`MILLILITRE` and asserts `500g` precedes `1kg`, `500ml` precedes `1L`, and the `EACH` entries group separately. `npx vitest run` exits 0.                                                       |
| R11 | E2E           | `grep -c 'name="packSize"' search.html` is non-zero for a `/search` fetch where the catalogue has net content. Then the empty case: fetch a category whose products all have null net content (resolve it from Prisma) and confirm `grep -c 'name="packSize"'` prints `0`.                                  |
| R12 | Accessibility | `grep -n -A4 'name="packSize"' components/product/ProductFilterForm.tsx` shows the `select` inside a wrapping `label` with no `id` attribute. Against `search.html`, `grep -o 'id="[^"]*"' search.html \| sort \| uniq -d` prints nothing for any pack-size id — no duplicate ids across the two renders.    |
| R13 | Unit          | `npx vitest run tests/filter-chips.test.ts` exits 0 with a case asserting a `packSize` chip renders with the R6 label and that its `href` omits `packSize` while preserving other keys. `grep -n "packSize" components/product/filter-chips.ts` shows it in both `REMOVABLE` and `FilterChipParams`.         |
| R14 | Unit          | `grep -n "packSize" components/product/search-href.ts` shows it in both `SearchHrefParams` and `CARRIED`. `npx vitest run tests/filter-chips.test.ts` exits 0 — that suite already pins `CARRIED` against `REMOVABLE`, so a mismatch fails here rather than in production pagination.                        |
| R15 | Integration   | `grep -n "packSize" "app/(storefront)/search/page.tsx" "app/(storefront)/categories/[slug]/page.tsx"` shows, in each file, the `SearchParams` declaration, the parser call, and the value reaching both the product query and `availableFacets`.                                                            |
| R16 | E2E           | `curl -s -o p1.html -w "%{http_code}\n" -H "Host: $AHEED_HOST" "http://127.0.0.1:8787/search?packSize=500-GRAM"` prints `200`. Cross-check every product slug in `p1.html` against Prisma directly — each must have `netContentAmount` `500` and `netContentUnit` `GRAM`. Do not trust the page alone.       |
| R17 | E2E           | `curl -s -o p2.html -w "%{http_code}\n" -H "Host: $AHEED_HOST" "http://127.0.0.1:8787/search?packSize=500-GRAM&packSize=1-KILOGRAM"` prints `200`, and no pack-size chip appears in `p2.html`. A `500` here is the `#689` defect shape reaching a brand-new key and is a hard fail, not a known issue.        |
| R18 | E2E           | `curl -s -o p3.html -w "%{http_code}\n" -H "Host: $AHEED_HOST" "http://127.0.0.1:8787/search?packSize=bogus"` prints `200`, no pack-size chip appears, and the product count in `p3.html` equals that of a plain `/search` fetch.                                                                           |
| R19 | Unit          | `sed -n '/export interface ProductSummary/,/^}/p' lib/repositories/products.ts` shows all four fields, and `npx tsc --noEmit` exits 0 — any repository function returning a `ProductSummary` without selecting them fails to compile, which is the real check here.                                         |
| R20 | Unit          | `sed -n '/export interface ProductDetail/,/^}/p' lib/repositories/products.ts` shows `hmcReference`, and `npx tsc --noEmit` exits 0.                                                                                                                                                                       |
| R21 | E2E           | Resolve from Prisma a product with all three flags true and one with all three false. Fetch a listing containing both, then grep the saved HTML for `Vegetarian`, `Gluten` and `HMC` within the true product's card markup, and confirm none of the three appears within the false product's card.          |
| R22 | E2E           | On the same saved HTML, the product with a brand renders its brand name; a product whose `brandId` is null renders no brand element. Resolve the null-brand product from Prisma rather than assuming which products lack one.                                                                              |
| R23 | E2E           | `curl -s -o d.html -H "Host: $AHEED_HOST" http://127.0.0.1:8787/products/<slug>` for a product with several flags true, then grep `d.html` for each true flag's label, the brand name and the origin. Confirm a flag that is false for that product does not appear.                                        |
| R24 | E2E           | Read that product's `hmcReference` from Prisma, then confirm the exact string appears in `d.html`. Escape the pattern if the value contains `&`, `<`, `>` or a quote.                                                                                                                                      |
| R25 | Accessibility | For each of the three new badges, the label is real text content in the markup (not a background colour, icon or `title` alone), and no enclosing element carries `aria-hidden="true"` on that text. Colour-only conveyance fails this row.                                                                 |
| R26 | Regression    | `git diff --name-only origin/staging` contains no `prisma/schema.prisma` and no path under `prisma/migrations/`, and `git status --porcelain prisma/` is empty.                                                                                                                                            |
| R27 | E2E           | `curl -s -o sri.html -w "%{http_code}\n" -H "Host: $SRIMART_HOST" http://127.0.0.1:8787/search` prints `200` and `sri.html` is not the `/coming-soon` page. Its facet controls reflect SriMart's own catalogue — confirm at least one differs from Aheed's, or state plainly that both stock the same facets. |
| R28 | Unit          | `npx vitest run` alone, with no concurrent build and no orphaned `node.exe`/`workerd.exe`, exits 0. Record the file and test totals in `build-notes.md` and compare against `CLAUDE.md`'s baseline of **117 files / 1544 tests** — a shortfall is the forks-pool trap, not a pass; the new totals replace that line. |
| R29 | Release       | `git diff origin/staging -- CHANGELOG.md` is non-empty and names `#694`, `#397` and `#608`.                                                                                                                                                                                                               |
| R30 | Release       | `npm run lint`, `npm run typecheck`, `npx vitest run` and `npm run format:check` each exit 0. CI on Linux is the authority; a `format:check` failure on untouched files is real drift now that `.gitattributes` pins `eol=lf`, not the old `core.autocrlf` artifact.                                        |
