/**
 * #1313 - Stripe Connect's two UK pricing options, as data. Pure.
 *
 * A PLANNING ASSUMPTION ONLY. The platform still takes payments through one platform Stripe account
 * (ADR-005); whether and how to move to Connect is the owner decision on #1310. Nothing here changes
 * payment code. Figures read from Stripe's own page on `retrievedOn`.
 */

export type ConnectOptionId = "stripe-pricing" | "platform-pricing";

export interface ConnectOption {
  id: ConnectOptionId;
  /** Stripe's own label, as read. */
  stripeName: string;
  platformFee: { activeAccountPence: number; payoutBps: number; payoutFixedPence: number } | null;
  whoBearsCardFeesAndDisputes: "shop" | "platform";
  summary: string;
  sourceUrl: string;
  /** `YYYY-MM-DD`. */
  retrievedOn: string;
}

const CONNECT_PRICING = "https://stripe.com/gb/connect/pricing";

export const CONNECT_OPTIONS: readonly ConnectOption[] = [
  {
    id: "stripe-pricing",
    stripeName: "Stripe handles pricing for your users",
    platformFee: null,
    whoBearsCardFeesAndDisputes: "shop",
    summary:
      "No platform fee and no payout fee. Stripe sets and collects card fees from each shop, and with direct charges the shop is responsible for Stripe fees, refunds and chargebacks.",
    sourceUrl: CONNECT_PRICING,
    retrievedOn: "2026-10-28",
  },
  {
    id: "platform-pricing",
    stripeName: "You handle pricing for your users",
    platformFee: { activeAccountPence: 200, payoutBps: 25, payoutFixedPence: 10 },
    whoBearsCardFeesAndDisputes: "platform",
    summary:
      "£2 per monthly active account and 0.25% + 10p per payout, plus 0.25% of payout volume for funds routing (not modelled). The platform pays Stripe's card fees and charges shops its own.",
    sourceUrl: CONNECT_PRICING,
    retrievedOn: "2026-10-28",
  },
];

/**
 * The option the model costs. "Stripe handles pricing" is the one with no platform fees, and it
 * matches the brief: each shop is the seller and pays its own card fees.
 */
export const CONNECT_MODELLED: ConnectOptionId = "stripe-pricing";
