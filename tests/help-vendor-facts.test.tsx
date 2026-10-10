// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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

  it("states the vendor's own rates when loyalty is on", async () => {
    state.loyalty = LOYALTY_ON;
    await renderHelp();

    const text = document.body.textContent ?? "";
    // The seeded-vendor values are deliberately NOT 1/1/100 here: a literal left in the page would
    // still read "1 point per £1" and pass a test written against the defaults.
    expect(text).toMatch(/2 points for every £1/i);
    expect(text).toMatch(/250 points are worth £2\.50/i);
    expect(text).toMatch(/expire 12 months/i);
  });

  it("names the tiers the vendor actually has, and omits the sentence when it has none", async () => {
    state.loyalty = LOYALTY_ON;
    state.tiers = [
      { key: "SILVER", name: "Silver", thresholdPence: 5000, multiplierBps: 12500 },
      { key: "GOLD", name: "Gold", thresholdPence: 10000, multiplierBps: 15000 },
    ];
    await renderHelp();
    expect(document.body.textContent ?? "").toMatch(/Silver, Gold/);

    cleanup();
    state.tiers = [];
    await renderHelp();
    expect(document.body.textContent ?? "").not.toMatch(/higher tier/i);
  });
});

describe("/help delivery facts (#1013 R3, R5, R6, R7, R8)", () => {
  it("states the vendor's exact minimum and fee when no area overrides them", async () => {
    await renderHelp();

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/£10\.00 before you can check out/i);
    expect(text).toMatch(/£2\.99 per delivery/i);
    expect(text).toMatch(/basket reaches £50\.00/i);
    expect(text).toMatch(/RG/);
  });

  it("says there is no minimum when minimumOrderPence is 0, rather than that one is required", async () => {
    state.profile = { ...SRIMART_PROFILE, minimumOrderPence: 0 };
    await renderHelp();

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/no minimum order/i);
    expect(text).not.toMatch(/minimum order value is required/i);
  });

  it("treats a 0 free-delivery threshold as not offered, not as everything free", async () => {
    // lib/delivery-pricing.ts: 0 and null both mean free delivery is never offered. #892 is open
    // because the store-admin guide claims 0 makes every order free; the code is authoritative.
    state.profile = { ...SRIMART_PROFILE, freeDeliveryThresholdPence: 0 };
    await renderHelp();

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/do not currently offer free delivery/i);
    expect(text).not.toMatch(/£0\.00/);
  });

  it("breaks the figures out per area when an area row overrides one", async () => {
    state.profile = {
      ...SRIMART_PROFILE,
      deliveryPrefixes: ["RG", "RG7"],
      deliveryAreas: [
        {
          prefix: "RG",
          deliveryFeePence: null,
          minimumOrderPence: null,
          freeDeliveryThresholdPence: null,
        },
        {
          prefix: "RG7",
          deliveryFeePence: 599,
          minimumOrderPence: null,
          freeDeliveryThresholdPence: null,
        },
      ],
    };
    await renderHelp();

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/By postcode area/i);
    expect(text).toMatch(/£5\.99 delivery/);
    // The flat claim must be gone: printing one fee as universal while RG7 charges more is the
    // same class of false statement this slice removed from the loyalty panel.
    expect(text).not.toMatch(/£2\.99 per delivery/i);
  });

  it("renders no postcode list at all when the vendor serves no areas", async () => {
    state.profile = { ...SRIMART_PROFILE, deliveryPrefixes: [], deliveryAreas: [] };
    await renderHelp();

    expect(document.body.textContent ?? "").not.toMatch(/Postcodes we deliver to/i);
  });

  it("shows collection only when the vendor offers it", async () => {
    await renderHelp();
    expect(document.body.textContent ?? "").not.toMatch(/Click & Collect/i);

    cleanup();
    state.profile = { ...SRIMART_PROFILE, offerCollection: true };
    await renderHelp();
    expect(document.body.textContent ?? "").toMatch(/Click & Collect/i);
  });
});

describe("/help vendor answers (#1012 R21)", () => {
  it("renders no questions section when the vendor has no active answers", async () => {
    await renderHelp();
    expect(document.body.textContent ?? "").not.toMatch(/Questions we are asked/i);
  });

  it("renders the vendor's own answers in the order given", async () => {
    state.faqs = [
      {
        id: "a",
        question: "First question?",
        answer: "First answer.",
        sortOrder: 0,
        isActive: true,
      },
      {
        id: "b",
        question: "Second question?",
        answer: "Second answer.",
        sortOrder: 1,
        isActive: true,
      },
    ];
    await renderHelp();

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Questions we are asked/i);
    expect(text.indexOf("First question?")).toBeLessThan(text.indexOf("Second question?"));
    expect(text).toMatch(/First answer\./);
  });
});

describe("/help shopper guide (#1022)", () => {
  it("renders the public shopping guide and nothing from the internal operations document", async () => {
    await renderHelp();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Detailed Shopping Guide/);
    expect(text).toMatch(/Guest Checkout/);
    expect(text).not.toMatch(/PENDING_PAYMENT/);
    expect(text).not.toMatch(/Known Trap/);
  });
});
