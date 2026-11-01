// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * #1013 — `/help` states this vendor's own delivery and loyalty facts, and states nothing about
 * loyalty when the vendor does not run a scheme.
 *
 * WHY THIS TEST EXISTS. The page asserted "Every purchase earns you points automatically" with no
 * condition, while `VendorConfig.loyaltyEnabled` is `Boolean @default(false)` and every OTHER
 * loyalty surface already gated on it: `/account/loyalty` returns `notFound()`, `/account` and
 * `/checkout` branch, and `lib/repositories/loyalty.ts` returns `NO_REDEMPTION`. SriMart is seeded
 * `loyaltyEnabled: false`, and that promise was live on its production Help Centre on 2026-10-10.
 * The same page also stated "A minimum order value is required for delivery" while
 * `minimumOrderPence` defaults to `0`.
 *
 * WHY IT RENDERS THE PAGE RATHER THAN READING ITS SOURCE. A grep or an AST check for the gate
 * passes as soon as the identifier `loyaltyEnabled` appears anywhere in the file — including in the
 * comment explaining why the gate exists. Rendering a loyalty-off vendor and asserting the absence
 * of the wording is the only version of this check that fails when the gate is deleted, which
 * `validation.md` R9 requires to be demonstrated.
 *
 * The page is an async server component with no nested async children, so awaiting it yields an
 * ordinary element tree that `@testing-library/react` can render.
 */

const SRIMART_PROFILE = {
  localityName: "Reading",
  deliveryFeePence: 299,
  minimumOrderPence: 1000,
  freeDeliveryThresholdPence: 5000,
  offerCollection: false,
  deliveryPrefixes: ["RG"],
  deliveryAreas: [
    {
      prefix: "RG",
      deliveryFeePence: null,
      minimumOrderPence: null,
      freeDeliveryThresholdPence: null,
    },
  ],
};

const LOYALTY_OFF = {
  loyaltyEnabled: false,
  pointsPerPoundEarned: 1,
  pencePerPointRedeemed: 1,
  minRedeemPoints: 100,
  tierWindowDays: 30,
  pointsExpiryMonths: null,
};

const LOYALTY_ON = {
  loyaltyEnabled: true,
  pointsPerPoundEarned: 2,
  pencePerPointRedeemed: 1,
  minRedeemPoints: 250,
  tierWindowDays: 30,
  pointsExpiryMonths: 12,
};

const state = {
  profile: SRIMART_PROFILE as unknown,
  loyalty: LOYALTY_OFF as unknown,
  tiers: [] as unknown[],
  faqs: [] as unknown[],
};

// #1052 — the contact card mounts the help assistant, whose server actions must not run here.
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn(), getPrismaWs: vi.fn() }));
vi.mock("@/features/assistant/assistant", () => ({
  loadAssistantContent: vi.fn(async () => null),
  startAssistantConversation: vi.fn(async () => null),
  recordAssistantOutcome: vi.fn(async () => null),
}));

vi.mock("@/lib/auth-rbac", () => ({
  requireVendorRole: async () => ({ ok: false, status: 403 }),
}));

vi.mock("@/lib/vendor-service", () => ({
  getCurrentVendorProfile: async () => state.profile,
}));

vi.mock("@/lib/loyalty-service", () => ({
  getLoyaltyRepository: () => ({
    config: async () => state.loyalty,
    tiers: async () => state.tiers,
  }),
}));

vi.mock("@/lib/vendor-faqs-service", () => ({
  getVendorFaqRepository: () => ({
    listActive: async () => state.faqs,
  }),
}));

async function renderHelp() {
  const { default: HelpPage } = await import("@/app/(storefront)/help/page");
  render(await HelpPage());
}

/*
 * The page imports the generated `DOC_ARTICLES` (`app/(admin)/staff/runbook/docs.ts`), which is a
 * large single module — importing it costs several seconds the first time and nothing afterwards.
 * Warmed here with its own generous timeout so that cost lands in setup rather than making
 * whichever test happens to run first look flaky.
 */
beforeAll(async () => {
  await import("@/app/(storefront)/help/page");
}, 60_000);

beforeEach(() => {
  state.profile = SRIMART_PROFILE;
  state.loyalty = LOYALTY_OFF;
  state.tiers = [];
  state.faqs = [];
});

afterEach(cleanup);

describe("/help loyalty gate (#1013 R1, R9)", () => {
  it("says nothing about loyalty, points or rewards when the vendor has loyalty off", async () => {
    await renderHelp();

    // The whole served page, not just the panel: the rendered shopping guide counts too, which is
    // why R10 stripped its loyalty section and #1022's visibility filter stopped an internal
    // operations document rendering here.
    expect(document.body.textContent ?? "").not.toMatch(/loyalt|points|reward/i);
    expect(screen.queryByText(/earns? you points/i)).toBeNull();
  });
});

describe("/help role journeys & delivery anchor (#1385)", () => {
  it("renders the interactive role journeys and delivery anchor for footer navigation", async () => {
    await renderHelp();

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Platform User Journey Maps/i);
    expect(text).toMatch(/Customer \(Shopper\)/i);
    expect(text).toMatch(/Store Staff/i);
    expect(text).toMatch(/Store Admin/i);
    expect(text).toMatch(/Platform Admin/i);

    // Footer links to /help#delivery
    const deliveryAnchor = document.getElementById("delivery");
    expect(deliveryAnchor).not.toBeNull();
  });

  it("has retired redundant static facts and shopping guide in favour of interactive journey maps", async () => {
    await renderHelp();

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/Detailed Shopping Guide/i);
    expect(text).not.toMatch(/By postcode area:/i);
    expect(text).not.toMatch(/Collecting instead:/i);
  });
});

describe("/help contact card (#1052)", () => {
  const CONTACT = { name: "Test Store", whatsappNumber: "447700900000" };

  it("opens the help assistant when it is available, with no direct WhatsApp link", async () => {
    state.profile = { ...SRIMART_PROFILE, ...CONTACT, assistantEnabled: true };
    await renderHelp();
    expect(screen.getByRole("heading", { name: "Still need help?" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /on WhatsApp/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open the help assistant" }));
    expect(await screen.findByRole("dialog", { name: "Help from Test Store" })).toBeTruthy();
  });

  it("links straight to WhatsApp when the assistant is off", async () => {
    state.profile = { ...SRIMART_PROFILE, ...CONTACT, assistantEnabled: false };
    await renderHelp();
    expect(screen.queryByRole("button", { name: "Open the help assistant" })).toBeNull();
    const link = screen.getByRole("link", { name: "Message Test Store on WhatsApp" });
    expect(link.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/447700900000\?text=/);
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("renders no contact card for a store with no WhatsApp number", async () => {
    state.profile = {
      ...SRIMART_PROFILE,
      name: "Test Store",
      whatsappNumber: null,
      assistantEnabled: true,
    };
    await renderHelp();
    expect(screen.queryByRole("heading", { name: "Still need help?" })).toBeNull();
  });
});
