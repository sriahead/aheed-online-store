# P2.6 slice 3 — Synonym dictionary, relevance-triggered recovery and tokeniser hygiene (requirements)

Closes **#566** (and **#396**), **#580**, **#572** and **#578** in one slice — a scope decision taken
at `/spec` that deliberately reverses `#580`'s own "not to be folded into #566" sequencing note; see
`plan.md` for the reasoning and the cost. Builds on `#564` (tokenised matching, five-tier ranking)
and `#565` (zero-result ladder, `SearchQueryLog`). A curated, vendor-scoped alias dictionary widens
what a query matches without ever replacing what the shopper typed; search recovery starts firing
when nothing _relevant_ was found rather than only when nothing at all was; and tokens carrying no
information stop being search terms.

Requirements are grouped so that a failure identifies which of the four issues it belongs to.

## A. The term model and expansion (#566)

R1. `lib/search-expansion.ts` exists and exports `expandSearchTerms(terms, aliases)`, returning one
group per input term, in input order, where a group has the shape
`{ term: string; variants: string[] }`.

R2. For every group `expandSearchTerms` returns, `variants[0]` is exactly the original term — an
alias only ever appends, so the shopper's own word is never removed from the query.

R3. `expandSearchTerms` called with an empty alias map returns one group per term whose `variants`
array has length 1 and equals `[term]`.

R4. Alias lookup is case-insensitive: an alias persisted as `Haldi` expands the parsed term `haldi`.

R5. Expansion is a single hop and does not compose: given a map containing both `a` to `b` and `b`
to `c`, the group for `a` has variants `["a", "b"]` and does not contain `c`.

R6. No group ever holds more than two variants, which follows from `@@unique([vendorId, alias])`
resolving a word to at most one canonical term — so the expanded predicate is at most twice the size
of the one `#564` already built, however large the dictionary grows.

R7. `lib/search-expansion.ts` performs no I/O — it imports neither `@/lib/db` nor `next/headers`, and
its unit tests construct the alias map in-process with no database.

## B. Ranking over groups (#566, prerequisite for #580)

R8. `lib/search-ranking.ts`'s ranking entry point takes term groups, and a candidate whose name
contains at least one variant of _every_ group is placed in a name tier (0, 1 or 2).

R9. Tier 0 is still decided by comparing the normalised candidate name against the joined
**original** terms, not against any expanded variant.

R10. `lib/search-ranking.ts` exports `hasNameTierCandidate(candidates, groups)`, returning `true` if
and only if at least one candidate falls in tier 0, 1 or 2.

R11. For a vendor with no approved synonyms, the `where` clause `searchProducts` builds for a given
query is structurally identical to the one `#564` built — an `AND` of per-term `OR`s over `name` and
`description` — so an empty dictionary changes neither results nor their order.

## C. Persistence, purity and the write path (#566)

R12. `prisma/schema.prisma` declares a `SearchSynonym` model carrying `vendorId`, `alias`,
`canonical`, a status of `PENDING` / `APPROVED` / `REJECTED`, a source of `SEED` / `STAFF` / `AI`,
and `@@unique([vendorId, alias])`. Status and source are Prisma enums, matching the existing
precedent of `OrderStatus`, `DiscountKind` and `VendorRole`.

R13. `SearchQueryLog` gains a field recording whether the direct search reached a name tier, written
from the same `hasNameTierCandidate` result the page uses, so a thin result is distinguishable in the
log from a good one — which `#565`'s `directResultCount` and `recoveryRung` together cannot express.

R14. A migration directory under `prisma/migrations/` creates the `SearchSynonym` table and adds the
`SearchQueryLog` column, and its `migration.sql` contains no `DROP INDEX` statement — the GAP-011
trigram drift that `--create-only` review has caught three times already.

R15. `lib/repositories/search-synonyms.ts` exists, every one of its exports takes `prisma` and
`vendorId` as explicit parameters, and the file contains no `getPrisma()` or `getPrismaWs()` call
expression and no value import of `next/headers`, `@/lib/tenant`, `@/lib/auth` or `@/lib/auth-rbac`.

R16. `lib/search-synonyms-service.ts` exists and is the only module that resolves a Prisma client and
the current vendor for the dictionary.

R17. The function that loads the alias map used for query expansion returns `APPROVED` rows only — a
`PENDING` or `REJECTED` row never widens a shopper's query.

R18. That load is bounded by a named constant in the source, so a vendor with an unexpectedly large
dictionary cannot make every search fetch an unbounded row set.

