import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #1015/#1014 R22, R24, R25 — the help assistant's public server actions.
 *
 * Services are mocked at the module boundary; what is asserted is what reaches the repository
 * layer: nothing at all when the switch is off or the WhatsApp number is missing, only
 * server-derived text as `openingQuestion` (never a client-sent `question`), and no throw when the
 * log fails. The repository's own behaviour against a real database is
 * `scripts/verify-assistant-conversations.ts`'s job, not this file's.
 */

vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth", () => ({
  getAuth: vi.fn(async () => ({ api: { getSession: vi.fn(async () => null) } })),
}));

const profile = vi.fn();
vi.mock("@/lib/vendor-service", () => ({ getCurrentVendorProfile: () => profile() }));

const listActive = vi.fn();
vi.mock("@/lib/vendor-faqs-service", () => ({
  getVendorFaqRepository: () => ({ listActive }),
}));

const start = vi.fn();
const record = vi.fn();
vi.mock("@/lib/assistant-service", () => ({
  getAssistantService: () => ({ start, record }),
}));

vi.mock("@/lib/loyalty-service", () => ({
  getLoyaltyRepository: () => ({
    config: async () => ({
      loyaltyEnabled: false,
      pointsPerPoundEarned: 1,
      pencePerPointRedeemed: 1,
      minRedeemPoints: 100,
      tierWindowDays: 30,
      pointsExpiryMonths: null,
    }),
  }),
}));
vi.mock("@/lib/orders-service", () => ({
  getOrderRepository: () => ({ listForUser: vi.fn(async () => ({ items: [] })) }),
}));

const { loadAssistantContent, startAssistantConversation, recordAssistantOutcome } =
  await import("@/features/assistant/assistant");

const ENABLED = {
  name: "Test Store",
  assistantEnabled: true,
  whatsappNumber: "447700900000",
  deliveryFeePence: 349,
  minimumOrderPence: 0,
  freeDeliveryThresholdPence: null,
  deliveryAreas: [],
  offerCollection: false,
};

const OWN_ACTIVE_FAQ = {
  id: "faq-own",
  question: "Do you deliver on Sundays?",
  answer: "Yes.",
  sortOrder: 0,
  isActive: true,
};

beforeEach(() => {
  profile.mockResolvedValue(ENABLED);
  // listActive is the vendor's ACTIVE rows only, as lib/repositories/vendor-faqs.ts returns them.
  listActive.mockResolvedValue([OWN_ACTIVE_FAQ]);
  start.mockResolvedValue({ id: "conv-1" });
  record.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("the switch (R22)", () => {
  it.each([
    ["assistantEnabled is false", { ...ENABLED, assistantEnabled: false }],
    ["whatsappNumber is null", { ...ENABLED, whatsappNumber: null }],
    ["no vendor resolves", null],
  ])("every action returns null and writes nothing when %s", async (_label, value) => {
    profile.mockResolvedValue(value);

    expect(await loadAssistantContent()).toBeNull();
    expect(await startAssistantConversation({ topic: "DELIVERY" })).toBeNull();
    expect(
      await recordAssistantOutcome({ conversationId: "conv-1", outcome: "ANSWERED" }),
    ).toBeNull();
    expect(start).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("loads content when the switch is on and a number is set", async () => {
    const data = await loadAssistantContent();
    expect(data?.whatsappNumber).toBe("447700900000");
    expect(data?.orderNumbers).toEqual([]);
  });
});

describe("server-derived opening question (R24)", () => {
  it("stores the fixed label, never a client-sent question", async () => {
    const result = await startAssistantConversation({
      topic: "DELIVERY",
      question: "my name is Jane Doe, 1 High Street",
    } as { topic: string });

    expect(result).toEqual({ conversationId: "conv-1" });
    expect(start).toHaveBeenCalledWith("DELIVERY", "Delivery charges and minimums");
  });

  it("stores the vendor's own active FAQ question for a store question", async () => {
    await startAssistantConversation({ topic: "STORE_QUESTION", faqId: "faq-own" });
    expect(start).toHaveBeenCalledWith("STORE_QUESTION", "Do you deliver on Sundays?");
  });

  it.each([
    ["an unknown FAQ id", { topic: "STORE_QUESTION", faqId: "nope" }],
    [
      "an inactive or another vendor's FAQ id (absent from listActive)",
      { topic: "STORE_QUESTION", faqId: "faq-other-vendor" },
    ],
    ["a store question with no FAQ id", { topic: "STORE_QUESTION" }],
    ["an unknown topic", { topic: "NOPE" }],
    ["a prototype key as the topic", { topic: "toString" }],
  ])("creates nothing for %s", async (_label, input) => {
    expect(await startAssistantConversation(input)).toBeNull();
    expect(start).not.toHaveBeenCalled();
  });
});

describe("outcomes", () => {
  it("passes ANSWERED and HANDED_OFF through, and refuses anything else without a write", async () => {
    expect(await recordAssistantOutcome({ conversationId: "conv-1", outcome: "ANSWERED" })).toBe(
      true,
    );
    expect(record).toHaveBeenCalledWith("conv-1", "ANSWERED");
    expect(await recordAssistantOutcome({ conversationId: "conv-1", outcome: "ABANDONED" })).toBe(
      false,
    );
    expect(await recordAssistantOutcome({ conversationId: "", outcome: "HANDED_OFF" })).toBe(false);
    expect(record).toHaveBeenCalledTimes(1);
  });
});

describe("a failing log never throws (R25)", () => {
  it("start resolves to null and record to false when the repository throws", async () => {
    start.mockRejectedValue(new Error("database down"));
    record.mockRejectedValue(new Error("database down"));

    await expect(startAssistantConversation({ topic: "OTHER" })).resolves.toBeNull();
    await expect(
      recordAssistantOutcome({ conversationId: "conv-1", outcome: "HANDED_OFF" }),
    ).resolves.toBe(false);
  });
});
