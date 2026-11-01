import { gbp, usd, type Currency, type Money } from "@/lib/pricing/money";

/**
 * #1313 - what the platform will cost IN PRODUCTION as shops and orders grow. Pure.
 *
 * `lib/running-costs.ts` is what we pay NOW; this is the scaling model. Every usage cost uses one
 * formula (`lib/pricing/volume-model.ts`):
 *
 *   units = baseUnits + shops * perShopUnits + shops * ordersPerShop * perOrderUnits
 *   cost  = fixed monthly part + max(0, units - freeUnits) * price.minor / price.perUnits
 *
 * A driver may have more than one usage part (Neon bills compute and storage separately; R2 bills two
 * operation classes); each part is costed on its own and summed (amended at Build, #1313 R3).
 *
 * UNIT PRICES and free allowances are copied from each provider's own pricing page on `asOf`. USAGE
 * QUANTITIES (requests per order, GB per shop, ...) are always OUR ESTIMATES: the platform has never
 * traded. Each note says so. Workers Paid's $5 and the domains are in `lib/running-costs.ts` and enter
 * every scenario as "current fixed costs", so they are not repeated here.
 */

export type DriverGroup = "infrastructure" | "messaging" | "operations" | "business";

export interface UsagePart {
  unit: string;
  baseUnits: number;
  perShopUnits: number;
  perOrderUnits: number;
  /** Free allowance per month for the whole platform, in `unit`. */
  freeUnits: number;
  /** `minor` (integer) per `perUnits` (positive integer) units. */
  price: { minor: number; perUnits: number; currency: Currency };
}

export interface CostDriver {
  id: string;
  name: string;
  provider: string;
  group: DriverGroup;
  fixed: { amount: Money; period: "month" | "year" } | null;
  oneOff: Money | null;
  usage: UsagePart[] | null;
  basis: "published-source" | "estimate";
  sourceUrl: string | null;
  /** `YYYY-MM-DD` the figures were read or estimated. */
  asOf: string;
  note: string;
}

export const DRIVER_GROUP_LABEL: Record<DriverGroup, string> = {
  infrastructure: "Infrastructure",
  messaging: "Email and SMS",
  operations: "Monitoring and backups",
  business: "Running the business",
};

const READ = "2026-10-28";
const NEON = "https://neon.com/pricing";
const WORKERS = "https://developers.cloudflare.com/workers/platform/pricing/";
const R2 = "https://developers.cloudflare.com/r2/pricing/";
const USAGE_NOTE = "Usage quantities are our estimates; the unit prices are the provider's.";

