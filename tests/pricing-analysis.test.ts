import { describe, expect, it } from "vitest";
import { buildPricingAnalysis, type PricingAnalysisInput } from "@/lib/pricing/analysis";
import type { Assumption, AssumptionId } from "@/lib/pricing/assumptions";
import type { BusinessModel, Recommendation } from "@/lib/pricing/business-models";
import type { Competitor } from "@/lib/pricing/competitors";
import type { ProposedPlan } from "@/lib/pricing/proposed-plans";
import type { CostReport } from "@/lib/running-costs";

/** #1309 R11-R16. The R15 fixture is reproduced verbatim from requirements.md. */

const NOW = new Date("2026-10-27T12:00:00Z");

function costs(monthlyCents: number, stale: string[] = []): CostReport {
  const totals = { annualCents: monthlyCents * 12, monthlyCents };
  return {
    current: totals,
    withPlanned: totals,
    atRenewal: totals,
    attention: [],
    renewals: [],
    unpriced: [],
    byGroup: {
      "platform-fixed": totals,
      "platform-usage": { annualCents: 0, monthlyCents: 0 },
      "dev-tools": { annualCents: 0, monthlyCents: 0 },
    },
    stale,
    ownerToConfirm: [],
  };
}

function assumption(id: AssumptionId, value: number | null, asOf = "2026-10-27"): Assumption {
  return {
    id,
    label: id,
    value,
    unit: "",
    basis: value === null ? "missing" : "published-source",
    sourceUrl: value === null ? null : "https://example.org",
    asOf,
    derivedFrom: null,
    note: null,
  };
}

function plan(id: string, monthlyFeePence: number, commissionBps: number): ProposedPlan {
  return {
    id,
    name: id,
    model: "hybrid",
    status: "proposal",
    monthlyFeePence,
    commissionBps,
    includes: [],
    addOns: [],
    positioning: "",
    vatNote: "",
  };
}

function model(id: string, representativePlanId: string): BusinessModel {
  return {
    id: id as BusinessModel["id"],
    name: id,
    description: "",
    advantages: [],
    disadvantages: [],
    risks: [],
    representativePlanId,
  };
}

const recommendation: Recommendation = {
  modelId: "hybrid",
  reasoning: [],
  reviewedOn: "2026-10-27",
  nextReviewDue: "2027-01-27",
};

/**
 * R15, verbatim: costs.withPlanned.monthlyCents 1000, usd-cents-per-gbp 125, card-fee-bps 150,
 * plans S (fee 2000, commission 0), C (fee 0, commission 500), H (fee 1000, commission 200),
 * F (fee 0, commission 100), scenarios [5], recommendation representative plan H.
 */
function fixture(overrides: Partial<PricingAnalysisInput> = {}): PricingAnalysisInput {
  return {
    costs: costs(1000),
    assumptions: [assumption("usd-cents-per-gbp", 125), assumption("card-fee-bps", 150)],
    plans: [plan("S", 2000, 0), plan("C", 0, 500), plan("H", 1000, 200), plan("F", 0, 100)],
    scenarioVendorCounts: [5],
    recommendation,
    models: [model("hybrid", "H")],
    competitors: [],
    ...overrides,
  };
}

const planResult = (a: ReturnType<typeof buildPricingAnalysis>, id: string) =>
  a.plans.find((p) => p.planId === id)!;

describe("the R15 fixture", () => {
  const a = buildPricingAnalysis(fixture(), NOW);

  it("converts the cost: costPence 800", () => {
    expect(a.costPence).toBe(800);
  });

  it("break-even: S 1 vendor, H 1 vendor, C 22858 pence at 350 bps net, F null at -50 bps", () => {
    expect(planResult(a, "S").breakEvenVendors).toBe(1);
    expect(planResult(a, "H").breakEvenVendors).toBe(1);
    expect(planResult(a, "C").breakEvenGmvPence).toBe(22858);
    expect(planResult(a, "C").netVariableBps).toBe(350);
    expect(planResult(a, "F").netVariableBps).toBe(-50);
    expect(planResult(a, "F").breakEvenGmvPence).toBeNull();
  });

  it("S at 5 vendors: revenue 10000, profit 9200, marginBps 9200", () => {
    const row = a.scenarios.find((s) => s.planId === "S" && s.vendors === 5)!;
    expect([row.revenuePence, row.profitPence, row.marginBps]).toEqual([10000, 9200, 9200]);
  });

  it('ranking byVendors ["H", "S"], byGmv ["C", "F"], recommendationDisagrees false', () => {
    expect(a.ranking).toEqual({ byVendors: ["H", "S"], byGmv: ["C", "F"] });
    expect(a.recommendationDisagrees).toBe(false);
  });

  it("with usd-cents-per-gbp null: costPence, every break-even, profit and margin are null", () => {
    const n = buildPricingAnalysis(
      fixture({
        assumptions: [assumption("usd-cents-per-gbp", null), assumption("card-fee-bps", 150)],
      }),
      NOW,
    );
    expect(n.costPence).toBeNull();
    for (const p of n.plans) {
      expect(p.breakEvenVendors).toBeNull();
      expect(p.breakEvenGmvPence).toBeNull();
    }
    for (const s of n.scenarios) {
      expect(s.profitPence).toBeNull();
      expect(s.marginBps).toBeNull();
    }
    expect(n.recommendationDisagrees).toBe(false);
  });
});

