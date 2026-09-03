---
id: p2-6-search-tokenised-matching-and-ranking-plan
title: "P2.6 slice 1 — Tokenised search matching and relevance ranking (plan)"
audience: [dev]
type: spec
status: draft
version: "1.1.0"
updated: 2026-09-03
visibility: internal
summary: Storefront search matches every term in a multi-word query independently instead of treating the whole query as one substring, and orders results by relevance and availability instead of by recency. First slice of P2.6.
tags: [search, catalogue, p2-6, ranking, pagination]
related: [architecture, roadmap, nfr-baseline]
---

# P2.6 slice 1 — Tokenised search matching and relevance ranking (plan)

Issue **#564**. First slice of **P2.6 — Search & AI shopping**, and the only one in that milestone
that fixes a defect rather than adding a capability. No schema change, no migration, no AI, no raw
SQL.

> **Revised at review, 2026-09-03 (1.0.0 to 1.1.0).** `truncated` was defined as "the candidate cap
> was reached", which is a lie when the catalogue holds exactly 200 matches — the shopper would be
> told the list is incomplete when it is complete. It now uses a **sentinel fetch** and means "more
> than 200 matches provably exist". The empty-result contract, the candidate fetch's ordering and
> the ranker's normalisation rules were all underspecified and are now pinned.

**Goal:** make a multi-word search return the products a shopper is obviously asking for, and put
the most relevant and available ones first. Today neither is true, and the first of the two is a
plain defect rather than a missing feature.

## What is actually broken

`lib/repositories/products.ts:359` passes the **whole trimmed query as a single substring**:

```
OR: [
  { name: { contains: trimmed, mode: "insensitive" } },
  { description: { contains: trimmed, mode: "insensitive" } },
]
```

There is no tokenisation, so `basmati rice 5kg` matches only a product whose name or description
contains that exact string in that exact order. Multi-word and out-of-order queries return **nothing**
— before typos or synonyms enter the picture at all.

`lib/shopping-list.ts` already does this correctly for the paste-a-list path: it splits into terms
and requires a candidate to contain **every** term (`matchesAllTerms`). So the two matching paths in
this codebase already disagree about what a multi-word query means, and the storefront has the worse
half.

Separately, `findPage` (`lib/repositories/products.ts:204`) orders **every** storefront listing,
search included, by `createdAt desc, id desc`. Nothing considers relevance or availability.

## Scope (this slice)

**A pure tokeniser — `lib/search-query.ts`.** `parseSearchQuery(raw)` lowercases, splits on
whitespace, strips surrounding punctuation, drops empties, and caps the result at
`MAX_SEARCH_TERMS` (10) so a pasted paragraph cannot generate an unbounded `AND` clause. No I/O, so
it is unit-testable without a database — the same split as `lib/shopping-list.ts`, `lib/cart-rules.ts`
and `lib/tier-pricing.ts`.

**Matching becomes an `AND` of per-term predicates**, each term matching `name` **or** `description`.
Recall is deliberately unchanged at the SQL level: a term may still be satisfied by the description.
What changes is that *every* term must be satisfied by *something*.

**A pure ranker — `lib/search-ranking.ts`.** `rankSearchCandidates(candidates, terms)` returns a
total, deterministic order over five tiers:

| Tier | Rule |
|---|---|
| 0 | the normalised name equals the joined terms exactly — **regardless of stock** |
| 1 | every term appears in the **name**, and the product is in stock |
| 2 | every term appears in the **name**, and it is out of stock |
| 3 | not every term is in the name (so the description carried the match), in stock |
| 4 | not every term is in the name, out of stock |

Within a tier: shorter name first, then name alphabetical, then `id`. The `id` tie-break exists so
the order is **total** — two products can legitimately share a name across categories, and a
non-total order makes pagination non-deterministic.

**The normalisation contract is explicit, because it is where two reasonable implementations
diverge.** `normaliseCandidateName(name)` lowercases, trims, and collapses every internal run of
whitespace to one space. A term "appears in the name" when the normalised name `.includes(term)` —
terms arrive from `parseSearchQuery` already lowercased and punctuation-stripped, so no further work
happens on that side. Tier 0 is normalised-name equality with `terms.join(" ")`.

It collapses whitespace where `lib/shopping-list.ts`'s `normaliseName` (`toLowerCase().trim()`) does
not, deliberately: tier 0 compares against a single-spaced join, so without collapsing, a product
named with a double space could never reach tier 0 no matter what the shopper typed.

**SQL and JS agree on ASCII and may not on everything else.** Postgres `ILIKE` uses collation rules;
JavaScript `toLowerCase()` uses Unicode ones. The consequence is bounded: the ranker only *orders* a
set the database already selected, so a disagreement can misplace a row within the ranking but can
never add or remove a result.

**Relevance dominates availability, deliberately.** An out-of-stock product whose name matches every
term (tier 2) outranks an in-stock product that only matched through its description (tier 3). The
alternative — availability as the outermost sort — is what the Discover pass of 2026-09-03 challenged
on this issue: burying an out-of-stock staple reads to a grocery shopper as "they do not sell this",
which is worse than showing it as temporarily unavailable, and the shopper already has an explicit
`inStockOnly` filter (`buildFilterWhere`, `products.ts:189`) for when they want the other behaviour.
Tier 0 makes that concrete: a shopper who types a product's name exactly always sees it first, in
stock or not.

