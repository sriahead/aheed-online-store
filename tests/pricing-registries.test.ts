import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASSUMPTIONS, SCENARIO_VENDOR_COUNTS } from "@/lib/pricing/assumptions";
import { BUSINESS_MODELS, RECOMMENDATION } from "@/lib/pricing/business-models";
import { COMPETITORS } from "@/lib/pricing/competitors";
import { formatMoney, roundHalfUp, type Money } from "@/lib/pricing/money";
import { PROPOSED_PLANS } from "@/lib/pricing/proposed-plans";

/** #1309 R5-R10 and R37's structural part: the pricing registries' shape and invariants. */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The Build date: no research can be dated after it. */
const BUILD_DATE = "2026-10-27";

const PURE_FILES = [
  "lib/pricing/money.ts",
  "lib/pricing/competitors.ts",
  "lib/pricing/assumptions.ts",
  "lib/pricing/proposed-plans.ts",
  "lib/pricing/business-models.ts",
  "lib/pricing/analysis.ts",
  "lib/pricing/committed.ts",
  "lib/pricing/refresh.ts",
  "lib/pricing/csv.ts",
];

function isMinor(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0;
}

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

describe("pure modules", () => {
  it.each(PURE_FILES)("%s has no directive, no request-context import and no fetch", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source.split("\n")[0]).not.toMatch(/use (client|server)/);
    expect(source).not.toMatch(
      /^import[^;]*from "(react|next\/|@\/lib\/db|@\/lib\/config|@prisma\/)/m,
    );
    expect(source).not.toMatch(/\bfetch\(/);
  });
});

describe("money (R5)", () => {
  it("formats and rounds", () => {
    expect(formatMoney({ minor: 123456, currency: "GBP" })).toBe("£1,234.56");
    expect(formatMoney({ minor: 5, currency: "USD" })).toBe("$0.05");
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(2.4999)).toBe(2);
  });

  it("every minor amount in every registry is a non-negative integer", () => {
    const moneys: (Money | null)[] = COMPETITORS.flatMap((c) =>
      c.plans.flatMap((p) => [p.monthlyFee, p.setupFee, p.cardFee?.fixed ?? null]),
    );
    for (const m of moneys) if (m) expect(isMinor(m.minor), JSON.stringify(m)).toBe(true);
    for (const p of PROPOSED_PLANS) {
      expect(isMinor(p.monthlyFeePence), p.id).toBe(true);
      for (const a of p.addOns) expect(isMinor(a.monthlyFeePence), a.name).toBe(true);
    }
    for (const a of ASSUMPTIONS) if (a.value !== null) expect(isMinor(a.value), a.id).toBe(true);
  });
});

