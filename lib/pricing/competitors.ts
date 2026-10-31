import { gbp, usd, type Money } from "@/lib/pricing/money";

/**
 * #1309 - what competitors charge, as data. Pure.
 *
 * Every figure was read from the competitor's OWN pricing page, at `sourceUrl`, on `retrievedOn`.
 * A third-party article is never a source. Where a provider does not publish a figure the competitor
 * is `not-published` with no plans, and where its page could not be read it is `not-readable`. Neither
 * case gets an invented plan. Update by editing this file in a PR; the dashboard's "Refresh
 * Recommendations" button suggests changes but writes nothing.
 *
 * Prices are as shown on the page at the time (VAT treatment as the page states it, recorded in
 * `extraCharges` where it says).
 */

export type CompetitorSegment = "store-builder" | "marketplace" | "local-platform" | "payments";
export type ResearchStatus = "published" | "not-published" | "not-readable";

export interface CompetitorPlan {
  name: string;
  monthlyFee: Money | null;
  setupFee: Money | null;
  /** Commission on each sale, in basis points (100 = 1%). */
  commissionBps: number | null;
  cardFee: { bps: number; fixed: Money } | null;
  addOns: string[];
  extraCharges: string[];
  features: string[];
  sourceUrl: string;
  /** `YYYY-MM-DD` the page was read. */
  retrievedOn: string;
}

export interface Competitor {
  id: string;
  name: string;
  segment: CompetitorSegment;
  website: string;
  researchStatus: ResearchStatus;
  /** `YYYY-MM-DD` of the last research attempt, whatever its outcome. */
  researchedOn: string;
  note: string | null;
  plans: CompetitorPlan[];
}

export const SEGMENT_LABEL: Record<CompetitorSegment, string> = {
  "store-builder": "Store builders",
  marketplace: "Marketplaces",
  "local-platform": "UK local-shop platforms",
  payments: "Payment-only baseline",
};

const SHOPIFY = "https://www.shopify.com/uk/pricing";
const SQUARE = "https://squareup.com/gb/en/online-store/plans";
const ECWID = "https://www.ecwid.com/pricing";
const UBER = "https://merchants.ubereats.com/gb/en/pricing/";
const STRIPE = "https://stripe.com/gb/pricing";
const SUMUP = "https://www.sumup.com/en-gb/pricing/";

const READ_ON = "2026-10-27";

function shopifyPlan(name: string, feePence: number, cardBps: number, thirdPartyFee: string) {
  return {
    name,
    monthlyFee: gbp(feePence),
    setupFee: null,
    commissionBps: null,
    cardFee: { bps: cardBps, fixed: gbp(25) },
    addOns: ["POS Pro: £69 per month per location", "Advanced Tax Platform"],
    extraCharges: [
      `${thirdPartyFee} transaction fee when using a third-party payment provider`,
      "Price shown is billed monthly; yearly billing is cheaper",
    ],
    features: ["Online store", "Shopify Payments card rates"],
    sourceUrl: SHOPIFY,
    retrievedOn: READ_ON,
  } satisfies CompetitorPlan;
}

function squarePlan(name: string, feePence: number, fixedPence: number, billing: string) {
  return {
    name,
    monthlyFee: gbp(feePence),
    setupFee: null,
    commissionBps: null,
    cardFee: { bps: 140, fixed: gbp(fixedPence) },
    addOns: [],
    extraCharges: [`Non-UK cards: 2.5% + ${fixedPence}p`, billing],
    features: ["Online store", "Square card processing"],
    sourceUrl: SQUARE,
    retrievedOn: READ_ON,
  } satisfies CompetitorPlan;
}

function ecwidPlan(name: string, feeCents: number) {
  return {
    name,
    monthlyFee: usd(feeCents),
    setupFee: null,
    commissionBps: 0,
    cardFee: null,
    addOns: [],
    extraCharges: ["Monthly billing price; annual billing is cheaper", "Excludes taxes"],
    features: ["Online store", "No per-sale fee charged by Ecwid"],
    sourceUrl: ECWID,
    retrievedOn: READ_ON,
  } satisfies CompetitorPlan;
}

function uberPlan(name: string, commissionBps: number, extra: string[]) {
  return {
    name,
    monthlyFee: null,
    setupFee: gbp(65000),
    commissionBps,
    cardFee: null,
    addOns: [],
    extraCharges: [
      "Activation fee £650 excl. VAT (tablet, printer, menu set-up, photography)",
      ...extra,
    ],
    features: ["Marketplace listing and ordering"],
    sourceUrl: UBER,
    retrievedOn: READ_ON,
  } satisfies CompetitorPlan;
}

