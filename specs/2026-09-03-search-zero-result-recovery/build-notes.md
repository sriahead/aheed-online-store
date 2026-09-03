# P2.6 slice 2 — Zero-result ladder and search query log (build notes)

Written at the end of Build, before the Clear. Issue **#565**.

## What changed and why

- **`lib/search-typo-correction.ts`** (new) — pure `levenshteinDistance`, `maxEditDistanceFor`,
  `correctTerms`. No I/O, so it needs no stub/mock to test.
- **`prisma/schema.prisma`** — new `SearchQueryLog` model plus `Vendor.searchQueryLogs` back-reference.
  New migration `prisma/migrations/20260903141320_p2_6_search_query_log/`.
- **`lib/repositories/products.ts`** — `listProductNameTokens` (new export); three predicate builders
  (`directSearchPredicate`, `identitySearchPredicate`, `broadSearchPredicate`) and one shared fetch
  helper (`fetchSearchCandidates`) that `searchProducts` now composes into the ladder; `ProductPage`
  gains `directResultCount`/`recovery`; `findPage` sets both to their always-empty values.
- **`lib/repositories/search-query-log.ts`** (new) — `recordSearchQuery`, matching
  `error-events.ts`/`order-lookup-rate-limit.ts`'s SWEEP_PROBABILITY-piggyback shape.
