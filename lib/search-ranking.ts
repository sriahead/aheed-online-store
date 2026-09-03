/**
 * Storefront search relevance ranking (P2.6 slice 1, #564) — pure, no I/O.
 *
 * WHY THIS IS IN JAVASCRIPT AND NOT IN THE QUERY.
 * Relevance is not a stored column, Prisma cannot express the tier expression
 * in `orderBy`, and computing it in SQL would need `$queryRaw`, which
 * `CLAUDE.md` bans in `lib/repositories/*`. So `searchProducts` fetches a
 * BOUNDED candidate set and orders it here. That bound is what makes the cost
 * of ranking in memory fixed rather than proportional to the catalogue, and it
 * is also the honest limitation: see `SEARCH_CANDIDATE_LIMIT` and the
 * `truncated` flag in `lib/repositories/products.ts`.
 *
 * Being pure is the point — every tier and tie-break below is provable from a
 * unit test with no database and no Workers request.
 */

import type { SearchTermGroup } from "@/lib/search-expansion";

/** The minimum a row must carry to be ranked. Deliberately structural: the repository ranks its own `ProductSummary` objects and gets them back. */
export interface SearchCandidate {
  id: string;
  name: string;
  inStock: boolean;
}

/**
 * The normalised form used for BOTH sides of every name comparison below.
 *
 * Lowercases, trims, and collapses every internal run of whitespace to a single
 * space. That last step is where this deliberately DIVERGES from
 * `lib/shopping-list.ts`'s `normaliseName` (`toLowerCase().trim()`): tier 0
 * compares the normalised name against `terms.join(" ")`, which is
 * single-spaced by construction, so without collapsing, a product named with a
 * double space could never reach tier 0 no matter what the shopper typed.
 *
 * Terms arrive from `parseSearchQuery` already lowercased and
 * punctuation-stripped, so no work happens on that side.
 *
 * NOTE: Postgres `ILIKE` (which selected the candidates) uses collation rules
 * and JavaScript `toLowerCase()` uses Unicode ones, so the two can disagree
 * outside ASCII. The consequence is bounded: this function only ORDERS a set
 * the database already chose, so a disagreement can misplace a row within the
 * ranking but can never add or remove a result.
 */
export function normaliseCandidateName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Five tiers, lowest first. Relevance dominates availability deliberately: an
 * out-of-stock product whose name matches every term (tier 2) outranks an
 * in-stock product that only matched through its description (tier 3).
 *
 * Burying an out-of-stock staple reads to a grocery shopper as "they do not
 * sell this", which is worse than showing it as temporarily unavailable — and
 * the shopper already has an explicit `inStockOnly` filter for when they want
 * the other behaviour. Tier 0 makes that concrete: type a product's name
 * exactly and you always see it first, in stock or not.
 *
 * P2.6 slice 3 (#566) — tiers are computed over term GROUPS, so a product
 * matched through an approved synonym ranks exactly as strongly as one matched
 * through the word the shopper actually typed. A group is satisfied by ANY of
 * its variants; every group must still be satisfied. Over a flat expanded list
 * this would instead have demanded the shopper's word AND its alias both appear
 * in the name, dropping a legitimate alias match to a description-only tier.
 *
 * TIER 0 STILL USES THE ORIGINAL TERMS, not the expanded variants: it means "the
 * shopper typed this product's name", and an alias expansion cannot make that
 * more or less true.
 */
function tierOf(
  candidate: SearchCandidate,
  groups: readonly SearchTermGroup[],
  joined: string,
): number {
  const name = normaliseCandidateName(candidate.name);
  if (name === joined) return 0;

  const allGroupsInName = groups.every((group) =>
    group.variants.some((variant) => name.includes(variant)),
  );
  if (allGroupsInName) return candidate.inStock ? 1 : 2;
  return candidate.inStock ? 3 : 4;
}

/** The joined ORIGINAL query — tier 0's comparison target. */
function joinOriginalTerms(groups: readonly SearchTermGroup[]): string {
  return groups.map((group) => group.term).join(" ");
}

/**
 * Did anything actually match on NAME (tier 0, 1 or 2), rather than only through
 * a description?
 *
 * P2.6 slice 3 (#580). `#565`'s recovery fires only when a search returns zero
 * candidates, which leaves the more damaging case untouched: a query returning
 * one tangential product — matched because a term appears in some unrelated
 * item's prose — reads to a shopper as "they do not stock this" just as firmly
 * as an empty page, while consuming the one mechanism built to prevent that
 * conclusion. This is the predicate that distinguishes the two, computed from
 * the same tiers the ranking already uses so the definition of "relevant" cannot
 * drift between ordering and recovery.
 */
export function hasNameTierCandidate(
  candidates: readonly SearchCandidate[],
  groups: readonly SearchTermGroup[],
): boolean {
  const joined = joinOriginalTerms(groups);
  return candidates.some((candidate) => tierOf(candidate, groups, joined) <= 2);
}

/**
 * Order candidates by relevance, then availability, then a total tie-break.
 *
 * Within a tier: shorter name first (the more specific product), then name
 * alphabetically, then `id`. The `id` step exists so the order is TOTAL — two
 * products can legitimately share a name across categories, and a non-total
 * order makes pagination non-deterministic, which matters here because the
 * cursor is an offset into this array.
 *
 * Does not mutate its input: callers pass a candidate set they may still hold.
 */
export function rankSearchCandidates<T extends SearchCandidate>(
  candidates: readonly T[],
  groups: readonly SearchTermGroup[],
): T[] {
  const joined = joinOriginalTerms(groups);
  // Keyed by object identity, not by `id`: computing each tier once keeps the
  // comparator cheap, and nothing here needs ids to be unique to do it.
  const tiers = new Map<T, number>();
  for (const candidate of candidates) {
    tiers.set(candidate, tierOf(candidate, groups, joined));
  }

  return [...candidates].sort((a, b) => {
    const tierDelta = (tiers.get(a) as number) - (tiers.get(b) as number);
    if (tierDelta !== 0) return tierDelta;
    if (a.name.length !== b.name.length) return a.name.length - b.name.length;
    const nameDelta = a.name.localeCompare(b.name);
    if (nameDelta !== 0) return nameDelta;
    return a.id.localeCompare(b.id);
  });
}
