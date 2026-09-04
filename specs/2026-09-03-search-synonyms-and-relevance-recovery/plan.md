---
id: p2-6-search-synonyms-and-relevance-recovery-plan
title: "P2.6 slice 3 — Synonym dictionary, relevance-triggered recovery and tokeniser hygiene (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-04
visibility: internal
summary: A curated vendor-scoped synonym dictionary expands search queries rather than replacing them, staff approve AI-proposed aliases drawn from the query log, recovery fires on thin results rather than only empty ones, and low-information tokens stop matching the whole catalogue.
tags: [search, catalogue, p2-6, synonyms, ranking, tokenisation]
related:
  [
    architecture,
    roadmap,
    nfr-baseline,
    p2-6-search-tokenised-matching-and-ranking-plan,
    p2-6-search-zero-result-recovery-plan,
  ]
---

# P2.6 slice 3 — Synonym dictionary, relevance-triggered recovery and tokeniser hygiene (plan)

Third slice of **P2.6 — Search & AI shopping**, built on `#564` (tokenised matching, five-tier
ranking) and `#565` (the zero-result ladder and `SearchQueryLog`).

**This slice covers four issues, by explicit decision taken at `/spec` on 2026-09-03:**

| Issue | What it contributes |
| --- | --- |
| **#566** | The curated `SearchSynonym` dictionary, staff CRUD, the approval queue, and the AI proposal step. Closes **#396**. |
| **#580** | The recovery trigger moves from "zero results" to "no relevant result". |
| **#572** | Tokeniser hygiene — single-character terms and a bare hyphen stop being search terms. |
| **#578** | The live-database verification `#565` deferred, run against real Postgres rather than a stub. |

## Why these four are one slice, and the decision that reverses

**`#580`'s own issue body says the opposite of what this plan does.** It records, at its `/propose`:
_"Sequencing: deliberately not folded into #566 — mixing a ranking-threshold change with a
dictionary slice makes both harder to validate. Best resolved before #568."_ That sequencing note is
**deliberately reversed here**, by the user's decision at `/spec`. Recording the reversal rather than
quietly contradicting the issue is the point of this paragraph — a future reader finding the two
documents in disagreement should find the disagreement explained, not have to guess which is current.

The argument for reversing it is that `#566` and `#580` are not two independent changes that happen
to touch one file. **Synonym expansion widens the direct predicate, which makes the exact condition
`#580` describes more likely, not less.** Once `haldi` also matches products named _Turmeric_, more
queries return a small non-empty result set — and every one of those sets bypasses the recovery
ladder entirely under `#565`'s strictly-zero trigger. Shipping the dictionary against the old trigger
would therefore make `#580`'s failure mode more reachable and then require a second slice to
re-narrow it. They also both need the same thing to exist first: a term model that can carry a
shopper's word _and_ its approved variants through both matching and ranking without either being
lost.

`#572` joins them because expansion consumes `parseSearchQuery`'s output directly: expanding a bare
`-` or a single character against the dictionary is work spent on a token that should never have
been a term. `#578` joins them because this slice must run `npm run preview` against the dev database
regardless, and `#565`'s deferred checks cover the very code paths this slice modifies — verifying
them _after_ the change and never before would leave it permanently unknown whether a failure was
pre-existing or introduced here.

**The honest cost of the decision:** this is a large slice — a new model, a migration, a new staff
page, an AI path, two tokeniser rules, a ranking-shape change and a trigger change.
`specs/roadmap.md` sized P2.6's six slices so each would "survive its own `/validate`", and this one
is materially bigger than that sizing assumed. The mitigation is that the four parts fail
independently, and `requirements.md` groups them so a validator can tell which part a failure
belongs to.

**Goal:** a shopper who types the word they actually use — `bhindi`, `haldi`, `keema` — finds the
shelf, and a shopper whose query returns one tangential product is offered a way out instead of
being left to conclude the shop does not stock it.

## The term model: one shopper word, several variants

Everything below depends on one new idea, so it comes first.

