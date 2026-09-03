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
- **`matchProductListTerms` expansion (R29) has no live check.** It is unit-covered and shares the
  expansion function with search, but the "Shop your list" path was not driven end-to-end.
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
