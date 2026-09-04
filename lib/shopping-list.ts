/**
 * "Shop your list" parsing and matching (P3d, #114) — pure, no I/O, so the
 * whole of it is unit-testable without a database (same split as
 * lib/cart-rules.ts, lib/auth-origin.ts and lib/delivery.ts, and the same
 * split lib/search-expansion.ts and lib/search-ranking.ts already use).
 *
 * The repository fetches candidate products in ONE query for the whole list;
 * every per-line decision after that happens here. A 100-line list must not
 * become 100 queries.
 */

import { expandSearchTerms, type SearchTermGroup } from "@/lib/search-expansion";

/** A list is capped so one paste can't fan out into an unbounded query. */
export const MAX_LIST_LINES = 100;

/** Per-line quantity ceiling, applied before stock clamping. */
export const MAX_LINE_QUANTITY = 99;

/** How many products an ambiguous line offers before the list is just noise. */
export const MAX_CANDIDATES_PER_LINE = 5;

/** Upper bound on the single candidate query (see matchListTerms). */
export const CANDIDATE_QUERY_LIMIT = 200;

export interface ParsedLine {
  /** Exactly what the shopper typed — the review screen shows this back. */
  original: string;
  quantity: number;
  terms: string[];
}

/** The product shape the review step needs. Deliberately smaller than ProductSummary. */
export interface ListCandidate {
  id: string;
  slug: string;
  name: string;
  unitLabel: string;
  basePrice: number;
  /** Effective stock, already resolved by the repository. 0 means unavailable. */
  stock: number;
}

export type LineResolution =
  | { kind: "matched"; product: ListCandidate }
  | { kind: "ambiguous"; candidates: ListCandidate[] }
  | { kind: "unmatched" };

export interface ResolvedLine extends ParsedLine {
  resolution: LineResolution;
}

/**
 * The match step's form state. It lives here rather than beside the action
 * because a "use server" module may only export async functions — a plain
 * const export there fails the build.
 */
export interface MatchListState {
  /** null before the first submission — the entry form renders alone. */
  lines: ResolvedLine[] | null;
  /** Set when the box was empty or held nothing usable. */
  error?: string;
}

export const EMPTY_MATCH_STATE: MatchListState = { lines: null };

/**
 * Explicit quantity forms: "2x apples", "2 x apples" (leading) and "apples x2",
 * "apples x 2" (trailing). An explicit `x` always wins over the bare-integer
 * rule below.
 */
const LEADING_X = /^(\d+)\s*[x×]\s*(?=\S)/i;
const TRAILING_X = /\s*[x×]\s*(\d+)$/i;

/**
 * A leading bare integer is a quantity ONLY when followed by whitespace —
 * i.e. when it is not glued to a unit. "2 apples" is two apples; "5kg basmati
 * rice" is one bag of Basmati Rice 5kg. Four seeded products carry a size in
 * their name (Basmati Rice 5kg, Sunflower Oil 2L, Mixed Nuts 500g, Orange
 * Juice 1L), so a shopper transcribing a label hits this on ordinary input.
 */
const LEADING_COUNT = /^(\d+)\s+(?=\S)/;

function clampLineQuantity(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(Math.trunc(value), MAX_LINE_QUANTITY);
}

/** Lowercase, strip surrounding punctuation and quotes, drop empties. */
function toTerms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/^[\s,.;:!?'"“”‘’()[\]]+|[\s,.;:!?'"“”‘’()[\]]+$/g, ""))
    .filter((token) => token.length > 0);
}

