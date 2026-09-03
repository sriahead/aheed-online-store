# P2.6 slice 1 — Tokenised search matching and relevance ranking (requirements / acceptance criteria)

Closes **#564**, the first slice of P2.6. Storefront search currently passes the whole query to a
single `contains`, so multi-word queries return nothing, and orders every result by `createdAt desc`,
so nothing prioritises relevance or availability. This slice tokenises the query, ranks the results
in pure code over a bounded candidate set, and amends `specs/architecture.md`'s pagination rule for
the one function that needs it. No schema change, no migration, no AI, no raw SQL. Narrative and
rationale: `plan.md`.

R1. `lib/search-query.ts` exists and exports `parseSearchQuery(raw: string): string[]` and the
    constant `MAX_SEARCH_TERMS`, whose value is `10`.

R2. `lib/search-query.ts` contains no import of `@/lib/db`, `next/headers`, `@/lib/tenant`,
    `@/lib/auth` or `@/lib/auth-rbac`, so it is exercisable without a database or a Workers request.

R3. `parseSearchQuery` lowercases its input, splits on whitespace, strips leading and trailing
    punctuation from each token, and drops tokens that are empty after stripping. Verified by unit
    test including at least the inputs `"  Basmati   RICE  "`, `"rice,"` and `"(rice)"`.

R4. `parseSearchQuery` returns at most `MAX_SEARCH_TERMS` terms for an input containing more
    whitespace-separated tokens than that.

R5. A unit test asserts that for at least five inputs that do **not** begin with a quantity,
    `parseSearchQuery(input)` deep-equals `parseListLine(input).terms` from `lib/shopping-list.ts`,
    pinning the two tokenisers to the same behaviour without merging them.

R6. `searchProducts` in `lib/repositories/products.ts` builds its predicate as an `AND` over the
    parsed terms, where each term is satisfied by a case-insensitive `contains` on `name` **or** on
    `description`.

R7. `searchProducts` retains its empty-query guard: for a query that is empty or whitespace-only it
    returns exactly `{ items: [], nextCursor: null, truncated: false }` **and issues no database
    query at all** — no method on the injected client is invoked.

R8. `searchProducts` composes its `where` as `vendorId`, `isActive: true`, the spread of
    `buildFilterWhere(filters)`, and the term `AND` from R6 — so vendor scoping, active-only
    filtering and all six existing filter controls (`minPricePence`, `maxPricePence`, `inStockOnly`,
    `isHalal`, `isFresh`, `isOrganic`) survive unchanged, along with `isFeatured`.

R9. Against the dev database, `searchProducts` returns at least one product for a multi-word query
    whose terms appear in a product's name in a **different order** than typed, and for the same
    query the pre-change implementation returns zero. Both halves demonstrated on a real row.

R10. `lib/search-ranking.ts` exists, exports `rankSearchCandidates`, and contains no import of
     `@/lib/db`, `next/headers`, `@/lib/tenant`, `@/lib/auth` or `@/lib/auth-rbac`.

R11. `rankSearchCandidates` orders candidates into the five tiers defined in `plan.md`: tier 0 exact
     normalised name equality regardless of stock; tier 1 all terms in name and in stock; tier 2 all
     terms in name and out of stock; tier 3 not all terms in name and in stock; tier 4 not all terms
     in name and out of stock. Verified by unit test with one candidate per tier.

R11a. The ranker's name normalisation is defined and exported as `normaliseCandidateName(name)`,
     which lowercases, trims, and collapses every internal run of whitespace to a single space. A
     term "appears in the name" when `normaliseCandidateName(name).includes(term)`, where terms come
     from `parseSearchQuery` and are therefore already lowercase and punctuation-stripped. Tier 0 is
     `normaliseCandidateName(name) === terms.join(" ")`. Unit tests cover the whitespace-collapsing
     case (a product named with a double space reaching tier 0) and a mixed-case exact match.

R12. A unit test asserts a tier-0 candidate that is **out of stock** ranks ahead of a tier-1
     candidate that is in stock.

