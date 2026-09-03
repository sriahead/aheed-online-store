# P2.6 slice 1 — Tokenised search matching and relevance ranking (build notes)

Issue **#564**. Branch `feature/search-tokenised-matching-and-ranking`. Implementation commit
`53cd773`; the spec landed separately in `aa58187` per Gate 2.

## What changed and why

**Two new pure modules, and the reason they are separate files rather than helpers inside the
repository.** `lib/search-query.ts` (tokenise) and `lib/search-ranking.ts` (rank) contain the whole
of this slice's judgement — what counts as a term, and what counts as more relevant. Neither imports
`@/lib/db`, `next/headers`, `@/lib/tenant`, `@/lib/auth` or `@/lib/auth-rbac`, so both are provable
from a unit test with no database and no Workers request. That is the entire reason the ranking is
computed in JavaScript rather than expressed in SQL: relevance is not a stored column, Prisma cannot
put the tier expression in `orderBy`, and computing it in SQL would need `$queryRaw`, which
`CLAUDE.md` bans in `lib/repositories/*`.

**`searchProducts` stopped using `findPage`.** This is the structural change and it is worth being
explicit about, because "search got slower/faster" is not what happened — search stopped sharing a
function with browse. `findPage` paginates by keyset on `(createdAt, id)`, and a keyset cursor's
ordering key has to *be* the sort key. A computed relevance score cannot be a keyset column, so the
two are incompatible in principle rather than by implementation. `findPage` itself is unchanged in
ordering and cursor semantics and still serves every browse and category listing; R20 exists to
catch a regression there and passes live.

