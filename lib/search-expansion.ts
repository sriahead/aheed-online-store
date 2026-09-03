/**
 * Storefront search synonym expansion (P2.6 slice 3, #566) — pure, no I/O, so
 * the whole rule is unit-testable without a database or a Workers request (same
 * split as `lib/search-query.ts`, `lib/search-ranking.ts` and
 * `lib/search-typo-correction.ts`).
 *
 * WHY GROUPS RATHER THAN A LONGER TERM LIST.
 * `#564` modelled a query as `string[]` where EVERY term must be satisfied. That
 * model cannot express an alias. Appending `turmeric` to `["haldi"]` would demand
 * a product containing both words; replacing `haldi` with `turmeric` would be
 * substitution, which `#566` forbids in as many words — the shopper's own query
 * has to stay in the search. Grouping the variants of one typed word together,
 * and satisfying a group when ANY variant matches, makes expansion additive by
 * construction rather than by care.
 *
 * The expanded predicate stays bounded, and that falls out of the schema rather
 * than needing a cap of its own: `@@unique([vendorId, alias])` resolves a word to
 * at most one canonical term, so a group holds at most two variants however large
 * the dictionary grows.
 */

/** One word the shopper typed, plus any approved alias it expands to. */
export interface SearchTermGroup {
  /** Exactly as parsed from the query — what tier 0 and the UI both quote back. */
  term: string;
  /**
   * Every string that satisfies this group, `variants[0]` ALWAYS being `term`
   * itself. That invariant is what makes "expansion never replacement" a
   * property of the type rather than a promise in a comment.
   */
  variants: string[];
}

/**
 * Alias keys are compared case-insensitively.
 *
 * `parseSearchQuery` already lowercases, so the query side needs no work — but a
 * row could have been written with any casing, and the repository's own
 * lowercasing on write cannot retroactively fix a row that predates it. Doing it
 * here too means the rule holds for whatever is actually in the table.
 */
function normaliseAlias(alias: string): string {
  return alias.toLowerCase().trim();
}

/**
 * Each parsed term → its group, in input order.
 *
 * Expansion is a SINGLE HOP and deliberately does not compose: the canonical
 * term a match produces is never itself looked up. A dictionary holding
 * `a -> b` and `b -> c` expands `a` to `["a", "b"]`, never to `["a", "b", "c"]`.
 * Chaining would make the predicate's size a function of the dictionary's shape
 * instead of the query's, and would let two independently reasonable staff
 * approvals compose into a mapping nobody reviewed.
 *
 * A self-mapping row (`rice -> rice`, which the staff form rejects but an older
 * row could hold) yields a single variant rather than a duplicated one, so a
 * pointless `OR` never reaches the query.
 */
export function expandSearchTerms(
  terms: readonly string[],
  aliases: ReadonlyMap<string, string>,
): SearchTermGroup[] {
  // Normalise the map's keys once per call rather than per term: the map is
  // bounded by the repository's own take limit, and a query is at most
  // MAX_SEARCH_TERMS long, so this is the cheaper way round.
  const lookup = new Map<string, string>();
  for (const [alias, canonical] of aliases) {
    lookup.set(normaliseAlias(alias), canonical.toLowerCase().trim());
  }

  return terms.map((term) => {
    const canonical = lookup.get(normaliseAlias(term));
    if (canonical === undefined || canonical === term || canonical === "") {
      return { term, variants: [term] };
    }
    return { term, variants: [term, canonical] };
  });
}

/**
 * The groups a query has when no dictionary applies — one single-variant group
 * per term.
 *
 * Exists so callers that have no vendor context (and the tests pinning `#564`'s
 * unchanged no-dictionary behaviour) can build the group shape without
 * constructing an empty Map at every call site.
 */
export function toUnexpandedGroups(terms: readonly string[]): SearchTermGroup[] {
  return terms.map((term) => ({ term, variants: [term] }));
}

/** Every variant across every group, deduplicated — the flat form the list matcher's `OR` needs. */
export function flattenVariants(groups: readonly SearchTermGroup[]): string[] {
  return [...new Set(groups.flatMap((group) => group.variants))];
}
