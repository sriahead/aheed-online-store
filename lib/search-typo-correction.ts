/**
 * Deterministic typo correction for storefront search (P2.6 slice 2, #565) — pure, no I/O, so it
 * is unit-testable without a database or a Workers request (same split as `lib/search-query.ts`
 * and `lib/search-ranking.ts`).
 *
 * NOT AI. A term is only ever replaced by a token that already exists in the vendor's own
 * product-name vocabulary, chosen by nearest Levenshtein distance within a length-scaled budget —
 * see `correctTerms`'s docstring for why a term already in that vocabulary is never touched.
 */

/** Classic edit-distance DP. O(a.length * b.length), no recursion, no memo table beyond one row. */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const currentRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow.push(
        Math.min(
          currentRow[j - 1] + 1, // insertion
          previousRow[j] + 1, // deletion
          previousRow[j - 1] + cost, // substitution
        ),
      );
    }
    previousRow = currentRow;
  }

  return previousRow[b.length];
}

/**
 * How far a term of a given length is allowed to drift before a correction is trusted. Short
 * words are refused entirely (`oil` mistyped as `oik` is one edit away from a dozen unrelated
 * three-letter words — the false-positive rate isn't worth it), longer words get proportionally
 * more room.
 */
export function maxEditDistanceFor(termLength: number): number {
  if (termLength <= 3) return 0;
  if (termLength <= 6) return 1;
  return 2;
}

/**
 * Nearest token to `term` within its edit-distance budget, or `null` if none qualifies.
 *
 * The length pre-filter (only tokens within `budget` characters of `term.length` are ever run
 * through `levenshteinDistance`) is a performance shortcut, not a behaviour change: Levenshtein
 * distance can never be smaller than the two strings' length difference, so a token outside that
 * window could never have won anyway.
 *
 * Ties resolve to the alphabetically first candidate, so the choice is deterministic.
 */
function nearestToken(term: string, tokens: ReadonlySet<string>): string | null {
  const budget = maxEditDistanceFor(term.length);
  let best: string | null = null;
  let bestDistance = Infinity;

  for (const token of tokens) {
    if (Math.abs(token.length - term.length) > budget) continue;
    const distance = levenshteinDistance(term, token);
    if (distance > budget) continue;
    if (distance < bestDistance || (distance === bestDistance && best !== null && token < best)) {
      best = token;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Correct each of `terms` against `tokens` (the vendor's deduplicated product-name vocabulary —
 * see `listProductNameTokens`).
 *
 * A term already present in `tokens` is returned UNCHANGED, even if a closer-looking token exists
 * elsewhere — it already means something real in this catalogue, and "correcting" it anyway is
 * how a correctly spelled term with simply no matching product gets silently turned into a
 * different word. A term absent from `tokens` is replaced by its nearest token within budget, or
 * left as typed if none qualifies.
 *
 * `corrected` is `true` iff at least one returned term differs from the input at the same index —
 * callers use it to skip a redundant re-query when nothing could be corrected at all.
 */
export function correctTerms(
  terms: readonly string[],
  tokens: ReadonlySet<string>,
): { terms: string[]; corrected: boolean } {
  let corrected = false;
  const result = terms.map((term) => {
    if (tokens.has(term)) return term;
    const replacement = nearestToken(term, tokens);
    if (replacement === null) return term;
    corrected = true;
    return replacement;
  });

  return { terms: result, corrected };
}
