---
id: p2-6-search-zero-result-recovery-plan
title: "P2.6 slice 2 — Zero-result ladder and search query log (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-03
visibility: internal
summary: A search that would otherwise show "No products found" first tries deterministic typo correction, then a looser identity-field match, then a broad match, before falling back to category and single-term suggestions, and every direct-search miss is logged (vendor-scoped, no user link) for review.
tags: [search, catalogue, p2-6, zero-result, analytics]
related: [architecture, roadmap, nfr-baseline, p2-6-search-tokenised-matching-and-ranking-plan]
---

# P2.6 slice 2 — Zero-result ladder and search query log (plan)

Issue **#565**. Second slice of **P2.6 — Search & AI shopping**, built directly on #564's tokenised
matching and five-tier ranking (`lib/search-query.ts`, `lib/search-ranking.ts`,
`lib/repositories/products.ts`'s `searchProducts`). Approved at `/propose` on 2026-09-03, then
revised at a second `/propose` the same day following Discover findings **#570** (a query log tied
to a signed-in user is personal data) and **#571** (an AI call on the live zero-result path is
attacker-controlled cost) — the version below has no AI on the request path and no user link on the
log. No `pg_trgm`, no raw SQL.

**Goal:** a search that finds nothing today should, where honestly possible, find something —
without ever silently substituting a different product for what the shopper asked for — and every
such miss should leave a trace staff can act on.

## What #564 leaves behind

`searchProducts` requires **every** parsed term to be satisfied by `name` **or** `description`
(an `AND` of per-term `OR`s). That is correct recall for a well-formed query and exactly zero help
for three routine grocery-search failures it does nothing about:

1. **A typo.** `bamati rice` matches nothing — no term is a substring of anything.
2. **An over-specific query.** `organic basmati rice` might correctly have no product satisfying
   all three terms simultaneously, even though `basmati rice` alone would.
3. **A word the catalogue doesn't have**, spelled correctly. `bhindi` (synonym for okra) is real
   grocery vocabulary and legitimately matches nothing — this slice cannot fix that one; it is
   **#566**.

Today all three render the same bare "No products match. Try a different search or clear your
filters." — indistinguishable from each other, and a dead end for the shopper.

## Scope (this slice)

**A zero-result ladder inside `searchProducts` itself**, not a second entry point. When the direct
(#564) query returns zero candidates, up to three further attempts run in order, stopping at the
first that yields at least one product:

| Rung | Predicate | What it's for |
|---|---|---|
| 1 — typo correction | Same `AND`-of-`OR` shape as the direct search, but with each uncorrectable-as-typed term replaced by the nearest token in the vendor's own product-name vocabulary | A misspelling of a real catalogue word |
| *(2 — synonym match)* | *not built here — see "Deliberately excluded"* | *#566* |
| 3 — identity-field OR | `OR` across terms, each matching **`name` or the product's category name** (description dropped) | A query too specific for every term to land on one product, loosened to "any term hits something the product actually is" |
| 4 — broad OR | `OR` across terms, each matching **`name` or `description`** | The widest net this codebase can express without `pg_trgm`/raw SQL |

If rung 4 still finds nothing, the page falls back to **relevant categories** (the same top-level
list already fetched for the department strip) and **alternative searches** (each individual term
of a multi-word query, offered as its own one-word search) instead of a bare "No products found".

**Rung 1 in detail — deterministic, not AI.** A term is a *candidate for correction* only when it
does not already appear verbatim in `listProductNameTokens(prisma, vendorId)` — the deduplicated,
lowercased token set of every active product's **name** (not description; a token from prose is a
much weaker signal of what the shopper meant). A term already in that set is never touched, so a
correctly spelled term that simply has no matching product is never corrupted into a different word.
For a candidate term, the nearest token by Levenshtein edit distance is used if it is within budget:

```
maxEditDistance(term.length) = 0 for length <= 3, 1 for length 4-6, 2 for length 7+
```

