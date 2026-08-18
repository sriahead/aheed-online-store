import { describe, expect, it } from "vitest";
import {
  auditPromotions,
  isPromotionCited,
  missingPromotionRows,
  type Promotion,
} from "@/scripts/sdd-promotions";

/**
 * #207 — the promotion-row check. Everything here runs against fixture roadmap text rather
 * than the real specs/roadmap.md: a checker proven by mutating a tracked file leaves nothing
 * re-runnable and risks committing the mutation.
 */

const promo = (number: number, mergeSha: string | null, mergedAt: string): Promotion => ({
  number,
  mergeSha,
  mergedAt,
});

// Shaped like the real change log: a leading date cell, prose, and the promotion cited by
// both PR number and merge SHA.
const ROADMAP_WITH_ROW = `
| 2026-08-18 | **P7b + local dev environment tier promoted to production** (**PR #229**, \`staging → main\`, merge \`6a6f51d\`): both slices reached production together. | Two slices promoted |
`;

const ROADMAP_WITHOUT_ROW = `
| 2026-08-18 | **P7b merged to staging** (**PR #223**, merge \`9ecfc6f\`): validated live. | Merged to staging |
`;

describe("isPromotionCited", () => {
  it("matches a row citing the PR number", () => {
    expect(isPromotionCited(promo(229, null, "2026-08-18T10:00:00Z"), ROADMAP_WITH_ROW)).toBe(true);
  });

  it("matches a row citing only the merge SHA", () => {
    const sha = "6a6f51d2c3b4a5968778695a4b3c2d1e0f9a8b7c";
    expect(isPromotionCited(promo(999, sha, "2026-08-18T10:00:00Z"), ROADMAP_WITH_ROW)).toBe(true);
  });

  it("does not match a bare #NNN that isn't written as a PR reference", () => {
    // Issues and PRs share one number space here; a row about issue #229 must not satisfy
    // a promotion PR #229 that was never documented.
    const issueRow = "| 2026-08-18 | Closed issue #229 during the sweep. | Housekeeping |";
    expect(isPromotionCited(promo(229, null, "2026-08-18T10:00:00Z"), issueRow)).toBe(false);
  });

  it("does not match a different PR number that shares a prefix", () => {
    const row = "| 2026-08-18 | **PR #2290** landed. | x |";
    expect(isPromotionCited(promo(229, null, "2026-08-18T10:00:00Z"), row)).toBe(false);
  });

  it("reports an uncited promotion as uncited", () => {
    expect(
      isPromotionCited(promo(229, "6a6f51d0000", "2026-08-18T10:00:00Z"), ROADMAP_WITHOUT_ROW),
    ).toBe(false);
  });
});

describe("auditPromotions", () => {
  const lastEdit = "2026-08-18T12:00:00Z";

  it("marks a cited promotion cited and not pending", () => {
    const [verdict] = auditPromotions(
      [promo(229, null, "2026-08-18T10:00:00Z")],
      ROADMAP_WITH_ROW,
      lastEdit,
    );
    expect(verdict.cited).toBe(true);
    expect(verdict.pending).toBe(false);
  });

  it("reports an uncited promotion merged BEFORE the last roadmap edit as a gap", () => {
    const verdicts = auditPromotions(
      [promo(229, null, "2026-08-18T10:00:00Z")],
      ROADMAP_WITHOUT_ROW,
      lastEdit,
    );
    expect(verdicts[0].cited).toBe(false);
    expect(verdicts[0].pending).toBe(false);
    expect(missingPromotionRows(verdicts)).toHaveLength(1);
  });

  it("treats an uncited promotion merged AFTER the last roadmap edit as pending carry-forward", () => {
    // The case that would otherwise fire falsely on every branch cut straight after a
    // promotion — the row can only be written on the next slice's branch.
    const verdicts = auditPromotions(
      [promo(229, null, "2026-08-18T14:00:00Z")],
      ROADMAP_WITHOUT_ROW,
      lastEdit,
    );
    expect(verdicts[0].pending).toBe(true);
    expect(missingPromotionRows(verdicts)).toHaveLength(0);
  });

  it("treats nothing as pending when the last roadmap edit is unknown", () => {
    const verdicts = auditPromotions(
      [promo(229, null, "2026-08-18T14:00:00Z")],
      ROADMAP_WITHOUT_ROW,
      null,
    );
    expect(verdicts[0].pending).toBe(false);
    expect(missingPromotionRows(verdicts)).toHaveLength(1);
  });

  it("orders verdicts oldest-first regardless of input order", () => {
    const verdicts = auditPromotions(
      [promo(229, null, "2026-08-18T10:00:00Z"), promo(214, null, "2026-08-17T10:00:00Z")],
      ROADMAP_WITH_ROW,
      lastEdit,
    );
    expect(verdicts.map((v) => v.promotion.number)).toEqual([214, 229]);
  });

  it("returns no verdicts for an empty promotion list", () => {
    expect(auditPromotions([], ROADMAP_WITH_ROW, lastEdit)).toEqual([]);
  });
});