export const COST_DRIVERS: readonly CostDriver[] = [
  {
    id: "neon-production",
    name: "Production database",
    provider: "Neon",
    group: "infrastructure",
    fixed: null,
    oneOff: null,
    usage: [
      {
        unit: "CU-hours",
        baseUnits: 150,
        perShopUnits: 0,
        perOrderUnits: 0.001,
        freeUnits: 0,
        price: { minor: 106, perUnits: 10, currency: "USD" },
      },
      {
        unit: "GB-month of storage",
        baseUnits: 0.5,
        perShopUnits: 0.25,
        perOrderUnits: 0.00012,
        freeUnits: 0,
        price: { minor: 35, perUnits: 1, currency: "USD" },
      },
    ],
    basis: "published-source",
    sourceUrl: NEON,
    asOf: READ,
    note: `Launch plan: $0.106 per CU-hour and $0.35 per GB-month, pay for what you use. The Free plan's 100 CU-hours were exceeded on 2026-10-26 with no trading (#1289), so production needs Launch. Baseline 150 CU-hours a month; storage keeps 12 months of orders at about 10 KB each. ${USAGE_NOTE}`,
  },
  {
    id: "neon-dev-staging",
    name: "Development and staging databases",
    provider: "Neon",
    group: "infrastructure",
    fixed: null,
    oneOff: null,
    usage: [
      {
        unit: "CU-hours",
        baseUnits: 120,
        perShopUnits: 0,
        perOrderUnits: 0,
        freeUnits: 200,
        price: { minor: 106, perUnits: 10, currency: "USD" },
      },
      {
        unit: "GB-month of storage",
        baseUnits: 1,
        perShopUnits: 0,
        perOrderUnits: 0,
        freeUnits: 2,
        price: { minor: 35, perUnits: 1, currency: "USD" },
      },
    ],
    basis: "published-source",
    sourceUrl: NEON,
    asOf: READ,
    note: `Two Free-plan projects (100 CU-hours and 1 GB each). The Free plan suspends rather than bills when it runs out; the price shown is what Launch would charge. ${USAGE_NOTE}`,
  },
  {
    id: "workers-requests",
    name: "Worker requests",
    provider: "Cloudflare",
    group: "infrastructure",
    fixed: null,
    oneOff: null,
    usage: [
      {
        unit: "requests",
        baseUnits: 100_000,
        perShopUnits: 30_000,
        perOrderUnits: 80,
        freeUnits: 10_000_000,
        price: { minor: 30, perUnits: 1_000_000, currency: "USD" },
      },
    ],
    basis: "published-source",
    sourceUrl: WORKERS,
    asOf: READ,
    note: `Workers Paid includes 10 million requests a month, then $0.30 per million. About 80 page and API requests per order, plus crawlers and staff use per shop. ${USAGE_NOTE}`,
  },
  {
    id: "workers-cpu",
    name: "Worker CPU time",
    provider: "Cloudflare",
    group: "infrastructure",
    fixed: null,
    oneOff: null,
    usage: [
      {
        unit: "CPU milliseconds",
        baseUnits: 1_000_000,
        perShopUnits: 300_000,
        perOrderUnits: 1_200,
        freeUnits: 30_000_000,
        price: { minor: 2, perUnits: 1_000_000, currency: "USD" },
      },
    ],
    basis: "published-source",
    sourceUrl: WORKERS,
    asOf: READ,
    note: `Workers Paid includes 30 million CPU milliseconds a month, then $0.02 per million. About 15 ms per request. ${USAGE_NOTE}`,
  },
  {
    id: "r2-storage",
    name: "Image storage",
    provider: "Cloudflare R2",
    group: "infrastructure",
    fixed: null,
    oneOff: null,
    usage: [
      {
        unit: "GB-month",
        baseUnits: 1,
        perShopUnits: 1,
        perOrderUnits: 0,
        freeUnits: 10,
        price: { minor: 15, perUnits: 10, currency: "USD" },
      },
    ],
    basis: "published-source",
    sourceUrl: R2,
    asOf: READ,
    note: `10 GB-month free, then $0.015 per GB-month; egress is free. About 1 GB of product images per shop. ${USAGE_NOTE}`,
  },
  {
    id: "r2-operations",
    name: "Image reads and writes",
    provider: "Cloudflare R2",
    group: "infrastructure",
    fixed: null,
    oneOff: null,
    usage: [
      {
        unit: "Class B reads",
        baseUnits: 200_000,
        perShopUnits: 20_000,
        perOrderUnits: 20,
        freeUnits: 10_000_000,
        price: { minor: 36, perUnits: 1_000_000, currency: "USD" },
      },
      {
        unit: "Class A writes",
        baseUnits: 10_000,
        perShopUnits: 2_000,
        perOrderUnits: 0,
        freeUnits: 1_000_000,
        price: { minor: 450, perUnits: 1_000_000, currency: "USD" },
      },
    ],
    basis: "published-source",
    sourceUrl: R2,
    asOf: READ,
    note: `Class B: 10 million free, then $0.36 per million. Class A: 1 million free, then $4.50 per million. Most image views are served from the CDN cache. ${USAGE_NOTE}`,
  },
  {
    id: "workers-ai",
    name: "AI images and text",
    provider: "Cloudflare Workers AI",
    group: "infrastructure",
    fixed: null,
    oneOff: null,
    usage: [
      {
        unit: "neurons",
        baseUnits: 30_000,
        perShopUnits: 5_000,
        perOrderUnits: 2,
        freeUnits: 300_000,
        price: { minor: 11, perUnits: 10_000, currency: "USD" },
      },
    ],
    basis: "published-source",
    sourceUrl: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
    asOf: READ,
    note: `10,000 neurons a day free (counted here as 300,000 a month), then $0.011 per 1,000. A flux-1-schnell image is 4.80 neurons per 512x512 tile plus 9.60 per step, so about 50 neurons; 5,000 per shop covers about 50 new product images and text features a month. ${USAGE_NOTE}`,
  },
  {
    id: "email-transactional",
    name: "Order and delivery emails",
    // #1217 — Cloudflare Email Service replaced Resend as the provider (Resend stays a config
    // fallback). Included in Workers Paid, so no fixed fee of its own.
    provider: "Cloudflare Email Service",
    group: "messaging",
    fixed: null,
    oneOff: null,
    usage: [
      {
        unit: "emails",
        baseUnits: 200,
        perShopUnits: 50,
        perOrderUnits: 3,
        freeUnits: 3_000,
        price: { minor: 35, perUnits: 1_000, currency: "USD" },
      },
    ],
    basis: "published-source",
    sourceUrl: "https://developers.cloudflare.com/email-service/platform/pricing/",
    // The registry's shared read date; the Cloudflare price itself was read on 2026-11-01 (#1217).
    asOf: READ,
    note: `Workers Paid includes 3,000 emails a month per account, then $0.35 per 1,000. Incoming mail (Email Routing) is free. Three emails per order (confirmation, dispatch, delivered). ${USAGE_NOTE}`,
  },
  {
    id: "sms",
    name: "SMS order alerts",
    provider: "Twilio",
    group: "messaging",
    fixed: null,
    oneOff: null,
    usage: [
      {
        unit: "messages",
        baseUnits: 0,
        perShopUnits: 0,
        perOrderUnits: 0,
        freeUnits: 0,
        price: { minor: 56, perUnits: 10, currency: "USD" },
      },
    ],
    basis: "published-source",
    sourceUrl: "https://www.twilio.com/en-us/sms/pricing/gb",
    asOf: READ,
    note: `$0.056 per UK message. Not part of the base platform: it is costed through the SMS add-on, so usage here is 0. ${USAGE_NOTE}`,
  },
  {
    id: "error-tracking",
    name: "Error tracking and alerts",
    provider: "Sentry",
    group: "operations",
    fixed: { amount: usd(2900), period: "month" },
    oneOff: null,
    usage: null,
    basis: "published-source",
    sourceUrl: "https://sentry.io/pricing/",
    asOf: READ,
    note: "Team plan, $29 a month billed monthly, 50k errors. The free Developer plan allows one user, and there are two partners. Today errors go to the built-in /staff/errors page, which sends no alerts.",
  },
  {
    id: "uptime-monitoring",
    name: "Uptime alerts",
    provider: "UptimeRobot",
    group: "operations",
    fixed: { amount: gbp(1000), period: "month" },
    oneOff: null,
    usage: null,
    basis: "estimate",
    sourceUrl: null,
    asOf: READ,
    note: "Estimate. uptimerobot.com/pricing listed the Solo plan at €12 a month on 2026-10-28, and its free plan is described as for hobby and non-profit projects. The registry has no euro currency, so this is our £10 estimate. Production was down for over a day before anyone noticed (#1289, #1296).",
  },
  {
    id: "backups",
    name: "Database backups (point-in-time restore)",
    provider: "Neon",
    group: "operations",
    fixed: { amount: usd(0), period: "month" },
    oneOff: null,
    usage: null,
    basis: "published-source",
    sourceUrl: NEON,
    asOf: READ,
    note: "Included in the Launch plan: restore to any point in the last 7 days. No separate charge.",
  },
  {
    id: "company-formation",
    name: "Company formation",
    provider: "Companies House",
    group: "business",
    fixed: null,
    oneOff: gbp(10000),
    usage: null,
    basis: "published-source",
    sourceUrl: "https://www.gov.uk/limited-company-formation/register-your-company",
    asOf: READ,
    note: "£100 to register a limited company online. One-off.",
  },
  {
    id: "accountant",
    name: "Accountant",
    provider: "To be chosen",
    group: "business",
    fixed: { amount: gbp(10000), period: "month" },
    oneOff: null,
    usage: null,
    basis: "estimate",
    sourceUrl: null,
    asOf: READ,
    note: "Estimate: about £100 a month for a small limited company's accounts, confirmation statement and VAT returns. Replace with a quote.",
  },
  {
    id: "ico-fee",
    name: "ICO data protection fee",
    provider: "Information Commissioner's Office",
    group: "business",
    fixed: { amount: gbp(5200), period: "year" },
    oneOff: null,
    usage: null,
    basis: "estimate",
    sourceUrl: null,
    asOf: READ,
    note: "Estimate: £52 a year for a tier 1 (micro) organisation. The ICO's fee pages could not be read on 2026-10-28 (one returned 404, the other showed no amounts), so this is not a verified figure. Confirm at ico.org.uk before paying.",
  },
  {
    id: "insurance-public-liability",
    name: "Public liability insurance",
    provider: "To be chosen",
    group: "business",
    fixed: { amount: gbp(12000), period: "year" },
    oneOff: null,
    usage: null,
    basis: "estimate",
    sourceUrl: null,
    asOf: READ,
    note: "Estimate: about £120 a year for a two-person software business. Replace with a quote.",
  },
  {
    id: "insurance-professional-indemnity",
    name: "Professional indemnity insurance",
    provider: "To be chosen",
    group: "business",
    fixed: { amount: gbp(30000), period: "year" },
    oneOff: null,
    usage: null,
    basis: "estimate",
    sourceUrl: null,
    asOf: READ,
    note: "Estimate: about £300 a year. It covers a shop's claim that the platform cost it money (an outage, a wrong price). Replace with a quote.",
  },
  {
    id: "legal-templates",
    name: "Legal templates (terms, privacy, data processing agreement)",
    provider: "To be chosen",
    group: "business",
    fixed: null,
    oneOff: gbp(50000),
    usage: null,
    basis: "estimate",
    sourceUrl: null,
    asOf: READ,
    note: "Estimate: about £500 one-off for platform terms, a privacy notice and a data processing agreement signed with each shop.",
  },
];
