// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { helpDeliveryFacts } from "@/lib/help-facts";
import { buildAssistantContent, type AssistantPanelData } from "@/lib/assistant-content";
import { buildHandoffText, buildHandoffUrl } from "@/lib/assistant-handoff";

/**
 * #1015/#1014 R28–R31 — the help assistant panel, driven through `FloatingContact` so focus return
 * is tested against the real trigger. The server actions are mocked; what is asserted is the
 * dialog's accessibility, how many log calls one conversation makes, that a refused log never
 * breaks the panel, and the exact handoff link.
 */

vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));

const loadAssistantContent = vi.fn<() => Promise<AssistantPanelData | null>>();
const startAssistantConversation =
  vi.fn<(input: { topic: string; faqId?: string }) => Promise<{ conversationId: string } | null>>();
const recordAssistantOutcome =
  vi.fn<(input: { conversationId: string; outcome: string }) => Promise<boolean | null>>();
vi.mock("@/features/assistant/assistant", () => ({
  loadAssistantContent,
  startAssistantConversation,
  recordAssistantOutcome,
}));

const { FloatingContact } = await import("@/components/layout/FloatingContact");

const VENDOR = "Test Store";
const NUMBER = "447700900000";

function panelData(orderNumbers: string[] = []): AssistantPanelData {
  return {
    vendorName: VENDOR,
    whatsappNumber: NUMBER,
    orderNumbers,
    sections: buildAssistantContent({
      vendorName: VENDOR,
      delivery: helpDeliveryFacts(
        { deliveryFeePence: 349, minimumOrderPence: 0, freeDeliveryThresholdPence: null },
        [],
      ),
      offerCollection: false,
      loyalty: {
        loyaltyEnabled: false,
        pointsPerPoundEarned: 1,
        pencePerPointRedeemed: 1,
        minRedeemPoints: 100,
        pointsExpiryMonths: null,
      },
      faqs: [],
      signedIn: orderNumbers.length > 0,
    }),
  };
}

async function openPanel() {
  render(
    <FloatingContact
      vendorName={VENDOR}
      facebookUrl={null}
      instagramUrl={null}
      whatsappNumber={NUMBER}
      assistantAvailable
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: `Contact and follow ${VENDOR}` }));
  fireEvent.click(screen.getByRole("button", { name: "Open help assistant" }));
  const dialog = await screen.findByRole("dialog");
  await screen.findByRole("button", { name: "Delivery charges and minimums" });
  return dialog;
}

