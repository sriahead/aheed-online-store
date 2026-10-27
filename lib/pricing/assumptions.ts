/**
 * #1309 - the profitability model's inputs, as data. Pure.
 *
 * Each value says where it came from. `published-source` values were read from the page at
 * `sourceUrl` on `asOf`; `missing` means there is no value and the analysis shows the dependent
 * figures as unavailable instead of guessing. There is deliberately no GMV, order-count or
 * average-order-value assumption: the platform has never traded (#113, #104), so none exists, and the
 * analysis reports break-even thresholds instead of assuming one.
 */

export type AssumptionBasis = "owner" | "published-source" | "proposal" | "missing";

export interface Assumption {
  id: AssumptionId;
  label: string;
  value: number | null;
  unit: string;
  basis: AssumptionBasis;
  sourceUrl: string | null;
  /** `YYYY-MM-DD`. */
  asOf: string;
  /** For a figure that is also a competitor plan's figure: which plan, so a refresh can update both. */
  derivedFrom: { competitorId: string; planName: string } | null;
  note: string | null;
}

export type AssumptionId = "usd-cents-per-gbp" | "card-fee-bps" | "card-fee-fixed-pence";

const STRIPE_STANDARD = { competitorId: "stripe-payments", planName: "Standard" };

export const ASSUMPTIONS: readonly Assumption[] = [
  {
    id: "usd-cents-per-gbp",
    label: "Exchange rate (US cents per £1)",
    value: 134,
    unit: "US cents per £1",
    basis: "published-source",
    sourceUrl:
      "https://www.bankofengland.co.uk/boeapps/database/Rates.asp?TD=23&TM=Oct&TY=2026&into=GBP&rateview=D",
    asOf: "2026-10-23",
    derivedFrom: null,
    note: "Bank of England spot rate 1.3387 US dollars per pound on 2026-10-23, rounded to whole cents.",
  },
  {
    id: "card-fee-bps",
    label: "Card fee, percentage part",
    value: 150,
    unit: "basis points of each payment",
    basis: "published-source",
    sourceUrl: "https://stripe.com/gb/pricing",
    asOf: "2026-10-27",
    derivedFrom: STRIPE_STANDARD,
    note: "Stripe's standard UK card rate. Under today's single platform Stripe account, the platform pays it on every vendor's sales.",
  },
  {
    id: "card-fee-fixed-pence",
    label: "Card fee, fixed part",
    value: 20,
    unit: "pence per payment",
    basis: "published-source",
    sourceUrl: "https://stripe.com/gb/pricing",
    asOf: "2026-10-27",
    derivedFrom: STRIPE_STANDARD,
    note: "Not in any break-even figure: it depends on the number of orders, which is unknown.",
  },
];

/**
 * What-if vendor counts for the scenario table. `basis: "proposal"`: these are inputs chosen to show
 * how the numbers scale, not a forecast of how many vendors the platform will have.
 */
export const SCENARIO_VENDOR_COUNTS: readonly number[] = [1, 5, 10, 25, 50];

export function assumptionValue(
  assumptions: readonly Assumption[],
  id: AssumptionId,
): number | null {
  return assumptions.find((a) => a.id === id)?.value ?? null;
}
