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
export type CostBasis =
  "owner-stated" | "provider-dashboard" | "provider-pricing-page" | "not-confirmed";
export type CostCategory =
  | "hosting"
  | "domain"
  | "database"
  | "storage"
  | "ai"
  | "payments"
  | "email"
  | "security"
  | "devtools";
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
    note: null,
  },
  {
    id: "stripe",
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
  };
}
