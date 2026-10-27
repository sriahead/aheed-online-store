import { daysSince, type CostReport } from "@/lib/running-costs";
import { assumptionValue, type Assumption } from "@/lib/pricing/assumptions";
import type { BusinessModel, Recommendation } from "@/lib/pricing/business-models";
import type { Competitor } from "@/lib/pricing/competitors";
import { roundHalfUp } from "@/lib/pricing/money";
import type { ProposedPlan } from "@/lib/pricing/proposed-plans";

/**
 * #1309 - break-even and scenario profitability for the proposed plans. Pure.
 *
 * WHAT IT DOES NOT ASSUME. The platform has never traded, so there is no GMV, order count or vendor
 * count to project from. Instead of inventing one it reports thresholds: how many vendors a fixed
 * fee needs to cover the platform's cost, and how much monthly sales a commission needs. The scenario
 * table runs at zero sales over what-if vendor counts.
 *
 * ROUNDING. Currency conversion and margins round half up; break-even counts round UP (you cannot
 * break even with a fraction of a vendor). The per-order fixed card fee is in no figure, because it
 * depends on the number of orders.
 *
 * The cost side is `costs.withPlanned.monthlyCents` (USD), converted at the dated exchange rate in
 * the assumptions. With no rate, every figure that needs one is `null`, never 0.
 */

export interface PlanBreakEven {
  planId: string;
  fixedPencePerVendor: number;
  /** Commission minus the card fee, in basis points; negative means each sale loses money. */
  netVariableBps: number | null;
  breakEvenVendors: number | null;
  breakEvenGmvPence: number | null;
  excludesPerOrderFee: true;
}

export interface ScenarioRow {
  planId: string;
  vendors: number;
  revenuePence: number;
  costPence: number | null;
  profitPence: number | null;
  marginBps: number | null;
  atZeroGmv: true;
}

export interface StaleEntry {
  registry: "costs" | "competitors" | "assumptions";
  id: string;
}

export interface PricingAnalysisInput {
  costs: CostReport;
  assumptions: readonly Assumption[];
  plans: readonly ProposedPlan[];
  scenarioVendorCounts: readonly number[];
  recommendation: Recommendation;
  models: readonly BusinessModel[];
  competitors: readonly Competitor[];
}

export interface PricingAnalysis {
  costUsdCents: number;
  usdCentsPerGbp: number | null;
  costPence: number | null;
  cardFeeBps: number | null;
  plans: PlanBreakEven[];
  scenarios: ScenarioRow[];
  ranking: { byVendors: string[]; byGmv: string[] };
  recommendationDisagrees: boolean;
  recommendationOverdue: boolean;
  stale: StaleEntry[];
}

/** Assumptions and competitor research are reviewed quarterly. */
export const QUARTERLY_REVIEW_DAYS = 92;

function marginBps(profit: number, revenue: number): number | null {
  if (revenue <= 0) return null;
  return profit >= 0
    ? roundHalfUp((profit * 10000) / revenue)
    : -roundHalfUp((-profit * 10000) / revenue);
}

function byNullableAscending(
  value: (id: string) => number | null,
): (a: string, b: string) => number {
  return (a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null && vb === null) return a.localeCompare(b);
    if (va === null) return 1;
    if (vb === null) return -1;
    return va - vb || a.localeCompare(b);
  };
}

export function buildPricingAnalysis(input: PricingAnalysisInput, now: Date): PricingAnalysis {
  const costUsdCents = input.costs.withPlanned.monthlyCents;
  const usdCentsPerGbp = assumptionValue(input.assumptions, "usd-cents-per-gbp");
  const cardFeeBps = assumptionValue(input.assumptions, "card-fee-bps");
  const costPence =
    usdCentsPerGbp === null || usdCentsPerGbp <= 0
      ? null
      : roundHalfUp((costUsdCents * 100) / usdCentsPerGbp);

  const plans: PlanBreakEven[] = input.plans.map((plan) => {
    const netVariableBps = cardFeeBps === null ? null : plan.commissionBps - cardFeeBps;
    const breakEvenVendors =
      costPence !== null && plan.monthlyFeePence > 0
        ? Math.ceil(costPence / plan.monthlyFeePence)
        : null;
    const breakEvenGmvPence =
      costPence !== null &&
      plan.monthlyFeePence === 0 &&
      netVariableBps !== null &&
      netVariableBps > 0
        ? Math.ceil((costPence * 10000) / netVariableBps)
        : null;
    return {
      planId: plan.id,
      fixedPencePerVendor: plan.monthlyFeePence,
      netVariableBps,
      breakEvenVendors,
      breakEvenGmvPence,
      excludesPerOrderFee: true,
    };
  });

  const scenarios: ScenarioRow[] = input.plans.flatMap((plan) =>
    input.scenarioVendorCounts.map((vendors) => {
      const revenuePence = vendors * plan.monthlyFeePence;
      const profitPence = costPence === null ? null : revenuePence - costPence;
      return {
        planId: plan.id,
        vendors,
        revenuePence,
        costPence,
        profitPence,
        marginBps: profitPence === null ? null : marginBps(profitPence, revenuePence),
        atZeroGmv: true as const,
      };
    }),
  );

  const result = new Map(plans.map((p) => [p.planId, p]));
  const byVendors = plans
    .filter((p) => p.breakEvenVendors !== null)
    .map((p) => p.planId)
    .sort(byNullableAscending((id) => result.get(id)!.breakEvenVendors));
  const byGmv = plans
    .filter((p) => p.fixedPencePerVendor === 0)
    .map((p) => p.planId)
    .sort(byNullableAscending((id) => result.get(id)!.breakEvenGmvPence));

  const representative =
    input.models.find((m) => m.id === input.recommendation.modelId)?.representativePlanId ?? null;
  let recommendationDisagrees = false;
  if (costPence !== null && representative !== null) {
    const list = byVendors.includes(representative)
      ? byVendors
      : byGmv.includes(representative)
        ? byGmv
        : null;
    recommendationDisagrees = list !== null && list[0] !== representative;
  }

  const stale: StaleEntry[] = [
    ...input.costs.stale.map((id) => ({ registry: "costs" as const, id })),
    ...input.competitors
      .filter((c) => daysSince(c.researchedOn, now) > QUARTERLY_REVIEW_DAYS)
      .map((c) => ({ registry: "competitors" as const, id: c.id })),
    ...input.assumptions
      .filter((a) => daysSince(a.asOf, now) > QUARTERLY_REVIEW_DAYS)
      .map((a) => ({ registry: "assumptions" as const, id: a.id })),
  ];

  return {
    costUsdCents,
    usdCentsPerGbp,
    costPence,
    cardFeeBps,
    plans,
    scenarios,
    ranking: { byVendors, byGmv },
    recommendationDisagrees,
    recommendationOverdue: daysSince(input.recommendation.nextReviewDue, now) > 0,
    stale,
  };
}
