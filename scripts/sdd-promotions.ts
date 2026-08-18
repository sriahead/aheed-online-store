/**
 * Promotion-row auditing for `npm run sdd:audit` (#207).
 *
 * `sdd:audit` checks that every *slice* has a `specs/roadmap.md` change-log row. It had no
 * notion of a *promotion* — a merged `staging → main` PR — so a promotion that never got a
 * roadmap row was structurally invisible to it. That gap recurred five consecutive times
 * (PR #140, P4a's, PR #200, PR #203, PR #206), each caught by eye at a later `/orient`, and
 * each time the observation was written into the roadmap as prose and never acted on.
 *
 * The matcher lives here, separate from `scripts/sdd-check.ts`, for one reason: that file is
 * a CLI entry point that calls `process.exit()` at module scope, so importing it from a test
 * would terminate the test run. Keeping the decision logic pure and importable is what lets
 * the missing-row case be proven against fixture text instead of by mutating the real
 * `specs/roadmap.md` — mutating a tracked file to exercise a checker risks committing the
 * mutation, and leaves nothing re-runnable behind.
 */

export type Promotion = {
  /** The `staging → main` PR number. */
  number: number;
  /** Full merge commit SHA, or null when the API didn't return one. */
  mergeSha: string | null;
  /** ISO-8601 merge timestamp. */
  mergedAt: string;
};

export type PromotionVerdict = {
  promotion: Promotion;
  /** A roadmap change-log row cites this promotion. */
  cited: boolean;
  /**
   * Merged after the roadmap was last edited, so its row could not yet have been written.
   * A legitimate carry-forward, not a gap — the row rides the next slice's branch.
   */
  pending: boolean;
};

/** Short SHAs in roadmap rows run 7-8 chars (`6a6f51d`, `0836e572`); 7 is the safe prefix. */
const SHA_PREFIX_LENGTH = 7;

/**
 * Does any change-log row cite this promotion?
 *
 * Two accepted forms, both of which every real row already uses:
 *   - the PR number, written as `PR #229` (a bare `#229` is deliberately NOT accepted —
 *     issue and PR numbers share one space here, so a row naming issue #229 would
 *     otherwise satisfy a promotion that was never documented);
 *   - the merge SHA, matched on its first 7 characters, which covers rows that write it
 *     short (`merge 6a6f51d`) or slightly longer (`merge 0836e572`).
 */
export function isPromotionCited(promotion: Promotion, roadmapText: string): boolean {
  if (new RegExp(`\\bPR #${promotion.number}\\b`).test(roadmapText)) return true;
  if (promotion.mergeSha && promotion.mergeSha.length >= SHA_PREFIX_LENGTH) {
    return roadmapText.includes(promotion.mergeSha.slice(0, SHA_PREFIX_LENGTH));
  }
  return false;
}

/**
 * Classify every promotion as cited, pending carry-forward, or a genuine gap.
 *
 * `lastRoadmapEditISO` is when `specs/roadmap.md` was last committed. A promotion merged
 * after that point cannot have a row yet — under the carry-forward rule its row lands on
 * the next slice's branch — so reporting it would fire falsely on every branch cut right
 * after a promotion, which is the fastest way to get a check ignored. When it is null
 * (no git history available) nothing is treated as pending, and the citation check still
 * stands on its own.
 */
export function auditPromotions(
  promotions: Promotion[],
  roadmapText: string,
  lastRoadmapEditISO: string | null,
): PromotionVerdict[] {
  const lastEdit = lastRoadmapEditISO ? Date.parse(lastRoadmapEditISO) : null;

  return promotions
    .slice()
    .sort((a, b) => a.mergedAt.localeCompare(b.mergedAt))
    .map((promotion) => {
      const cited = isPromotionCited(promotion, roadmapText);
      const pending =
        !cited && lastEdit !== null && Number.isFinite(lastEdit)
          ? Date.parse(promotion.mergedAt) > lastEdit
          : false;
      return { promotion, cited, pending };
    });
}

/** Promotions that are neither cited nor a legitimate pending carry-forward. */
export function missingPromotionRows(verdicts: PromotionVerdict[]): PromotionVerdict[] {
  return verdicts.filter((v) => !v.cited && !v.pending);
}
