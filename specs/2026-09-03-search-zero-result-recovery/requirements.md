# P2.6 slice 2 — Zero-result ladder and search query log (requirements / acceptance criteria)

Closes **#565**, second slice of P2.6, built on #564's `searchProducts`. When the direct tokenised
search finds nothing, up to three further attempts run in order (typo correction, then a looser
identity-field match, then a broad match) before the page falls back to category and single-term
suggestions. Every search submission's outcome is logged, vendor-scoped, with no user link. No AI on
the request path, no `pg_trgm`, no raw SQL. Narrative and rationale: `plan.md`.

R1. `lib/search-typo-correction.ts` exists, contains no import of `@/lib/db`, `next/headers`,
    `@/lib/tenant`, `@/lib/auth` or `@/lib/auth-rbac`, and exports `levenshteinDistance(a: string, b: string): number`.

R2. `levenshteinDistance` is verified by unit test against known values, including at least:
    identical strings → `0`; one substitution (`"rice"`/`"ricd"`) → `1`; one insertion and one
    deletion; and the empty-string cases (`levenshteinDistance("", "abc") === 3`).

R3. `lib/search-typo-correction.ts` exports `maxEditDistanceFor(termLength: number): number`
    returning `0` for `termLength <= 3`, `1` for `4 <= termLength <= 6`, and `2` for
    `termLength >= 7`. Unit test covers the boundary values `3`, `4`, `6`, `7`.

R4. `lib/search-typo-correction.ts` exports
    `correctTerms(terms: string[], tokens: ReadonlySet<string>): { terms: string[]; corrected: boolean }`.
    A term already present in `tokens` is returned unchanged. A term absent from `tokens` is replaced
    by the token in `tokens` with the smallest Levenshtein distance that is `<= maxEditDistanceFor(term.length)`;
    on a tie, the alphabetically first such token is chosen. A term absent from `tokens` with no token
    within budget is returned unchanged. `corrected` is `true` if and only if at least one returned
    term differs from the input at the same index.

R5. A unit test asserts `correctTerms` never selects a replacement token whose length differs from
    the input term's length by more than `maxEditDistanceFor(term.length)` — the length pre-filter
    used as a performance shortcut cannot change which token is selected, since Levenshtein distance
    is never smaller than the length difference between two strings.

R6. `lib/repositories/products.ts` exports `listProductNameTokens(prisma, vendorId): Promise<Set<string>>`
    (or an equivalent array-returning form used consistently by its one caller), built from the
    **name** field only (not `description`) of every `isActive: true` product for that `vendorId`,
    tokenised with `parseSearchQuery`, deduplicated. Takes `prisma` and `vendorId` as explicit
    parameters; calls neither `getPrisma()` nor `getPrismaWs()` in its body.

R7. `ProductPage` gains two additive fields: `directResultCount: number` and
    `recovery: SearchRecoveryInfo | null`, where
    `SearchRecoveryInfo = { rung: "typo" | "identity" | "broad" | "none"; correctedTerms?: string[] }`.
    `listProducts` and `listProductsByCategory` (both backed by `findPage`) return
    `directResultCount: 0, recovery: null` on every call.

R8. `searchProducts`'s empty-query guard is unchanged in trigger and DB-call count, and now returns
    `{ items: [], nextCursor: null, truncated: false, directResultCount: 0, recovery: null }` — no
    method on the injected client is invoked.

