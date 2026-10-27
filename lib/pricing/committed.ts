import { buildCostReport, RUNNING_COST_ITEMS, type CostItem } from "@/lib/running-costs";
import { ASSUMPTIONS, SCENARIO_VENDOR_COUNTS, type Assumption } from "@/lib/pricing/assumptions";
import { buildPricingAnalysis, type PricingAnalysis } from "@/lib/pricing/analysis";
import { BUSINESS_MODELS, RECOMMENDATION } from "@/lib/pricing/business-models";
import { COMPETITORS, type Competitor } from "@/lib/pricing/competitors";
import { PROPOSED_PLANS } from "@/lib/pricing/proposed-plans";

/**
 * #1309 - the registries as one bundle, so the page, the CSV route, the refresh and the quarterly
 * script all compute from the same inputs. Pure.
 */

export interface Registries {
  costItems: readonly CostItem[];
  competitors: readonly Competitor[];
  assumptions: readonly Assumption[];
}

export const COMMITTED: Registries = {
  costItems: RUNNING_COST_ITEMS,
  competitors: COMPETITORS,
  assumptions: ASSUMPTIONS,
};

export function analyse(registries: Registries, now: Date): PricingAnalysis {
  return buildPricingAnalysis(
    {
      costs: buildCostReport(registries.costItems, now),
      assumptions: registries.assumptions,
      plans: PROPOSED_PLANS,
      scenarioVendorCounts: SCENARIO_VENDOR_COUNTS,
      recommendation: RECOMMENDATION,
      models: BUSINESS_MODELS,
      competitors: registries.competitors,
    },
    now,
  );
}

/** The newest `YYYY-MM-DD` in `dates`, or `null` for none. */
export function newestDate(dates: readonly string[]): string | null {
  return dates.length === 0 ? null : [...dates].sort().at(-1)!;
}
