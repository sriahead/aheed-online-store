import { COMPETITORS, type Competitor, type CompetitorPlan } from "@/lib/pricing/competitors";
import { roundHalfUp, toPence } from "@/lib/pricing/money";
import {
  cardFees,
  type ModelInputs,
  type PricingModelParams,
  type Scenario,
} from "@/lib/pricing/volume-model";

/**
 * #1313 - the four volume-linked pricing models, what each is compared with, and the launch
 * recommendation. Pure. Written text and proposed prices, not AI output.
 *
 * Every model's revenue grows with a shop's orders, and none takes a percentage of sales: a grocer's
 * margin is thin, and a percentage would also tax the basket's VAT and deposit lines. All prices are
 * PROPOSALS in pence, excluding VAT. Nothing outside the costs dashboard reads them.
 */

export type BusinessModelId =
  "order-bands" | "allowance-per-order" | "capped-per-order" | "customer-fee";

export interface BusinessModel {
  id: BusinessModelId;
  name: string;
  description: string;
  advantages: string[];
  disadvantages: string[];
  risks: string[];
  pricing: PricingModelParams;
  status: "proposal";
  vatNote: string;
}

const VAT_NOTE =
  "Prices exclude VAT. Once the platform is VAT-registered, VAT is added to our fees (see Risks).";

export const BUSINESS_MODELS: readonly BusinessModel[] = [
  {
    id: "order-bands",
    name: "Order bands",
    description:
      "A monthly fee set by how many orders the shop took that month, with a small pence fee per order above the top band.",
    advantages: [
      "Easy to explain: the shop knows its band",
      "Our revenue steps up as the shop grows, roughly in line with support and infrastructure",
    ],
    disadvantages: [
      "A shop just over a band edge pays the higher fee for a few extra orders",
      "Needs a monthly order count and a band change each month",
    ],
    risks: ["Bands set too wide leave a busy shop under-priced against its support time"],
    pricing: {
      kind: "order-bands",
      bands: [
        { upToOrders: 300, monthlyFeePence: 3900, label: "Up to 300 orders" },
        { upToOrders: 1000, monthlyFeePence: 7900, label: "Up to 1,000 orders" },
        { upToOrders: 3000, monthlyFeePence: 14900, label: "Up to 3,000 orders" },
      ],
      abovePerOrderPence: 5,
    },
    status: "proposal",
    vatNote: VAT_NOTE,
  },
  {
    id: "allowance-per-order",
    name: "Allowance plus per order",
    description:
      "A flat monthly fee that includes a number of orders, then a fixed pence fee for each order above it.",
    advantages: ["Smooth: no band edges", "A quiet month costs only the flat fee"],
    disadvantages: ["Uncapped: a very busy shop pays more every month"],
    risks: ["The per-order fee adds to the shop's own 20p card fee on every order"],
    pricing: {
      kind: "allowance-per-order",
      monthlyFeePence: 3900,
      includedOrders: 300,
      perOrderPence: 12,
    },
    status: "proposal",
    vatNote: VAT_NOTE,
  },
  {
    id: "capped-per-order",
    name: "Low fee, capped per order",
    description:
      "A low monthly fee plus a pence fee per order, with the per-order part capped each month.",
    advantages: [
      "Cheapest way in for a new shop",
      "The cap makes the worst month predictable for the shop",
    ],
    disadvantages: ["Above the cap our revenue stops growing while costs keep rising"],
    risks: ["A shop that grows past the cap costs us more each month for the same fee"],
    pricing: {
      kind: "capped-per-order",
      monthlyFeePence: 1500,
      perOrderPence: 15,
      capPence: 15000,
    },
    status: "proposal",
    vatNote: VAT_NOTE,
  },
  {
    id: "customer-fee",
    name: "Customer service fee",
    description:
      "A low monthly fee for the shop, plus a fixed service fee per order that the customer pays at checkout and the platform keeps.",
    advantages: [
      "The shop pays the least of any model",
      "Our revenue grows exactly with orders, with no cap",
      "Common in UK food delivery, so customers recognise it",
    ],
    disadvantages: [
      "The customer sees an extra charge, which can lose small orders",
      "Needs checkout and Stripe Connect application-fee support that does not exist yet",
    ],
    risks: [
      "The shop may absorb the fee to stay competitive, which turns it back into a per-order fee",
      "Our fee becomes part of the customer's payment, so its VAT and consumer-law wording need advice",
    ],
    pricing: { kind: "customer-fee", monthlyFeePence: 1500, customerFeePerOrderPence: 30 },
    status: "proposal",
    vatNote: VAT_NOTE,
  },
];