**Search stops using `findPage`.** It fetches a bounded candidate set ordered by
`createdAt desc, id desc` — a **total** order, so the chosen 200 are deterministic even when
timestamps tie right at the cap boundary — ranks it in memory, slices the requested page, and only
then looks up tier pricing for the twelve rows actually being rendered, not for all of the
candidates. The row-to-summary mapping currently inline in `findPage` is extracted to
a shared helper so both paths build an identical `ProductSummary`.

**Two additive contract changes.** `ProductPage` gains a boolean `truncated`, so the decision to warn
the shopper is made in testable repository code rather than inferred in the page. Item fields are
unchanged, and **every** return path carries the field — including the empty-query guard and the
out-of-range cursor, which return `{ items: [], nextCursor: null, truncated: ... }` rather than a
two-field object.

**`truncated` is set by a sentinel row, not by the cap.** The fetch asks for
`SEARCH_CANDIDATE_LIMIT + 1` rows; `truncated` is `rows.length > SEARCH_CANDIDATE_LIMIT`; the sentinel
is discarded and at most 200 candidates are ranked. Defining it as "the cap was reached" would make it
**lie** when the catalogue holds exactly 200 matches: nothing is missing, yet the shopper would be
told the list is incomplete. One extra row buys a flag that means what it says.

A cursor **beyond** the ranked candidate count returns an honest empty page — not a silent bounce
back to page one, which would loop a shopper who deep-linked a stale cursor — and carries the real
`truncated` value, since the candidate fetch has already happened by then.

**`listProducts` is untouched.** Browse mode (`/search` with no `q`) keeps keyset pagination exactly
as today. The change below is scoped to one function.

## The pagination decision, and the standing rule it amends

Relevance ranking and keyset pagination on `(createdAt, id)` are incompatible: the cursor's ordering
key has to be the sort key, and relevance is not a stored column. Prisma cannot express the tier
expression in `orderBy`, and computing it in SQL would need `$queryRaw`, which `CLAUDE.md` forbids in
`lib/repositories/*` and which P2.6 has already ruled out of scope.

So `searchProducts` fetches at most `SEARCH_CANDIDATE_LIMIT + 1` (201) matching rows, discards the
sentinel row if it came back, ranks at most `SEARCH_CANDIDATE_LIMIT` (200) candidates purely, and
paginates by slicing that ranked array. The cursor becomes a **non-negative integer offset into
the ranked candidate set**, parsed defensively — anything that is not such an integer is treated as
page zero rather than erroring.

`specs/architecture.md` currently says keyset pagination on `(createdAt, id)` is used "everywhere
lists can grow" and "never `OFFSET`". **This slice amends that**, narrowly, and the persistent doc is
updated in the same commit rather than left contradicting the code. The amendment is defensible on
the rule's own stated rationale: `OFFSET` is banned because "it degrades linearly and is the classic
mobile-scroll performance trap". Here the database query is **bounded and identical for every page** —
page ten costs exactly what page one costs — so the degradation the rule exists to prevent cannot
occur. What is given up is different and is stated plainly below.

**The honest cost of the cap.** A query matching more than 200 products cannot reach the products
beyond the cap, and which 200 are ranked is decided by the fetch's own `createdAt desc, id desc`
order, not by relevance. On a 2,000-product catalogue a broad single word such as `chicken` can plausibly exceed
it. This slice does not hide that: when more than 200 matches provably exist, the results page says so
and invites the shopper to narrow the search, rather than silently presenting a partial set as if it
were complete. A small presentational component owns that notice so it can be tested with the flag
forced both ways, rather than only when the dev catalogue happens to contain a broad enough query.
Raising or removing the cap needs either an index that can serve ranking or the `pg_trgm` work in
**#286**, and is not attempted here.

## Deliberately excluded

- **Typo tolerance and "did you mean".** `#565`, and `#286` for the `pg_trgm` optimisation. A
  misspelled term still returns nothing from this slice.
- **Synonyms and transliteration.** `#566`. `bhindi` does not find okra after this slice.
- **The zero-result recovery ladder and the search query log.** `#565`. This slice leaves the
  existing "No products match" copy alone apart from the cap notice described above.
- **Autocomplete.** `#568`. There is no suggestions endpoint and no client JS in this slice; the
  search form stays a plain no-JS GET.
- **New filter facets.** `#569`. The six existing controls are unchanged.
- **Removing `description` from matching.** It stays in the SQL predicate and is demoted by ranking
  instead. Dropping it is a recall regression this slice has no evidence to justify, and `#565`'s
  query log is what would produce that evidence.
- **Refactoring `lib/shopping-list.ts` to share the tokeniser.** The two tokenisers stay separate
  files; a test asserts they agree on inputs without a leading quantity. They differ deliberately at
  the quantity level — the list matcher strips `2` from `2 apples`, and search must not, because
  `5kg` in `5kg basmati rice` is part of a product name. Rewriting tested P3d code for cosmetic
  sharing is churn this slice does not need.
- **`prisma migrate`.** No schema change, so no migration and therefore no exposure to the
  `DROP INDEX` drift that has fired three times (`#508`).

## Open items carried forward

- **#286** stays open as the ranking/index optimisation and is the route to a larger candidate cap.
- **#565** depends on this slice's ranking tiers: tier 3 and tier 4 are precisely the
  "description-only, low-confidence" signal its ladder needs in order to fire on a thin result set
  rather than only on an empty one. That was the Discover finding of 2026-09-03 recorded against
  `#565`; this slice provides the mechanism, and `#565` decides the threshold.
- **#568**'s autocomplete will inherit whatever ranking this slice establishes, which is why the
  tiers are defined here rather than left implicit.
