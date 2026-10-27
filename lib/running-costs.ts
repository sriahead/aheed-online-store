/**
 * #1295 - the platform's running costs, as data. Pure: no React, no Next, no database, no network.
 *
 * WHY A FILE AND NOT A TABLE: about a dozen rows that change a few times a year do not justify a
 * migration, an editor or a seed. The owner edits this file and ships; every figure carries its own
 * `asOf` date and `basis`, so the page can say how much to trust it. See
 * specs/2026-10-27-running-costs-report/plan.md.
 *
 * RULES THAT KEEP THE REPORT HONEST
 *  - Money is integer cents with an explicit currency (CLAUDE.md). USD only: Cloudflare quotes USD
 *    and any conversion would be an invented rate. A second currency means extending the report.
 *  - `costStatus` says what a figure is: `actual` (a bill or a dashboard the owner reads),
 *    `planned` (about to be bought), `estimate` (computed from usage) or `unverified`.
 *  - Only fixed `actual` and `planned` amounts reach a total. A usage-based or not-yet-priced item
 *    has `amountCents: null` and is listed as unpriced, so a total never silently includes a guess.
 *  - `limits` (free allowance and overage) are copied from a provider's own pricing page with its URL
 *    and retrieval date, and stay "not confirmed by the owner" until `confirmedByOwner` is set. If a
 *    page could not be read, `limits` is `null`; never fill it from memory.
 */

export type CostStatus = "actual" | "planned" | "estimate" | "unverified";
/**
 * `open-licence` (#1309): free, open data or assets, where the "pricing page" is the licence. Such
 * an item costs 0 and its `limits.sourceUrl` is the licence or terms page.
 */
export type CostBasis =
  | "owner-stated"
  | "provider-dashboard"
  | "provider-pricing-page"
  | "not-confirmed"
  | "open-licence";
/**
 * #1309 - which kind of cost an item is. `platform-fixed`: a subscription or registration the
 * platform needs to run. `platform-usage`: billed by use. `dev-tools`: used to build the platform,
 * not to run it.
 */
export type CostGroup = "platform-fixed" | "platform-usage" | "dev-tools";
/**
 * #1309 - how often an item's figures are re-checked: monthly for running costs, quarterly for
 * annual subscriptions and open licences. `reviewEvery` is `quarter` exactly when `period` is `year`
 * or `basis` is `open-licence` (tested).
 */
export type ReviewInterval = "month" | "quarter";
export type CostCategory =
  | "hosting"
  | "domain"
  | "database"
  | "storage"
  | "ai"
  | "payments"
  | "email"
  | "security"
  | "devtools"
  | "data"
  | "assets";
export type CostPeriod = "month" | "year";

export interface CostLimits {
  /** What is free, in the provider's own terms. */
  allowance: string;
  /** What happens or what it costs beyond that, or `null` when the page does not say. */
  overage: string | null;
  sourceUrl: string;
  /** `YYYY-MM-DD` the page was read. */
  retrievedOn: string;
  confirmedByOwner: boolean;
}

export interface CostPriceChange {
  /** The new price in cents from `effectiveOn` onward; only meaningful for a `year` item. */
  toCents: number;
  /** `YYYY-MM-DD`. */
  effectiveOn: string;
  note: string;
}

export interface CostItem {
  id: string;
  name: string;
  provider: string;
  category: CostCategory;
  group: CostGroup;
  reviewEvery: ReviewInterval;
  /** What the item is used for, or `null`. */
  role: string | null;
  plan: string;
  costStatus: CostStatus;
  basis: CostBasis;
  /** `YYYY-MM-DD` the figures were last checked. */
  asOf: string;
  amountCents: number | null;
  period: CostPeriod | null;
  currency: "USD";
  /** `YYYY-MM-DD`, or `null` when there is no dated renewal (or it is not bought yet). */
  renewsOn: string | null;
  /** `null` when it does not apply or is not known. */
  autoRenew: boolean | null;
  priceChange: CostPriceChange | null;
  limits: CostLimits | null;
  /** The one live usage source the page can read today. */
  usage: "workers-ai" | null;
  note: string | null;
}

const WORKERS_PRICING = "https://developers.cloudflare.com/workers/platform/pricing/";
const NEON_PRICING = "https://neon.com/pricing";
const R2_PRICING = "https://developers.cloudflare.com/r2/pricing/";
const WORKERS_AI_PRICING = "https://developers.cloudflare.com/workers-ai/platform/pricing/";