export type ComparatorSource =
  | { competitorId: string; planName: string; cardFees: "plan" | "stripe-standard" | "included" }
  | { kind: "do-nothing" };

export interface Comparator {
  id: string;
  label: string;
  source: ComparatorSource;
  note: string | null;
}

export const COMPARATORS: readonly Comparator[] = [
  {
    id: "shopify-basic",
    label: "Shopify Basic",
    source: { competitorId: "shopify", planName: "Basic", cardFees: "plan" },
    note: null,
  },
  {
    id: "shopify-grow",
    label: "Shopify Grow",
    source: { competitorId: "shopify", planName: "Grow", cardFees: "plan" },
    note: null,
  },
  {
    id: "square-free",
    label: "Square Online Free",
    source: { competitorId: "square-online", planName: "Free", cardFees: "plan" },
    note: null,
  },
  {
    id: "square-plus",
    label: "Square Online Plus",
    source: { competitorId: "square-online", planName: "Plus", cardFees: "plan" },
    note: "Monthly price when billed annually.",
  },
  {
    id: "ecwid-starter",
    label: "Ecwid Starter",
    source: { competitorId: "ecwid", planName: "Starter", cardFees: "stripe-standard" },
    note: "Ecwid brings no card processing; Stripe's standard rate is assumed.",
  },
  {
    id: "uber-eats-self-delivery",
    label: "Uber Eats (self-delivery)",
    source: { competitorId: "uber-eats", planName: "Self-Delivery", cardFees: "included" },
    note: "13% commission with card processing included, plus a one-off activation fee.",
  },
  {
    id: "do-nothing",
    label: "Do nothing (no online shop)",
    source: { kind: "do-nothing" },
    note: "Costs nothing, and takes no online orders.",
  },
];

export function comparatorPlan(
  source: ComparatorSource,
  competitors: readonly Competitor[] = COMPETITORS,
): CompetitorPlan | null {
  if ("kind" in source) return null;
  return (
    competitors
      .find((c) => c.id === source.competitorId)
      ?.plans.find((p) => p.name === source.planName) ?? null
  );
}

/**
 * What a shop pays per month on a comparator at a volume: the plan's monthly fee, its commission, and
 * card fees (the plan's own, Stripe's standard rate, or included). The one-off setup fee is returned
 * separately and never folded in. Disputes are not included for comparators.
 */
export function comparatorShopPays(
  comparator: Comparator,
  scenario: Omit<Scenario, "shops">,
  inputs: Pick<ModelInputs, "usdCentsPerGbp" | "cardFeeBps" | "cardFeeFixedPence">,
  competitors: readonly Competitor[] = COMPETITORS,
): { monthlyPence: number | null; setupPence: number | null } {
  const source = comparator.source;
  if ("kind" in source) return { monthlyPence: 0, setupPence: 0 };
  const plan = comparatorPlan(source, competitors);
  if (!plan) return { monthlyPence: null, setupPence: null };

  const { ordersPerShop, basketPence } = scenario;
  const fee = plan.monthlyFee === null ? 0 : toPence(plan.monthlyFee, inputs.usdCentsPerGbp);
  const commission =
    plan.commissionBps === null
      ? 0
      : roundHalfUp((ordersPerShop * basketPence * plan.commissionBps) / 10000);
  let card: number | null = 0;
  if (source.cardFees === "stripe-standard") {
    card = cardFees(ordersPerShop, basketPence, inputs.cardFeeBps, inputs.cardFeeFixedPence);
  } else if (source.cardFees === "plan" && plan.cardFee) {
    const fixed = toPence(plan.cardFee.fixed, inputs.usdCentsPerGbp);
    card = fixed === null ? null : cardFees(ordersPerShop, basketPence, plan.cardFee.bps, fixed);
  }
  const setupPence = plan.setupFee === null ? 0 : toPence(plan.setupFee, inputs.usdCentsPerGbp);
  return {
    monthlyPence: fee === null || card === null ? null : fee + commission + card,
    setupPence,
  };
}

