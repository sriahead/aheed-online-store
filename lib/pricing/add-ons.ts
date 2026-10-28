import { roundHalfUp } from "@/lib/pricing/money";

/**
 * #1313 - paid extras a shop can add, with what each costs us to run. Pure. Proposals only.
 *
 * `runCost` is our cost per billing unit, in pence: a provider unit price times the stated usage, or
 * partner minutes at the year-1 rate (£25 an hour). `marginClass` is `cheap-high-margin` exactly when
 * the margin is 70% or more (tested), so a usage-heavy add-on is priced to cover its use. An add-on the
 * platform cannot deliver today is `available: false`; its price is still shown, as a proposal.
 */

export type AddOnBilling = "month" | "one-off" | "per-use";
export type MarginClass = "cheap-high-margin" | "usage-heavy";

export interface AddOn {
  id: string;
  name: string;
  price: { pence: number; billing: AddOnBilling; unit: string };
  runCost: {
    pence: number;
    basis: "published-source" | "estimate";
    /** The cost driver the figure comes from, if any (for staleness). */
    driverId: string | null;
    derivation: string;
  };
  packaging: "separate" | { includedIn: string };
  available: boolean;
  marginClass: MarginClass;
  note: string;
  /** `YYYY-MM-DD` the price and run cost were last reviewed. */
  asOf: string;
}

export const HIGH_MARGIN_BPS = 7000;

/** Margin on one billing unit, in basis points. */
export function addOnMarginBps(addOn: Pick<AddOn, "price" | "runCost">): number {
  const x = ((addOn.price.pence - addOn.runCost.pence) * 10000) / addOn.price.pence;
  return x >= 0 ? roundHalfUp(x) : -roundHalfUp(-x);
}