/** Verisign's `.com` increase, announced on the Cloudflare Registrar page on 2026-10-27. */
const COM_PRICE_CHANGE: CostPriceChange = {
  toCents: 1117,
  effectiveOn: "2026-11-01",
  note: "Verisign raises the standard .com price from $10.46 to $11.17 for registrations, renewals and transfers.",
};

export const RUNNING_COST_ITEMS: readonly CostItem[] = [
  {
    id: "cloudflare-workers",
    group: "platform-fixed",
    reviewEvery: "month",
    name: "Cloudflare Workers",
    provider: "Cloudflare",
    category: "hosting",
    role: "Runs the storefront and staff panel",
    plan: "Workers Paid",
    costStatus: "actual",
    basis: "owner-stated",
    asOf: "2026-10-27",
    amountCents: 500,
    period: "month",
    currency: "USD",
    renewsOn: null,
    autoRenew: null,
    priceChange: null,
    limits: {
      allowance: "10 million requests and 30 million CPU milliseconds included per month",
      overage:
        "$0.30 per additional million requests; $0.02 per additional million CPU milliseconds",
      sourceUrl: WORKERS_PRICING,
      retrievedOn: "2026-10-27",
      confirmedByOwner: false,
    },
    usage: null,
    note: null,
  },
  {
    id: "domain-nocaped",
    group: "platform-fixed",
    reviewEvery: "quarter",
    name: "nocaped.com",
    provider: "Cloudflare Registrar",
    category: "domain",
    role: "dev and staging",
    plan: "Domain registration",
    costStatus: "actual",
    basis: "provider-dashboard",
    asOf: "2026-10-27",
    amountCents: 1046,
    period: "year",
    currency: "USD",
    renewsOn: "2027-08-15",
    autoRenew: false,
    priceChange: COM_PRICE_CHANGE,
    limits: null,
    usage: null,
    note: "Every dev and staging host sits on this domain.",
  },
  {
    id: "domain-merqify",
    group: "platform-fixed",
    reviewEvery: "quarter",
    name: "merqify.com",
    provider: "Cloudflare Registrar",
    category: "domain",
    role: "main platform domain",
    plan: "Domain registration",
    costStatus: "planned",
    basis: "provider-pricing-page",
    asOf: "2026-10-27",
    amountCents: 1046,
    period: "year",
    currency: "USD",
    renewsOn: null,
    autoRenew: null,
    priceChange: COM_PRICE_CHANGE,
    limits: null,
    usage: null,
    note: "Being bought on 2026-10-27. Set renewsOn and costStatus once registered.",
  },
  {
    id: "domain-aheedfoodcentre",
    group: "platform-fixed",
    reviewEvery: "quarter",
    name: "aheedfoodcentre.co.uk",
    provider: "Cloudflare Registrar",
    category: "domain",
    role: "client domain",
    plan: "Domain registration",
    costStatus: "planned",
    basis: "provider-pricing-page",
    asOf: "2026-10-27",
    amountCents: 530,
    period: "year",
    currency: "USD",
    renewsOn: null,
    autoRenew: null,
    priceChange: null,
    limits: null,
    usage: null,
    note: "Being bought on 2026-10-27. Set renewsOn and costStatus once registered.",
  },
  {
    id: "neon",
    group: "platform-fixed",
    reviewEvery: "month",
    name: "Neon Postgres",
    provider: "Neon",
    category: "database",
    role: "Primary database (dev, staging and production projects)",
    plan: "Free",
    costStatus: "actual",
    basis: "owner-stated",
    asOf: "2026-10-27",
    amountCents: 0,
    period: "month",
    currency: "USD",
    renewsOn: null,
    autoRenew: null,
    priceChange: null,
    limits: {
      allowance:
        "Free plan: 1 GB storage per project (20 GB across the account), 100 CU-hours per project per month, up to 100 projects",
      overage:
        "Exceeding the storage limit blocks writes; running out of CU-hours suspends compute until the next billing period. The first paid plan is usage-based.",
      sourceUrl: NEON_PRICING,
      retrievedOn: "2026-10-27",
      confirmedByOwner: false,
    },
    usage: null,
    note: "The production project went over its free quota from about 2026-10-26 (#1289). Moving to a paid plan would be a new cost this report does not yet model.",
  },
  {
    id: "cloudflare-r2",
    group: "platform-usage",
    reviewEvery: "month",
    name: "Cloudflare R2",
    provider: "Cloudflare",
    category: "storage",
    role: "Product, category and icon images",
    plan: "Free",
    costStatus: "actual",
    basis: "owner-stated",
    asOf: "2026-10-27",
    amountCents: 0,
    period: "month",
    currency: "USD",
    renewsOn: null,
    autoRenew: null,
    priceChange: null,
    limits: {
      allowance:
        "R2 Standard: 10 GB-month storage, 1 million Class A operations and 10 million Class B operations per month",
      overage:
        "$0.015 per GB-month; $4.50 per million Class A operations; $0.36 per million Class B operations",
      sourceUrl: R2_PRICING,
      retrievedOn: "2026-10-27",
      confirmedByOwner: false,
    },
    usage: null,
    note: null,
  },
  {
    id: "cloudflare-access",
    group: "dev-tools",
    reviewEvery: "month",
    name: "Cloudflare Access",
    provider: "Cloudflare",
    category: "security",
    role: "Protects the internal documentation site",
    plan: "Free",
    costStatus: "actual",
    basis: "owner-stated",
    asOf: "2026-10-27",
    amountCents: 0,
    period: "month",
    currency: "USD",
    renewsOn: null,
    autoRenew: null,
    priceChange: null,
    limits: null,
    usage: null,
    note: null,
  },
  {
    id: "github",
    group: "dev-tools",
    reviewEvery: "month",
    name: "GitHub",
    provider: "GitHub",
    category: "devtools",
    role: "Source, CI and the delivery board",
    plan: "Free",
    costStatus: "actual",
    basis: "owner-stated",
    asOf: "2026-10-27",
    amountCents: 0,
    period: "month",
    currency: "USD",
    renewsOn: null,
    autoRenew: null,
    priceChange: null,
    limits: null,
    usage: null,
    note: null,
  },
  {
    id: "workers-ai",
    group: "platform-usage",
    reviewEvery: "month",
    name: "Cloudflare Workers AI",
    provider: "Cloudflare",
    category: "ai",
    role: "AI image generation and text features",
    plan: "Pay as you go above a daily allowance",
    costStatus: "estimate",
    basis: "provider-pricing-page",
    asOf: "2026-10-27",
    amountCents: null,
    period: null,
    currency: "USD",
    renewsOn: null,
    autoRenew: null,
    priceChange: null,
    limits: {
      allowance: "10,000 neurons per day at no charge",
      overage: "$0.011 per 1,000 neurons beyond the daily allowance (Workers Paid plan)",
      sourceUrl: WORKERS_AI_PRICING,
      retrievedOn: "2026-10-27",
      confirmedByOwner: false,
    },
    usage: "workers-ai",
    note: "Product and campaign image generation (flux-1-schnell) is billed under this item, alongside the text features.",
  },
  {
    id: "stripe",
    group: "platform-usage",
    reviewEvery: "month",
    name: "Stripe",
    provider: "Stripe",
    category: "payments",
    role: "Card payments",
    plan: "Standard (not yet live)",
    costStatus: "unverified",
    basis: "not-confirmed",
    asOf: "2026-10-27",
    amountCents: null,
    period: null,
    currency: "USD",
    renewsOn: null,
    autoRenew: null,
    priceChange: null,
    limits: null,
    usage: null,
    note: "No fees until live Stripe keys exist (#113); once live, fees are charged per transaction.",
  },
  {
    id: "cloudflare-email",
    group: "platform-usage",
    reviewEvery: "month",
    name: "Cloudflare Email Service",
    provider: "Cloudflare",
    category: "email",
    role: "Transactional email",
    plan: "Planned, not yet integrated",
    costStatus: "unverified",
    basis: "not-confirmed",
    asOf: "2026-10-27",
    amountCents: null,
    period: null,
    currency: "USD",
    renewsOn: null,
    autoRenew: null,
    priceChange: null,
    limits: null,
    usage: null,
    note: "Planned replacement for the current email provider setting. Its price is not confirmed.",
  },
  // #1309 - the rest of the brief's audit list. Nothing here is a guess: the open-licence rows link
  // their licence, and Claude and Gemini Pro stay unpriced until the owner states the plan.
  {
    id: "postcode-reference",
    group: "platform-fixed",
    reviewEvery: "month",
    name: "Postcode reference database",
    provider: "Neon",
    category: "database",
    role: "Postcode and address lookup at checkout",
    plan: "Free",
    costStatus: "actual",
    basis: "owner-stated",
    asOf: "2026-10-27",
    amountCents: 0,
    period: "month",
    currency: "USD",
    renewsOn: null,
    autoRenew: null,
    priceChange: null,
    limits: null,
    usage: null,
    note: "A separate Neon project, uk-location-reference, on the same free plan as the main database. It is read only through lib/reference/.",
  },
  {
    id: "os-opendata",
    group: "platform-fixed",
    reviewEvery: "quarter",
    name: "OS OpenData (Code-Point Open, OS Open Names)",
    provider: "Ordnance Survey",
    category: "data",
    role: "Source data for the postcode reference database",
    plan: "Open Government Licence",
    costStatus: "actual",
    basis: "open-licence",
    asOf: "2026-10-27",
    amountCents: 0,
    period: "month",
    currency: "USD",
    renewsOn: null,
    autoRenew: null,
    priceChange: null,
    limits: {
      allowance: "Free to use, including commercially, with attribution",
      overage: null,
      sourceUrl: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
      retrievedOn: "2026-10-27",
      confirmedByOwner: false,
    },
    usage: null,
    note: "Downloaded with no API key by .github/workflows/sync-reference-data.yml.",
  },
  {
    id: "iconify-icons",
    group: "platform-fixed",
    reviewEvery: "quarter",
    name: "Iconify icon sets",
    provider: "Iconify (Lucide, Noto, Phosphor)",
    category: "assets",
    role: "Interface and category icons, built into the bundle",
    plan: "Open-source licences",
    costStatus: "actual",
    basis: "open-licence",
    asOf: "2026-10-27",
    amountCents: 0,
    period: "month",
    currency: "USD",
    renewsOn: null,
    autoRenew: null,
    priceChange: null,
    limits: {
      allowance: "Lucide: ISC (no attribution required, commercial use allowed)",
      overage: null,
      sourceUrl: "https://icon-sets.iconify.design/lucide/",
      retrievedOn: "2026-10-27",
      confirmedByOwner: false,
    },
    usage: null,
    note: "Noto is Apache 2.0 and Phosphor is MIT; the licence texts are in scripts/icon-licences/.",
  },
  {
    id: "open-food-facts",
    group: "platform-fixed",
    reviewEvery: "quarter",
    name: "Open Food Facts",
    provider: "Open Food Facts",
    category: "data",
    role: "Product data source",
    plan: "Open Database Licence",
    costStatus: "actual",
    basis: "open-licence",
    asOf: "2026-10-27",
    amountCents: 0,
    period: "month",
    currency: "USD",
    renewsOn: null,
    autoRenew: null,
    priceChange: null,
    limits: {
      allowance:
        "Database under the Open Database Licence; individual contents under the Database Contents Licence",
      overage: null,
      sourceUrl: "https://world.openfoodfacts.org/terms-of-use",
      retrievedOn: "2026-10-27",
      confirmedByOwner: false,
    },
    usage: null,
    note: null,
  },
  {
    id: "claude",
    group: "dev-tools",
    reviewEvery: "month",
    name: "Claude",
    provider: "Anthropic",
    category: "devtools",
    role: "AI coding assistant used to build the platform",
    plan: "Not stated by the owner",
    costStatus: "unverified",
    basis: "not-confirmed",
    asOf: "2026-10-27",
    amountCents: null,
    period: null,
    currency: "USD",
    renewsOn: null,
    autoRenew: null,
    priceChange: null,
    limits: null,
    usage: null,
    note: "The owner has not stated the plan or amount. Set both and costStatus once confirmed.",
  },
  {
    id: "gemini-pro",
    group: "dev-tools",
    reviewEvery: "month",
    name: "Gemini Pro",
    provider: "Google",
    category: "devtools",
    role: "AI assistant used to build the platform",
    plan: "Not stated by the owner",
    costStatus: "unverified",
    basis: "not-confirmed",
    asOf: "2026-10-27",
    amountCents: null,
    period: null,
    currency: "USD",
    renewsOn: null,
    autoRenew: null,
    priceChange: null,
    limits: null,
    usage: null,
    note: "The owner has not stated the plan or amount. Set both and costStatus once confirmed.",
  },
];