describe("competitors (R6, R7)", () => {
  it("holds exactly the 10 agreed competitors in their segments", () => {
    expect(Object.fromEntries(COMPETITORS.map((c) => [c.id, c.segment]))).toEqual({
      shopify: "store-builder",
      wix: "store-builder",
      "square-online": "store-builder",
      ecwid: "store-builder",
      "uber-eats": "marketplace",
      deliveroo: "marketplace",
      "just-eat": "marketplace",
      "snappy-shopper": "local-platform",
      "stripe-payments": "payments",
      sumup: "payments",
    });
  });

  it.each(COMPETITORS.map((c) => [c.id, c] as const))("%s is well formed", (_id, c) => {
    expect(c.website).toMatch(/^https:\/\//);
    expect(c.researchedOn).toMatch(DATE);
    expect(c.plans.length > 0).toBe(c.researchStatus === "published");
    for (const plan of c.plans) {
      expect(plan.sourceUrl).toMatch(/^https:\/\//);
      expect(hostOf(plan.sourceUrl).endsWith(hostOf(c.website)), plan.sourceUrl).toBe(true);
      expect(plan.retrievedOn).toMatch(DATE);
      expect(plan.retrievedOn <= BUILD_DATE).toBe(true);
      for (const bps of [plan.commissionBps, plan.cardFee?.bps ?? null]) {
        if (bps !== null) expect(Number.isInteger(bps) && bps >= 0 && bps <= 10000).toBe(true);
      }
      expect(
        plan.monthlyFee !== null || plan.commissionBps !== null || plan.cardFee !== null,
        plan.name,
      ).toBe(true);
      expect(Array.isArray(plan.addOns) && Array.isArray(plan.extraCharges)).toBe(true);
    }
  });
});

describe("assumptions (R8)", () => {
  it("holds exactly the three assumptions with consistent basis and source", () => {
    expect(ASSUMPTIONS.map((a) => a.id).sort()).toEqual(
      ["card-fee-bps", "card-fee-fixed-pence", "usd-cents-per-gbp"].sort(),
    );
    for (const a of ASSUMPTIONS) {
      expect(a.basis === "missing", a.id).toBe(a.value === null);
      expect(a.sourceUrl !== null, a.id).toBe(a.basis === "published-source");
      expect(a.asOf).toMatch(DATE);
      expect(a.id).not.toMatch(/gmv|orders|aov/);
    }
  });

  it("the exchange rate is published by a central bank or official statistics body", () => {
    const fx = ASSUMPTIONS.find((a) => a.id === "usd-cents-per-gbp")!;
    expect(fx.basis).toBe("published-source");
    expect(fx.value).not.toBeNull();
    expect(hostOf(fx.sourceUrl!)).toMatch(/(bankofengland\.co\.uk|ecb\.europa\.eu|ons\.gov\.uk)$/);
  });

  it("the card fee is Stripe's, and equals the stripe-payments plan it is derived from", () => {
    const stripe = COMPETITORS.find((c) => c.id === "stripe-payments")!;
    for (const id of ["card-fee-bps", "card-fee-fixed-pence"] as const) {
      const a = ASSUMPTIONS.find((x) => x.id === id)!;
      expect(a.basis).toBe("published-source");
      expect(hostOf(a.sourceUrl!)).toBe("stripe.com");
      expect(a.derivedFrom?.competitorId).toBe("stripe-payments");
      const plan = stripe.plans.find((p) => p.name === a.derivedFrom!.planName)!;
      expect(a.value).toBe(id === "card-fee-bps" ? plan.cardFee!.bps : plan.cardFee!.fixed.minor);
    }
  });

  it("the scenario vendor counts are fixed what-ifs", () => {
    expect(SCENARIO_VENDOR_COUNTS).toEqual([1, 5, 10, 25, 50]);
    expect(readFileSync("lib/pricing/assumptions.ts", "utf8")).toMatch(/basis: "proposal"/);
  });
});

describe("proposed plans (R9)", () => {
  it("one plan per model, each a proposal with the model's fee shape", () => {
    expect(PROPOSED_PLANS.map((p) => p.model).sort()).toEqual(
      ["commission", "freemium", "hybrid", "subscription"].sort(),
    );
    const ids = COMPETITORS.map((c) => c.id);
    for (const p of PROPOSED_PLANS) {
      expect(p.status).toBe("proposal");
      expect(p.commissionBps >= 0 && p.commissionBps <= 10000).toBe(true);
      expect(
        ids.some((id) => p.positioning.includes(id)),
        p.id,
      ).toBe(true);
      expect(p.vatNote).toContain("VAT");
    }
    const by = (model: string) => PROPOSED_PLANS.find((p) => p.model === model)!;
    expect(by("subscription").commissionBps).toBe(0);
    expect(by("subscription").monthlyFeePence).toBeGreaterThan(0);
    expect(by("commission").monthlyFeePence).toBe(0);
    expect(by("commission").commissionBps).toBeGreaterThan(0);
    expect(by("hybrid").monthlyFeePence).toBeGreaterThan(0);
    expect(by("hybrid").commissionBps).toBeGreaterThan(0);
    expect(by("freemium").monthlyFeePence).toBe(0);
  });
});

describe("business models (R10)", () => {
  it("holds the six models with non-empty trade-offs and the right representative plan", () => {
    expect(BUSINESS_MODELS.map((m) => m.id).sort()).toEqual(
      ["commission", "freemium", "hybrid", "subscription", "transaction-fee", "usage-based"].sort(),
    );
    for (const m of BUSINESS_MODELS) {
      expect(m.advantages.length && m.disadvantages.length && m.risks.length, m.id).toBeTruthy();
      const plan = PROPOSED_PLANS.find((p) => p.model === m.id);
      expect(m.representativePlanId, m.id).toBe(plan ? plan.id : null);
    }
    expect(
      BUSINESS_MODELS.find((m) => m.id === "transaction-fee")!.representativePlanId,
    ).toBeNull();
    expect(BUSINESS_MODELS.find((m) => m.id === "usage-based")!.representativePlanId).toBeNull();
  });

  it("the recommendation names a modelled model and is due 92 days after review", () => {
    const model = BUSINESS_MODELS.find((m) => m.id === RECOMMENDATION.modelId)!;
    expect(model.representativePlanId).not.toBeNull();
    expect(RECOMMENDATION.reasoning.length).toBeGreaterThan(0);
    const due = new Date(`${RECOMMENDATION.reviewedOn}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 92);
    expect(RECOMMENDATION.nextReviewDue).toBe(due.toISOString().slice(0, 10));
  });
});
