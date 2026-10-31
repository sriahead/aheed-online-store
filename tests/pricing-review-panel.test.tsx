// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RefreshResult } from "@/lib/pricing/refresh";

/** #1309 R23: the review panel renders an unsaved refresh result. */

const { refreshCostsAction, refreshRecommendationsAction } = vi.hoisted(() => ({
  refreshCostsAction: vi.fn(),
  refreshRecommendationsAction: vi.fn(),
}));
vi.mock("@/app/(admin)/staff/platform/costs/actions", () => ({
  refreshCostsAction,
  refreshRecommendationsAction,
}));

import { PricingReviewPanel } from "@/components/staff/PricingReviewPanel";

afterEach(cleanup);

const result: RefreshResult = {
  scope: "all",
  ranAt: "2026-10-27T12:00:00.000Z",
  sources: [
    {
      sourceUrl: "https://stripe.com/gb/pricing",
      status: "read",
      rows: [
        {
          sourceUrl: "https://stripe.com/gb/pricing",
          target: {
            kind: "competitor-plan",
            competitorId: "stripe-payments",
            planName: "Standard",
          },
          field: "cardFee.bps",
          committed: 150,
          suggested: 140,
          change: "changed",
        },
      ],
    },
    { sourceUrl: "https://www.shopify.com/uk/pricing", status: "unreachable", rows: [] },
  ],
  recommendations: {
    ifAccepted: {} as never,
    deltas: {
      models: [
        {
          modelId: "customer-fee",
          committed: { marginPence: 63302, shopPaysPence: 31475 },
          ifAccepted: { marginPence: 63302, shopPaysPence: 30850 },
        },
      ],
      recommendationDisagreesChanged: false,
    },
    actions: ["Review stripe-payments Standard cardFee.bps and update the registry by PR"],
  },
};

describe("PricingReviewPanel", () => {
  it("disables the buttons while running, then shows statuses, suggestions, deltas and actions", async () => {
    let resolve!: (v: unknown) => void;
    refreshRecommendationsAction.mockReturnValue(new Promise((r) => (resolve = r)));
    const view = render(<PricingReviewPanel lastAnalysis="2026-10-27" />);
    const button = view.getByText("Refresh Recommendations");
    fireEvent.click(button);
    expect((view.getByText("Refreshing…") as HTMLButtonElement).disabled).toBe(true);
    expect((view.getByText("Refresh Costs") as HTMLButtonElement).disabled).toBe(true);

    await act(async () => resolve({ ok: true, result }));

    const text = view.container.textContent ?? "";
    expect(text).toContain("stripe.com: Read");
    expect(text).toContain("www.shopify.com: Page could not be fetched");
    expect(text).toContain("Unconfirmed suggestion");
    expect(text).toContain("stripe-payments: Standard cardFee.bps: 150 → 140");
    expect(text).toContain(
      "customer-fee: margin £633.02, shop pays £314.75 → margin £633.02, shop pays £308.50",
    );
    expect(text).toContain("Review stripe-payments Standard");
    expect(text).toContain("Last analysis: 2026-10-27");
    expect(view.getByText("Download suggestions (CSV)")).toBeTruthy();
  });

  it("shows the refusal message", async () => {
    refreshCostsAction.mockResolvedValue({ ok: false, error: "Platform admin only" });
    const view = render(<PricingReviewPanel lastAnalysis="2026-10-27" />);
    await act(async () => {
      fireEvent.click(view.getByText("Refresh Costs"));
    });
    expect(view.container.textContent).toContain("Platform admin only");
  });
});
