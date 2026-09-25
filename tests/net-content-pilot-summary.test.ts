import { describe, expect, it } from "vitest";
import { summariseNetContentPilot, type SummaryRow } from "@/lib/net-content-pilot-summary";

/** #900 (R22) — the pilot measurement shown on /staff/net-content. */

const row = (overrides: Partial<SummaryRow>): SummaryRow => ({
  status: "PENDING",
  unitLabelCheck: null,
  latencyMs: 1000,
  inputTokens: 400,
  outputTokens: 50,
  model: "@cf/google/gemma-4-26b-a4b-it",
  ...overrides,
});

describe("summariseNetContentPilot (R22)", () => {
  it("reports n/a rates when nothing exists or nothing is reviewed", () => {
    expect(summariseNetContentPilot([])).toMatchObject({
      total: 0,
      acceptanceRate: null,
      noAnswerShare: null,
      meanLatencyMs: null,
      models: [],
    });
    expect(summariseNetContentPilot([row({})]).acceptanceRate).toBeNull();
  });

  it("computes every figure from the rows", () => {
    const summary = summariseNetContentPilot([
      row({ status: "ACCEPTED", unitLabelCheck: "AGREES", latencyMs: 1000 }),
      row({ status: "EDITED", unitLabelCheck: "DISAGREES", latencyMs: 2000 }),
      row({ status: "REJECTED", unitLabelCheck: "NOT_CHECKABLE", latencyMs: 3000 }),
      row({ status: "PENDING", unitLabelCheck: "AGREES", latencyMs: 4000 }),
      row({
        status: "NO_ANSWER",
        latencyMs: 5000,
        inputTokens: null,
        outputTokens: null,
        model: "@cf/other",
      }),
    ]);

    expect(summary.byStatus).toEqual({
      PENDING: 1,
      ACCEPTED: 1,
      EDITED: 1,
      REJECTED: 1,
      NO_ANSWER: 1,
    });
    expect(summary.acceptanceRate).toBeCloseTo(1 / 3);
    expect(summary.noAnswerShare).toBeCloseTo(1 / 5);
    // PENDING's AGREES is not counted: only reviewed rows.
    expect(summary.labelCheckAmongReviewed).toEqual({ AGREES: 1, DISAGREES: 1, NOT_CHECKABLE: 1 });
    expect(summary.meanLatencyMs).toBe(3000);
    expect(summary.totalInputTokens).toBe(1600);
    expect(summary.totalOutputTokens).toBe(200);
    expect(summary.models).toEqual(["@cf/google/gemma-4-26b-a4b-it", "@cf/other"]);
  });
});