const STATUS_LABEL: Record<CostStatus, string> = {
  actual: "Actual",
  planned: "Planned",
  estimate: "Estimate",
  unverified: "Unverified",
};

export function formatCostStatus(status: CostStatus): string {
  return STATUS_LABEL[status];
}

export interface CostTotals {
  annualCents: number;
  monthlyCents: number;
}

export type AttentionKind = "auto-renew-off" | "renewal-soon" | "price-change-soon";

export interface AttentionEntry {
  id: string;
  kind: AttentionKind;
}

export interface RenewalEntry {
  id: string;
  renewsOn: string;
  amountCents: number | null;
}

export interface CostReport {
  /** Actual fixed costs only. */
  current: CostTotals;
  /** Actual plus planned. */
  withPlanned: CostTotals;
  /** Actual plus planned, with each price change applied. */
  atRenewal: CostTotals;
  attention: AttentionEntry[];
  renewals: RenewalEntry[];
  /** Ids of items with no fixed amount: listed on the page, never in a total. */
  unpriced: string[];
  /** #1309 - the `current` rule (actual items only) restricted to each group. */
  byGroup: Record<CostGroup, CostTotals>;
  /** #1309 - ids whose `asOf` is older than their review interval. */
  stale: string[];
  /** #1309 - ids the owner still has to confirm (`costStatus: "unverified"`). */
  ownerToConfirm: string[];
}