export type TrackedMetricId = "cost-per-order" | "partner-minutes-per-shop" | "margin-per-shop";

export interface Recommendation {
  modelId: BusinessModelId;
  launchAddOnIds: string[];
  foundingOffer: {
    shopName: string;
    pricing: PricingModelParams;
    /** `YYYY-MM-DD`. */
    startsOn: string;
    /** `YYYY-MM-DD`, after `startsOn` and at most 365 days later. */
    reviewOn: string;
    terms: string[];
    reviewClause: string;
  };
  trackMonthly: { id: TrackedMetricId; name: string; definition: string; rePriceWhen: string }[];
  changeTriggers: string[];
  reasoning: string[];
  /** `YYYY-MM-DD`. */
  reviewedOn: string;
  /** `reviewedOn` plus 92 days. */
  nextReviewDue: string;
}

export const RECOMMENDATION: Recommendation = {
  modelId: "customer-fee",
  launchAddOnIds: ["custom-domain", "catalogue-setup", "ai-content"],
  foundingOffer: {
    shopName: "Aheed Food Centre",
    pricing: { kind: "customer-fee", monthlyFeePence: 0, customerFeePerOrderPence: 25 },
    startsOn: "2026-11-01",
    reviewOn: "2027-05-01",
    terms: [
      "No monthly fee for the first six months, and a 25p customer service fee instead of the public 30p.",
      "Until checkout can collect the service fee (it needs Stripe Connect, #1310), no fee is charged at all.",
      "Custom domain, catalogue setup and AI product content included at no charge.",
      "In return: monthly feedback, permission to be named as our first client, and order counts shared for the review.",
    ],
    reviewClause:
      "On the review date both sides look at the three tracked numbers. Prices then move to the public list or a new agreed founding rate, with at least 30 days' written notice. Either side can end the arrangement with 30 days' notice.",
  },
  trackMonthly: [
    {
      id: "cost-per-order",
      name: "Cost per order",
      definition:
        "Our total monthly cost excluding partner time, divided by all orders taken across shops that month.",
      rePriceWhen: "Above 10p for two months running, or rising for three.",
    },
    {
      id: "partner-minutes-per-shop",
      name: "Partner minutes per shop",
      definition:
        "Minutes both partners spent on support, fixes and catalogue work for a shop, averaged over trading shops.",
      rePriceWhen: "Above 180 minutes a month (the model assumes 120).",
    },
    {
      id: "margin-per-shop",
      name: "Margin per shop",
      definition:
        "Fee revenue per shop minus its share of every cost, partner time included at the current rate.",
      rePriceWhen: "Below zero for a band for two months running.",
    },
  ],
  changeTriggers: [
    "Customers abandon more baskets once the service fee appears, or shops start absorbing it.",
    "Support time per shop runs well above the 120-minute estimate.",
    "Checkout cannot collect a service fee by the time the second shop is ready: fall back to order bands.",
    "Neon or Resend usage costs grow faster than orders.",
    "The Connect decision (#1310) lands on the platform-pricing option, which adds per-account and per-payout fees.",
  ],
  reasoning: [
    "Partner time is the biggest cost. At about two hours a month per shop and £25 an hour it is several times the infrastructure and business costs together, and the three shop-paid models do not cover it at the reference scenario at prices a grocer would compare favourably with Shopify or Square.",
    "The customer service fee is the only model that covers every cost, partner time included, at the reference scenario, while the shop's own monthly total stays close to Square Online and Ecwid.",
    "Its revenue rises exactly with orders and takes no percentage of the grocer's margin. The customer pays a fixed amount per order, which UK food delivery customers already recognise.",
    "It cannot be collected until checkout supports it and Stripe Connect is in place (#1310). Until then the founding shop pays nothing, and order bands are the fall-back for shop number two if checkout is not ready.",
    "Advisory: the platform has never traded, so no figure here is realised revenue.",
  ],
  reviewedOn: "2026-10-28",
  nextReviewDue: "2027-01-28",
};
