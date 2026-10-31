import { buildCostReport, daysSince, RUNNING_COST_ITEMS, type CostItem } from "@/lib/running-costs";
import { ADD_ONS, type AddOn } from "@/lib/pricing/add-ons";
import {
  ASSUMPTIONS,
  assumptionValue,
  SCENARIO_BASKETS_PENCE,
  SCENARIO_ORDERS,
  SCENARIO_SHOPS,
  type Assumption,
  type AssumptionId,
} from "@/lib/pricing/assumptions";
import {
  BUSINESS_MODELS,
  COMPARATORS,
  comparatorShopPays,
  RECOMMENDATION,
  type BusinessModel,
  type BusinessModelId,
  type Recommendation,
} from "@/lib/pricing/business-models";
import { COMPETITORS, type Competitor } from "@/lib/pricing/competitors";
import { CONNECT_MODELLED, CONNECT_OPTIONS, type ConnectOption } from "@/lib/pricing/connect";
import { COST_DRIVERS, type CostDriver } from "@/lib/pricing/cost-drivers";
import { RISKS, type Risk } from "@/lib/pricing/risks";
import {
  breakEvenShopsForPayTarget,
  breakEvenShopsIncludingTime,
  evaluate,
  firstFreeTierLimit,
  partnerRateByYear,
  startupCosts,
  vatThresholdShops,
  type Evaluation,
  type ModelInputs,
  type Scenario,
} from "@/lib/pricing/volume-model";
import { usd } from "@/lib/pricing/money";

/**
 * #1309, #1313 - the registries as one bundle, and the one analysis the page, the CSV route, the
 * refresh and the quarterly script all compute from. Pure.
 */

export interface Registries {
  costItems: readonly CostItem[];
  competitors: readonly Competitor[];
  assumptions: readonly Assumption[];
  drivers: readonly CostDriver[];
  connect: readonly ConnectOption[];
  models: readonly BusinessModel[];
  addOns: readonly AddOn[];
  risks: readonly Risk[];
  recommendation: Recommendation;
}

export const COMMITTED: Registries = {
  costItems: RUNNING_COST_ITEMS,
  competitors: COMPETITORS,
  assumptions: ASSUMPTIONS,
  drivers: COST_DRIVERS,
  connect: CONNECT_OPTIONS,
  models: BUSINESS_MODELS,
  addOns: ADD_ONS,
  risks: RISKS,
  recommendation: RECOMMENDATION,
};

/** Assumptions, competitor research, drivers, Connect and risks are reviewed quarterly. */
export const QUARTERLY_REVIEW_DAYS = 92;

export type StaleRegistry =
  "costs" | "competitors" | "assumptions" | "cost-drivers" | "add-ons" | "risks" | "connect";

export interface StaleEntry {
  registry: StaleRegistry;
  id: string;
}

export interface ModelResult {
  modelId: BusinessModelId;
  reference: Evaluation;
  breakEvenForPayTarget: number | null;
  breakEvenIncludingTime: number | null;
  vatThresholdShops: number | null;
}

export interface GridRow extends Scenario {
  modelId: BusinessModelId;
  evaluation: Evaluation;
}

export interface ComparisonRow {
  comparatorId: string;
  ordersPerShop: number;
  basketPence: number;
  monthlyPence: number | null;
  setupPence: number | null;
}

export interface PricingAnalysisV2 {
  inputs: ModelInputs;
  referenceScenario: Scenario;
  models: ModelResult[];
  grid: GridRow[];
  comparisons: ComparisonRow[];
  firstLimits: { ordersPerShop: number; limit: ReturnType<typeof firstFreeTierLimit> }[];
  startupPence: number | null;
  partnerRates: (number | null)[];
  payTargetPence: number | null;
  recommendationDisagrees: boolean;
  recommendationOverdue: boolean;
  stale: StaleEntry[];
}

function required(assumptions: readonly Assumption[], id: AssumptionId): number {
  const value = assumptionValue(assumptions, id);
  if (value === null) throw new Error(`Pricing assumption ${id} has no value`);
  return value;
}

/** The model inputs from the registries (and `now`, for the current-costs total). */
export function inputsFromRegistries(registries: Registries, now: Date): ModelInputs {
  const a = registries.assumptions;
  const modelled = registries.connect.find((c) => c.id === CONNECT_MODELLED) ?? null;
  return {
    usdCentsPerGbp: assumptionValue(a, "usd-cents-per-gbp"),
    cardFeeBps: required(a, "card-fee-bps"),
    cardFeeFixedPence: required(a, "card-fee-fixed-pence"),
    disputeRateBps: required(a, "dispute-rate-bps"),
    disputeFeePence: required(a, "dispute-fee-pence"),
    partnerHourlyRatePence: assumptionValue(a, "partner-hourly-rate-pence"),
    partnerMinutesPerShopMonth: required(a, "partner-minutes-per-shop-month"),
    onboardingMinutesPerShop: required(a, "onboarding-minutes-per-shop"),
    onboardingAmortisationMonths: required(a, "onboarding-amortisation-months"),
    payoutsPerShopMonth: required(a, "payouts-per-shop-month"),
    currentFixed: usd(buildCostReport(registries.costItems, now).withPlanned.monthlyCents),
    drivers: registries.drivers,
    connectFee: modelled?.platformFee ?? null,
  };
}

