/**
 * #1309 - candidate prices for selling the platform to vendors. Pure.
 *
 * Every plan here is a PROPOSAL, written at Build (2026-10-27) from the competitor research in
 * `lib/pricing/competitors.ts`. Nothing outside the costs dashboard reads this file: no checkout,
 * subscription or vendor setting uses these numbers. Prices are in pence, excluding VAT.
 */

export type PricingModel = "subscription" | "commission" | "hybrid" | "freemium";

export interface ProposedPlan {
  id: string;
  name: string;
  model: PricingModel;
  status: "proposal";
  monthlyFeePence: number;
  /** Commission on each vendor sale, in basis points (100 = 1%). */
  commissionBps: number;
  includes: string[];
  addOns: { name: string; monthlyFeePence: number }[];
  /** Which competitor figures this plan is positioned against, naming the competitor ids. */
  positioning: string;
  vatNote: string;
}

const VAT_NOTE = "Prices exclude VAT. Whether the platform must charge VAT has not been assessed.";

const CORE_FEATURES = [
  "Own branded storefront and domain",
  "Delivery areas and slots",
  "Staff panel",
  "Card payments through the platform",
];

export const PROPOSED_PLANS: readonly ProposedPlan[] = [
  {
    id: "subscription",
    name: "Store",
    model: "subscription",
    status: "proposal",
    monthlyFeePence: 2500,
    commissionBps: 0,
    includes: CORE_FEATURES,
    addOns: [{ name: "Additional custom domain", monthlyFeePence: 500 }],
    positioning:
      "Matches shopify Basic (£25 a month billed monthly) and sits above square-online Plus (£20 billed annually), with no per-sale fee. Under today's single platform Stripe account the platform pays the 1.5% + 20p card fee on every sale, so this plan loses margin as a vendor's sales grow.",
    vatNote: VAT_NOTE,
  },
  {
    id: "commission",
    name: "Pay as you sell",
    model: "commission",
    status: "proposal",
    monthlyFeePence: 0,
    commissionBps: 400,
    includes: CORE_FEATURES,
    addOns: [],
    positioning:
      "No monthly fee. 4% per sale, card processing included, against uber-eats' 13% for self-delivery or pick-up and 30% with Uber's couriers, plus its £650 activation fee.",
    vatNote: VAT_NOTE,
  },
  {
    id: "hybrid",
    name: "Growth",
    model: "hybrid",
    status: "proposal",
    monthlyFeePence: 900,
    commissionBps: 250,
    includes: CORE_FEATURES,
    addOns: [{ name: "Additional custom domain", monthlyFeePence: 500 }],
    positioning:
      "£9 a month plus 2.5% per sale, card processing included, against shopify Basic's £25 a month plus 2% + 25p per card payment, and square-online Plus at £20 a month plus 1.4% + 25p.",
    vatNote: VAT_NOTE,
  },
  {
    id: "freemium",
    name: "Starter",
    model: "freemium",
    status: "proposal",
    monthlyFeePence: 0,
    commissionBps: 0,
    includes: [
      "Own storefront on a platform subdomain",
      "Small catalogue",
      "Upgrade to Store or Growth",
    ],
    addOns: [],
    positioning:
      "Mirrors square-online Free and ecwid Starter as an entry point. With no fee and no commission it cannot cover the card fees the platform pays, so it only works as a time-limited or capped tier.",
    vatNote: VAT_NOTE,
  },
];