/** Normalised form used for BOTH sides of a name comparison. */
export function normaliseName(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * One list line → a quantity and its search terms. Returns null for a line that
 * is blank or has no usable terms once punctuation is stripped.
 */
export function parseListLine(raw: string): { quantity: number; terms: string[] } | null {
  let rest = raw.trim();
  if (rest.length === 0) return null;

  let quantity = 1;

  const leadingX = rest.match(LEADING_X);
  if (leadingX) {
    quantity = clampLineQuantity(Number(leadingX[1]));
    rest = rest.slice(leadingX[0].length);
  } else {
    const trailingX = rest.match(TRAILING_X);
    if (trailingX) {
      quantity = clampLineQuantity(Number(trailingX[1]));
      rest = rest.slice(0, rest.length - trailingX[0].length);
    } else {
      const leadingCount = rest.match(LEADING_COUNT);
      if (leadingCount) {
        quantity = clampLineQuantity(Number(leadingCount[1]));
        rest = rest.slice(leadingCount[0].length);
      }
    }
  }

  const terms = toTerms(rest);
  if (terms.length === 0) return null;

  return { quantity, terms };
}

/** The whole pasted list → parsed lines, blanks dropped, capped at MAX_LIST_LINES. */
export function parseList(rawText: string): ParsedLine[] {
  const lines: ParsedLine[] = [];

  for (const raw of rawText.split(/\r?\n/)) {
    if (lines.length >= MAX_LIST_LINES) break;
    const parsed = parseListLine(raw);
    if (parsed) lines.push({ original: raw.trim(), ...parsed });
  }

  return lines;
}

/** Every distinct term across the list — the single query's search set. */
export function distinctTerms(lines: ParsedLine[]): string[] {
  return [...new Set(lines.flatMap((line) => line.terms))];
}

/**
 * Total, deterministic ordering so the same list always renders the same review.
 * A shorter name containing every term is the more specific product; the
 * alphabetical tie-break exists purely to remove residual ambiguity.
 *
 * Note: every candidate reaching here already contains ALL of the line's terms
 * (that is what makes it a candidate), so there is no all-terms-first tier to
 * apply — see build notes.
 */
function rankCandidates(a: ListCandidate, b: ListCandidate): number {
  if (a.name.length !== b.name.length) return a.name.length - b.name.length;
  return a.name.localeCompare(b.name);
}

/**
 * A candidate satisfies a group when its name contains ANY of that group's variants — same rule
 * `lib/search-ranking.ts`'s `tierOf` applies to search. With no approved alias for a term, its
 * group holds only that term, so this behaves exactly like the old literal-term check.
 */
function matchesAllGroups(candidate: ListCandidate, groups: readonly SearchTermGroup[]): boolean {
  const name = normaliseName(candidate.name);
  return groups.every((group) => group.variants.some((variant) => name.includes(variant)));
}

/**
 * Resolve every line against the one candidate set. A product matches a line only when its name
 * contains a variant of EVERY group — matching any single term would offer confident-looking wrong
 * products, which the review step exists to prevent.
 *
 * P2.6 slice 3 (#566, #396) — `aliases` widens each line's terms into groups here, mirroring what
 * `matchListTerms` already did to build the candidate pool. Without this, a candidate found ONLY
 * via an alias (`dhania` → a product named "Fresh Coriander") reached the pool but was silently
 * re-rejected as unmatched, because this function used to re-check the candidate's name against the
 * shopper's literal, unexpanded word — the same query, expanded on the DB side and not on this one.
 * Defaults to an empty map so every existing no-alias caller and test is unaffected: an empty map
 * yields single-variant groups, identical to the old per-term check.
 */
export function resolveLines(
  lines: ParsedLine[],
  candidates: ListCandidate[],
  aliases: ReadonlyMap<string, string> = new Map(),
): ResolvedLine[] {
  return lines.map((line) => {
    const groups = expandSearchTerms(line.terms, aliases);
    const fullMatches = candidates.filter((candidate) => matchesAllGroups(candidate, groups));

    if (fullMatches.length === 0) {
      let maxScore = 0;
      const scored = candidates.map((candidate) => {
        const name = normaliseName(candidate.name);
        const score = groups.filter((group) =>
          group.variants.some((variant) => name.includes(variant)),
        ).length;
        if (score > maxScore) maxScore = score;
        return { candidate, score };
      });

      if (maxScore > 0) {
        const partialMatches = scored.filter((s) => s.score === maxScore).map((s) => s.candidate);

        return {
          ...line,
          resolution: {
            kind: "ambiguous",
            candidates: partialMatches.sort(rankCandidates).slice(0, MAX_CANDIDATES_PER_LINE),
          },
        };
      }

      return { ...line, resolution: { kind: "unmatched" } };
    }

    const matching = fullMatches;

    // An exact name match resolves the line outright, even when other products
    // also contain every term ("milk" → Milk, not Milk + Whole Milk). Compares
    // against the ORIGINAL terms, never an expanded variant — same rule as
    // search's tier 0: an alias cannot make "this is exactly what I typed" more
    // true than it is.
    const joined = line.terms.join(" ");
    const exact = matching.filter((candidate) => normaliseName(candidate.name) === joined);
    if (exact.length === 1) return { ...line, resolution: { kind: "matched", product: exact[0] } };

    if (matching.length === 1) {
      return { ...line, resolution: { kind: "matched", product: matching[0] } };
    }

    return {
      ...line,
      resolution: {
        kind: "ambiguous",
        candidates: [...matching].sort(rankCandidates).slice(0, MAX_CANDIDATES_PER_LINE),
      },
    };
  });
}