**The row-to-summary mapping was extracted to `toProductSummary`.** It was inline in `findPage`, so
the ranked path would have needed a second copy of a fifteen-field mapping. Two copies is how one
storefront surface quietly starts rendering a field the other does not — and `ProductSummary` has
grown three times already (`inStock` in P3a, `stockQuantity`/`lowStockThreshold` in #345, `tier` in
#348), so a fourth is a matter of when. `productSummarySelect` was extracted alongside it for the
same reason: the two paths now cannot select different shapes.

**`ProductPage.truncated` is set by a sentinel row, not by the cap.** The fetch asks for
`SEARCH_CANDIDATE_LIMIT + 1` (201) and the flag is `rows.length > SEARCH_CANDIDATE_LIMIT`. This was
settled at spec review and is the one design point most likely to be "simplified" later by someone
who notices the extra row: defining it as "the cap was reached" makes the flag **lie** when the
catalogue holds exactly 200 matches — nothing is missing, yet the shopper is told the list is
incomplete. `tests/search-repository.test.ts` carries an explicit "exactly 200" case with a
do-not-remove comment, because that case is the only one that distinguishes the two semantics.

**The truncation notice is its own component.** `components/product/SearchTruncationNotice.tsx`
exists so the flag can be forced both ways in a component test. Inline in the page, the notice could
only ever be exercised when the dev catalogue happened to contain a query broad enough to exceed the
cap — a property of seed data, not of this code — which invites the one fix that must never be made:
lowering `SEARCH_CANDIDATE_LIMIT` to manufacture a pass.

**Persistent docs updated on this branch, not deferred.** `specs/architecture.md` (1.22.0, in the
spec commit) carries the scoped exception to the keyset rule. `docs/developer-portal/nfr-baseline.md`
(1.3.0) records the re-measurement.

## Decisions taken during the build

**`rankSearchCandidates` is generic over `T extends SearchCandidate` and ranks `ProductSummary`
objects directly.** The alternative was a wrapper (`{ row, id, name, inStock }`) ranked and then
unwrapped. Ranking the summaries makes R18's "same fields as the keyset path" true by construction
rather than by assertion, and it costs 200 cheap object allocations. Tier pricing is attached after
the page is sliced, so `listActiveTiersForProducts` still sees at most `take` ids (R17).

**The tier cache inside the ranker is keyed by object identity, not by `id`.** Written with a
`Map<string, number>` first. Ids are unique coming from a database, but keying on them makes the
comparator silently wrong if two candidates ever share one, and nothing about the function's
signature promises they cannot. `Map<T, number>` costs nothing and removes the assumption.

**Name length and `localeCompare` operate on the raw name, not the normalised one.** This follows
`lib/shopping-list.ts`'s existing `rankCandidates` rather than inventing a second convention. The
`id` tie-break makes the order total regardless, which is what pagination actually needs — the
cursor is an offset into this array.

**`buildFilterWhere` is now exported.** Required by R8's validation row, which specifies comparing
the captured `where` against the helper's own output rather than a hand-written copy. A hand-written
expectation is exactly what lets a filter silently stop being applied while the test keeps passing.
It is exported for that reason and no other; nothing outside the test consumes it.

**Cursor parsing accepts anything and falls back to page zero.** `Number(cursor)`, then reject
non-integers and negatives. A cursor arrives straight from a URL a shopper may have edited,
bookmarked or truncated, so erroring on a malformed one turns a stale link into a 500. An
out-of-range offset returns an honest empty page rather than bouncing to page one, which would loop
a shopper following a stale deep link.

**The spies in `tests/search-repository.test.ts` are typed to accept an argument.**
`vi.fn(async () => rows)` gives `mock.calls` an empty tuple type, so `calls[0][0]` will not
typecheck — and the captured arguments are what most of that file asserts on. `vi.fn(async (_args:
unknown) => rows)` is the fix.

## Deviations from the spec

**Two corrections to the spec itself, made at Build and recorded in `plan.md`'s revision note
(1.1.0 to 1.2.0).** Neither changes what was built; both change what the spec claims.

1. `plan.md` said a broad single word such as `chicken` could plausibly exceed the candidate cap on
   a 2,000-product catalogue. **Measured, `chicken` matches 3 products** and `rice` 98. The cap is
   reachable, but by short low-information terms matching through descriptions — `e` matches 2,026,
   `a` matches 2,024. The sentence now records the measurement instead of the guess.
2. `validation.md`'s R19a optional row **named `chicken` directly** as the term to count. A
   validator following it literally would have found 3, concluded the truncation notice was
   unreachable, and recorded a false negative. The row now points at
   `scripts/verify-search-slice.ts`'s own multi-term probe, which reports the widest term it finds,
   and warns explicitly against assuming `chicken` is broad enough.

**No deviation in the implementation.** Every requirement R1–R27 was built as written, including the
sentinel semantics, the five tiers, the whitespace-collapsing normalisation and the three-field
empty return on every path.

## Known-shaky areas

**The ranker orders what SQL selected, and the two do not agree outside ASCII.** Postgres `ILIKE`
uses collation rules; JavaScript `toLowerCase()` uses Unicode ones. The consequence is bounded and
stated in `lib/search-ranking.ts`: a disagreement can misplace a row within the ranking but can
never add or remove a result. Not exercised — the seeded catalogue is ASCII. This becomes live when
**#566** brings transliteration in.

**Which 200 candidates get ranked is decided by `createdAt desc, id desc`, not by relevance.** For a
query that truncates, the ranking is therefore over the *newest* 200 matches, which is arbitrary
with respect to what the shopper wanted. This is the honest cost of the cap and is stated in
`plan.md`; the notice exists precisely because it cannot be papered over. It only bites above the
cap, which on the dev catalogue means single-character terms.

**Search latency was re-measured but there is no real before/after.** p95 is 67.6 ms against a
400 ms target, well inside it. That is the only supported claim. Four paths this slice never touched
also moved in the same run, and `getCategoryBySlug` got *slower* by more than search got faster —
so these figures are still round-trip-and-autoscaling noise, exactly as `nfr-baseline.md` already
warns for `listProducts`. A genuine comparison needs both variants measured in one session.

**The truncation notice has never rendered on a real page.** R19a's component test proves the
component both ways deterministically, and that is the binding proof. The optional system-level row
(curl a truncating query under `npm run preview` and grep for the copy) was **not** walked at Build.
It is reachable on the dev database using `e` or `a` as the query — do not use `chicken`.

**`parseSearchQuery` keeps an interior hyphen as its own term.** `-` sits outside the punctuation
class both tokenisers share, so `rice - basmati` parses to `["rice", "-", "basmati"]` and requires a
product whose text contains a hyphen. Left as-is deliberately: narrowing the class here would break
the R5 agreement with `lib/shopping-list.ts`. Pinned by a test so it is a recorded behaviour rather
than a surprise, and filed as **#572** together with the single-character-term problem, since both
live in the same function.

**Nothing here was validated against the spec by the context that wrote it.** These notes are build
evidence, not Gate 3.
