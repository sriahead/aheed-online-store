import { describe, expect, it } from "vitest";
import {
  analyseV2,
  COMMITTED,
  recommendationDisagrees,
  type ModelResult,
  type Registries,
} from "@/lib/pricing/committed";
import type { CostDriver } from "@/lib/pricing/cost-drivers";
import { gbp, usd } from "@/lib/pricing/money";
import { evaluate, type ModelInputs, type PricingModelParams } from "@/lib/pricing/volume-model";

/** #1313 R21-R22: `analyseV2` over the committed registries, the disagreement rule and staleness. */

const NOW = new Date("2026-10-28T12:00:00Z");

describe("analyseV2 shape (R21)", () => {
  const a = analyseV2(COMMITTED, NOW);

  it("evaluates every model at the reference scenario", () => {
    expect(a.referenceScenario).toEqual({ shops: 10, ordersPerShop: 500, basketPence: 2500 });
    expect(a.models.map((m) => m.modelId)).toEqual(COMMITTED.models.map((m) => m.id));
    for (const m of a.models) {
      const model = COMMITTED.models.find((x) => x.id === m.modelId)!;
      expect(m.reference).toEqual(evaluate(a.referenceScenario, model.pricing, a.inputs));
    }
  });

  it("builds the full grid and comparison set", () => {
    expect(a.grid).toHaveLength(4 * 6 * 3 * 3);
    expect(a.comparisons).toHaveLength(7 * 3 * 3);
    expect(a.firstLimits.map((l) => l.ordersPerShop)).toEqual([100, 500, 2000]);
  });

  it("reports start-up costs, partner rates and a missing pay target", () => {
    expect(a.startupPence).toBe(60000);
    expect(a.partnerRates).toEqual([2500, null, null]);
    expect(a.payTargetPence).toBeNull();
    for (const m of a.models) expect(m.breakEvenForPayTarget).toBeNull();
  });

  it("the committed recommendation agrees with the committed numbers and is not overdue", () => {
    expect(a.recommendationDisagrees).toBe(false);
    expect(a.recommendationOverdue).toBe(false);
  });

  it("is overdue the day after nextReviewDue", () => {
    expect(analyseV2(COMMITTED, new Date("2027-01-28T23:00:00Z")).recommendationOverdue).toBe(
      false,
    );
    expect(analyseV2(COMMITTED, new Date("2027-01-29T00:00:00Z")).recommendationOverdue).toBe(true);
  });
});

describe("recommendationDisagrees (R21), with the R13 fixture", () => {
  const D1: CostDriver = {
    id: "D1",
    name: "D1",
    provider: "t",
    group: "infrastructure",
    fixed: { amount: usd(500), period: "month" },
    oneOff: null,
    usage: [
      {
        unit: "u",
        baseUnits: 0,
        perShopUnits: 0,
        perOrderUnits: 10,
        freeUnits: 10000,
        price: { minor: 50, perUnits: 1000, currency: "USD" },
      },
    ],
    basis: "estimate",
    sourceUrl: null,
    asOf: "2026-10-28",
    note: "estimate",
  };
  const D2: CostDriver = {
    ...D1,
    id: "D2",
    fixed: { amount: gbp(12000), period: "year" },
    usage: null,
  };
  const inputs = (fx: number | null): ModelInputs => ({
    usdCentsPerGbp: fx,
    cardFeeBps: 150,
    cardFeeFixedPence: 20,
    disputeRateBps: 10,
    disputeFeePence: 2000,
    partnerHourlyRatePence: 2500,
    partnerMinutesPerShopMonth: 120,
    onboardingMinutesPerShop: 720,
    onboardingAmortisationMonths: 12,
    payoutsPerShopMonth: 4,
    currentFixed: usd(0),
    drivers: [D1, D2],
    connectFee: null,
  });
  const scenario = { shops: 2, ordersPerShop: 1000, basketPence: 2000 };
  const A: PricingModelParams = {
    kind: "allowance-per-order",
    monthlyFeePence: 1000,
    includedOrders: 300,
    perOrderPence: 5,
  };
  const B: PricingModelParams = {
    kind: "customer-fee",
    monthlyFeePence: 500,
    customerFeePerOrderPence: 50,
  };
  const results = (fx: number | null): ModelResult[] => [
    {
      modelId: "allowance-per-order",
      reference: evaluate(scenario, A, inputs(fx)),
      breakEvenForPayTarget: null,
      breakEvenIncludingTime: null,
      vatThresholdShops: null,
    },
    {
      modelId: "customer-fee",
      reference: evaluate(scenario, B, inputs(fx)),
      breakEvenForPayTarget: null,
      breakEvenIncludingTime: null,
      vatThresholdShops: null,
    },
  ];

  it("recommending A disagrees: it loses money and B dominates it", () => {
    expect(recommendationDisagrees(results(125), "allowance-per-order")).toBe(true);
  });
  it("recommending B agrees", () => {
    expect(recommendationDisagrees(results(125), "customer-fee")).toBe(false);
  });
  it("is false when the recommended margin is unknown", () => {
    expect(recommendationDisagrees(results(null), "allowance-per-order")).toBe(false);
  });
  it("is true for a profitable model that another model dominates", () => {
    const rich: PricingModelParams = {
      kind: "customer-fee",
      monthlyFeePence: 100,
      customerFeePerOrderPence: 60,
    };
    const r = [
      { ...results(125)[1] },
      {
        ...results(125)[1],
        modelId: "order-bands" as const,
        reference: evaluate(scenario, rich, inputs(125)),
      },
    ];
    // order-bands here: revenue 120200 > 101000 and shop pays 53055 < 53250.
    expect(r[1].reference.marginPence! > r[0].reference.marginPence!).toBe(true);
    expect(r[1].reference.shopPays.totalPence < r[0].reference.shopPays.totalPence).toBe(true);
    expect(recommendationDisagrees(r, "customer-fee")).toBe(true);
  });
});

describe("stale (R22)", () => {
  it("is empty on the Build date", () => {
    expect(analyseV2(COMMITTED, NOW).stale).toEqual([]);
  });

  it("names every new registry 93 days after the Build date", () => {
    const later = new Date("2027-01-29T12:00:00Z");
    const registries: Registries = COMMITTED;
    const stale = analyseV2(registries, later).stale;
    const by = (registry: string) => stale.filter((s) => s.registry === registry).map((s) => s.id);
    expect(by("cost-drivers").sort()).toEqual(COMMITTED.drivers.map((d) => d.id).sort());
    expect(by("risks").sort()).toEqual(COMMITTED.risks.map((r) => r.id).sort());
    expect(by("connect").sort()).toEqual(["platform-pricing", "stripe-pricing"]);
    // Only add-ons priced from a (now stale) driver.
    expect(by("add-ons").sort()).toEqual(
      COMMITTED.addOns
        .filter((x) => x.runCost.basis === "published-source" && x.runCost.driverId !== null)
        .map((x) => x.id)
        .sort(),
    );
    expect(by("add-ons").length).toBeGreaterThan(0);
  });
});