export const COST_GROUPS: readonly CostGroup[] = ["platform-fixed", "platform-usage", "dev-tools"];

/** Days after which an item is stale, per review interval (#1309). */
export const REVIEW_INTERVAL_DAYS: Record<ReviewInterval, number> = { month: 31, quarter: 92 };

/** Whole UTC days from `date` (`YYYY-MM-DD`) to the UTC calendar date of `now`. */
export function daysSince(date: string, now: Date): number {
  const today = utcDay(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - parseDay(date)) / DAY_MS);
}

/** How far ahead "soon" looks, in days, for a renewal or a price change. */
export const ATTENTION_WINDOW_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(year: number, monthIndex: number, day: number): number {
  return Date.UTC(year, monthIndex, day);
}

/** `YYYY-MM-DD` as a UTC day number. */
function parseDay(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return utcDay(year, month - 1, day);
}

function annualCents(item: CostItem, atRenewal: boolean): number {
  if (item.amountCents === null || item.period === null) return 0;
  const amount = atRenewal && item.priceChange ? item.priceChange.toCents : item.amountCents;
  return item.period === "month" ? amount * 12 : amount;
}

function totals(
  items: readonly CostItem[],
  statuses: readonly CostStatus[],
  atRenewal: boolean,
): CostTotals {
  const annual = items
    .filter((item) => statuses.includes(item.costStatus))
    .reduce((sum, item) => sum + annualCents(item, atRenewal), 0);
  return { annualCents: annual, monthlyCents: Math.round(annual / 12) };
}

