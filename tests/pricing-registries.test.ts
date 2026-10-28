import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ADD_ONS } from "@/lib/pricing/add-ons";
import {
  ASSUMPTIONS,
  SCENARIO_BASKETS_PENCE,
  SCENARIO_ORDERS,
  SCENARIO_SHOPS,
} from "@/lib/pricing/assumptions";
import * as assumptionsModule from "@/lib/pricing/assumptions";
import {
  BUSINESS_MODELS,
  COMPARATORS,
  comparatorPlan,
  RECOMMENDATION,
} from "@/lib/pricing/business-models";
import { COMPETITORS } from "@/lib/pricing/competitors";
import { CONNECT_MODELLED, CONNECT_OPTIONS } from "@/lib/pricing/connect";
import { COST_DRIVERS } from "@/lib/pricing/cost-drivers";
import { formatMoney, roundHalfUp, type Money } from "@/lib/pricing/money";
import { RISKS } from "@/lib/pricing/risks";

/**
 * #1309 R6-R7 (competitors, unchanged) and #1313 R1-R5, R14, R15, R17, R19, R20 and R37's structural
 * part: the pricing registries' shape and invariants.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The Build date: no research can be dated after it. */
const BUILD_DATE = "2026-10-28";

const PURE_FILES = [
  "lib/pricing/money.ts",
  "lib/pricing/competitors.ts",
  "lib/pricing/assumptions.ts",
  "lib/pricing/cost-drivers.ts",
  "lib/pricing/connect.ts",
  "lib/pricing/volume-model.ts",
  "lib/pricing/business-models.ts",
  "lib/pricing/add-ons.ts",
  "lib/pricing/risks.ts",
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

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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

describe("money", () => {
  it("formats and rounds", () => {
    expect(formatMoney({ minor: 123456, currency: "GBP" })).toBe("£1,234.56");
    expect(formatMoney({ minor: 5, currency: "USD" })).toBe("$0.05");
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(2.4999)).toBe(2);
  });

  it("every minor amount in every registry is a non-negative integer", () => {
    const moneys: (Money | null)[] = [
      ...COMPETITORS.flatMap((c) =>
        c.plans.flatMap((p) => [p.monthlyFee, p.setupFee, p.cardFee?.fixed ?? null]),
      ),
      ...COST_DRIVERS.flatMap((d) => [d.fixed?.amount ?? null, d.oneOff]),
    ];
    for (const m of moneys) if (m) expect(isMinor(m.minor), JSON.stringify(m)).toBe(true);
    for (const a of ASSUMPTIONS) if (a.value !== null) expect(isMinor(a.value), a.id).toBe(true);
  });
});

describe("competitors (#1309 R6, R7)", () => {
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
    }
  });
});

