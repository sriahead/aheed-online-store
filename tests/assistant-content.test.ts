import { describe, expect, it } from "vitest";
import { helpDeliveryFacts, pointsExpirySentence } from "@/lib/help-facts";
import {
  assistantEntries,
  buildAssistantContent,
  DELIVERY_VARIES_SENTENCE,
  type AssistantContentInput,
  type AssistantEntry,
} from "@/lib/assistant-content";

/**
 * #1015 R12–R17 — the guided help assistant's topics and answers. Every figure comes from the
 * vendor's own settings through `helpDeliveryFacts()`, every store answer is the vendor's own row
 * verbatim, and the two things nobody can resolve today (#606) are handoff-only.
 */

const LOYALTY_OFF = {
  loyaltyEnabled: false,
  pointsPerPoundEarned: 1,
  pencePerPointRedeemed: 1,
  minRedeemPoints: 100,
  pointsExpiryMonths: null,
};

function input(overrides: Partial<AssistantContentInput> = {}): AssistantContentInput {
  return {
    vendorName: "Test Store",
    delivery: helpDeliveryFacts(
      {
        deliveryFeePence: 349,
        minimumOrderPence: 1500,
        freeDeliveryThresholdPence: 4000,
        collectionMinimumOrderPence: 0,
      },
      [],
    ),
    offerCollection: false,
    loyalty: LOYALTY_OFF,
    faqs: [],
    signedIn: false,
    ...overrides,
  };
}

function entries(overrides: Partial<AssistantContentInput> = {}): AssistantEntry[] {
  return assistantEntries(buildAssistantContent(input(overrides)));
}

function entry(topic: string, overrides: Partial<AssistantContentInput> = {}): AssistantEntry {
  const found = entries(overrides).find((e) => e.topic === topic);
  if (!found) throw new Error(`no ${topic} entry`);
  return found;
}

function text(e: AssistantEntry): string {
  return (e.answer ?? []).join(" ");
}

describe("topic set (R13)", () => {
  const ALWAYS = [
    "DELIVERY",
    "DISCOUNT_CODES",
    "ORDER_STATUS",
    "ITEM_SWAP",
    "CANCEL_PAID_ORDER",
    "OTHER",
  ];

  it("always offers the six fixed topics, and nothing conditional when it is off", () => {
    expect(entries().map((e) => e.topic)).toEqual([
      "DELIVERY",
      "DISCOUNT_CODES",
      "ORDER_STATUS",
      "ITEM_SWAP",
      "CANCEL_PAID_ORDER",
      "OTHER",
    ]);
  });

  it("adds COLLECTION exactly when collection is offered", () => {
    expect(entries({ offerCollection: false }).some((e) => e.topic === "COLLECTION")).toBe(false);
    expect(entries({ offerCollection: true }).some((e) => e.topic === "COLLECTION")).toBe(true);
  });

  it("adds REWARDS exactly when loyalty is on", () => {
    expect(entries().some((e) => e.topic === "REWARDS")).toBe(false);
    const on = entries({ loyalty: { ...LOYALTY_OFF, loyaltyEnabled: true } });
    expect(on.some((e) => e.topic === "REWARDS")).toBe(true);
    for (const topic of ALWAYS) expect(on.some((e) => e.topic === topic)).toBe(true);
  });

  it("has no store-question entry and no store-answers section with zero FAQs", () => {
    const sections = buildAssistantContent(input());
    expect(sections.some((s) => s.heading.startsWith("Answers from"))).toBe(false);
    expect(entries().some((e) => e.topic === "STORE_QUESTION")).toBe(false);
  });

  it("has one store-question entry per FAQ, in the order given", () => {
    const faqs = [
      { id: "f3", question: "Third?", answer: "C" },
      { id: "f1", question: "First?", answer: "A" },
      { id: "f2", question: "Second?", answer: "B" },
    ];
    const store = entries({ faqs }).filter((e) => e.topic === "STORE_QUESTION");
    expect(store.map((e) => e.faqId)).toEqual(["f3", "f1", "f2"]);
  });
});

describe("labels and verbatim store answers (R14)", () => {
  it("uses the plan's fixed labels character for character", () => {
    const all = entries({
      offerCollection: true,
      loyalty: { ...LOYALTY_OFF, loyaltyEnabled: true },
    });
    const labels = Object.fromEntries(all.map((e) => [e.topic, e.label]));
    expect(labels).toEqual({
      DELIVERY: "Delivery charges and minimums",
      COLLECTION: "Click & Collect",
      REWARDS: "Rewards and points",
      DISCOUNT_CODES: "Discount codes",
      ORDER_STATUS: "Where is my order?",
      ITEM_SWAP: "Swap an item in my order",
      CANCEL_PAID_ORDER: "Cancel an order I've paid for",
      OTHER: "Something else",
    });
  });

  it("passes a store's question and answer through unchanged", () => {
    const faq = {
      id: "f1",
      question: "  Do you deliver on Sundays?  ",
      answer: "Line one.\nLine two.",
    };
    const store = entry("STORE_QUESTION", { faqs: [faq] });
    expect(store.label).toBe(faq.question);
    expect(store.answer).toEqual([faq.answer]);
    expect(store.handoffOnly).toBe(false);
  });
});

