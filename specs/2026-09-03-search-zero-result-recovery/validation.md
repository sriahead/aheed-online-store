# P2.6 slice 2 — Zero-result ladder and search query log (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing** — isolated business logic (`lib/search-typo-correction.ts`), pure and DB-free.
2. **Integration Testing** — `searchProducts`, `listProductNameTokens`, `recordSearchQuery` against a
   stub Prisma client and, for the live-row requirements, a real dev database.
3. **System / End-to-End Testing** — a real zero-result search against the dev database exercising
   the full ladder.
4. **Regression & Acceptance Testing** — repository-purity/client-injection suites, full test/lint/
   typecheck/format:check.
5. **Performance & Resilience Testing** — not separately re-measured: the direct-search hot path is
   unchanged in query shape (R9), and the ladder only adds cost on the already-rare zero-result path.
6. **Security & Accessibility Testing** — R16's no-user-link check (data-rights exposure), R21's
   fallback UI accessible markup.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `lib/search-typo-correction.ts` exists; `grep -E "from \"(@/lib/db\|next/headers\|@/lib/tenant\|@/lib/auth\|@/lib/auth-rbac)\"" lib/search-typo-correction.ts` returns nothing; the file exports `levenshteinDistance`. |
| R2  | Unit | `npx vitest run tests/search-typo-correction.test.ts` passes, including the identical/one-substitution/one-insertion/one-deletion/empty-string cases named in R2. |
| R3  | Unit | Same test file asserts `maxEditDistanceFor(3) === 0`, `maxEditDistanceFor(4) === 1`, `maxEditDistanceFor(6) === 1`, `maxEditDistanceFor(7) === 2`. |
| R4  | Unit | Test asserts: a term present in the token set is returned unchanged with `corrected: false` when it's the only term; a term absent from the set within budget is replaced by the correct nearest token; a tie between two equidistant tokens resolves to the alphabetically first (construct a token set with e.g. `"rice"` and `"race"` both distance 1 from `"rico"` — assert `"race"` wins); a term with no token in budget is returned unchanged and does not itself set `corrected: true`. |
| R5  | Unit | Test builds a token set containing a token within edit-distance budget at a much longer length difference in characters removed (impossible by construction — Levenshtein can't beat length difference) and one within both budget and length window; asserts the selected token is always one whose length differs by no more than the budget, by comparing `correctTerms`'s output against a brute-force (no length pre-filter) reference implementation across a fixture list of terms/tokens and asserting identical results. |
| R6  | Integration | `npx vitest run tests/search-repository.test.ts` (extended) asserts `listProductNameTokens` is called with a stub client whose `product.findMany` is invoked with `{ where: { vendorId, isActive: true }, select: { name: true } }` (or equivalent), and that its returned set is built from `parseSearchQuery` of each name, deduplicated — assert with two products sharing a word that the word appears once. |
| R7  | Unit | `grep -n "directResultCount\|recovery" lib/repositories/products.ts` shows both fields on `ProductPage`; a unit test on `listProducts`/`listProductsByCategory` (stub client, no matches needed) asserts the returned page has `directResultCount: 0, recovery: null`. |
| R8  | Unit | `tests/search-repository.test.ts` asserts `searchProducts(prisma, vendorId, "", opts)` and `searchProducts(prisma, vendorId, "   ", opts)` both resolve to `{ items: [], nextCursor: null, truncated: false, directResultCount: 0, recovery: null }` with zero calls recorded on every spy on the stub client. |
| R9  | Unit | Stub client returns 3 matching rows on the direct predicate; assert `directResultCount === 3`, `recovery === null`, and that no further `product.findMany` call happens (spy call count stays at 1). |
| R10 | Unit | Stub client returns 0 rows on the direct predicate and >0 rows on a re-query whose predicate matches the corrected terms; assert `recovery` equals `{ rung: "typo", correctedTerms: [...] }` with the expected corrected terms, and that the returned items are ranked (via `rankSearchCandidates`, verifiable by asserting tier order) against those corrected terms, not the originals. |
| R11 | Unit | Stub client returns 0 rows on direct and on the typo re-query (or `correctTerms` finds nothing to correct), and >0 rows on a query whose `where` includes an `OR` over `name` and `category.name` for each term (assert the captured `findMany` args shape); assert `recovery === { rung: "identity" }` and ranking uses the original terms. |
| R12 | Unit | Same pattern one rung further: direct, typo and identity all empty; broad rung (`OR` over `name`/`description` per term) returns rows; assert `recovery === { rung: "broad" }`. |
| R13 | Unit | All four attempts return 0 rows; assert `items === []`, `directResultCount === 0`, `recovery === { rung: "none" }`, and exactly 4 `findMany` calls were made (direct + typo + identity + broad — confirms no fifth, redundant query). |
| R14 | Unit | Each of the four captured `findMany` calls in the R9–R13 tests carries `take: SEARCH_CANDIDATE_LIMIT + 1` and `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`; a case with `SEARCH_CANDIDATE_LIMIT + 1` rows returned from whichever rung supplied results asserts `truncated === true` on the final page. |
| R15 | Unit | Construct a stub where the direct fetch is empty, the typo re-query returns `PAGE_SIZE + 5` candidates; call `searchProducts` twice — once with no cursor, once with the cursor from the first call's `nextCursor` — and assert the second call's captured typo re-query `findMany` args are identical to the first call's (same corrected-term predicate), and that the two pages' `items` are disjoint slices of one consistent ranked order (no item repeated, no item skipped). |
| R16 | Unit | `npx prisma validate` exits 0; `grep -n "model SearchQueryLog" -A 15 prisma/schema.prisma` shows exactly the fields listed in R16, and `grep -c "User" <that block>` is `0`; `grep -n "searchQueryLogs" prisma/schema.prisma` shows the `Vendor` back-reference. |
| R17 | Unit | `ls prisma/migrations/ \| grep -i search_query_log` shows a new migration directory; `cat prisma/migrations/<new>/migration.sql` contains `CREATE TABLE "SearchQueryLog"` and `grep -i "DROP INDEX" prisma/migrations/<new>/migration.sql` matching any of the three `20260820143949_p7_5de_order_search_trigram` index names returns nothing. |
| R18 | Integration | `npx vitest run tests/search-query-log.test.ts` asserts `recordSearchQuery` creates exactly one row via a stub client's `searchQueryLog.create` spy, with `query` truncated when given a >200-char input and `ipHash` present as a 64-char hex string derived from the raw `ip` argument (not the raw IP itself); takes `prisma`/`vendorId` as parameters (`grep -n "getPrisma\(\)\|getPrismaWs\(\)" lib/repositories/search-query-log.ts` returns nothing). |
| R19 | Integration | Same test file: with `Math.random` mocked below `0.01`, asserts `searchQueryLog.deleteMany` is called with a `createdAt: { lt: <90-day-ago Date> } }` filter; with `Math.random` mocked above `0.01`, asserts it is not called. |
| R20 | Integration | `grep -n "recordSearchQuery" lib/products-service.ts` shows the call guarded by `opts.cursor === undefined`; a unit test on `getProductRepository().search(...)` with a stub asserts `recordSearchQuery` fires once when `cursor` is omitted and not at all when a `cursor` is passed. Under `npm run preview`, submit a real zero-result search (a nonsense query against the dev catalogue) and a real "Next page" click on a normal query, then query the Explorer API (`POST http://127.0.0.1:8787/cdn-cgi/local/explorer/api/local/observability/query`) or the dev database directly for `SearchQueryLog` rows — exactly one row for the zero-result search, none created by the pagination click. |
| R21 | Unit | `npx vitest run tests/search-recovery-notice.test.tsx` renders `SearchRecoveryNotice` with `recovery: null` (nothing rendered), `recovery: { rung: "none" }` (category links and per-term search links present), `recovery: { rung: "typo", correctedTerms: [...] }` (short notice present, fallback markup absent), and `recovery: { rung: "identity" }` (short notice present) — all four asserted in one file. |
| R22 | Integration | `grep -n "result.recovery" "app/(storefront)/search/page.tsx"` shows it passed to the component from R21, and shows no new `getCategoryRepository()`/category-fetch call beyond the existing `allCategories` used elsewhere on the page. |
| R23 | Regression | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` — both pass with no changes to either test file's allowlists (`git diff --stat` shows neither file touched, or if touched, only for an unrelated reason stated in build-notes). |
| R24 | Regression | `specs/roadmap.md`'s change-log carries a row citing **PR #575** and/or **PR #576** for the #491/#564 production promotion. |
| R25 | Unit | `git diff origin/staging...HEAD -- CHANGELOG.md` is non-empty and the diff includes an entry referencing `#565`. |
| R26 | Regression | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` all exit 0. Per `CLAUDE.md`'s vitest trap: confirm the file/test count matches the expected total (no heavy build immediately prior) before trusting a green run — re-run once if the reported file count looks short. |