/** Lets the chained start → record promises settle. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  loadAssistantContent.mockResolvedValue(panelData());
  startAssistantConversation.mockResolvedValue({ conversationId: "conv-1" });
  recordAssistantOutcome.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("dialog accessibility (R28)", () => {
  it("is a labelled modal dialog", async () => {
    const dialog = await openPanel();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("dialog", { name: `Help from ${VENDOR}` })).toBe(dialog);
  });

  it("closes on Escape and returns focus to the help-assistant button", async () => {
    await openPanel();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Open help assistant" }),
    );
  });

  it("returns from an answer to the topic list with the back control", async () => {
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Discount codes" }));
    expect(screen.queryByRole("button", { name: "Something else" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to topics" }));
    expect(screen.getByRole("button", { name: "Something else" })).toBeTruthy();
  });
});

describe("answer links close the panel (#1049 R1-R4)", () => {
  it("closes on following an answer link, returns focus, and records no extra outcome", async () => {
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Where is my order?" }));
    await settle();
    expect(recordAssistantOutcome).toHaveBeenCalledTimes(1);

    const link = screen.getByRole("link", { name: "Look up an order" });
    expect(link.getAttribute("href")).toBe("/orders/lookup");
    fireEvent.click(link);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Open help assistant" }),
    );
    await settle();
    expect(recordAssistantOutcome).toHaveBeenCalledTimes(1);
  });

  it("leaves the panel open when the WhatsApp handoff is followed", async () => {
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Cancel an order I've paid for" }));
    fireEvent.click(screen.getByRole("link", { name: /Message the store on WhatsApp/ }));
    await settle();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("one conversation per open panel (R29)", () => {
  it("starts once, marks ANSWERED once, HANDED_OFF once, and starts again after reopening", async () => {
    await openPanel();

    fireEvent.click(screen.getByRole("button", { name: "Delivery charges and minimums" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to topics" }));
    fireEvent.click(screen.getByRole("button", { name: "Discount codes" }));
    await settle();

    expect(startAssistantConversation).toHaveBeenCalledTimes(1);
    expect(startAssistantConversation).toHaveBeenCalledWith({ topic: "DELIVERY" });
    expect(recordAssistantOutcome).toHaveBeenCalledTimes(1);
    expect(recordAssistantOutcome).toHaveBeenCalledWith({
      conversationId: "conv-1",
      outcome: "ANSWERED",
    });

    fireEvent.click(screen.getByRole("link", { name: /Message the store on WhatsApp/ }));
    await settle();
    expect(recordAssistantOutcome).toHaveBeenCalledTimes(2);
    expect(recordAssistantOutcome).toHaveBeenLastCalledWith({
      conversationId: "conv-1",
      outcome: "HANDED_OFF",
    });

    // Close, reopen: the next first choice is a new conversation.
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Open help assistant" }));
    fireEvent.click(await screen.findByRole("button", { name: "Something else" }));
    await settle();
    expect(startAssistantConversation).toHaveBeenCalledTimes(2);
    expect(startAssistantConversation).toHaveBeenLastCalledWith({ topic: "OTHER" });
  });

  it("does not mark a handoff-only topic as answered", async () => {
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Swap an item in my order" }));
    await settle();
    expect(startAssistantConversation).toHaveBeenCalledTimes(1);
    expect(recordAssistantOutcome).not.toHaveBeenCalled();
  });
});

describe("a refused log never breaks the panel (R30)", () => {
  it("still shows answers and the handoff, and records nothing", async () => {
    startAssistantConversation.mockResolvedValue(null);
    await openPanel();

    fireEvent.click(screen.getByRole("button", { name: "Delivery charges and minimums" }));
    expect(screen.getByText(/£3\.49/)).toBeTruthy();
    const link = screen.getByRole("link", { name: /Message the store on WhatsApp/ });
    fireEvent.click(link);
    await settle();

    expect(recordAssistantOutcome).not.toHaveBeenCalled();
  });
});

describe("the handoff link (R31)", () => {
  it("is the bounded summary for the chosen topic, opens a new tab, and says it is not a transfer", async () => {
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Cancel an order I've paid for" }));

    const link = screen.getByRole("link", { name: /Message the store on WhatsApp/ });
    expect(link.getAttribute("href")).toBe(
      buildHandoffUrl(
        NUMBER,
        buildHandoffText({ vendorName: VENDOR, subject: "Cancel an order I've paid for" }),
      ),
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(
      screen.getByText(
        "This opens WhatsApp with a short summary. Your conversation here is not sent.",
      ),
    ).toBeTruthy();
  });

  it("includes an order number only once a signed-in shopper picks one", async () => {
    loadAssistantContent.mockResolvedValue(
      panelData(["TST-20261011-AAA111", "TST-20261010-BBB222"]),
    );
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Swap an item in my order" }));

    const link = () => screen.getByRole("link", { name: /Message the store on WhatsApp/ });
    const subject = "Swap an item in my order";
    expect(link().getAttribute("href")).toBe(
      buildHandoffUrl(NUMBER, buildHandoffText({ vendorName: VENDOR, subject })),
    );

    fireEvent.change(screen.getByRole("combobox", { name: /Mention an order/ }), {
      target: { value: "TST-20261010-BBB222" },
    });
    expect(link().getAttribute("href")).toBe(
      buildHandoffUrl(
        NUMBER,
        buildHandoffText({ vendorName: VENDOR, subject, orderNumber: "TST-20261010-BBB222" }),
      ),
    );
  });

  it("offers no order picker to a guest", async () => {
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Swap an item in my order" }));
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
