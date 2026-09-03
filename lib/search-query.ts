/**
 * Storefront search tokenisation (P2.6 slice 1, #564) — pure, no I/O, so the
 * whole of it is unit-testable without a database or a Workers request (same
 * split as `lib/shopping-list.ts`, `lib/cart-rules.ts` and `lib/tier-pricing.ts`).
 *
 * Before this, `searchProducts` passed the whole trimmed query to a single
 * `contains`, so `basmati rice 5kg` matched only a product whose name or
 * description held that exact string in that exact order. Multi-word and
 * out-of-order queries returned nothing.
 *
 * WHY THIS IS A SECOND TOKENISER AND NOT A SHARED ONE.
 * `lib/shopping-list.ts` already splits text into terms correctly for the
 * paste-a-list path, and the two agree on every input that does not begin with
 * a quantity — `tests/search-query.test.ts` pins that agreement so they cannot
 * silently diverge. They differ deliberately at the quantity level: the list
 * matcher strips the `2` from `2 apples`, and search must NOT, because `5kg` in
 * `5kg basmati rice` is part of a product name rather than a count. Merging
 * them would mean teaching one function two behaviours selected by a flag,
 * which is how the caller's intent stops being visible at the call site.
 */

/**
 * Upper bound on the terms one query contributes to the SQL predicate.
 *
 * Each term becomes its own `AND` clause with an OR over two `contains`
 * comparisons, so an uncapped query is an uncapped predicate — a pasted
 * paragraph would otherwise build an arbitrarily large `WHERE`. Ten is well
 * past any real grocery search; the terms beyond it are dropped rather than
 * the query being refused, so an over-long paste still returns something
 * sensible.
 */
export const MAX_SEARCH_TERMS = 10;

/**
 * Same punctuation class as `lib/shopping-list.ts`'s `toTerms`, deliberately
 * duplicated rather than exported across — see the module docstring. The two
 * are pinned together by test, not by a shared symbol.
 */
const SURROUNDING_PUNCTUATION = /^[\s,.;:!?'"“”‘’()[\]]+|[\s,.;:!?'"“”‘’()[\]]+$/g;

/**
 * Shortest token that carries enough information to be a search term (#572).
 *
 * Measured against the dev catalogue at `#564`'s Build: `e` matched 2,026 of
 * roughly 2,000 products and `a` matched 2,024, because every term is satisfied
 * by `name` OR `description` and a one-letter substring appears in nearly every
 * description. A one-character query is not a search — it is the whole catalogue
 * in an arbitrary order. It was also the only thing that reliably triggered the
 * truncation notice, which exists to explain a genuinely incomplete result set.
 */
const MIN_TERM_LENGTH = 2;

/** At least one letter or digit, so a bare `-`, `&` or `--` is not a term (#572). */
const CARRIES_INFORMATION = /[\p{L}\p{N}]/u;

/**
 * A raw search box value → the terms every result must satisfy.
 *
 * Lowercases, splits on whitespace, strips surrounding punctuation from each
 * token, DROPS LOW-INFORMATION TOKENS (#572), and caps the result at
 * `MAX_SEARCH_TERMS`. Returns `[]` for a query that is empty or holds nothing
 * usable, which is what `searchProducts`'s empty-query guard tests — and, since
 * `#572`, also what `/search` renders its "too short" message from rather than
 * claiming the catalogue holds no match.
 *
 * WHERE THIS NOW DIVERGES FROM `lib/shopping-list.ts`, AND WHY.
 * The two tokenisers already differ on a leading quantity (see the module
 * docstring). Since `#572` they also differ on low-information tokens, and
 * `tests/search-query.test.ts`'s agreement test is scoped to say so. A search
 * term is a RECALL instrument, where a one-character token or a bare hyphen is
 * pure noise that matches most of the catalogue; a list line is something the
 * shopper wrote deliberately and which passes through a review step before
 * anything reaches a basket. Applying this filter to `parseListLine` too would
 * change "Shop your list" behaviour for no stated benefit.
 */
export function parseSearchQuery(raw: string): string[] {
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(SURROUNDING_PUNCTUATION, ""))
    .filter((token) => token.length >= MIN_TERM_LENGTH && CARRIES_INFORMATION.test(token))
    .slice(0, MAX_SEARCH_TERMS);
}
