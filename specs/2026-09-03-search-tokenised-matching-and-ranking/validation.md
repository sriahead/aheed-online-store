# P2.6 slice 1 — Tokenised search matching and relevance ranking (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

The weight of this slice sits in **Unit** testing, because both new modules (`lib/search-query.ts`,
`lib/search-ranking.ts`) are deliberately pure — that is the whole reason the ranking logic was put
there rather than in a query. **Integration** covers the repository against a real Neon branch, which
is possible only because `searchProducts` takes `prisma` explicitly. **Performance** is in scope
despite this being an early slice, because search is the one read path
`docs/developer-portal/nfr-baseline.md` marks `scan` and the one that moved measurably at catalogue
scale.

**Two behaviours are proven by a stub client, not by Neon**, because a live query cannot demonstrate
a *negative*: that no query was issued (R7), and that the composed `where` contains every filter
(R8). Both use a stub whose Prisma methods are spies, asserting on calls and arguments. The live
integration checks stay as additional confidence, not as the proof.

## Two environment rules that decide whether a result means anything

**A `tsx` script must build its own Prisma client from the bare `@prisma/client` specifier**, exactly
as `prisma/seed.ts` does. It must **not** import `lib/db` — that resolves `@prisma/client/wasm`,
whose query compiler Node cannot load, and the call dies with
`Unknown file extension ".wasm"`. This is why the repository functions take `prisma` as a parameter
at all.