describe("assumptions (R1, R2)", () => {
  it("holds exactly the agreed ids with the agreed basis", () => {
    expect(Object.fromEntries(ASSUMPTIONS.map((a) => [a.id, a.basis]))).toEqual({
      "usd-cents-per-gbp": "published-source",
      "card-fee-bps": "published-source",
      "card-fee-fixed-pence": "published-source",
      "card-fee-eea-bps": "published-source",
      "dispute-fee-pence": "published-source",
      "dispute-rate-bps": "estimate",
      "partner-hourly-rate-pence": "owner",
      "partner-rate-yearly-increase-bps": "missing",
      "partner-pay-target-pence": "missing",
      "partner-minutes-per-shop-month": "estimate",
      "onboarding-minutes-per-shop": "estimate",
      "onboarding-amortisation-months": "proposal",
      "average-basket-pence": "estimate",
      "payouts-per-shop-month": "estimate",
      "reference-shops": "proposal",
      "reference-orders-per-shop": "proposal",
    });
  });

  it("has the owner's and the proposal values", () => {
    const v = (id: string) => ASSUMPTIONS.find((a) => a.id === id)!;
    expect(v("card-fee-bps").value).toBe(150);
    expect(v("card-fee-fixed-pence").value).toBe(20);
    expect(v("partner-hourly-rate-pence").value).toBe(2500);
    expect(v("partner-hourly-rate-pence").asOf).toBe("2026-10-28");
    expect(v("partner-rate-yearly-increase-bps").value).toBeNull();
    expect(v("partner-pay-target-pence").value).toBeNull();
    expect(v("onboarding-amortisation-months").value).toBe(12);
    expect(v("average-basket-pence").value).toBe(2500);
    expect(v("reference-shops").value).toBe(10);
    expect(v("reference-orders-per-shop").value).toBe(500);
  });

  it("basis, value and source agree", () => {
    for (const a of ASSUMPTIONS) {
      expect(a.basis === "missing", a.id).toBe(a.value === null);
      expect(a.sourceUrl !== null, a.id).toBe(a.basis === "published-source");
      expect(a.asOf).toMatch(DATE);
      if (a.value !== null) expect(Number.isInteger(a.value), a.id).toBe(true);
      if (a.basis === "published-source" && a.id !== "usd-cents-per-gbp") {
        expect(hostOf(a.sourceUrl!), a.id).toBe("stripe.com");
      }
    }
  });

  it("the exchange rate is published by a central bank or official statistics body", () => {
    const fx = ASSUMPTIONS.find((a) => a.id === "usd-cents-per-gbp")!;
    expect(fx.value).not.toBeNull();
    expect(hostOf(fx.sourceUrl!)).toMatch(/(bankofengland\.co\.uk|ecb\.europa\.eu|ons\.gov\.uk)$/);
  });

  it("the card fee equals the stripe-payments plan it is derived from", () => {
    const stripe = COMPETITORS.find((c) => c.id === "stripe-payments")!;
    for (const id of ["card-fee-bps", "card-fee-fixed-pence"] as const) {
      const a = ASSUMPTIONS.find((x) => x.id === id)!;
      expect(a.derivedFrom?.competitorId).toBe("stripe-payments");
      const plan = stripe.plans.find((p) => p.name === a.derivedFrom!.planName)!;
      expect(a.value).toBe(id === "card-fee-bps" ? plan.cardFee!.bps : plan.cardFee!.fixed.minor);
    }
  });

  it("exports the three scenario grids and no vendor-count grid", () => {
    expect(SCENARIO_SHOPS).toEqual([1, 5, 10, 25, 50, 100]);
    expect(SCENARIO_ORDERS).toEqual([100, 500, 2000]);
    expect(SCENARIO_BASKETS_PENCE).toEqual([1500, 2500, 4000]);
    expect("SCENARIO_VENDOR_COUNTS" in assumptionsModule).toBe(false);
    expect(
      readFileSync("lib/pricing/assumptions.ts", "utf8").match(/`basis: "proposal"`/g)?.length,
    ).toBe(3);
  });
});

