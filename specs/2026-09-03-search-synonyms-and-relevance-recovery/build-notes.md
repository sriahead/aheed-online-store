# P2.6 slice 3 — Synonym dictionary, relevance-triggered recovery and tokeniser hygiene (build notes)

Written at the end of Build, before the Clear. Covers **#566** (closing **#396**), **#580**,
**#572** and **#578**.

## What changed and why

**The term-group model is the load-bearing change, and everything else hangs off it.**
`lib/search-expansion.ts` introduces `SearchTermGroup` — `{ term, variants }` with `variants[0]`
always the shopper's own word. `#564` modelled a query as `string[]` where every term must be
satisfied, and that model simply cannot express an alias: appending `turmeric` to `["haldi"]`
demands both words, replacing it is substitution, which `#566` forbids. Grouping the variants of one
typed word, and satisfying a group when ANY variant matches, makes "expansion never replacement" a
property of the type rather than a promise in a comment. The predicate stays bounded without a cap
of its own, because `@@unique([vendorId, alias])` resolves a word to at most one canonical term, so
a group holds at most two variants however large the dictionary grows.

`lib/search-ranking.ts` computes tiers over groups, so an alias-matched product ranks as a name
match instead of dropping to a description-only tier — that ordering bug is the whole reason
expansion could not have been a flat term list. Tier 0 still compares against the **original** joined
query: it means "the shopper typed this product's name", and an alias cannot make that more true.

**`hasNameTierCandidate` is exported from the ranking module rather than written fresh** so `#580`'s
notion of "relevant" and the ranking's notion cannot drift apart. That was the main design risk in
folding `#580` into this slice.

**`#580` is additive, never subtractive.** The zero-result ladder REPLACES the result set, which is
right for a query that found nothing and wrong for one that found something tangential — fifty
description-only matches must not all be swapped out. So a thin result keeps every product and gains
a notice beside it. The ladder's three rungs, their order and their semantics are untouched.

**`SearchQueryLog` gained `directNameMatch`** because `directResultCount` and `recoveryRung`
together genuinely cannot express a thin result: `haldi` returning one tangential product logs
`directResultCount: 1, recoveryRung: null`, byte-identical to a query that worked. Those are exactly
the rows `#566`'s proposal step most needs. Nullable on purpose — rows written before the column
existed do not know, and "unknown" must not read as "thin", so the curation query matches `false`
explicitly rather than "not true".