R19. Every `createMany` or `updateMany` written against `SearchSynonym` runs through `getPrismaWs()`,
never `getPrisma()` (#382).

R20. Submitting an alias that already exists for the vendor returns a field-level form error rather
than a 500, and the handling path uses `isUniqueViolation()` from `lib/repositories/prisma-errors.ts`
so that both the HTTP adapter's `23505` and the WebSocket adapter's `P2002` are caught.

## D. Staff surface and AI proposals (#566)

R21. `/staff/search-synonyms` requires `requireVendorRole("ADMIN")` and renders `PanelRefusal` on the
refusal branch — it does not `return null` and does not hand-roll equivalent markup.

R22. A store admin can add, edit and remove a synonym from that page, and each write is a server
action whose `"use server"` module exports async functions only.

R23. A store admin can approve or reject a `PENDING` row; after approval that alias expands queries,
and after rejection it does not.

R24. The AI proposal action is reachable only from `/staff/search-synonyms` behind
`requireVendorRole("ADMIN")`, and no code path reachable from `/search` invokes any AI call (#571).

R25. With `CLOUDFLARE_ACCOUNT_ID` or `CLOUDFLARE_API_TOKEN` absent, the AI proposal action returns a
message to the operator and writes no rows, rather than throwing.

R26. Rows the AI proposal action writes carry status `PENDING` and source `AI`, and the number of
query-log rows it reads per run is bounded by a named constant in the source.

R27. The AI proposal action selects its input from `SearchQueryLog` rows that found nothing **or**
were thin per R13 — not from zero-result rows alone.

R28. `prisma/seed.ts` seeds `#566`'s keyword list (bhindi, karela, haldi, keema, qeema, atta, dhania,
jeera, mirch, chana, aloo, baingan, methi) as `APPROVED` rows with source `SEED`, and running the
seed twice creates no duplicate rows.

R29. `matchProductListTerms` ("Shop your list") expands its terms through the same dictionary
function as `searchProducts`, so an approved alias works identically in both.

## E. Recovery on thin results (#580)

R30. When the direct search returns at least one candidate and `hasNameTierCandidate` is `false`,
`/search` renders **every** product the direct search returned **and** a suggestions block — no
product the direct search found is removed.

R31. The suggestions block on a thin result offers the dictionary's canonical term where the query
contains a known alias, and the typo-correction suggestion where one is within budget, each as a link
to that search.

R32. When at least one candidate reaches a name tier, no suggestions block renders.

R33. The zero-result ladder is behaviourally unchanged: with zero direct candidates the same three
rungs run in the same order with the same replace semantics `#565` shipped, and the existing tests'
observable assertions — which rung fired, which product ids came back — are unmodified.

## F. Tokeniser hygiene (#572)

R34. `parseSearchQuery` drops any token shorter than two characters, so `parseSearchQuery("e")`
returns `[]`.

R35. `parseSearchQuery` drops any token containing no letter or digit, so
`parseSearchQuery("rice - basmati")` returns `["rice", "basmati"]`.

R36. A query that is non-empty but parses to zero terms causes `/search` to tell the shopper the
query was too short, and issues no product query for it.

R37. `tests/search-query.test.ts`'s agreement test with `lib/shopping-list.ts` is narrowed to inputs
free of low-information tokens, and states in the test file why the two tokenisers now diverge.

## G. The live verification #565 deferred (#578)

R38. Under `npm run preview` against the dev Neon database, each of the three ladder rungs — typo,
identity and broad — is observed supplying results for a real query, the identity rung's category
relation filter included.

R39. Search latency is measured under `npm run preview` against the dev catalogue with both the
dictionary read and typo correction on the path, recorded as an actual number in `build-notes.md`,
and is inside `specs/mission.md`'s API `p95 under 400 ms` target — or, if it is not, `#565`'s recorded
fallback (degrade the typo rung to a no-op, start the ladder at identity) is applied and recorded.

R40. Against the dev database, a first-page search adds exactly one `SearchQueryLog` row and a "Next
page" click adds none, verified by reading real rows rather than a unit-level guard.

R41. An accessibility check of the recovery and suggestion markup — link contrast and visible focus
state — is run and its result recorded in `build-notes.md`, with any defect found either fixed here
or filed as a tracked issue.

## H. Gates

R42. `specs/roadmap.md` carries a change-log row for **PR #581** (the `#565` promotion to `main`),
which `npm run sdd:audit` reported as pending carry-forward at this slice's `/orient`.

R43. `CHANGELOG.md` is updated on this branch (Gate 4).

R44. `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` and
`npm run kms:validate` all pass.
