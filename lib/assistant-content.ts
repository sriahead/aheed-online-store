import { formatPrice } from "@/components/product/format-price";
import { freeDeliveryOffered, type HelpDeliveryFacts } from "@/lib/help-facts";

/**
 * What the guided help assistant shows (#1015) — pure, no I/O, unit-tested.
 *
 * Every answer here is either COMPUTED from the vendor's own settings (the same figures `/help`
 * shows, through the same `helpDeliveryFacts()`), neutral platform wording that is true for every
 * vendor, or the VENDOR'S OWN active FAQ answer passed in verbatim. Nothing is authored on a
 * vendor's behalf (ADR-004, #239), so a vendor with no FAQ answers simply has no "store answers"
 * section, and one that adds answers at `/staff/faqs` gets them with no code change (#1021).
 *
 * This module deliberately imports nothing from `lib/repositories/` or a `*-service` module: the
 * client panel imports its types, and the server action does the reading. The two input shapes
 * below are the subsets it needs, declared here for that reason.
 *
 * Item swaps and cancelling a paid order are HANDOFF ONLY. Nobody can resolve either today (#606),
 * so the copy names neither an outcome nor a timescale.
 */

/** Mirrors `enum AssistantTopic` in prisma/schema.prisma; kept as a string union so the client can use it. */
export type AssistantTopicName =
  | "DELIVERY"
  | "COLLECTION"
  | "REWARDS"
  | "DISCOUNT_CODES"
  | "STORE_QUESTION"
  | "ORDER_STATUS"
  | "ITEM_SWAP"
  | "CANCEL_PAID_ORDER"
  | "OTHER";

export type AssistantFixedTopic = Exclude<AssistantTopicName, "STORE_QUESTION">;

/** The labels a shopper sees, and what `openingQuestion` logs for a fixed topic. */
export const ASSISTANT_TOPIC_LABELS: Record<AssistantFixedTopic, string> = {
  DELIVERY: "Delivery charges and minimums",
  COLLECTION: "Click & Collect",
  REWARDS: "Rewards and points",
  DISCOUNT_CODES: "Discount codes",
  ORDER_STATUS: "Where is my order?",
  ITEM_SWAP: "Swap an item in my order",
  CANCEL_PAID_ORDER: "Cancel an order I've paid for",
  OTHER: "Something else",
};

export const HANDOFF_PERSON_NEEDED =
  "This needs a person at the store. Tap below to start a WhatsApp message with this topic filled in.";
export const HANDOFF_SOMETHING_ELSE =
  "Tap below to start a WhatsApp message to the store with this topic filled in.";
export const DELIVERY_VARIES_SENTENCE =
  "Some areas have different charges. The Help Centre lists each area.";

export interface AssistantLoyaltyFacts {
  loyaltyEnabled: boolean;
  pointsPerPoundEarned: number;
  pencePerPointRedeemed: number;
  minRedeemPoints: number;
  pointsExpiryMonths: number | null;
}

export interface AssistantFaq {
  id: string;
  question: string;
  answer: string;
}

export interface AssistantContentInput {
  vendorName: string;
  delivery: HelpDeliveryFacts;
  offerCollection: boolean;
  loyalty: AssistantLoyaltyFacts;
  /** Active FAQ rows only, already in display order. */
  faqs: AssistantFaq[];
  signedIn: boolean;
}

export interface AssistantLink {
  href: string;
  label: string;
}

export interface AssistantEntry {
  /** Stable React key: the topic, or `faq:<id>` for a store question. */
  key: string;
  topic: AssistantTopicName;
  /** Set only for a STORE_QUESTION — what the server action looks the question up by. */
  faqId?: string;
  label: string;
  /** Paragraphs of the answer; `null` for a handoff-only entry. */
  answer: string[] | null;
  links: AssistantLink[];
  handoffOnly: boolean;
  /** The fixed sentence shown above the handoff for a handoff-only entry. */
  handoffPrompt: string | null;
}

export interface AssistantSection {
  heading: string;
  entries: AssistantEntry[];
}

/** What `loadAssistantContent` returns to the panel. */
export interface AssistantPanelData {
  vendorName: string;
  whatsappNumber: string;
  sections: AssistantSection[];
  /** The signed-in shopper's own most recent order numbers at this vendor; empty for a guest. */
  orderNumbers: string[];
}

/** How many of a signed-in shopper's recent orders the handoff offers to mention. */
export const ASSISTANT_RECENT_ORDERS = 5;

function fixedEntry(
  topic: AssistantFixedTopic,
  answer: string[] | null,
  links: AssistantLink[] = [],
  handoffPrompt: string | null = null,
): AssistantEntry {
  return {
    key: topic,
    topic,
    label: ASSISTANT_TOPIC_LABELS[topic],
    answer,
    links,
    handoffOnly: answer === null,
    handoffPrompt,
  };
}