Ties (more than one nearest token at the same distance) resolve to the alphabetically first, so the
choice is deterministic and testable. A term with no token inside budget is left as typed. The
corrected term set — which may be identical to the original if nothing was correctable — is then run
through the *exact same* direct-search predicate. If that yields results, the page shows them with a
plain "Showing results for X instead of Y" notice; if not, the ladder continues to rung 3 regardless
of any partial corrections rung 1 found.

Cost containment on the length check, not just the edit-distance one: a term is only compared
against tokens within ±2 characters of its own length before running the O(n·m) distance
calculation, since Levenshtein distance can never be smaller than the length difference.

**Rung 3 and 4 reuse `rankSearchCandidates`** against the *original* query terms (not the rung-1
correction, which only applies to rung 1's own predicate), so a loosened match set is still ordered
by how much of what the shopper typed it actually satisfies. Both are capped at
`SEARCH_CANDIDATE_LIMIT` with the same `+1` sentinel `searchProducts` already uses, through one
shared internal fetch helper the direct search, rung 1, rung 3 and rung 4 all call — the query shape
changes per rung, the fetch/rank/cap machinery does not.

**`ProductPage` gains two additive fields**, `directResultCount: number` and
`recovery: SearchRecoveryInfo | null`:

```ts
type SearchRecoveryRung = "typo" | "identity" | "broad" | "none";
interface SearchRecoveryInfo {
  rung: SearchRecoveryRung;
  correctedTerms?: string[]; // only set when rung === "typo"
}
```

`directResultCount` is the candidate count from the **direct** (#564) fetch alone, captured before
any rung runs — cheap, since that count is already computed locally at that point regardless of what
happens next. It exists so the query-log write (below) can log a real count without a second query
just to re-derive one. `recovery` is `null` when the direct search already found something — the
ladder never ran. `{ rung: "none" }` means every rung was tried and none found anything — the page's
fallback (categories + single-term links) is what renders in that case. `findPage`-backed paths
(`listProducts`, `listProductsByCategory`) always return `directResultCount: 0, recovery: null` —
meaningless there, present only so every `ProductPage` has the same shape, matching how `truncated`
already works.

**A vendor-scoped search query log — `SearchQueryLog`.** Recorded once per search submission (see
"Why only the first page" below) — every submission, not only the zero-result ones, so
`directResultCount` on a healthy query gives staff a baseline to compare a recurring zero-result
query against. It exists to let staff later find those recurring gaps and promote them into #566's
synonym dictionary:

```prisma
model SearchQueryLog {
  id                String   @id @default(uuid())
  vendorId          String
  vendor            Vendor   @relation(fields: [vendorId], references: [id])
  query             String   // trimmed, lowercased, truncated to 200 chars
  directResultCount Int      // count from the #564 direct search, BEFORE any ladder rung
  recoveryRung      String?  // "typo" | "identity" | "broad" | "none" | null (direct search already succeeded)
  ipHash            String   // SHA-256, never the raw IP — see OrderLookupAttempt's precedent
  createdAt         DateTime @default(now())

  @@index([vendorId, directResultCount, createdAt])
}
```

`Vendor` gains the matching back-reference field, `searchQueryLogs SearchQueryLog[]`, alongside its
existing `lookupAttempts`/`authenticationAttempts`/`bindingRefusals` lines.

**No user link, by deliberate decision (#570).** A search history tied to a signed-in user is
personal data, and `lib/repositories/data-rights.ts` would then have to cover it in both export and
erasure. Carrying vendor + hashed IP only — exactly `OrderLookupAttempt` and `AuthenticationAttempt`'s
existing shape — serves the curation purpose (which queries recur, not who searched them) and removes
the compliance question at the root rather than answering it.

**Hashing happens inside the repository function, not the service** — `recordSearchQuery` takes the
raw client IP and hashes it itself (its own `hashIp`, SHA-256 hex — the same few lines duplicated in
`lib/repositories/order-lookup-rate-limit.ts` and `lib/repositories/auth-rate-limit.ts`; matching that
existing convention rather than introducing a shared IP-hashing helper this slice wasn't asked to
extract). The service resolves the raw IP the same way
`app/(storefront)/orders/lookup/page.tsx`'s `resolveClientIp()` already does
(`cf-connecting-ip`, else `x-forwarded-for`'s first entry, else `"unknown"`) and passes it straight
through.

**A retention sweep from the start**, same low-probability piggyback pattern as
`lib/repositories/error-events.ts` and `lib/repositories/order-lookup-rate-limit.ts`
(`SWEEP_PROBABILITY = 0.01`), so the extra `deleteMany` doesn't add latency to every request.
Retention is **90 days** — long enough for a monthly staff review to see a recurring pattern, short
enough that an unbounded-growth incident (`#468`'s original mistake) caps out at a bounded number of
rows regardless of traffic. `deleteMany` is confirmed safe on the HTTP adapter behind `getPrisma()`
(`#382`); no transaction, no `getPrismaWs()` needed.

**Why only the first page.** `searchProducts` recomputes the whole ladder on every call, including a
"Next page" click, because the ladder is a pure function of the query and the current catalogue —
recomputing it is what keeps page 2 showing the *same* rung's results as page 1. But the **log write**
only fires when `cursor` is `undefined`. A shopper paginating an already-successful search is not a
gap; logging every page of every multi-page browse would drown the signal the log exists to surface
in noise from queries that were never a problem.

**Staff visibility.** No new staff page ships in this slice — reading the log directly (or a future
`/staff` view, `#566`'s territory) is how the data gets used. This slice's job is only to make sure
the rows exist and mean what they say.

## Deliberately excluded

- **The synonym rung itself, and its data.** `#566` owns the synonym table, its staff-approval UI,
  and any AI-assisted suggestion generation. Rung 2 in the table above is a **placeholder in the
  design, not in the code** — this slice's ladder has three real rungs (1, 3, 4); #566 inserts its
  rung between 1 and 3 when it ships, rather than this slice building a rung that would do nothing
  today.
- **Any AI call on the request path.** Ruled out at the second `/propose` (#571): `/search` is public
  and unauthenticated, so a zero-result is trivially attacker-forced through `?q=`, there is no
  middleware layer on this stack to rate-limit it centrally (`CLAUDE.md`), and the AI quota is shared
  with the product-image pipeline (`#523`). AI stays staff-triggered and offline over the logged
  queries, in #566.
- **`pg_trgm` fuzzy matching.** Stays `#286`'s territory — Prisma has no similarity operator, so
  ranking by trigram distance needs `$queryRaw`, which `CLAUDE.md` forbids in `lib/repositories/*`,
  and P2.6 leaves that raw-SQL exception out of scope entirely.
- **A staff-facing view of the query log.** The table exists and is queryable; a UI over it is
  `#566`'s approval-queue territory, not this slice's.
- **Log retention beyond the 90-day sweep** (archival, export) — `#246`'s territory; noted, not
  solved here.
- **Changing what a *non-empty* result set looks like.** Ranking, tiers and the `truncated` notice
  are all #564's and untouched. This slice only changes what happens when the candidate set is
  empty.

## Open items carried forward

- **#566** inserts the synonym rung and its staff-approval UI, and is what makes the query log
  actually actionable rather than merely recorded.
- **The Discover finding of 2026-09-03** ("ranking in-stock first can hide that the shop stocks the
  item at all") is a challenge to #564's *already-shipped* ranking, not to this slice's ladder — it
  is out of scope here and needs its own `/propose`.
- **The weight-denominated-line Discover finding** touches #567 (AI Shop List), not this slice —
  noted so it isn't lost, not addressed here.
