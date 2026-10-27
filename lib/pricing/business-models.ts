/**
 * #1309 - the business models considered, and the current recommendation. Pure.
 *
 * Written text, not AI output. "Expected profitability" for a model is the analysis output for its
 * representative proposed plan (`lib/pricing/analysis.ts`); a model with no plan is shown as "Not
 * modelled". When the numbers stop supporting the recommendation, the dashboard says so
 * (`recommendationDisagrees`), and when `nextReviewDue` passes it flags the recommendation as overdue.
 */

export type BusinessModelId =
  "subscription" | "commission" | "freemium" | "transaction-fee" | "usage-based" | "hybrid";

export interface BusinessModel {
  id: BusinessModelId;
  name: string;
  description: string;
  advantages: string[];
  disadvantages: string[];
  risks: string[];
  representativePlanId: string | null;
}

export const BUSINESS_MODELS: readonly BusinessModel[] = [
  {
    id: "subscription",
    name: "Subscription",
    description: "A fixed monthly fee per vendor, with no cut of sales.",
    advantages: [
      "Predictable revenue that does not depend on vendors' sales",
      "Easy for a vendor to compare with store builders",
    ],
    disadvantages: [
      "A barrier for a new vendor with few sales",
      "Revenue does not grow when vendors grow",
    ],
    risks: [
      "Under today's single platform Stripe account the platform pays card fees on every sale, so a busy vendor on a flat fee can cost more than they pay",
    ],
    representativePlanId: "subscription",
  },
  {
    id: "commission",
    name: "Commission",
    description: "A percentage of each sale, with no monthly fee.",
    advantages: [
      "No upfront cost for the vendor",
      "Revenue grows with vendors' sales and covers card fees by construction",
    ],
    disadvantages: [
      "No revenue until vendors trade",
      "Vendors with high sales may prefer a flat fee",
    ],
    risks: [
      "The platform has never traded, so the sales needed to break even are unknown to be reachable",
      "Commission must stay above the card fee, or every sale loses money",
    ],
    representativePlanId: "commission",
  },
  {
    id: "freemium",
    name: "Freemium",
    description: "A free entry tier, with paid tiers for more features or capacity.",
    advantages: ["Lowest barrier to sign-up", "A path to upgrade once a vendor trades"],
    disadvantages: [
      "Free vendors still cost hosting, support and card fees",
      "Needs clear limits to drive upgrades",
    ],
    risks: ["With no fee and no commission, the free tier loses the card fee on every sale"],
    representativePlanId: "freemium",
  },
  {
    id: "transaction-fee",
    name: "Transaction fee",
    description: "A fixed fee per order, independent of order value.",
    advantages: ["Simple for vendors with large baskets"],
    disadvantages: ["Unfair on small orders", "Revenue depends on order count, which is unknown"],
    risks: ["Cannot be modelled until there is order data"],
    representativePlanId: null,
  },
  {
    id: "usage-based",
    name: "Usage-based",
    description: "Charges by use of platform resources, such as AI features or storage.",
    advantages: ["Passes costs such as Workers AI straight through"],
    disadvantages: [
      "Hard for a vendor to predict",
      "The platform's usage costs are currently near zero, so there is little to charge for",
    ],
    risks: ["Billing complexity out of proportion to the costs involved"],
    representativePlanId: null,
  },
  {
    id: "hybrid",
    name: "Hybrid",
    description: "A low monthly fee plus a small percentage of each sale.",
    advantages: [
      "The fee covers fixed costs from the first vendor",
      "The commission covers card fees and grows with vendors' sales",
      "Undercuts store builders' fee plus card rate for a typical small shop",
    ],
    disadvantages: ["Two numbers to explain instead of one"],
    risks: [
      "If the platform moves to Stripe Connect and vendors pay their own card fees, the commission should be revisited",
    ],
    representativePlanId: "hybrid",
  },
];

export interface Recommendation {
  modelId: BusinessModelId;
  reasoning: string[];
  /** `YYYY-MM-DD`. */
  reviewedOn: string;
  /** `reviewedOn` plus 92 days. */
  nextReviewDue: string;
}

export const RECOMMENDATION: Recommendation = {
  modelId: "hybrid",
  reasoning: [
    "The platform's fixed running cost is a few dollars a month, so one vendor on a small fee covers it.",
    "Under today's single platform Stripe account the platform pays the card fee on every sale. A commission above the card fee is the only way to make that cost scale with the revenue that causes it.",
    "A low fee plus a small commission costs a small shop less than a store builder's fee plus card rate, and far less than a marketplace's commission.",
    "This is advisory: the platform has never traded, so no figure here is realised revenue.",
  ],
  reviewedOn: "2026-10-27",
  nextReviewDue: "2027-01-27",
};