R9. `searchProducts` runs the direct (#564) predicate first exactly as before, and sets
    `directResultCount` to the number of candidates that fetch returned (capped at
    `SEARCH_CANDIDATE_LIMIT`, matching R15 of #564's requirements). When that count is greater than
    zero, `recovery` is `null` and no further rung runs — the ladder adds no extra database query to
    any search that the direct predicate already satisfies.

R10. When the direct fetch's candidate count is zero, rung 1 runs: `listProductNameTokens` is called,
     `correctTerms` is applied to the parsed terms, and if `corrected` is `true` the same direct-search
     predicate shape is re-queried using the corrected terms. If that re-query's candidate count is
     greater than zero, those candidates become the result, ranked with `rankSearchCandidates` against
     the **corrected** terms, and `recovery` is set to
     `{ rung: "typo", correctedTerms: <the corrected terms> }`.

R11. If rung 1 does not apply (`corrected` was `false`) or does not yield results, rung "identity" runs:
     an `OR` across the original parsed terms, each term matching `name` **or** the product's category
     `name` (case-insensitive `contains`; `description` excluded). If its candidate count is greater
     than zero, those candidates become the result, ranked against the **original** terms, and
     `recovery` is set to `{ rung: "identity" }`.

R12. If the identity rung yields nothing, rung "broad" runs: an `OR` across the original parsed terms,
     each term matching `name` **or** `description`. If its candidate count is greater than zero,
     those candidates become the result, ranked against the original terms, and `recovery` is set to
     `{ rung: "broad" }`.

R13. If the broad rung also yields nothing, `items` is `[]` and `recovery` is set to `{ rung: "none" }`.
     `directResultCount` remains `0` from R9 in this case and in every ladder case R10–R13.

R14. Every rung's fetch (direct, typo-corrected, identity, broad) is built through one shared internal
     helper that applies `vendorId`, `isActive: true`, `buildFilterWhere(filters)`, orders by
     `createdAt desc, id desc`, and fetches `SEARCH_CANDIDATE_LIMIT + 1` rows with the sentinel
     discarded exactly as #564's `searchProducts` already does — so `truncated` carries the same
     meaning (more than `SEARCH_CANDIDATE_LIMIT` matches provably exist) regardless of which rung
     ultimately supplied the results.

R15. A unit test simulates a query whose direct fetch is empty and whose typo-corrected re-query
     returns more than `PAGE_SIZE` candidates, requests a `cursor` beyond the first page, and asserts
     the second page is sliced from the **same** ranked (corrected-term) candidate set rather than
     re-triggering the ladder from a different rung — proved by asserting the injected client's typo
     re-query predicate (or an equivalent stable signal) is identical across both calls.

R16. `prisma/schema.prisma` gains a `SearchQueryLog` model with exactly the fields in `plan.md`'s
     schema block: `id`, `vendorId` + `vendor` relation, `query` (String), `directResultCount` (Int),
     `recoveryRung` (String, nullable), `ipHash` (String), `createdAt` (DateTime, default now), and
     an index on `[vendorId, directResultCount, createdAt]`. The model has **no** field or relation
     referencing `User` in any form. `Vendor` gains the matching back-reference field
     `searchQueryLogs SearchQueryLog[]`.

R17. A migration directory exists under `prisma/migrations/` for the `SearchQueryLog` table, generated
     with `prisma migrate dev --create-only` and reviewed before being applied. Its generated
     `migration.sql` contains a `CREATE TABLE` for the new table and contains **no** `DROP INDEX`
     referencing any of the three trigram indexes from `20260820143949_p7_5de_order_search_trigram`
     (`#508`'s recurring drift risk).

R18. `lib/repositories/search-query-log.ts` exists and exports
     `recordSearchQuery(prisma, vendorId, ip, query, directResultCount, recoveryRung): Promise<void>`,
     which hashes `ip` to `ipHash` (SHA-256 hex) internally — matching
     `lib/repositories/order-lookup-rate-limit.ts`'s own `hashIp` rather than a shared helper — and
     creates one `SearchQueryLog` row with `query` trimmed, lowercased and truncated to 200
     characters (`query.trim().toLowerCase().slice(0, 200)`). Takes `prisma` and `vendorId` as
     explicit parameters and calls neither `getPrisma()` nor `getPrismaWs()` in its body.

R19. `recordSearchQuery` piggybacks a retention sweep behind `SWEEP_PROBABILITY = 0.01`, deleting rows
     with `createdAt` older than `RETENTION_MS` (90 days) via `deleteMany` — same shape as
     `lib/repositories/error-events.ts` and `lib/repositories/order-lookup-rate-limit.ts`.

R20. `lib/products-service.ts`'s `search()` method calls `recordSearchQuery` after `searchProducts`
     resolves, **only when `opts.cursor` is `undefined`**, passing the resolved vendor id, the raw
     client IP resolved the same way `app/(storefront)/orders/lookup/page.tsx`'s `resolveClientIp()`
     already does (`cf-connecting-ip` header, else the first `x-forwarded-for` entry, else
     `"unknown"`), the raw query string, `directResultCount`, and `recovery?.rung ?? null`. When
     `opts.cursor` is defined (a "Next page" request), `recordSearchQuery` is not called.

R21. `components/product/SearchRecoveryNotice.tsx` accepts `{ recovery: SearchRecoveryInfo | null;
     terms: string[]; categories: CategorySummary[] }` (or an equivalent shape covering the same
     three inputs) and renders the zero-result fallback — the given categories plus one link per
     entry of `terms`, each to `/search?q=<term>` — when `recovery?.rung === "none"`, and a distinct,
     shorter notice — stating results shown are for a corrected or broadened version of the query —
     when `recovery` is non-null with any other rung. Neither renders when `recovery` is `null`.
     `tests/search-recovery-notice.test.tsx` (matching `tests/truncated-notice.test.tsx`'s pattern)
     covers all four `recovery` states (`null`, `"typo"`, one of `"identity"`/`"broad"`, and `"none"`)
     in one file.

R22. `app/(storefront)/search/page.tsx` passes `result.recovery`, the parsed search terms and the
     already-fetched top-level category list (`allCategories`) to `SearchRecoveryNotice` — no new
     category query is added for this.

R23. `searchProducts`, `listProductNameTokens` and `recordSearchQuery` all take `prisma` and
     `vendorId`/equivalent as explicit parameters and call neither `getPrisma()` nor `getPrismaWs()`
     in their own bodies. `tests/repository-purity.test.ts` and
     `tests/repository-client-injection.test.ts` both still pass with no allowlist changes.

R24. The roadmap change-log row for the #491/#564 production promotion (**PR #575**, and its
     Document-final follow-up **PR #576**) exists. This checks the *previous* work landed cleanly —
     this slice's own row cannot exist until its own Document stage.

R25. `CHANGELOG.md` updated (Gate 4).

R26. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