function deliveryEntry(facts: HelpDeliveryFacts): AssistantEntry {
  const { defaults, varies } = facts;
  const answer = [
    defaults.deliveryFeePence > 0
      ? `Standard delivery costs ${formatPrice(defaults.deliveryFeePence)}.`
      : `Standard delivery is free (${formatPrice(0)}).`,
  ];
  if (defaults.minimumOrderPence > 0) {
    answer.push(`The minimum order for delivery is ${formatPrice(defaults.minimumOrderPence)}.`);
  }
  if (freeDeliveryOffered(defaults.freeDeliveryThresholdPence)) {
    answer.push(
      `Delivery is free on orders of ${formatPrice(defaults.freeDeliveryThresholdPence as number)} or more.`,
    );
  }
  answer.push("Your postcode is checked at checkout.");

  const varied = varies.fee || varies.minimum || varies.threshold;
  if (varied) answer.push(DELIVERY_VARIES_SENTENCE);

  return fixedEntry(
    "DELIVERY",
    answer,
    varied ? [{ href: "/help", label: "Open the Help Centre" }] : [],
  );
}

function collectionEntry(facts: HelpDeliveryFacts): AssistantEntry {
  const answer = [
    "You can collect your order from the store instead of having it delivered. There is no delivery fee on a collection order.",
  ];
  if (facts.collectionMinimumOrderPence > 0) {
    answer.push(`Collection orders must reach ${formatPrice(facts.collectionMinimumOrderPence)}.`);
  }
  return fixedEntry("COLLECTION", answer);
}

function rewardsEntry(loyalty: AssistantLoyaltyFacts): AssistantEntry {
  const points = loyalty.pointsPerPoundEarned === 1 ? "point" : "points";
  const answer = [
    `You earn ${loyalty.pointsPerPoundEarned} ${points} for every £1 you spend, once the store confirms your order.`,
    `Once you have ${loyalty.minRedeemPoints} points you can use them at checkout: ${loyalty.minRedeemPoints} points are worth ${formatPrice(
      loyalty.minRedeemPoints * loyalty.pencePerPointRedeemed,
    )} off.`,
  ];
  if (loyalty.pointsExpiryMonths !== null) {
    answer.push(`Points expire ${loyalty.pointsExpiryMonths} months after you earn them.`);
  }
  return fixedEntry("REWARDS", answer, [{ href: "/account/loyalty", label: "See your points" }]);
}

function discountCodesEntry(loyaltyEnabled: boolean): AssistantEntry {
  return fixedEntry("DISCOUNT_CODES", [
    "Enter your code at checkout, before you pay.",
    `Only one discount code can be used per order${
      loyaltyEnabled ? ", but you can use it alongside your points" : ""
    }.`,
  ]);
}

function orderStatusEntry(signedIn: boolean): AssistantEntry {
  return signedIn
    ? fixedEntry(
        "ORDER_STATUS",
        ["Every order you have placed, and where it is now, is in your account."],
        [{ href: "/account/orders", label: "View my orders" }],
      )
    : fixedEntry(
        "ORDER_STATUS",
        ["You can check an order with its order number and the email address you used."],
        [{ href: "/orders/lookup", label: "Look up an order" }],
      );
}

/**
 * The assistant's sections, in display order. Sections with no entries are left out, so a vendor
 * with no active FAQ answers gets no "store answers" heading at all.
 */
export function buildAssistantContent(input: AssistantContentInput): AssistantSection[] {
  const common: AssistantEntry[] = [deliveryEntry(input.delivery)];
  if (input.offerCollection) common.push(collectionEntry(input.delivery));
  if (input.loyalty.loyaltyEnabled) common.push(rewardsEntry(input.loyalty));
  common.push(discountCodesEntry(input.loyalty.loyaltyEnabled));

  const storeAnswers: AssistantEntry[] = input.faqs.map((faq) => ({
    key: `faq:${faq.id}`,
    topic: "STORE_QUESTION",
    faqId: faq.id,
    label: faq.question,
    answer: [faq.answer],
    links: [],
    handoffOnly: false,
    handoffPrompt: null,
  }));

  const order: AssistantEntry[] = [
    orderStatusEntry(input.signedIn),
    fixedEntry("ITEM_SWAP", null, [], HANDOFF_PERSON_NEEDED),
    fixedEntry("CANCEL_PAID_ORDER", null, [], HANDOFF_PERSON_NEEDED),
  ];

  const sections: AssistantSection[] = [
    { heading: "Common questions", entries: common },
    { heading: `Answers from ${input.vendorName}`, entries: storeAnswers },
    { heading: "About an order", entries: order },
    {
      heading: "Anything else",
      entries: [fixedEntry("OTHER", null, [], HANDOFF_SOMETHING_ELSE)],
    },
  ];
  return sections.filter((section) => section.entries.length > 0);
}

/** Every entry across the sections, in display order — what the tests and the panel iterate. */
export function assistantEntries(sections: AssistantSection[]): AssistantEntry[] {
  return sections.flatMap((section) => section.entries);
}