export const ADD_ONS: readonly AddOn[] = [
  {
    id: "custom-domain",
    name: "Custom domain",
    price: { pence: 300, billing: "month", unit: "per domain per month" },
    runCost: {
      pence: 65,
      basis: "published-source",
      driverId: null,
      derivation:
        "Cloudflare Registrar .com at $10.46 a year (running costs registry, domain-nocaped), about 65p a month at 134 US cents per £1.",
    },
    packaging: { includedIn: "customer-fee" },
    available: true,
    marginClass: "cheap-high-margin",
    note: "The shop owns the domain and can take it with them (see Risks: domain ownership).",
    asOf: "2026-10-28",
  },
  {
    id: "ai-content",
    name: "AI product photos and descriptions",
    price: { pence: 500, billing: "month", unit: "up to 50 products a month" },
    runCost: {
      pence: 5,
      basis: "published-source",
      driverId: "workers-ai",
      derivation:
        "About 5,000 Workers AI neurons for 50 images and descriptions, $0.011 per 1,000 beyond the free daily allowance.",
    },
    packaging: "separate",
    available: true,
    marginClass: "cheap-high-margin",
    note: "Images are generated and stored in R2 today. A person reviews each image before it goes live.",
    asOf: "2026-10-28",
  },
  {
    id: "catalogue-setup",
    name: "Catalogue setup service",
    price: { pence: 25000, billing: "one-off", unit: "up to 500 products" },
    runCost: {
      pence: 12500,
      basis: "estimate",
      driverId: null,
      derivation: "300 partner minutes at £25 an hour.",
    },
    packaging: "separate",
    available: true,
    marginClass: "usage-heavy",
    note: "Importing and checking a shop's product list, prices and categories. Priced to cover our time.",
    asOf: "2026-10-28",
  },
  {
    id: "extra-staff-accounts",
    name: "Extra staff accounts",
    price: { pence: 200, billing: "month", unit: "per account per month" },
    runCost: {
      pence: 5,
      basis: "estimate",
      driverId: null,
      derivation: "Negligible database and sign-in load per account; 5p a month allowed.",
    },
    packaging: "separate",
    available: true,
    marginClass: "cheap-high-margin",
    note: "Two staff accounts come with every plan.",
    asOf: "2026-10-28",
  },
  {
    id: "sms-alerts",
    name: "SMS order alerts",
    price: { pence: 8, billing: "per-use", unit: "per message" },
    runCost: {
      pence: 4,
      basis: "published-source",
      driverId: "sms",
      derivation: "Twilio UK outbound SMS at $0.056 a message, about 4p.",
    },
    packaging: "separate",
    available: false,
    marginClass: "usage-heavy",
    note: "Not built yet. Every message costs us money, so it is charged per message, never bundled.",
    asOf: "2026-10-28",
  },
  {
    id: "marketing-emails",
    name: "Marketing emails",
    price: { pence: 1000, billing: "month", unit: "up to 2,000 emails a month" },
    runCost: {
      pence: 134,
      basis: "published-source",
      driverId: "email-transactional",
      derivation: "2,000 emails at Resend's $0.90 per 1,000 overage, about £1.34.",
    },
    packaging: "separate",
    available: false,
    marginClass: "cheap-high-margin",
    note: "Not built yet: consent-checked marketing sending is #1152.",
    asOf: "2026-10-28",
  },
  {
    id: "loyalty",
    name: "Loyalty and rewards",
    price: { pence: 1500, billing: "month", unit: "per shop per month" },
    runCost: {
      pence: 417,
      basis: "estimate",
      driverId: null,
      derivation: "About 10 partner minutes a month of support at £25 an hour.",
    },
    packaging: "separate",
    available: true,
    marginClass: "cheap-high-margin",
    note: "The rewards scheme exists today and is switched on per shop at /staff/loyalty.",
    asOf: "2026-10-28",
  },
  {
    id: "driver-routing",
    name: "Delivery driver app and route planning",
    price: { pence: 2500, billing: "month", unit: "per shop per month" },
    runCost: {
      pence: 800,
      basis: "estimate",
      driverId: null,
      derivation: "A third-party routing service plus support time; no provider chosen.",
    },
    packaging: "separate",
    available: false,
    marginClass: "usage-heavy",
    note: "Not built yet. Do not sell until a routing provider is priced.",
    asOf: "2026-10-28",
  },
  {
    id: "pos-stock-sync",
    name: "Till (POS) or stock sync",
    price: { pence: 3000, billing: "month", unit: "per shop per month" },
    runCost: {
      pence: 1250,
      basis: "estimate",
      driverId: null,
      derivation:
        "About 30 partner minutes a month keeping an integration working, at £25 an hour.",
    },
    packaging: "separate",
    available: false,
    marginClass: "usage-heavy",
    note: "Not built yet, and each till system is a separate integration (see #1196).",
    asOf: "2026-10-28",
  },
  {
    id: "analytics-reports",
    name: "Analytics reports",
    price: { pence: 800, billing: "month", unit: "per shop per month" },
    runCost: {
      pence: 20,
      basis: "estimate",
      driverId: null,
      derivation: "Report queries on the existing database; about 20p a month allowed.",
    },
    packaging: "separate",
    available: true,
    marginClass: "cheap-high-margin",
    note: "Builds on the staff reports that exist today.",
    asOf: "2026-10-28",
  },
  {
    id: "priority-support",
    name: "Priority support (evenings and weekends)",
    price: { pence: 4000, billing: "month", unit: "per shop per month" },
    runCost: {
      pence: 2500,
      basis: "estimate",
      driverId: null,
      derivation: "About 60 partner minutes a month of out-of-hours cover at £25 an hour.",
    },
    packaging: "separate",
    available: true,
    marginClass: "usage-heavy",
    note: "Shops trade evenings and weekends. Standard support is working hours; this covers the rest.",
    asOf: "2026-10-28",
  },
  {
    id: "multi-branch",
    name: "Multi-branch shops",
    price: { pence: 2000, billing: "month", unit: "per extra branch per month" },
    runCost: {
      pence: 833,
      basis: "estimate",
      driverId: null,
      derivation: "About 20 partner minutes a month per branch at £25 an hour.",
    },
    packaging: "separate",
    available: false,
    marginClass: "usage-heavy",
    note: "Not built yet: one shop has one set of delivery areas, slots and stock today.",
    asOf: "2026-10-28",
  },
];