describe("cost drivers (R3, R4)", () => {
  it("holds exactly the 17 drivers in their groups", () => {
    expect(Object.fromEntries(COST_DRIVERS.map((d) => [d.id, d.group]))).toEqual({
      "neon-production": "infrastructure",
      "neon-dev-staging": "infrastructure",
      "workers-requests": "infrastructure",
      "workers-cpu": "infrastructure",
      "r2-storage": "infrastructure",
      "r2-operations": "infrastructure",
      "workers-ai": "infrastructure",
      "email-transactional": "messaging",
      sms: "messaging",
      "error-tracking": "operations",
      "uptime-monitoring": "operations",
      backups: "operations",
      "company-formation": "business",
      accountant: "business",
      "ico-fee": "business",
      "insurance-public-liability": "business",
      "insurance-professional-indemnity": "business",
      "legal-templates": "business",
    });
  });

  it.each(COST_DRIVERS.map((d) => [d.id, d] as const))("%s is well formed", (_id, d) => {
    expect(d.fixed !== null || d.oneOff !== null || d.usage !== null).toBe(true);
    expect(d.asOf).toMatch(DATE);
    expect(d.asOf <= BUILD_DATE).toBe(true);
    expect(d.sourceUrl !== null).toBe(d.basis === "published-source");
    if (d.sourceUrl) expect(d.sourceUrl).toMatch(/^https:\/\//);
    for (const part of d.usage ?? []) {
      for (const n of [part.baseUnits, part.perShopUnits, part.perOrderUnits, part.freeUnits]) {
        expect(n >= 0).toBe(true);
      }
      expect(Number.isInteger(part.price.minor) && part.price.minor >= 0).toBe(true);
      expect(Number.isInteger(part.price.perUnits) && part.price.perUnits > 0).toBe(true);
    }
    if (d.usage) expect(d.note.toLowerCase()).toContain("estimate");
    if (d.basis === "estimate") expect(d.note.length).toBeGreaterThan(20);
  });

  it("publishes the infrastructure and email prices, Companies House's fee, and one-offs", () => {
    const by = (id: string) => COST_DRIVERS.find((d) => d.id === id)!;
    for (const d of COST_DRIVERS.filter((x) => x.group === "infrastructure")) {
      expect(d.basis, d.id).toBe("published-source");
    }
    expect(by("email-transactional").basis).toBe("published-source");
    expect(hostOf(by("company-formation").sourceUrl!)).toBe("gov.uk");
    for (const id of ["company-formation", "legal-templates"]) {
      expect(by(id).oneOff, id).not.toBeNull();
      expect(by(id).fixed, id).toBeNull();
    }
  });
});

describe("Stripe Connect (R5)", () => {
  it("holds the two options, one with no platform fee, read from stripe.com", () => {
    expect(CONNECT_OPTIONS.map((c) => c.id)).toEqual(["stripe-pricing", "platform-pricing"]);
    expect(CONNECT_OPTIONS[0].platformFee).toBeNull();
    expect(CONNECT_OPTIONS[1].platformFee).not.toBeNull();
    for (const c of CONNECT_OPTIONS) {
      expect(hostOf(c.sourceUrl)).toBe("stripe.com");
      expect(c.retrievedOn).toMatch(DATE);
      expect(c.stripeName.length).toBeGreaterThan(0);
    }
    expect(CONNECT_OPTIONS.map((c) => c.id)).toContain(CONNECT_MODELLED);
  });
});

describe("business models (R14, R15)", () => {
  it("holds the four volume-linked models, each priced in pence and a proposal", () => {
    expect(BUSINESS_MODELS.map((m) => m.id)).toEqual([
      "order-bands",
      "allowance-per-order",
      "capped-per-order",
      "customer-fee",
    ]);
    for (const m of BUSINESS_MODELS) {
      expect(m.pricing.kind).toBe(m.id);
      expect(m.status).toBe("proposal");
      expect(m.vatNote).toContain("VAT");
      expect(m.advantages.length && m.disadvantages.length && m.risks.length, m.id).toBeTruthy();
      const numbers = JSON.stringify(m.pricing).match(/-?\d+(\.\d+)?/g) ?? [];
      for (const n of numbers) expect(isMinor(Number(n)), `${m.id} ${n}`).toBe(true);
      expect(Object.keys(m.pricing).some((k) => /Bps$|percent|commission/i.test(k))).toBe(false);
    }
    const bands = BUSINESS_MODELS[0].pricing;
    expect(bands.kind === "order-bands" && bands.bands.length >= 3).toBe(true);
  });

  it("the v1 plans and analysis modules are gone", () => {
    expect(existsSync("lib/pricing/proposed-plans.ts")).toBe(false);
    expect(existsSync("lib/pricing/analysis.ts")).toBe(false);
  });

  it("compares against the seven agreed alternatives, each resolving to a real plan", () => {
    expect(COMPARATORS.map((c) => c.id)).toEqual([
      "shopify-basic",
      "shopify-grow",
      "square-free",
      "square-plus",
      "ecwid-starter",
      "uber-eats-self-delivery",
      "do-nothing",
    ]);
    for (const c of COMPARATORS) {
      if ("kind" in c.source) continue;
      expect(comparatorPlan(c.source), c.id).not.toBeNull();
    }
    const card = (id: string) => {
      const s = COMPARATORS.find((c) => c.id === id)!.source;
      return "kind" in s ? null : s.cardFees;
    };
    expect(card("ecwid-starter")).toBe("stripe-standard");
    expect(card("uber-eats-self-delivery")).toBe("included");
  });
});

describe("add-ons (R17)", () => {
  it("holds exactly the 12 add-ons, well formed", () => {
    expect(ADD_ONS.map((a) => a.id)).toEqual([
      "custom-domain",
      "ai-content",
      "catalogue-setup",
      "extra-staff-accounts",
      "sms-alerts",
      "marketing-emails",
      "loyalty",
      "driver-routing",
      "pos-stock-sync",
      "analytics-reports",
      "priority-support",
      "multi-branch",
    ]);
    const modelIds = BUSINESS_MODELS.map((m) => m.id as string);
    const bandLabels = BUSINESS_MODELS.flatMap((m) =>
      m.pricing.kind === "order-bands" ? m.pricing.bands.map((b) => b.label) : [],
    );
    for (const a of ADD_ONS) {
      expect(Number.isInteger(a.price.pence) && a.price.pence > 0, a.id).toBe(true);
      expect(isMinor(a.runCost.pence), a.id).toBe(true);
      expect(a.runCost.derivation.length, a.id).toBeGreaterThan(0);
      if (!a.available) expect(a.note.length, a.id).toBeGreaterThan(0);
      if (a.packaging !== "separate") {
        expect([...modelIds, ...bandLabels], a.id).toContain(a.packaging.includedIn);
      }
      if (a.runCost.driverId) {
        expect(
          COST_DRIVERS.map((d) => d.id),
          a.id,
        ).toContain(a.runCost.driverId);
      }
      expect(a.asOf).toMatch(DATE);
    }
    expect(ADD_ONS.find((a) => a.id === "catalogue-setup")!.price.billing).toBe("one-off");
  });
});

describe("risks (R19)", () => {
  it("includes every required risk, each well formed", () => {
    const ids = RISKS.map((r) => r.id);
    for (const id of [
      "vat-on-fees",
      "vat-registration-threshold",
      "weighed-items-substitutions",
      "allergen-information",
      "age-restricted-items",
      "domain-ownership",
      "customer-data-ownership",
      "delivery-liability",
      "out-of-hours-support",
      "refunds-and-disputes",
      "card-payments-merchant-of-record",
    ]) {
      expect(ids).toContain(id);
    }
    for (const r of RISKS) {
      expect(r.summary.length, r.id).toBeGreaterThan(0);
      expect(r.summary.length, r.id).toBeLessThanOrEqual(400);
      expect(r.action.length, r.id).toBeGreaterThan(0);
      expect(r.asOf).toMatch(DATE);
      if (r.sourceUrl) expect(r.sourceUrl).toMatch(/^https:\/\//);
      if (r.cost?.basis === "published-source") expect(r.cost.sourceUrl).toMatch(/^https:\/\//);
    }
    const by = (id: string) => RISKS.find((r) => r.id === id)!;
    expect(hostOf(by("vat-registration-threshold").sourceUrl!)).toBe("gov.uk");
    expect(by("vat-registration-threshold").summary).toContain("£90,000");
    expect(by("age-restricted-items").issues).toContain(1200);
    expect(by("card-payments-merchant-of-record").issues).toContain(1310);
    const modelled = CONNECT_OPTIONS.find((c) => c.id === CONNECT_MODELLED)!;
    expect(by("refunds-and-disputes").summary).toContain(modelled.stripeName);
    expect(by("refunds-and-disputes").summary).toMatch(/each shop is responsible/);
  });
});

describe("recommendation (R20)", () => {
  it("names a model, launch add-ons, a dated founding offer and three metrics", () => {
    const r = RECOMMENDATION;
    expect(BUSINESS_MODELS.map((m) => m.id)).toContain(r.modelId);
    expect(r.launchAddOnIds.length).toBeGreaterThan(0);
    for (const id of r.launchAddOnIds) expect(ADD_ONS.map((a) => a.id)).toContain(id);
    expect(r.foundingOffer.pricing.kind).toBe(r.modelId);
    expect(r.foundingOffer.shopName.length).toBeGreaterThan(0);
    expect(r.foundingOffer.reviewOn > r.foundingOffer.startsOn).toBe(true);
    expect(r.foundingOffer.reviewOn <= addDays(r.foundingOffer.startsOn, 365)).toBe(true);
    expect(r.foundingOffer.terms.length).toBeGreaterThan(0);
    expect(r.foundingOffer.reviewClause.length).toBeGreaterThan(0);
    expect(r.trackMonthly.map((t) => t.id)).toEqual([
      "cost-per-order",
      "partner-minutes-per-shop",
      "margin-per-shop",
    ]);
    for (const t of r.trackMonthly) {
      expect(t.definition.length && t.rePriceWhen.length, t.id).toBeTruthy();
    }
    expect(r.changeTriggers.length).toBeGreaterThan(0);
    expect(r.reasoning.length).toBeGreaterThan(0);
    expect(r.reviewedOn).toBe(BUILD_DATE);
    expect(r.nextReviewDue).toBe(addDays(r.reviewedOn, 92));
    expect(readFileSync("lib/pricing/business-models.ts", "utf8")).not.toMatch(/publicPrice/);
  });
});

describe("sources and dates (R37, structural)", () => {
  it("every published-source entry has an https source and a date", () => {
    const entries = [
      ...ASSUMPTIONS.filter((a) => a.basis === "published-source").map((a) => [
        a.sourceUrl,
        a.asOf,
      ]),
      ...COST_DRIVERS.filter((d) => d.basis === "published-source").map((d) => [
        d.sourceUrl,
        d.asOf,
      ]),
      ...CONNECT_OPTIONS.map((c) => [c.sourceUrl, c.retrievedOn]),
      ...COMPETITORS.flatMap((c) => c.plans.map((p) => [p.sourceUrl, p.retrievedOn])),
    ];
    for (const [url, date] of entries) {
      expect(url).toMatch(/^https:\/\//);
      expect(date).toMatch(DATE);
    }
  });
});