**Anything checked through a browser goes through `npm run preview`, never `npm run dev`.** Plain
`next dev` cannot load the WASM query engine, so a DB-touching route renders an error state with no
crash and no obvious signal.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1 | Unit | `grep -n 'export function parseSearchQuery\|export const MAX_SEARCH_TERMS' lib/search-query.ts` returns both lines and shows the constant set to `10`, and `npx vitest run tests/search-query.test.ts` exits 0. |
| R2 | Unit | `grep -nE "from \"(@/lib/db\|next/headers\|@/lib/tenant\|@/lib/auth\|@/lib/auth-rbac)\"" lib/search-query.ts` returns no lines (exit 1). |
| R3 | Unit | `npx vitest run tests/search-query.test.ts` passes, and its output names cases for `"  Basmati   RICE  "`, `"rice,"` and `"(rice)"`, each asserting the terms are `["basmati","rice"]` or `["rice"]` respectively. |
| R4 | Unit | Same test file contains a case passing 15 whitespace-separated tokens and asserting `parseSearchQuery(input).length === 10`. |
| R5 | Unit | Same test file contains a case iterating at least five quantity-free inputs and asserting `parseSearchQuery(i)` deep-equals `parseListLine(i).terms`. Confirm it is non-vacuous by temporarily changing one tokeniser and re-running — the test must fail; revert. |
| R6 | Unit | In `tests/search-repository.test.ts`, call `searchProducts` with a stub client that captures the `where` passed to `product.findMany`, using the query `"basmati rice"`. Assert `where.AND` has length 2 and that each element is `{ OR: [ { name: { contains: <term>, mode: "insensitive" } }, { description: { contains: <term>, mode: "insensitive" } } ] }`. |
| R7 | Unit **(proof)** + Integration (extra) | **Proof:** in `tests/search-repository.test.ts`, build a stub client whose `product.findMany`, `product.count` and every other method are `vi.fn()`. Call `searchProducts(stub, vendorId, "   ", {take:12})`. Assert the return deep-equals `{ items: [], nextCursor: null, truncated: false }` **and** that every spy has `toHaveBeenCalledTimes(0)`. The spy assertion is what proves the requirement — a live call cannot show a query was *not* made. **Extra:** the same call in `scripts/verify-search-slice.ts` against Neon returns the same object. |
| R8 | Unit **(proof)** + Integration (extra) | **Proof:** with the same stub, call `searchProducts` once with all six filters set (`minPricePence`, `maxPricePence`, `inStockOnly`, `isHalal`, `isFresh`, `isOrganic`) plus `isFeatured`. Assert the captured `where` contains `vendorId`, `isActive: true`, the term `AND`, and each of `basePrice.gte`, `basePrice.lte`, `inventory.quantity.gt`, `isHalal`, `isFresh`, `isOrganic`, `isFeatured` — comparing against `buildFilterWhere(filters)` directly so the assertion cannot drift from the helper. **Extra:** in `scripts/verify-search-slice.ts`, one vendor-isolation smoke test (every returned id belongs to the vendor passed in) and one `{inStockOnly:true}` smoke test. |
| R9 | Integration | In `scripts/verify-search-slice.ts` (own client, bare `@prisma/client`): (a) call `searchProducts(prisma, aheedVendorId, "rice basmati", {take:12})` — a real product is named `Basmati Rice 5kg`, so the terms are in the opposite order — and assert `items.length >= 1`; (b) issue the **old** predicate directly via `prisma.product.findMany` with a single `contains` of `"rice basmati"` over name/description and assert it returns `0`. Run `npx tsx scripts/verify-search-slice.ts > /tmp/r.txt 2>&1` then read the file — do **not** pipe to `head`, which can kill the writer before its own cleanup runs. |
| R10 | Unit | `grep -nE "from \"(@/lib/db\|next/headers\|@/lib/tenant\|@/lib/auth\|@/lib/auth-rbac)\"" lib/search-ranking.ts` returns no lines (exit 1), and `npx vitest run tests/search-ranking.test.ts` passes. |
| R11 | Unit | `tests/search-ranking.test.ts` builds one candidate per tier for the terms `["basmati","rice"]` and asserts the returned order is tier 0, 1, 2, 3, 4 by id. |
| R11a | Unit | `grep -n 'export function normaliseCandidateName' lib/search-ranking.ts` returns the definition. Tests assert: `normaliseCandidateName("  Basmati   Rice  ")` equals `"basmati rice"`; a candidate named `"Basmati  Rice"` (double space) reaches **tier 0** for terms `["basmati","rice"]`; and a candidate named `"BASMATI RICE"` reaches tier 0 for the same terms. |
| R12 | Unit | Same file: a case with an out-of-stock exact-name candidate and an in-stock all-terms-in-name candidate asserts the exact-name one is at index 0. |
| R13 | Unit | Same file: a case with an out-of-stock all-terms-in-name candidate and an in-stock description-only candidate asserts the out-of-stock one is at index 0. |
| R14 | Unit | Same file: (a) two same-length identical names differing only by `id` — assert the lower `id` sorts first; (b) build one candidate array, build a **second array holding the same candidates in a different order** (reversed, and one shuffled with a fixed permutation), rank both, and assert the two id sequences are identical. |
| R15 | Unit | `grep -n 'export const SEARCH_CANDIDATE_LIMIT' lib/repositories/products.ts` shows the value `200`. With the stub client from R6, assert the `take` passed to the candidate `findMany` equals `SEARCH_CANDIDATE_LIMIT + 1`, and that its `orderBy` is `[{ createdAt: "desc" }, { id: "desc" }]`. A further test feeds the stub `SEARCH_CANDIDATE_LIMIT + 1` rows and asserts at most `SEARCH_CANDIDATE_LIMIT` reach the ranker (spy on `rankSearchCandidates`, or assert the sentinel's id never appears in any page). |
| R16 | Unit **(proof)** + Integration (extra) | **Proof:** with the stub returning a known candidate set, call `searchProducts` with `cursor` set to `undefined`, `"abc"` and `"-5"` and assert all three return an identical first page; then with a cursor at and beyond the candidate count and assert `items` is empty, `nextCursor` is `null`, and `truncated` equals the value the same stub produces for page one (not hardcoded `false`). Assert none of the five calls throws. **Extra:** repeat the four cursor values in `scripts/verify-search-slice.ts` against Neon. |
| R17 | Unit | With the stub, given a candidate set larger than `take`, assert `listActiveTiersForProducts` is called with an array whose length is at most `take`. |
| R18 | Unit | `grep -n 'function toProductSummary\|toProductSummary(' lib/repositories/products.ts` shows one definition and at least two call sites (`findPage` and the search path). Tests assert: a search item and a `listProducts` item for the same product have identical key sets; `listProducts` returns `truncated === false`; the stub returning **exactly** `SEARCH_CANDIDATE_LIMIT` rows yields `truncated === false`; and the stub returning `SEARCH_CANDIDATE_LIMIT + 1` rows yields `truncated === true`. The "exactly 200" case is the one that distinguishes this semantic from the cap-reached one — it must not be omitted. |
| R19 | Unit | `grep -rn 'truncated' 'app/(storefront)/search/page.tsx'` shows the repository value passed to the notice component, and the component file exists. |
| R19a | Unit | `npx vitest run tests/truncated-notice.test.tsx` passes, rendering the component once with `truncated: true` (asserting the notice text is found) and once with `truncated: false` (asserting it is absent). This is deterministic and independent of catalogue contents. **Extra (optional, system-level):** `scripts/verify-search-slice.ts`'s own R19a check counts several candidate terms and names the widest one; use whichever term it reports as exceeding the cap. **Do not assume `chicken` is broad enough** — measured at Build it matches only 3 products, while `e` matches 2,026; an earlier draft of this row named `chicken` and would have led to recording the notice as unreachable when it is not. With `npm run preview` running, `curl -s "http://127.0.0.1:8787/search?q=<widest term>" \| grep -i narrow` matches and a narrow query's does not (exit 1). **If no term exceeds 200 on the database in front of you, record that this optional row was not reachable there.** Do not lower `SEARCH_CANDIDATE_LIMIT` to manufacture a pass. R19a is the binding proof; this row is system-level confirmation only. |
| R20 | Integration | `git diff` on `lib/repositories/products.ts` shows `findPage`'s `orderBy` and `nextCursor` lines unchanged. In `scripts/verify-search-slice.ts`, call `listProducts` with `take:2`, take its `nextCursor`, call again with that cursor, and assert the two pages share no ids. |
| R21 | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` passes. Both are whole-directory and need no new entry. |
| R22 | Regression | `git status --short prisma/` prints nothing, and `git diff --stat prisma/schema.prisma` is empty. |
| R23 | Regression | `git diff specs/architecture.md` shows the pagination paragraph amended with the bound and the rationale, plus `version` and `updated` bumped. Then `npm run kms:validate` exits 0 with `invalid front-matter (failing): 0`, and `npm run kms:build-index` leaves `npm run kms:check-generated` exiting 0. |
| R24 | Performance | `npx tsx scripts/measure-catalogue-queries.ts > /tmp/m.txt 2>&1`, read the file, and confirm the `product search (searchProducts)` p95 is below 400 ms. Record the figure in `docs/developer-portal/nfr-baseline.md` beside the existing 95.4 ms measurement rather than replacing it. |
| R25 | Regression | `grep -n 'PR #562' specs/roadmap.md` returns at least one change-log row. This checks the **previous** loop's Document (final), not this slice's — this slice's own row cannot exist yet. |
| R26 | Regression | `git diff origin/staging -- CHANGELOG.md` is non-empty and describes this slice under `[Unreleased]`. |
| R27 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0. `npx vitest run` exits 0 **and reports at least 77 files / 903 tests plus this slice's new files** — a shortfall means the forks-worker startup trap fired and the run is a non-result to repeat, not a pass. Run it alone, never alongside a build, and check for orphaned `node.exe`/`workerd.exe` first. CI on Linux is the authority. |