**Repository/service split** follows the established pattern: `lib/repositories/search-synonyms.ts`
is pure (client and vendor as explicit parameters, no request context) and
`lib/search-synonyms-service.ts` is the request-scoped facade, because `app/**`, `features/**` and
`components/**` are ESLint-forbidden from importing `@/lib/db`. `createProposedSynonyms` uses
`createMany` and so takes a `getPrismaWs()` client (#382).

**AI is staff-triggered and offline only** (#571): `lib/search-synonym-proposals.ts` is imported by
nothing under `app/(storefront)`, uses the same Cloudflare REST transport as
`lib/image-generation.ts` with the existing account credentials, and every row it writes lands
`PENDING`/`AI`.

**`#572`** drops sub-two-character tokens and tokens carrying no letter or digit. `/search` reports
"too short" for a query that parses to nothing, rather than "No products match", which would be a
lie about the catalogue — and `searchProducts` already returned early there, so no query is issued.

## Decisions taken during the build

- **Staff-entered synonyms are `APPROVED` on creation, not `PENDING`.** The spec did not say. A store
  admin typing an entry *is* the approver; `PENDING` exists for AI proposals. `source` still records
  `STAFF` vs `SEED` vs `AI`, so provenance is answerable from the row.
- **One form per row with `name="intent"` submit buttons**, rather than one form per action. A row
  needs save, remove and (when pending) approve/reject; HTML forbids nested forms, and side-by-side
  forms would each repeat the row's hidden fields. One form also means one authorization check.
- **`useActionState` client components rather than plain progressive-enhancement forms.** The
  duplicate-alias case has to surface as a visible field error (R20), and that needs the action's
  return value rendered. The forms are still real `<form>`s posting server actions.
- **Expansion is one hop and does not compose** (`a -> b`, `b -> c` gives `a` only `["a","b"]`).
  Chaining would make predicate size a function of the dictionary's shape rather than the query's,
  and would let two independently reasonable staff approvals compose into a mapping nobody reviewed.
- **`SYNONYM_LOAD_LIMIT = 500`** — a real curated grocery dictionary is dozens of rows; this is far
  past that and still trivial, while bounding the read that now sits on every search.
- **Seed idempotency is by ALIAS, not by row count.** A count guard cannot repair a partially-seeded
  dictionary, which is `#502`'s lesson about guards positioned to skip work wholesale.
- **Model `@cf/meta/llama-3.1-8b-instruct`**, and the response parsed defensively — a model's reply
  is untrusted input, so anything that is not two non-empty differing strings is dropped rather than
  repaired, and the batch is capped at `PROPOSAL_RESULT_LIMIT`.
- **`scripts/verify-search-synonyms-migration.ts` was kept in the repo**, matching
  `scripts/verify-search-slice.ts` and `scripts/verify-repository-injection.ts`. It needs
  `indexname::text` — `pg_indexes.indexname` is Postgres type `name`, which the Neon driver adapter
  cannot deserialize (`UnsupportedNativeDataType`).

## Deviations from the spec

**One, and a test found it.** R30/R31 describe the thin-result block as offering the canonical term
and/or the typo correction. Building it revealed that the commonest thin result *before the
dictionary is populated* has **neither** — no approved alias covers the term, and no correction is
in budget — so under the spec as written the block would render nothing at all, leaving precisely
the shopper `#580` exists for with one tangential product and no signal that it is tangential.

`ProductPage.suggestions` is therefore **non-null whenever the result is thin**, both fields
independently nullable, and `SearchSuggestionsNotice` always renders in that state: it says the
results are loosely related, lists whichever suggestions exist, and falls back to the department
links the zero-result notice already uses. This is a small scope addition beyond R31's literal text
(the department links), taken deliberately rather than widening the requirement quietly. A validator
checking R31 will find the canonical and typo suggestions exactly as specified, plus this.

Nothing else deviates.

## Fix pass (post-/validate)

`/validate` (fresh context, 2026-09-04) found one real defect and two measurement/recording gaps
that turned out not to be defects at all:

- **Blocking, real bug: R29 was false.** Closing the "no live check" gap this file already flagged
  below found that `matchProductListTerms` widens its own SQL predicate with the approved alias map
  (correct), but `lib/shopping-list.ts`'s `resolveLines` — the separate, pure step that re-checks
  each returned candidate against a line's terms — had no knowledge of that map at all. It re-ran
  the check against the shopper's literal, unexpanded word, so a candidate found ONLY via an alias
  was fetched into the pool and then silently re-rejected as `"unmatched"`. Confirmed live under
  `npm run preview`, same dev catalogue, same term: `/search?q=dhania` finds *Fresh Coriander 100g*
  (via the seeded `dhania` → `coriander` alias); "Shop your list" with `dhania` resolved
  `"unmatched"`. Root-caused and fixed by threading the alias map through, not by loosening
  `resolveLines`'s contract: `ProductRepository` gains `synonymAliasMap()` (docstring on the
  interface explains why the map — not just the candidate pool — has to reach this second step);
  `matchList` fetches it alongside `matchListTerms` and passes it into `resolveLines`, which now
  expands each line's terms into groups via the SAME pure `expandSearchTerms` search already uses,
  and matches a candidate when every group is satisfied by any variant — identical rule to
  `search-ranking.ts`'s `tierOf`. The exact-match tier still compares against the ORIGINAL joined
  terms, never an expanded variant, mirroring R9's "an alias cannot make an exact match more true"
  rule. `aliases` defaults to an empty map, so every pre-existing caller and the 23 existing
  `resolveLines` tests are unaffected byte-for-byte — confirmed by running them unchanged before
  writing new coverage. Four new tests in `tests/shopping-list.test.ts` cover: resolving via the
  alias, the pre-fix behaviour reproduced exactly by omitting the third argument, the exact-match
  tier staying original-terms-only, and the alias staying additive (the literal word still matches
  directly). **Observable behaviour changed** (a list line whose word only matches through an
  approved alias now resolves instead of reporting unmatched, and can legitimately come back
  `"ambiguous"` when the canonical term has several products — e.g. `chana` → `chickpeas` now offers
  *Chana Dal 2kg* alongside four generated Chickpeas products, all correctly found via the same
  alias `/search` already used), so `CHANGELOG.md` is updated.
- **Not a bug — a bad measurement: R39.** `/validate`'s first pass measured a 50-request p95 of
  ~448ms for the worst-case zero-result query and reported it as over the 400ms target, with the
  fallback (`plan.md`'s "degrade the typo rung to a no-op, start the ladder at identity") named as
  the apparent next step. Before applying it, direct per-query timing (a Node script hitting the
  real dev database, bypassing the Worker) showed every individual query the ladder issues costs
  ~20–30ms — nowhere near enough to explain that number even across five sequential round trips.
  The 448ms sample had been taken while several other DB scratch scripts and admin-action POSTs were
  running concurrently in the same session — the same class of contamination `CLAUDE.md` already
  documents for `vitest` under concurrent load, just for HTTP latency instead of test execution. Two
  clean, isolated re-measurements (30 then 50 requests, nothing else running) gave p95 ≈ 319ms and
  ≈ 326ms respectively, comfortably under target; baseline (a direct-hit query with no ladder at
  all) sits at p95 ≈ 249ms, so the ladder's own incremental cost is only ~70–80ms at p95. **Applying
  the fallback would have been the wrong fix for a measurement artifact, and would have broken R33**
  (same three rungs, same order — the fallback removes the typo rung entirely), which is exactly the
  "know when a fix is really a redesign" case: the correct fix here was re-measuring cleanly, not
  changing the ladder. No code changed. Recorded number: **p95 ≈ 326ms** (50 requests, isolated,
  `npm run preview` against the dev catalogue, query `xyzzy999notreal`), under the 400ms target — R39
  passes as originally specified.
- **Recording gaps, not defects.** `validation.md`'s own environment note required Build to record
  concrete dev-catalogue queries for R30–R32 and R38, and an accessibility-check result for R41;
  none had been recorded. `/validate` found and confirmed all of them live — recorded here so a
  future fresh context doesn't have to re-derive them:
  - **Thin result (R30–R32):** `masoor` — one description-only match (*Red Split Lentils 2kg*, via
    "Masoor dal" in its description), no approved alias, no in-budget correction → suggestions block
    renders with department links only (the no-suggestions case R31's own deviation note describes).
    `aloo` — approved alias to `potato` (description-only match) → suggestions block offers
    "potato". `flavour` — no alias, but within typo budget of `flour` (a real name token) → offers
    "flour" as the typo suggestion. `rice` — real name-tier match → no suggestions block at all
    (R32).
  - **Ladder rungs (R38):** `ricee` → typo rung, corrects to `rice`. `fruit xyzzy999` → identity
    rung, via the `category.name` relation filter matching "Fruit & Veg" (this is the case
    `build-notes.md` had flagged as never run against real Postgres — confirmed live here for the
    first time). `xyzzy999 masoor` → broad rung, via `masoor` matching *Red Split Lentils*'s
    description once the AND-across-terms direct predicate and the name/category-only identity rung
    both fail.
  - **Accessibility (R41):** link colour is `--color-action` (Aheed's live-rendered vendor branding
    is `#108020`, not the `tokens.css` default `#2e7d32` — `brandStyle()`'s inline override wins, so
    the LIVE rendered value is what was checked) against both `bg-surface-muted` (`#f5f5f0`, contrast
    4.65:1) and the actual `bg-white` pill the links render on (5.08:1) — both clear WCAG AA's 4.5:1
    for normal text. Focus state: `focus-visible:ring-2 focus-visible:ring-action
    focus-visible:ring-offset-2` is present on every suggestion/department link. No defect found.

## Known-shaky areas

- **The real AI call has never executed.** Neither `CLOUDFLARE_ACCOUNT_ID` nor
  `CLOUDFLARE_API_TOKEN` is present in `.env` or `.dev.vars`; both exist in `secrets/staging.vars`
  and `secrets/production.vars`. So the **degradation** path (R25) is what local preview exercises
  by default, and **R26/R27's live half is the least-tested code in this slice** — the request
  shape, the response envelope (`result.response`), and `parseProposalResponse` against a real
  reply. To validate: copy those two values from `secrets/staging.vars` into `.dev.vars` and
  **restart `npm run preview`** (that file is read at Worker boot), then press the button. Note the
  query log is effectively empty pre-launch, so seed it by running a few failing searches first, or
  the run correctly returns "No failed searches to learn from yet."
- **Proposal quality is unassessable pre-launch** and is not a code property. Both this and the
  unverified live call are tracked in **#583**.
- **`prisma migrate dev` hung**, twice, producing no output; both invocations were killed. The
  migration had in fact applied — `prisma migrate status` reports "Database schema is up to date!",
  and the verification script confirms `SearchSynonym`, `SearchQueryLog.directNameMatch` and all
  three `pg_trgm` indexes. Worth re-confirming against the dev branch at Validate rather than
  trusting this note.
- **GAP-011 fired a fourth time.** The generated migration proposed `DROP INDEX` for all three
  hand-authored trigram indexes, from a model unrelated to `Order`/`User`. Removed before applying
  and verified present afterwards. The migration's explanatory comment contains the literal string
  `DROP INDEX`, so **R14's grep must stay anchored** (`^DROP INDEX`) — validation.md was corrected
  during Build for exactly this reason. An unanchored grep matches the explanation and would reward
  deleting it.
- **`matchProductListTerms` expansion (R29) — RESOLVED at the Fix pass above.** The live end-to-end
  check this line originally flagged as missing is what found the real bug: `resolveLines` was
  alias-blind. See "Fix pass" for the defect, the fix and the new test coverage. Left here, struck
  through in spirit rather than deleted, so the history of how this was found stays legible.
- **Thin-result detection depends on `hasNameTierCandidate` over the DIRECT candidate set only.** If
  a filter (price, in-stock) narrows results to description-only matches, the notice fires — which
  is intended, but is the case most likely to look surprising in live use.
- **A seed run failed mid-way** on an S3 `ConnectTimeoutError` in `refreshProductImages`, before
  reaching synonym seeding. Transient and unrelated; the retry succeeded. Mentioned so a repeat is
  not mistaken for a defect in this slice.
- **CLAUDE.md's vitest file/test baseline was stale again** (77/903 against a real 86/1019) and is
  corrected on this branch. The worker-startup trap fired during this Build and was caught by the
  file count — and that run exited **1**, not 0.

## Deferred items filed as issues

- **#582** — bulk approve/reject on the synonym queue (per-row today; `plan.md` excludes it
  deliberately, and the trigger to build it is a real proposal run returning up to 25 rows).
- **#583** — the real AI call and proposal quality are both unverified; carries the exact recipe for
  exercising the call locally.
- **#584** — `CLAUDE.md`'s vitest file-count baseline has gone stale twice and disabled the very
  detection it exists to provide; proposes fixing the pool behaviour or checking the count in CI
  rather than documenting it harder. Corrected to 86/1019 on this branch as the stopgap.