describe("plan results (R12)", () => {
  it("every plan result excludes the per-order fee", () => {
    for (const p of buildPricingAnalysis(fixture(), NOW).plans)
      expect(p.excludesPerOrderFee).toBe(true);
  });

  it("uses the withPlanned monthly cost", () => {
    const report = { ...costs(1000), current: { annualCents: 0, monthlyCents: 0 } };
    expect(buildPricingAnalysis(fixture({ costs: report }), NOW).costUsdCents).toBe(1000);
  });
});

describe("scenarios (R13)", () => {
  it("a loss gives a negative margin and zero revenue gives null", () => {
    const a = buildPricingAnalysis(
      fixture({ plans: [plan("L", 100, 0), plan("Z", 0, 500)], scenarioVendorCounts: [1] }),
      NOW,
    );
    const loss = a.scenarios.find((s) => s.planId === "L")!;
    expect([loss.revenuePence, loss.profitPence, loss.marginBps]).toEqual([100, -700, -70000]);
    const zero = a.scenarios.find((s) => s.planId === "Z")!;
    expect(zero.marginBps).toBeNull();
    expect(zero.atZeroGmv).toBe(true);
  });
});

describe("ranking and disagreement (R14)", () => {
  it("ties break by id", () => {
    const a = buildPricingAnalysis(
      fixture({ plans: [plan("b", 1000, 0), plan("a", 1000, 0)] }),
      NOW,
    );
    expect(a.ranking.byVendors).toEqual(["a", "b"]);
  });

  it("disagrees when the representative plan is not first in its list", () => {
    const a = buildPricingAnalysis(fixture({ models: [model("hybrid", "S")] }), NOW);
    // S and H both need 1 vendor; H wins the tie by id, so S is second.
    expect(a.recommendationDisagrees).toBe(true);
  });
});

describe("staleness and overdue (R16)", () => {
  const competitor = (researchedOn: string): Competitor => ({
    id: `c-${researchedOn}`,
    name: "c",
    segment: "store-builder",
    website: "https://example.org",
    researchStatus: "not-published",
    researchedOn,
    note: null,
    plans: [],
  });

  it("a competitor 93 days old is stale and 92 days old is not", () => {
    const a = buildPricingAnalysis(
      fixture({ competitors: [competitor("2026-07-26"), competitor("2026-07-27")] }),
      NOW,
    );
    expect(a.stale).toEqual([{ registry: "competitors", id: "c-2026-07-26" }]);
  });

  it("includes stale assumptions and the cost report's stale ids", () => {
    const a = buildPricingAnalysis(
      fixture({
        costs: costs(1000, ["neon"]),
        assumptions: [
          assumption("usd-cents-per-gbp", 125, "2026-01-01"),
          assumption("card-fee-bps", 150),
        ],
      }),
      NOW,
    );
    expect(a.stale).toEqual([
      { registry: "costs", id: "neon" },
      { registry: "assumptions", id: "usd-cents-per-gbp" },
    ]);
  });

  it("the recommendation is not overdue on its due date and is the day after", () => {
    expect(
      buildPricingAnalysis(fixture(), new Date("2027-01-27T23:00:00Z")).recommendationOverdue,
    ).toBe(false);
    expect(
      buildPricingAnalysis(fixture(), new Date("2027-01-28T00:00:00Z")).recommendationOverdue,
    ).toBe(true);
  });
});
