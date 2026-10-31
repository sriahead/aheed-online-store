/**
 * #1313 - what will cost money or create risk as we grow and is not priced elsewhere. Pure.
 *
 * Plain English, one entry per risk. A cost is given only where it can be stated (a published figure
 * with its source, or an estimate). This is not legal, tax or insurance advice: several actions say to
 * take it.
 */

export interface Risk {
  id: string;
  title: string;
  /** At most 400 characters (tested). */
  summary: string;
  whoBears: "platform" | "shop" | "customer" | "shared";
  cost: {
    pence: number;
    period: "month" | "year" | "one-off" | "per-event";
    basis: "published-source" | "estimate";
    sourceUrl: string | null;
  } | null;
  action: string;
  sourceUrl: string | null;
  /** `YYYY-MM-DD`. */
  asOf: string;
  issues: number[];
}

const READ = "2026-10-28";
const VAT_REG = "https://www.gov.uk/vat-registration/when-to-register";

export const RISKS: readonly Risk[] = [
  {
    id: "vat-on-fees",
    title: "VAT on our fees",
    summary:
      "Every price on this page excludes VAT. Once we are VAT-registered, 20% is added to our fees. A VAT-registered shop reclaims it; a small unregistered shop pays it in full, so our price is effectively 20% higher for them.",
    whoBears: "shop",
    cost: null,
    action:
      "Quote prices as 'plus VAT' from day one, and take an accountant's advice on whether a customer service fee is our supply or the shop's.",
    sourceUrl: VAT_REG,
    asOf: READ,
    issues: [1310],
  },
  {
    id: "vat-registration-threshold",
    title: "VAT registration threshold",
    summary:
      "We must register for VAT when our taxable turnover over the last 12 months goes over £90,000, or is expected to in the next 30 days. The Models section shows how many shops each model needs to cross it.",
    whoBears: "platform",
    cost: null,
    action:
      "Track rolling 12-month fee revenue monthly; register within 30 days of the end of the month it goes over.",
    sourceUrl: VAT_REG,
    asOf: READ,
    issues: [],
  },
  {
    id: "weighed-items-substitutions",
    title: "Weighed items and substitutions change the order total",
    summary:
      "A grocery order often changes after it is placed: a joint of meat weighs more or less, or an item is swapped. Charging the exact final amount needs payment authorised at checkout and captured later, plus partial refunds. Today the full amount is taken at checkout and a paid order cannot be reduced.",
    whoBears: "shared",
    cost: null,
    action:
      "Build authorise-then-capture before shops with weighed lines go live. An authorisation lapses after about 7 days, so capture on delivery.",
    sourceUrl: null,
    asOf: READ,
    issues: [],
  },
  {
    id: "allergen-information",
    title: "Allergen information for food sold online",
    summary:
      "Food law requires the 14 allergens to be available before purchase is completed (on the website) and again when the food is delivered (stickers, a leaflet or by phone). The shop is responsible, but our product pages must be able to carry and show it.",
    whoBears: "shop",
    cost: null,
    action:
      "Add allergen fields to products and a delivery-note option; put the shop's duty in our terms.",
    sourceUrl:
      "https://www.gov.uk/government/publications/allergen-guidance-for-food-businesses/allergen-guidance-for-food-businesses",
    asOf: READ,
    issues: [],
  },
  {
    id: "age-restricted-items",
    title: "Age-restricted items",
    summary:
      "Alcohol, tobacco, knives and some medicines need an age check at sale and at delivery, and alcohol needs a licence. The platform has no age, licensing or per-line control today, and a new client's catalogue already has age-restricted lines.",
    whoBears: "shop",
    cost: null,
    action:
      "Block age-restricted lines from online sale until age checks exist; make the shop's licence a condition in our terms.",
    sourceUrl: null,
    asOf: READ,
    issues: [1200],
  },
  {
    id: "domain-ownership",
    title: "Who owns each shop's domain",
    summary:
      "If we register a shop's domain in our account, the shop cannot leave without our help, and an expired card on our side takes their shop offline.",
    whoBears: "shared",
    cost: null,
    action:
      "Register custom domains in the shop's name (we manage DNS only), and say in our terms that they can take it with them.",
    sourceUrl: null,
    asOf: READ,
    issues: [],
  },
  {
    id: "customer-data-ownership",
    title: "Who owns customer data",
    summary:
      "The shop is the data controller for its customers; we process data for it. That needs a data processing agreement with every shop, our own ICO fee, and a way to hand a shop its customer list if it leaves.",
    whoBears: "platform",
    cost: {
      pence: 5200,
      period: "year",
      basis: "estimate",
      sourceUrl: null,
    },
    action:
      "Sign a data processing agreement at onboarding (legal templates are a business cost) and pay the ICO fee; confirm the amount at ico.org.uk.",
    sourceUrl: "https://ico.org.uk/for-organisations/data-protection-fee/",
    asOf: READ,
    issues: [],
  },
  {
    id: "delivery-liability",
    title: "Delivery liability",
    summary:
      "Shops deliver with their own drivers. Damaged, late or missing deliveries, and driver accidents, are the shop's responsibility, but a customer will blame the website.",
    whoBears: "shop",
    cost: null,
    action:
      "State in our terms that the shop is the seller and deliverer; keep professional indemnity insurance for claims against us.",
    sourceUrl: null,
    asOf: READ,
    issues: [],
  },
  {
    id: "out-of-hours-support",
    title: "Support in the evenings and at weekends",
    summary:
      "Grocers trade seven days a week and into the evening, which is exactly when two partners with day jobs are least available. An outage on a Saturday evening is a shop's busiest hour.",
    whoBears: "platform",
    cost: {
      pence: 2500,
      period: "month",
      basis: "estimate",
      sourceUrl: null,
    },
    action:
      "Sell priority support for out-of-hours cover, set response times in the terms, and add uptime alerts (#1296).",
    sourceUrl: null,
    asOf: READ,
    issues: [1296],
  },
  {
    id: "refunds-and-disputes",
    title: "Refunds and disputes under Stripe Connect",
    summary:
      "With 'Stripe handles pricing for your users' and direct charges, each shop is responsible for its Stripe fees, refunds and chargebacks. A dispute costs the shop £20, and Stripe does not return the card fee on a refund.",
    whoBears: "shop",
    cost: {
      pence: 2000,
      period: "per-event",
      basis: "published-source",
      sourceUrl: "https://stripe.com/gb/pricing",
    },
    action:
      "Explain this at onboarding; the model includes expected dispute fees in what the shop pays.",
    sourceUrl: "https://stripe.com/gb/connect/pricing",
    asOf: READ,
    issues: [1310],
  },
  {
    id: "card-payments-merchant-of-record",
    title: "One platform Stripe account takes every shop's money",
    summary:
      "Today one platform Stripe account is the merchant for every shop's sales (ADR-005). That is acceptable while the only real merchant is the first client, but not for a second shop: it is a Stripe-terms and money-handling risk.",
    whoBears: "platform",
    cost: null,
    action: "Decide on Stripe Connect (#1310) before the second shop takes a live payment.",
    sourceUrl: null,
    asOf: READ,
    issues: [1310, 113],
  },
];