export const COMPETITORS: readonly Competitor[] = [
  {
    id: "shopify",
    name: "Shopify",
    segment: "store-builder",
    website: "https://www.shopify.com/uk",
    researchStatus: "published",
    researchedOn: READ_ON,
    note: "Plus starts at £1,800 per month on custom terms and is not listed as a plan.",
    plans: [
      shopifyPlan("Basic", 2500, 200, "2%"),
      shopifyPlan("Grow", 6500, 170, "1%"),
      shopifyPlan("Advanced", 34400, 150, "0.6%"),
    ],
  },
  {
    id: "wix",
    name: "Wix",
    segment: "store-builder",
    website: "https://www.wix.com",
    researchStatus: "not-readable",
    researchedOn: READ_ON,
    note: "The pricing page shows location-dependent prices and says its USD prices are for reference only, so no figure could be attributed to a currency.",
    plans: [],
  },
  {
    id: "square-online",
    name: "Square Online",
    segment: "store-builder",
    website: "https://squareup.com/gb/en",
    researchStatus: "published",
    researchedOn: READ_ON,
    note: null,
    plans: [
      squarePlan("Free", 0, 25, "No monthly fee"),
      squarePlan("Plus", 2000, 25, "Monthly price when billed annually"),
      squarePlan("Premium", 6400, 15, "Monthly price when billed annually"),
    ],
  },
  {
    id: "ecwid",
    name: "Ecwid",
    segment: "store-builder",
    website: "https://www.ecwid.com",
    researchStatus: "published",
    researchedOn: READ_ON,
    note: null,
    plans: [
      ecwidPlan("Starter", 500),
      ecwidPlan("Venture", 3500),
      ecwidPlan("Business", 6500),
      ecwidPlan("Unlimited", 14900),
    ],
  },
  {
    id: "uber-eats",
    name: "Uber Eats",
    segment: "marketplace",
    website: "https://www.ubereats.com",
    researchStatus: "published",
    researchedOn: READ_ON,
    note: null,
    plans: [
      uberPlan("Uber Delivery", 3000, ["33% for Uber One members"]),
      uberPlan("Self-Delivery", 1300, []),
      uberPlan("Pick-up", 1300, []),
    ],
  },
  {
    id: "deliveroo",
    name: "Deliveroo",
    segment: "marketplace",
    website: "https://deliveroo.co.uk",
    researchStatus: "not-readable",
    researchedOn: READ_ON,
    note: "The public site publishes no partner commission, and the partner sign-up site (restaurants.deliveroo.com) could not be read.",
    plans: [],
  },
  {
    id: "just-eat",
    name: "Just Eat",
    segment: "marketplace",
    website: "https://www.just-eat.co.uk",
    researchStatus: "not-published",
    researchedOn: READ_ON,
    note: "The partner hub publishes no commission, joining fee or subscription figure.",
    plans: [],
  },
  {
    id: "snappy-shopper",
    name: "Snappy Shopper",
    segment: "local-platform",
    website: "https://www.snappyshopper.co.uk",
    researchStatus: "not-readable",
    researchedOn: READ_ON,
    note: "The retailer site (retailers.snappyshopper.co.uk) could not be read. Trade press mentions a sign-up fee and a retailer service fee, but gives no figure from Snappy Shopper itself.",
    plans: [],
  },
  {
    id: "stripe-payments",
    name: "Stripe",
    segment: "payments",
    website: "https://stripe.com",
    researchStatus: "published",
    researchedOn: READ_ON,
    note: "The platform's own payment provider: under today's single platform account, these fees are a platform cost.",
    plans: [
      {
        name: "Standard",
        monthlyFee: gbp(0),
        setupFee: null,
        commissionBps: null,
        cardFee: { bps: 150, fixed: gbp(20) },
        addOns: [],
        extraCharges: [
          "EEA cards: 2.5% + 20p",
          "International cards: 3.15% + 20p",
          "+2% if currency conversion is required",
        ],
        features: ["No setup or monthly fees"],
        sourceUrl: STRIPE,
        retrievedOn: READ_ON,
      },
    ],
  },
  {
    id: "sumup",
    name: "SumUp",
    segment: "payments",
    website: "https://www.sumup.com",
    researchStatus: "published",
    researchedOn: READ_ON,
    note: "The page states in-person rates; its online-payment rates were not shown, so no card fee is recorded.",
    plans: [
      {
        name: "Pay-as-you-go",
        monthlyFee: gbp(0),
        setupFee: null,
        commissionBps: null,
        cardFee: null,
        addOns: [],
        extraCharges: [],
        features: ["In-person: 1.69% for cards other than SumUp's own"],
        sourceUrl: SUMUP,
        retrievedOn: READ_ON,
      },
      {
        name: "Payments Plus",
        monthlyFee: gbp(1900),
        setupFee: null,
        commissionBps: null,
        cardFee: null,
        addOns: [],
        extraCharges: [],
        features: ["Lower in-person rates for a monthly fee"],
        sourceUrl: SUMUP,
        retrievedOn: READ_ON,
      },
    ],
  },
];