R13. A unit test asserts a tier-2 candidate (all terms in name, out of stock) ranks ahead of a
     tier-3 candidate (description-only match, in stock).

R14. Within a tier, `rankSearchCandidates` orders by shorter `name` first, then by `name`
     alphabetically, then by `id`. A unit test asserts the `id` tie-break by ranking two candidates
     with identical names and lengths, and a second test asserts that **two differently ordered
     input arrays** holding the same candidates produce identical id sequences — proving the
     comparator is a total order independent of input order, not merely that one array sorts
     repeatably.

R15. `searchProducts` ranks at most `SEARCH_CANDIDATE_LIMIT` candidates, whose value is `200` and
     which is exported so tests assert against the constant rather than a literal. It **fetches at
     most `SEARCH_CANDIDATE_LIMIT + 1` rows**, the extra row being solely a truncation sentinel that
     is discarded before ranking. The candidate fetch orders by `createdAt desc, id desc` — a total
     order, so the selected candidate set is deterministic even when timestamps tie at the cap
     boundary.

R16. `searchProducts` treats its `cursor` as a non-negative integer offset into the ranked candidate
     set. A cursor that is absent, non-numeric or negative yields the first page. A cursor at or
     beyond the ranked candidate count returns `{ items: [], nextCursor: null, truncated: t }` where
     `t` is the real truncation value from R18 — the candidate fetch still happened, so the flag is
     not fabricated. None of the four cases throws.

R17. `searchProducts` calls `listActiveTiersForProducts` with at most `take` product ids — the sliced
     page — never with the full candidate set.

R18. Every item `searchProducts` returns carries exactly the same fields `findPage` produced, built
     through a helper shared by both code paths rather than a second inline mapping. `ProductPage`
     gains one additive field, `truncated: boolean`, which is `true` when and only when the candidate
     fetch returned **more than** `SEARCH_CANDIDATE_LIMIT` rows — i.e. the sentinel row came back, so
     matches beyond the cap provably exist. Exactly `SEARCH_CANDIDATE_LIMIT` matches yields `false`.
     `listProducts` sets it to `false`.

R19. A presentational component renders the truncation notice — text stating results are incomplete
     and inviting a narrower search — when its `truncated` prop is `true`, and renders nothing when
     it is `false`. `app/(storefront)/search/page.tsx` passes the repository's `truncated` value to
     it.

R19a. A component test renders that component with `truncated: true` and asserts the notice text is
     present, then with `truncated: false` and asserts it is absent. This runs regardless of what the
     dev catalogue contains, so the UI half of R19 cannot finish unproven.

R20. `listProducts` and the browse mode of `app/(storefront)/search/page.tsx` (no `q` parameter) still
     use keyset pagination on `(createdAt, id)`; `findPage` is unchanged in ordering and cursor
     semantics.

R21. `searchProducts` takes `prisma` and `vendorId` as explicit parameters and calls neither
     `getPrisma()` nor `getPrismaWs()` in its body. `tests/repository-purity.test.ts` and
     `tests/repository-client-injection.test.ts` both still pass.

R22. `prisma/schema.prisma` is unchanged by this slice and `prisma/migrations/` gains no directory.

R23. `specs/architecture.md` records that ranked storefront search paginates by offset into a bounded
     candidate set rather than by keyset, states the bound, and states why the `OFFSET` prohibition's
     rationale does not apply. Its front-matter `version` and `updated` are bumped.

R24. Storefront search latency is re-measured against the roughly 2,000-product dev catalogue with
     `npx tsx scripts/measure-catalogue-queries.ts`, the p95 is recorded in
     `docs/developer-portal/nfr-baseline.md`, and it is below the 400 ms target from
     `specs/mission.md`.

R25. The roadmap change-log row for **PR #562** exists, confirming the previous loop's Document
     (final) landed. This checks the *previous* slice, not this one — this slice's own row cannot
     exist until its own Document stage.

R26. `CHANGELOG.md` updated (Gate 4).

R27. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