describe("delivery answer (R15)", () => {
  const facts = (fee: number, min: number, threshold: number | null) =>
    helpDeliveryFacts(
      {
        deliveryFeePence: fee,
        minimumOrderPence: min,
        freeDeliveryThresholdPence: threshold,
        collectionMinimumOrderPence: 0,
      },
      [],
    );

  it("states the fee, and the minimum only when above zero", () => {
    expect(text(entry("DELIVERY", { delivery: facts(349, 1500, null) }))).toContain("£3.49");
    expect(text(entry("DELIVERY", { delivery: facts(349, 1500, null) }))).toContain("£15.00");
    expect(text(entry("DELIVERY", { delivery: facts(349, 0, null) }))).not.toMatch(/minimum/i);
  });

  it("mentions free delivery only when it is offered", () => {
    expect(text(entry("DELIVERY", { delivery: facts(349, 0, null) }))).not.toMatch(/free/i);
    expect(text(entry("DELIVERY", { delivery: facts(349, 0, 0) }))).not.toMatch(/free/i);
    const offered = text(entry("DELIVERY", { delivery: facts(349, 0, 4000) }));
    expect(offered).toMatch(/free/i);
    expect(offered).toContain("£40.00");
  });

  it("points to the Help Centre when an area overrides a figure, and not otherwise", () => {
    const varied = helpDeliveryFacts(
      {
        deliveryFeePence: 349,
        minimumOrderPence: 0,
        freeDeliveryThresholdPence: null,
        collectionMinimumOrderPence: 0,
      },
      [
        {
          prefix: "AB1",
          deliveryFeePence: 599,
          minimumOrderPence: null,
          freeDeliveryThresholdPence: null,
        },
      ],
    );
    expect(varied.varies.fee).toBe(true);
    const withAreas = entry("DELIVERY", { delivery: varied });
    expect(withAreas.answer).toContain(DELIVERY_VARIES_SENTENCE);
    expect(withAreas.links.map((l) => l.href)).toContain("/help");

    const plain = entry("DELIVERY");
    expect(plain.answer).not.toContain(DELIVERY_VARIES_SENTENCE);
    expect(plain.links).toEqual([]);
  });
});

describe("rewards, collection and order status (R16)", () => {
  const loyalty = {
    ...LOYALTY_OFF,
    loyaltyEnabled: true,
    pointsPerPoundEarned: 2,
    minRedeemPoints: 250,
  };

  it("states the earn rate and redeem threshold, expiry only when set, and links to the points page", () => {
    const never = entry("REWARDS", { loyalty });
    expect(text(never)).toContain("2 points");
    expect(text(never)).toContain("250 points");
    expect(text(never)).not.toMatch(/expire/i);
    expect(never.links.map((l) => l.href)).toEqual(["/account/loyalty"]);

    const expiring = entry("REWARDS", { loyalty: { ...loyalty, pointsExpiryMonths: 12 } });
    expect(text(expiring)).toContain(
      "Points expire if your account goes 12 months without an order. Placing an order resets the clock.",
    );
  });

  /**
   * #1045 — the sentence itself, asserted with `toBe` rather than a pattern.
   *
   * The previous assertions here matched `/expire/i` and `"12 months"`, both of which the WRONG
   * sentence ("Points expire 12 months after you earn them") also satisfied, so the defect lived
   * under a green test for three slices. A regex would still admit a longer sentence that
   * re-introduced per-point aging; string equality is what actually pins the rule. `/help` renders
   * this same helper, so the two surfaces cannot drift (`lib/help-facts.ts`).
   */
  it("words points expiry as inactivity-based, matching isLapsed()", () => {
    expect(pointsExpirySentence(12)).toBe(
      "Points expire if your account goes 12 months without an order. Placing an order resets the clock.",
    );
    expect(pointsExpirySentence(12)).not.toMatch(/after you earn/i);
  });

  it("states the collection minimum only when above zero", () => {
    const delivery = (collectionMin: number) => ({
      ...helpDeliveryFacts(
        {
          deliveryFeePence: 349,
          minimumOrderPence: 0,
          freeDeliveryThresholdPence: null,
          collectionMinimumOrderPence: 0,
        },
        [],
      ),
      collectionMinimumOrderPence: collectionMin,
    });
    expect(text(entry("COLLECTION", { offerCollection: true, delivery: delivery(0) }))).not.toMatch(
      /£/,
    );
    expect(
      text(entry("COLLECTION", { offerCollection: true, delivery: delivery(1000) })),
    ).toContain("£10.00");
  });

  it("links a signed-in shopper to their orders and a guest to order lookup", () => {
    expect(entry("ORDER_STATUS", { signedIn: true }).links.map((l) => l.href)).toEqual([
      "/account/orders",
    ]);
    expect(entry("ORDER_STATUS", { signedIn: false }).links.map((l) => l.href)).toEqual([
      "/orders/lookup",
    ]);
  });
});

describe("handoff-only topics (R17)", () => {
  it("gives swap and cancel no answer and the fixed person-needed sentence", () => {
    for (const topic of ["ITEM_SWAP", "CANCEL_PAID_ORDER"]) {
      const e = entry(topic);
      expect(e.answer).toBeNull();
      expect(e.handoffOnly).toBe(true);
      expect(e.handoffPrompt).toBe(
        "This needs a person at the store. Tap below to start a WhatsApp message with this topic filled in.",
      );
    }
  });

  it("gives something-else no answer and its own fixed sentence", () => {
    const e = entry("OTHER");
    expect(e.answer).toBeNull();
    expect(e.handoffOnly).toBe(true);
    expect(e.handoffPrompt).toBe(
      "Tap below to start a WhatsApp message to the store with this topic filled in.",
    );
  });
});