- **`lib/products-service.ts`** — `search()` now hashes-and-logs on the first page of a submission;
  added a duplicated `resolveClientIp()` (matching `orders/lookup/page.tsx`'s own, not shared).
- **`components/product/SearchRecoveryNotice.tsx`** (new) — renders the ladder's outcome.
- **`app/(storefront)/search/page.tsx`** — wires `result.recovery`/parsed terms/`allCategories`
  through to the new component, and branches the zero-items case between it and the pre-existing
  plain "No products match" text (browse mode / non-search zero-result still uses the latter, since
  there's no ladder outside `search()`).
- Tests: `tests/search-typo-correction.test.ts`, `tests/search-query-log.test.ts`,
  `tests/search-recovery-notice.test.tsx` (all new); `tests/search-repository.test.ts` extended with
  ten new tests covering R6/R9–R15 and one existing assertion (R7's empty-query guard) updated for
  the two new `ProductPage` fields.

Why the ladder lives *inside* `searchProducts` rather than as a separate exported function: the
service layer (and the page) only ever wanted one thing — "the best answer to this query" — and a
second entry point would have forced `products-service.ts` to know the ladder's rung order itself.
Keeping it internal means `recovery` is the only new thing any caller has to understand.

## Decisions taken during the build

- **Migration name**: `p2_6_search_query_log` (not specified in `plan.md`).
- **Identity and broad rungs share one notice message** ("No exact matches. Showing related products
  instead.") rather than two distinct ones. `requirements.md` R21 left this genuinely open ("a
  distinct, shorter notice... when `recovery` is non-null with any other rung", singular) — read as
  one shared message for both non-typo rungs, which is also what `validation.md`'s R21 row tests
  (one of `"identity"`/`"broad"` as *representative*, not both separately).
- **`SearchRecoveryNotice`'s prop shape** landed as `{ recovery, terms, categories }` — the
  "equivalent shape" R21 explicitly allowed.
- **Found and fixed a real design-token bug while building the fallback markup**: the per-term and
  per-category pill links were written with `bg-surface`, which does not exist as a token
  (`design-system/tokens/tokens.css` defines only `--color-surface-muted`, not a plain `--color-
  surface`) — Tailwind would have silently generated no rule for it, leaving the pills with no
  background at all against the `bg-surface-muted` container they sit on. Caught by checking the
  token file before trusting the class name, not by any automated check. Fixed to `bg-white`,
  matching the established "white chip/card on a muted container" pattern used throughout
  `components/cart/*` and `components/bundle/*`.
- **`makeLadderStub`'s test double** (in `tests/search-repository.test.ts`) distinguishes the
  token-vocabulary query from a ranked candidate fetch by the *absence* of `orderBy` in the captured
  args, rather than inspecting `where` shape — simpler and matches the one real structural
  difference between `listProductNameTokens`'s query and every rung's query.

## Deviations from the spec

- **`SearchRecoveryNotice`'s `"none"`-rung fallback omits the per-term links when the query has only
  one term.** `requirements.md` R21, read literally, says the component renders "the given categories
  plus one link per entry of `terms`" without a term-count condition. `plan.md`'s prose already
  motivated the narrower behaviour ("alternative searches — each individual term **of a multi-word
  query**"), but R21's own wording didn't carry that qualifier through, so a strict reading of the
  requirement and the shipped component disagree. Justification: a single-term query's "individual
  term" link would point at `/search?q=<that exact term>` — the identical search that already
  produced this fallback — which is not a useful suggestion, it's a loop. `tests/search-recovery-
  notice.test.tsx` has a dedicated test for this exact case (`"omits per-term links for a
  single-term query"`), so the behaviour is deliberate and covered, not an oversight — but it is a
  real gap between the literal requirement text and what shipped, and validation should treat R21 as
  satisfied by the *intent* (matching `plan.md`) rather than fail it on the literal wording.

No other known deviations.

## Fix pass (post-/validate)

`/validate` (fresh context, 2026-09-03) found three gaps, none of them requiring a redesign — the
underlying requirements already held by inspection, the check proving them didn't exist or didn't
run:

- **Blocking**: `plan.md`'s front-matter `summary` was 363 characters, over
  `kms/schema/frontmatter.ts`'s 300-char max (`npm run kms:validate` failed). Invisible to
  `lint`/`typecheck`/`test`/`build`, would have failed CI's `quality/kms` job on push (see
  `CLAUDE.md`'s "KMS docs" section — this is that same trap, just the front-matter-length variant
  rather than the MDX-parse one). Trimmed to 295 characters, same content, dropped only the trailing
  "promoted into #566's synonym dictionary" clause. `ARTIFACT_INDEX.md`/`docs.ts` rebuilt afterward
  (`npm run kms:build-index`) since the front-matter changed.
- **R7's validation.md row** asked for a dedicated unit test asserting `listProducts`/
  `listProductsByCategory` return `directResultCount: 0, recovery: null` — didn't exist (
  `listProductsByCategory` had zero direct test coverage of any kind, a pre-existing gap this slice
  inherited rather than introduced). Added both assertions to `tests/search-repository.test.ts`.
- **R20's unit-test half was previously misreported as done** — the line below claiming "the unit
  half... is tested" was checked against `tests/search-repository.test.ts`'s R15 pagination tests,
  which prove the ladder is stable across pages, not that `getProductRepository().search()` itself
  guards the log write on `cursor`. No test anywhere called `getProductRepository()` with a mocked
  `recordSearchQuery`. Added `tests/products-service.test.ts`, mocking `@/lib/db`/`@/lib/tenant`/
  `next/headers` at the module boundary (same shape as `tests/roles.test.ts`/`tests/tenant.test.ts`)
  and leaving `@/lib/repositories/products` real, so the actual wiring in `lib/products-service.ts`
  is what's under test, not a re-assertion of the repository's own already-tested logic.

No observable application behaviour changed — CHANGELOG.md is untouched.

## Known-shaky areas

- **No live-database exercise of the ladder at all.** Every ladder-specific test (R6, R9–R15) runs
  against a stub Prisma client; nothing in this Build session ran a real zero-result query — typo,
  identity or broad — against the dev catalogue under `npm run preview`. In particular: the identity
  rung's `category: { name: { contains: ... } }` relation filter has never been exercised against
  real Postgres in this slice (Prisma should translate it to a join, but it is untested against a
  live database here), and neither has the interaction between the ladder's extra queries and
  `SEARCH_CANDIDATE_LIMIT`'s `+1` sentinel row when a *loosened* rung is the one that overflows it.
- **The typo-correction feasibility/cost question `plan.md` flagged as "Needs validation — measure
  before committing to it" was not measured against the real ~2,000-product dev catalogue.**
  `listProductNameTokens` fetches every active product's `name` with no pagination; whether that plus
  the O(terms × tokens) Levenshtein scan stays comfortably inside the 400ms p95 budget on the real
  catalogue size is unverified. If it doesn't hold up, `plan.md` already names the fallback (degrade
  rung 1 to a no-op, let the ladder start at identity) — this wasn't reached.
- **R20's live/Explorer-API half still hasn't been run.** The unit half (log fires on cursor-less
  calls only, and not at all on a "Next page" click) is now genuinely tested — see "Fix pass" above.
  A real `npm run preview` search plus a real "Next page" click, checked against actual
  `SearchQueryLog` rows in the dev database, has still not been done.
- **The migration was applied only to the dev database.** Staging/production apply it via `prisma
  migrate deploy` on promotion, from the same (already-corrected) `migration.sql` — the `#508`
  `DROP INDEX` risk is fixed at the file level, so it should not recur per-environment, but that
  reasoning itself is unverified against a real `migrate deploy` run.
- **No accessibility pass on `SearchRecoveryNotice`'s new markup** beyond what `role="status"` gives
  for free — link contrast/focus states were copied from existing patterns (`text-action underline`)
  but not independently checked.