export function referenceScenario(assumptions: readonly Assumption[]): Scenario {
  return {
    shops: required(assumptions, "reference-shops"),
    ordersPerShop: required(assumptions, "reference-orders-per-shop"),
    basketPence: required(assumptions, "average-basket-pence"),
  };
}

/**
 * True when, at the reference scenario, the recommended model loses money (partner time included),
 * or another model is better on both counts: a higher margin for us AND a lower total for the shop.
 */
export function recommendationDisagrees(
  results: readonly ModelResult[],
  recommendedId: BusinessModelId,
): boolean {
  const recommended = results.find((r) => r.modelId === recommendedId);
  if (!recommended) return false;
  const margin = recommended.reference.marginPence;
  if (margin === null) return false;
  if (margin < 0) return true;
  return results.some(
    (other) =>
      other.modelId !== recommendedId &&
      other.reference.marginPence !== null &&
      other.reference.marginPence > margin &&
      other.reference.shopPays.totalPence < recommended.reference.shopPays.totalPence,
  );
}

function staleEntries(registries: Registries, now: Date): StaleEntry[] {
  const old = (date: string) => daysSince(date, now) > QUARTERLY_REVIEW_DAYS;
  const staleDrivers = registries.drivers.filter((d) => old(d.asOf)).map((d) => d.id);
  return [
    ...buildCostReport(registries.costItems, now).stale.map((id) => ({
      registry: "costs" as const,
      id,
    })),
    ...registries.competitors
      .filter((c) => old(c.researchedOn))
      .map((c) => ({ registry: "competitors" as const, id: c.id })),
    ...registries.assumptions
      .filter((a) => old(a.asOf))
      .map((a) => ({ registry: "assumptions" as const, id: a.id })),
    ...staleDrivers.map((id) => ({ registry: "cost-drivers" as const, id })),
    ...registries.addOns
      .filter(
        (addOn) =>
          addOn.runCost.basis === "published-source" &&
          addOn.runCost.driverId !== null &&
          staleDrivers.includes(addOn.runCost.driverId),
      )
      .map((addOn) => ({ registry: "add-ons" as const, id: addOn.id })),
    ...registries.risks
      .filter((r) => old(r.asOf))
      .map((r) => ({ registry: "risks" as const, id: r.id })),
    ...registries.connect
      .filter((c) => old(c.retrievedOn))
      .map((c) => ({ registry: "connect" as const, id: c.id })),
  ];
}

export function analyseV2(registries: Registries, now: Date): PricingAnalysisV2 {
  const inputs = inputsFromRegistries(registries, now);
  const reference = referenceScenario(registries.assumptions);
  const volume = { ordersPerShop: reference.ordersPerShop, basketPence: reference.basketPence };
  const payTargetPence = assumptionValue(registries.assumptions, "partner-pay-target-pence");

  const models: ModelResult[] = registries.models.map((model) => ({
    modelId: model.id,
    reference: evaluate(reference, model.pricing, inputs),
    breakEvenForPayTarget: breakEvenShopsForPayTarget(
      model.pricing,
      volume,
      inputs,
      payTargetPence,
    ),
    breakEvenIncludingTime: breakEvenShopsIncludingTime(model.pricing, volume, inputs),
    vatThresholdShops: vatThresholdShops(model.pricing, volume, inputs),
  }));

  const grid: GridRow[] = registries.models.flatMap((model) =>
    SCENARIO_SHOPS.flatMap((shops) =>
      SCENARIO_ORDERS.flatMap((ordersPerShop) =>
        SCENARIO_BASKETS_PENCE.map((basketPence) => {
          const scenario = { shops, ordersPerShop, basketPence };
          return {
            modelId: model.id,
            ...scenario,
            evaluation: evaluate(scenario, model.pricing, inputs),
          };
        }),
      ),
    ),
  );

  const comparisons: ComparisonRow[] = COMPARATORS.flatMap((comparator) =>
    SCENARIO_ORDERS.flatMap((ordersPerShop) =>
      SCENARIO_BASKETS_PENCE.map((basketPence) => ({
        comparatorId: comparator.id,
        ordersPerShop,
        basketPence,
        ...comparatorShopPays(
          comparator,
          { ordersPerShop, basketPence },
          inputs,
          registries.competitors,
        ),
      })),
    ),
  );

  const recommendation = registries.recommendation;
  return {
    inputs,
    referenceScenario: reference,
    models,
    grid,
    comparisons,
    firstLimits: SCENARIO_ORDERS.map((ordersPerShop) => ({
      ordersPerShop,
      limit: firstFreeTierLimit(registries.drivers, ordersPerShop),
    })),
    startupPence: startupCosts(registries.drivers, inputs.usdCentsPerGbp),
    partnerRates: partnerRateByYear(
      inputs.partnerHourlyRatePence,
      assumptionValue(registries.assumptions, "partner-rate-yearly-increase-bps"),
    ),
    payTargetPence,
    recommendationDisagrees: recommendationDisagrees(models, recommendation.modelId),
    recommendationOverdue: daysSince(recommendation.nextReviewDue, now) > 0,
    stale: staleEntries(registries, now),
  };
}

/** The newest `YYYY-MM-DD` in `dates`, or `null` for none. */
export function newestDate(dates: readonly string[]): string | null {
  return dates.length === 0 ? null : [...dates].sort().at(-1)!;
}
