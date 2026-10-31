import { describe, expect, it } from "vitest";
import { addOnMarginBps, ADD_ONS, HIGH_MARGIN_BPS } from "@/lib/pricing/add-ons";
import { comparatorShopPays, type Comparator } from "@/lib/pricing/business-models";
import type { Competitor } from "@/lib/pricing/competitors";
import type { CostDriver } from "@/lib/pricing/cost-drivers";
import { gbp, toPence, usd } from "@/lib/pricing/money";
import {
  breakEvenShopsForPayTarget,
  breakEvenShopsIncludingTime,
  connectPence,
  driverMonthlyPence,
  evaluate,
  firstFreeTierLimit,
  partnerRateByYear,
  partnerTimePence,
  platformFee,
  startupCosts,
  vatThresholdShops,
  type ModelInputs,
  type PricingModelParams,
} from "@/lib/pricing/volume-model";

// #1313 R6-R13, R16, R18. Every number in R13 is asserted here against the named output.

const D1: CostDriver = {
  id: "D1",
  name: "D1",
  provider: "test",
  group: "infrastructure",
  fixed: { amount: usd(500), period: "month" },
  oneOff: null,
  usage: [
    {
      unit: "units",
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
  note: "Usage quantities are estimates.",
};
const D2: CostDriver = {
  ...D1,
  id: "D2",
  fixed: { amount: gbp(12000), period: "year" },
  usage: null,
};
const D3: CostDriver = { ...D1, id: "D3", fixed: null, usage: null, oneOff: gbp(5000) };

function inputs(over: Partial<ModelInputs> = {}): ModelInputs {
  return {
    usdCentsPerGbp: 125,
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
    drivers: [D1, D2, D3],
    connectFee: null,
    ...over,
  };
}

const SCENARIO = { shops: 2, ordersPerShop: 1000, basketPence: 2000 };
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
const VOLUME = { ordersPerShop: 1000, basketPence: 2000 };

describe("toPence (R6)", () => {
  it("passes GBP through and converts USD half up", () => {
    expect(toPence(gbp(1234), null)).toBe(1234);
    expect(toPence(usd(1000), 125)).toBe(800);
    expect(toPence(usd(1), 134)).toBe(1);
  });
  it("is null for USD with no usable rate", () => {
    expect(toPence(usd(1000), null)).toBeNull();
    expect(toPence(usd(1000), 0)).toBeNull();
  });
});

describe("platform fee per model kind (R7)", () => {
  it("allowance-per-order", () => {
    expect(platformFee(A, 1000)).toBe(4500);
    expect(platformFee(A, 200)).toBe(1000);
  });
  it("capped-per-order", () => {
    expect(
      platformFee(
        { kind: "capped-per-order", monthlyFeePence: 500, perOrderPence: 10, capPence: 3000 },
        1000,
      ),
    ).toBe(3500);
  });
  it("order-bands, inside and above the top band", () => {
    const bands: PricingModelParams = {
      kind: "order-bands",
      bands: [
        { upToOrders: 300, monthlyFeePence: 1500, label: "a" },
        { upToOrders: 1000, monthlyFeePence: 3000, label: "b" },
        { upToOrders: 3000, monthlyFeePence: 6000, label: "c" },
      ],
      abovePerOrderPence: 2,
    };
    expect(platformFee(bands, 1000)).toBe(3000);
    expect(platformFee(bands, 3500)).toBe(7000);
  });
  it("customer-fee charges the shop only the monthly fee", () => {
    expect(platformFee(B, 1000)).toBe(500);
  });
});

describe("evaluate - the R13 fixture", () => {
  const a = evaluate(SCENARIO, A, inputs());
  const b = evaluate(SCENARIO, B, inputs());

  it("Model A: what the shop pays", () => {
    expect(a.shopPays.platformFeePence).toBe(4500);
    expect(a.shopPays.cardFeesPence).toBe(50000);
    expect(a.shopPays.disputeFeesPence).toBe(2000);
    expect(a.shopPays.totalPence).toBe(56500);
    expect(a.shopPays.customerPaysPerOrderPence).toBe(0);
  });
  it("Model A: revenue, cost and margin", () => {
    expect(a.revenuePence).toBe(9000);
    expect(a.cost.currentFixedPence).toBe(0);
    expect(a.cost.driversPence).toBe(1800);
    expect(a.cost.connectPence).toBe(0);
    expect(a.cost.partnerTimePence).toBe(15000);
    expect(a.cost.totalPence).toBe(16800);
    expect(a.marginPence).toBe(-7800);
    expect(a.marginPerShopPence).toBe(-3900);
    expect(a.marginBps).toBe(-8667);
  });
  it("Model B: card fees on basket plus the customer fee", () => {
    expect(b.shopPays.cardFeesPence).toBe(50750);
    expect(b.shopPays.totalPence).toBe(53250);
    expect(b.shopPays.customerPaysPerOrderPence).toBe(50);
    expect(b.revenuePence).toBe(101000);
    expect(b.marginPence).toBe(84200);
  });
  it("drivers: D1 800, D2 1000, D3 one-off only (R9)", () => {
    expect(driverMonthlyPence(D1, 2, 1000, 125)).toBe(800);
    expect(driverMonthlyPence(D2, 2, 1000, 125)).toBe(1000);
    expect(driverMonthlyPence(D3, 2, 1000, 125)).toBe(0);
    expect(startupCosts([D1, D2, D3], 125)).toBe(5000);
  });
  it("with no exchange rate, USD-dependent figures are null and the shop total stands", () => {
    const n = evaluate(SCENARIO, A, inputs({ usdCentsPerGbp: null }));
    expect(n.cost.driversPence).toBeNull();
    expect(n.cost.totalPence).toBeNull();
    expect(n.marginPence).toBeNull();
    expect(n.marginBps).toBeNull();
    expect(n.shopPays.totalPence).toBe(56500);
  });
  it("margin bps is null when revenue is 0", () => {
    const zero: PricingModelParams = {
      kind: "customer-fee",
      monthlyFeePence: 0,
      customerFeePerOrderPence: 0,
    };
    expect(evaluate(SCENARIO, zero, inputs()).marginBps).toBeNull();
  });
});

describe("Connect (R10)", () => {
  it("is 0 with no platform fee and 10480 with one", () => {
    expect(connectPence(SCENARIO, inputs())).toBe(0);
    expect(
      connectPence(
        SCENARIO,
        inputs({ connectFee: { activeAccountPence: 200, payoutBps: 25, payoutFixedPence: 10 } }),
      ),
    ).toBe(10480);
  });
});

describe("partner time (R11)", () => {
  it("costs 15000 for 2 shops and is null with no rate", () => {
    expect(partnerTimePence(2, inputs())).toBe(15000);
    expect(partnerTimePence(2, inputs({ partnerHourlyRatePence: null }))).toBeNull();
  });
  it("grows the rate by year", () => {
    expect(partnerRateByYear(2500, 1000)).toEqual([2500, 2750, 3025]);
    expect(partnerRateByYear(2500, null)).toEqual([2500, null, null]);
  });
});

describe("searches (R12)", () => {
  it("first free-tier limit", () => {
    expect(firstFreeTierLimit([D1, D2, D3], 1000)).toEqual({
      driverId: "D1",
      unit: "units",
      shops: 2,
    });
    expect(firstFreeTierLimit([D1, D2, D3], 100)?.shops).toBe(11);
    expect(firstFreeTierLimit([D1, D2, D3], 2000)?.shops).toBe(1);
    expect(firstFreeTierLimit([D2, D3], 1000)).toBeNull();
  });
  it("pay-target break-even", () => {
    expect(breakEvenShopsForPayTarget(A, VOLUME, inputs(), 100000)).toBe(25);
    expect(breakEvenShopsForPayTarget(A, VOLUME, inputs(), null)).toBeNull();
    expect(breakEvenShopsForPayTarget(A, VOLUME, inputs(), 1e12)).toBeNull();
  });
  it("VAT threshold", () => {
    expect(vatThresholdShops(A, VOLUME, inputs())).toBe(167);
  });
  it("break-even including time", () => {
    expect(breakEvenShopsIncludingTime(B, VOLUME, inputs())).toBe(1);
    // Model A's fee never covers its partner time at this volume.
    expect(breakEvenShopsIncludingTime(A, VOLUME, inputs())).toBeNull();
  });
});

describe("comparators (R16)", () => {
  const competitors: Competitor[] = [
    {
      id: "store",
      name: "Store",
      segment: "store-builder",
      website: "https://example.com",
      researchStatus: "published",
      researchedOn: "2026-10-28",
      note: null,
      plans: [
        {
          name: "Basic",
          monthlyFee: gbp(2500),
          setupFee: null,
          commissionBps: null,
          cardFee: { bps: 200, fixed: gbp(25) },
          addOns: [],
          extraCharges: [],
          features: [],
          sourceUrl: "https://example.com/pricing",
          retrievedOn: "2026-10-28",
        },
        {
          name: "Market",
          monthlyFee: null,
          setupFee: gbp(65000),
          commissionBps: 1300,
          cardFee: null,
          addOns: [],
          extraCharges: [],
          features: [],
          sourceUrl: "https://example.com/pricing",
          retrievedOn: "2026-10-28",
        },
      ],
    },
  ];
  const c = (planName: string, cardFees: "plan" | "stripe-standard" | "included"): Comparator => ({
    id: planName,
    label: planName,
    source: { competitorId: "store", planName, cardFees },
    note: null,
  });
  it("store-builder plan with its own card fee", () => {
    expect(comparatorShopPays(c("Basic", "plan"), VOLUME, inputs(), competitors)).toEqual({
      monthlyPence: 67500,
      setupPence: 0,
    });
  });
  it("marketplace with commission and setup fee", () => {
    expect(comparatorShopPays(c("Market", "included"), VOLUME, inputs(), competitors)).toEqual({
      monthlyPence: 260000,
      setupPence: 65000,
    });
  });
  it("do nothing", () => {
    expect(
      comparatorShopPays(
        { id: "x", label: "x", source: { kind: "do-nothing" }, note: null },
        VOLUME,
        inputs(),
        competitors,
      ),
    ).toEqual({ monthlyPence: 0, setupPence: 0 });
  });
});

describe("add-on margins (R18)", () => {
  it("classifies every add-on by its computed margin, none negative", () => {
    for (const addOn of ADD_ONS) {
      const margin = addOnMarginBps(addOn);
      expect(margin, addOn.id).toBeGreaterThanOrEqual(0);
      expect(addOn.marginClass, addOn.id).toBe(
        margin >= HIGH_MARGIN_BPS ? "cheap-high-margin" : "usage-heavy",
      );
    }
  });
  it("computes the margin half up", () => {
    expect(
      addOnMarginBps({
        price: { pence: 300, billing: "month", unit: "x" },
        runCost: { pence: 65, basis: "estimate", driverId: null, derivation: "x" },
      }),
    ).toBe(7833);
  });
});
