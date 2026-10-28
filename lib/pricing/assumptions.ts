/**
 * #1309, #1313 - the pricing model's inputs, as data. Pure.
 *
 * Each value says where it came from. `published-source` values were read from the page at
 * `sourceUrl` on `asOf`; `owner` values were stated by the owner; `estimate` is our own figure with no
 * published source (Build notes give the reasoning for each); `proposal` is a what-if input; `missing`
 * means there is no value and every dependent figure is shown as unavailable instead of guessed.
 *
 * Partner time is in MINUTES so every value stays an integer. The platform has never traded (#113,
 * #104): the basket, order and shop figures are what-ifs, not forecasts.
 */

export type AssumptionBasis = "owner" | "published-source" | "proposal" | "estimate" | "missing";

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

export type AssumptionId =
  | "usd-cents-per-gbp"
  | "card-fee-bps"
  | "card-fee-fixed-pence"
  | "card-fee-eea-bps"
  | "dispute-fee-pence"
  | "dispute-rate-bps"
  | "partner-hourly-rate-pence"
  | "partner-rate-yearly-increase-bps"
  | "partner-pay-target-pence"
  | "partner-minutes-per-shop-month"
  | "onboarding-minutes-per-shop"
  | "onboarding-amortisation-months"
  | "average-basket-pence"
  | "payouts-per-shop-month"
  | "reference-shops"
  | "reference-orders-per-shop";

const STRIPE_STANDARD = { competitorId: "stripe-payments", planName: "Standard" };
const STRIPE_PRICING = "https://stripe.com/gb/pricing";
const BUILD = "2026-10-28";

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
    label: "Card fee, percentage part (UK cards)",
    value: 150,
    unit: "basis points of each payment",
    basis: "published-source",
    sourceUrl: STRIPE_PRICING,
    asOf: "2026-10-27",
    derivedFrom: STRIPE_STANDARD,
    note: "Stripe's standard UK card rate. Under Stripe Connect the shop, as the seller, pays it.",
  },
  {
    id: "card-fee-fixed-pence",
    label: "Card fee, fixed part",
    value: 20,
    unit: "pence per payment",
    basis: "published-source",
    sourceUrl: STRIPE_PRICING,
    asOf: "2026-10-27",
    derivedFrom: STRIPE_STANDARD,
    note: "Charged on every order, whatever the basket. Included wherever card fees appear.",
  },
  {
    id: "card-fee-eea-bps",
    label: "Card fee, percentage part (EEA cards)",
    value: 250,
    unit: "basis points of each payment",
    basis: "published-source",
    sourceUrl: STRIPE_PRICING,
    asOf: BUILD,
    derivedFrom: null,
    note: "2.5% + 20p. Recorded for reference; the totals use the UK rate, as the page states.",
  },
  {
    id: "dispute-fee-pence",
    label: "Dispute (chargeback) fee",
    value: 2000,
    unit: "pence per dispute",
    basis: "published-source",
    sourceUrl: STRIPE_PRICING,
    asOf: BUILD,
    derivedFrom: null,
    note: "£20.00 for each dispute received. Under Connect direct charges the shop bears it.",
  },
  {
    id: "dispute-rate-bps",
    label: "Disputes as a share of orders",
    value: 10,
    unit: "basis points of orders (10 = 0.1%)",
    basis: "estimate",
    sourceUrl: null,
    asOf: BUILD,
    derivedFrom: null,
    note: "Our estimate for local card-not-present grocery orders. No trading data exists yet.",
  },
  {
    id: "partner-hourly-rate-pence",
    label: "Partner hourly rate, year 1",
    value: 2500,
    unit: "pence per hour",
    basis: "owner",
    sourceUrl: null,
    asOf: "2026-10-28",
    derivedFrom: null,
    note: "Owner: £25 an hour in year 1, rising every year.",
  },
  {
    id: "partner-rate-yearly-increase-bps",
    label: "Partner rate yearly increase",
    value: null,
    unit: "basis points per year (500 = 5%)",
    basis: "missing",
    sourceUrl: null,
    asOf: "2026-10-28",
    derivedFrom: null,
    note: "The owner said the rate rises every year but gave no percentage.",
  },
  {
    id: "partner-pay-target-pence",
    label: "Partners' monthly pay target (both partners)",
    value: null,
    unit: "pence per month",
    basis: "missing",
    sourceUrl: null,
    asOf: "2026-10-28",
    derivedFrom: null,
    note: "Not given by the owner. Enter one in What if to see the shops needed.",
  },
  {
    id: "partner-minutes-per-shop-month",
    label: "Partner time per shop per month (support, fixes, catalogue changes)",
    value: 120,
    unit: "minutes per shop per month",
    basis: "estimate",
    sourceUrl: null,
    asOf: BUILD,
    derivedFrom: null,
    note: "Two hours a month per trading shop, after onboarding. Track it monthly and re-price on it.",
  },
  {
    id: "onboarding-minutes-per-shop",
    label: "Onboarding time per new shop (setup, catalogue import, training)",
    value: 900,
    unit: "minutes per new shop",
    basis: "estimate",
    sourceUrl: null,
    asOf: BUILD,
    derivedFrom: null,
    note: "Fifteen hours once per shop. Catalogue setup beyond this is the paid catalogue-setup add-on.",
  },
  {
    id: "onboarding-amortisation-months",
    label: "Months onboarding is spread over",
    value: 12,
    unit: "months",
    basis: "proposal",
    sourceUrl: null,
    asOf: BUILD,
    derivedFrom: null,
    note: "Onboarding is a one-off; spreading it over a year gives a steady monthly figure.",
  },
  {
    id: "average-basket-pence",
    label: "Average basket",
    value: 2500,
    unit: "pence per order",
    basis: "estimate",
    sourceUrl: null,
    asOf: BUILD,
    derivedFrom: null,
    note: "£25. The page also shows £15 and £40 baskets.",
  },
  {
    id: "payouts-per-shop-month",
    label: "Payouts to each shop per month",
    value: 20,
    unit: "payouts per shop per month",
    basis: "estimate",
    sourceUrl: null,
    asOf: BUILD,
    derivedFrom: null,
    note: "About one per working day. Only matters if the platform-pricing Connect option is chosen.",
  },
  {
    id: "reference-shops",
    label: "Reference scenario: shops",
    value: 10,
    unit: "shops",
    basis: "proposal",
    sourceUrl: null,
    asOf: BUILD,
    derivedFrom: null,
    note: "The headline figures and the recommendation check use this scenario.",
  },
  {
    id: "reference-orders-per-shop",
    label: "Reference scenario: orders per shop per month",
    value: 500,
    unit: "orders per shop per month",
    basis: "proposal",
    sourceUrl: null,
    asOf: BUILD,
    derivedFrom: null,
    note: null,
  },
];

/** Shop counts for the scenario grids. `basis: "proposal"`: what-if inputs, not a forecast. */
export const SCENARIO_SHOPS: readonly number[] = [1, 5, 10, 25, 50, 100];

/** Orders per shop per month for the scenario grids. `basis: "proposal"`. */
export const SCENARIO_ORDERS: readonly number[] = [100, 500, 2000];

/** Average baskets for the scenario grids, in pence. `basis: "proposal"`. */
export const SCENARIO_BASKETS_PENCE: readonly number[] = [1500, 2500, 4000];

export function assumptionValue(
  assumptions: readonly Assumption[],
  id: AssumptionId,
): number | null {
  return assumptions.find((a) => a.id === id)?.value ?? null;
}