/**
 * The totals, the "needs attention" list and the renewal list for `items`, as of the UTC calendar
 * date of `now`. Pure, so a test can pin every number.
 */
export function buildCostReport(items: readonly CostItem[], now: Date): CostReport {
  const today = utcDay(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const within = (date: string): boolean => {
    const days = Math.round((parseDay(date) - today) / DAY_MS);
    return days >= 0 && days <= ATTENTION_WINDOW_DAYS;
  };

  const attention: AttentionEntry[] = [];
  for (const item of items) {
    if (item.autoRenew === false) attention.push({ id: item.id, kind: "auto-renew-off" });
    if (item.renewsOn !== null && within(item.renewsOn)) {
      attention.push({ id: item.id, kind: "renewal-soon" });
    }
    if (item.priceChange !== null && within(item.priceChange.effectiveOn)) {
      attention.push({ id: item.id, kind: "price-change-soon" });
    }
  }

  const renewals: RenewalEntry[] = items
    .filter((item): item is CostItem & { renewsOn: string } => item.renewsOn !== null)
    .map((item) => ({
      id: item.id,
      renewsOn: item.renewsOn,
      amountCents: item.priceChange ? item.priceChange.toCents : item.amountCents,
    }))
    .sort((a, b) => a.renewsOn.localeCompare(b.renewsOn));

  return {
    current: totals(items, ["actual"], false),
    withPlanned: totals(items, ["actual", "planned"], false),
    atRenewal: totals(items, ["actual", "planned"], true),
    attention,
    renewals,
    unpriced: items.filter((item) => item.amountCents === null).map((item) => item.id),
    byGroup: Object.fromEntries(
      COST_GROUPS.map((group) => [
        group,
        totals(
          items.filter((item) => item.group === group),
          ["actual"],
          false,
        ),
      ]),
    ) as Record<CostGroup, CostTotals>,
    stale: items
      .filter((item) => daysSince(item.asOf, now) > REVIEW_INTERVAL_DAYS[item.reviewEvery])
      .map((item) => item.id),
    ownerToConfirm: items.filter((item) => item.costStatus === "unverified").map((item) => item.id),
  };
}