`#564` modelled a query as `string[]` — a flat list of terms, every one of which must be satisfied.
Expansion breaks that model. If `haldi` expands to `turmeric`, appending `turmeric` to the flat list
would require a product to contain **both** words; replacing `haldi` with `turmeric` would be
substitution, which `#566` forbids in as many words (_"the shopper's original query must remain in
the search"_).

So a parsed query becomes **groups**, one per word the shopper typed:

```ts
type SearchTermGroup = { term: string; variants: string[] };
```

`variants[0]` is always the original term. Approved aliases append to `variants`. A group is
satisfied when **any** of its variants matches. That single change makes expansion additive by
construction rather than by care.

**The expanded predicate stays bounded, and that falls out of the schema rather than needing a
cap.** `@@unique([vendorId, alias])` means a given word resolves to at most one canonical term, so a
group holds at most two variants and a ten-term query can never build a predicate more than twice
the size `#564` already allowed. Growing the dictionary adds rows, not query cost.

The three consequences:

- **Matching** — the predicate is an `AND` over groups, each group an `OR` over its variants across
  `name` and `description`. With an empty dictionary this is byte-for-byte the behaviour `#564`
  shipped, which is what makes the change safe to reason about.
- **Ranking** — `lib/search-ranking.ts`'s `tierOf` currently asks
  `terms.every((t) => name.includes(t))`. Against an expanded flat list that would demand the
  shopper's word _and_ its alias both appear in the name, so a _Turmeric Powder_ matched via `haldi`
  would fall to a description-only tier and look irrelevant. Over groups it becomes
  `groups.every((g) => g.variants.some((v) => name.includes(v)))`, and an alias match ranks exactly
  as strongly as the word the shopper typed.
- **Tier 0** — the "typed a product's name exactly" tier keeps comparing against the **original**
  joined query, not the expanded one. Tier 0 is about the shopper having typed the literal name; an
  alias expansion cannot make that more or less true.

## Scope (this slice)

### 1. The dictionary (#566, closes #396)

**`SearchSynonym`** — vendor-scoped, `@@unique([vendorId, alias])` so one alias resolves to one
canonical term per vendor, while many aliases may share a canonical term. Carries a `status`
(`PENDING` / `APPROVED` / `REJECTED`) and a `source` (`SEED` / `STAFF` / `AI`), so the approval queue
and the audit question "where did this row come from?" are both answerable from the row itself.
**Only `APPROVED` rows expand a query** — a `PENDING` AI proposal must never reach a shopper.

Mapping is **one-directional**, alias to canonical. `haldi` finds turmeric; `turmeric` already finds
turmeric and needs no help. Bidirectional expansion is excluded below.

`lib/repositories/search-synonyms.ts` holds the pure functions (`prisma` and `vendorId` as explicit
parameters, no request context, no `getPrisma()` call — `tests/repository-purity.test.ts` and
`tests/repository-client-injection.test.ts` both enforce this and both walk the whole directory).
`lib/search-synonyms-service.ts` is the request-scoped facade, matching the sibling-service pattern
every other repository already follows.

`lib/search-expansion.ts` is pure and holds `expandSearchTerms(terms, aliases)`, so the expansion
rule is unit-testable with no database — the same split as `search-query.ts`, `search-ranking.ts` and
`search-typo-correction.ts`.

**Consumers wired in this slice: storefront search (`searchProducts`) and the "Shop your list"
matcher (`matchProductListTerms`).** Those are the two that exist today. `#566` names four, but
autocomplete (`#568`) and the AI Shop List (`#567`) are not built yet — putting the rule in a shared
pure module is what makes them consume the same dictionary when they arrive, and is the substance of
`#566`'s _"a synonym that works in one and not another is the defect to design out"_.

**Staff surface** — `/staff/search-synonyms`, ADMIN-only, rendering `PanelRefusal` on the refusal
branch (never a bare `return null`; the portal shell would otherwise serve a blank content area that
reads as a loading state). Add, edit, remove, and approve or reject a pending proposal.

**The AI proposal step is staff-triggered and offline.** A button on that page reads the vendor's own
recent `SearchQueryLog` rows that found little or nothing, sends them to the Cloudflare Workers AI
REST API together with the vendor's canonical vocabulary, and writes the results back as `PENDING`
rows for a human to approve. It follows `lib/image-generation.ts` exactly: plain `fetch` against
`https://api.cloudflare.com/client/v4/accounts/.../ai/run/...` with the existing
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` from `getAiEnv()`, degrading to a clear message
rather than throwing when they are absent. **No new infrastructure and no new credential.** This is
the shape `#571` demanded: AI is reachable only by an authenticated store admin pressing a button,
never from the public `/search` path, so it cannot be driven by an attacker.

**Seed coverage** for `#566`'s keyword list — bhindi/okra, karela/bitter gourd, haldi/turmeric, keema
and qeema/minced meat, atta/chapati flour and wheat flour, dhania/coriander, jeera/cumin,
mirch/chilli, chana/chickpeas, aloo/potato, baingan/aubergine and eggplant, methi/fenugreek — written
as `APPROVED` with source `SEED`, idempotently, so the dictionary is useful on day one rather than
starting from a blank page.

### 2. Recovery on thin results, not only empty ones (#580)

`#580` offered three options. **Option 3 is taken, with the suggestion source made concrete**, and
the other two are rejected for reasons worth recording:

- **Option 1 — fire the existing ladder on a relevance threshold.** Rejected as specified, because
  the ladder _replaces_ the result set. A query returning fifty description-only matches would have
  all fifty swapped for a broader rung's results, removing products the shopper could legitimately
  have wanted. Recovery must never subtract.
- **Option 2 — drop `description` from search matching**, aligning with P3d's list matcher.
  Rejected: it deletes real recall on products whose names are terse, `#564` chose
  name-or-description deliberately and pinned it with tests, and it would silently change what
  `directResultCount` means in every `SearchQueryLog` row already written.
- **Option 3 — show suggestions alongside thin results.** Taken. Nothing is removed, no second
  result set is merged, and the trigger is a pure function of data already computed.

Concretely: a **thin** result is one where at least one candidate came back but **none reaches a name
tier** — every match arrived through `description` alone. `lib/search-ranking.ts` already computes
precisely this, so the slice exports it as `hasNameTierCandidate(candidates, groups)` rather than
recomputing the idea anywhere. On a thin result the page keeps every product it already had and
additionally renders suggestions: the dictionary's canonical term where an alias exists, and the
typo-correction suggestion where one is in budget, each as a link to that search.

**The zero-result ladder is untouched.** All three rungs, their order, and their replace semantics
stay exactly as `#565` shipped them. This adds a case beside them; it does not modify them.

Note how the two halves compose: with the dictionary approved, `haldi` matches turmeric **by name**,
lands in a name tier, and is never thin in the first place. Option 3 is the safety net for the terms
the dictionary does not yet know — which, before launch, is most of them.

**`SearchQueryLog` has to learn about thinness, or the dictionary cannot curate itself.** `#565`'s
log records `directResultCount` and `recoveryRung`, which between them describe a query that found
nothing and a query that found something — with **no way to tell a good result from a thin one**. A
`haldi` query returning one tangential product logs `directResultCount: 1, recoveryRung: null`,
identical to a query that worked perfectly. That is precisely the row `#566`'s AI proposal step most
needs to see, since a thin result is the strongest available signal that a word is missing from the
dictionary. So the log gains a field recording whether the direct result reached a name tier, written
from the same `hasNameTierCandidate` call the page already makes, and the proposal step selects on
zero-result **and** thin-result rows rather than zero alone. This is an additive column on an
existing table, in the same migration as `SearchSynonym`.

### 3. Tokeniser hygiene (#572)

Two rules, both in `parseSearchQuery`:

- **A token shorter than two characters is dropped.** Measured at `#564`'s Build, `e` matched 2,026
  of roughly 2,000 products and `a` matched 2,024 — a one-letter substring appears in nearly every
  description. Such a query is not a search; it is the whole catalogue in an arbitrary order. It is
  also the only thing that currently triggers the truncation notice, which exists to explain a
  genuinely incomplete result set.
- **A token containing no letter or digit is dropped.** This removes the bare `-` that survives today
  (`rice - basmati` currently demands a product whose text contains a literal hyphen) and generalises
  to any punctuation the shared surrounding-punctuation class does not strip.

**The two tokenisers stop being pinned on these inputs, deliberately.** `lib/search-query.ts` and
`lib/shopping-list.ts` already differ on a leading quantity; they now also differ on low-information
tokens, and `tests/search-query.test.ts`'s agreement test narrows to say so explicitly. The reason
they should differ: a search term is a _recall_ instrument where a one-character token is pure noise,
whereas a list line is something the shopper wrote deliberately and which is resolved through a
review step before anything enters a basket. Changing `lib/shopping-list.ts` to match would alter
"Shop your list" behaviour for no stated benefit and well outside this slice's framing.

**When every token is dropped**, the query is not run at all — `searchProducts` already returns early
on zero terms without touching the client — and `/search` says the query was too short rather than
"No products match", which would be a lie about the catalogue.

### 4. The live verification #565 deferred (#578)

Run in one `npm run preview` session against the dev Neon branch, **after** this slice's changes, so
each result describes the code that will actually ship:

1. Each ladder rung driven to fire against real Postgres, the identity rung included — its
   `category: { name: { contains: ... } }` relation filter has never once been executed against a
   real database, only against a stub client.
2. The typo-correction cost question `#565` flagged as _"Needs validation — measure before committing
   to it"_, measured on the real catalogue and written down as a number against `specs/mission.md`'s
   API `p95 under 400 ms` target. `listProductNameTokens` fetches every active product's name
   unpaginated, and this slice adds a dictionary read to the same path. `#565`'s `plan.md` already
   records the fallback if the budget does not hold — degrade rung 1 to a no-op and start the ladder
   at identity — so the measurement has a defined consequence either way.
3. `SearchQueryLog` rows confirmed to be written for a first-page search and **not** for a "Next
   page" click, checked against actual rows rather than a unit-level guard.
4. An accessibility pass over the recovery and suggestion markup — contrast and focus states — which
   `#565` took on trust from copied patterns.

## Deliberately excluded

- **AI expansion at query time**, embeddings, and vector search — `#566`'s own exclusions, and
  `#571`'s ruling. AI proposes rows offline; it never sees a shopper's query on the request path.
- **Bidirectional or transitive expansion.** `haldi` finds turmeric; turmeric does not find `haldi`,
  and a chain of two aliases does not compose. One hop, one direction, so the expanded predicate's
  size stays a function of the query rather than of the dictionary's shape.
- **Cross-vendor or platform-default dictionaries** — `#566`'s exclusion, unchanged. Each vendor
  curates its own.
- **Bulk approve or reject.** The queue is per-row. Bulk would need the `form=` attribute binding
  pattern to avoid nested forms — a known solved problem here, but unnecessary work at the volumes a
  pre-launch query log can produce.
- **`pg_trgm` fuzzy matching (#286)** and any raw SQL. Typo tolerance stays Levenshtein in
  TypeScript.
- **Changing `lib/shopping-list.ts`'s tokeniser** — see above.
- **Merging ladder results into a thin result set.** Considered and rejected while settling `#580`:
  it makes `truncated` and the recovery notice's wording ambiguous, for no gain over suggestions.
- **Re-tuning the trigger from real traffic.** `#580` notes the store is not live, so
  `SearchQueryLog` is effectively empty; every judgement here is reasoned from the catalogue, and
  revisiting it once real traffic exists is a post-launch question, not this slice's.
- **Autocomplete (#568) and the AI Shop List (#567)** as consumers — they do not exist yet.

## Open items carried forward

- **`#578` item 4's accessibility fix**, if the pass finds a real defect: this slice runs the check
  and records the result, but a substantive a11y remediation belongs with the a11y-debt work, the way
  P8.1a handled prior frontend debt.
- **The roadmap change-log row for PR #581** (the `#565` promotion), reported as pending
  carry-forward by `npm run sdd:audit` at this slice's `/orient`. It rides this branch, per the
  carry-forward rule.
- **`#286`** (pg_trgm fuzzy search) and **`#398`** (the unit and pack-size model `#567` needs) remain
  open and unaffected by this slice.
