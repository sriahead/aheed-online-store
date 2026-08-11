import { describe, expect, it } from "vitest";
import {
  computeCodeDiscountPence,
  evaluateCode,
  normaliseCode,
  refusalMessage,
  type CodeRefusalReason,
  type EvaluateCodeInput,
} from "@/lib/discounts";
import { MIN_PAYABLE_PENCE } from "@/lib/loyalty";

/**
 * P5b (#145) — pure discount-code rules. No database, no request context: every
 * case here runs on arithmetic and dates alone (R1).
 */

const NOW = new Date("2026-08-11T12:00:00.000Z");
const PAST = new Date("2026-01-01T00:00:00.000Z");
const FUTURE = new Date("2027-01-01T00:00:00.000Z");

/** A code that applies cleanly, which each test then breaks in exactly one way. */
function code(overrides: Partial<EvaluateCodeInput> = {}): EvaluateCodeInput {
  return {
    kind: "PERCENTAGE",
    value: 1000,
    minSubtotalPence: 0,
    startsAt: PAST,
    endsAt: null,
    remainingRedemptions: null,
    maxPerCustomer: null,
    isActive: true,
    subtotalPence: 2000,
    deliveryFeePence: 300,
    userId: "user-1",
    customerUseCount: 0,
    now: NOW,
    ...overrides,
  };
}

/** Deterministic PRNG so a failing property case is reproducible. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("normaliseCode (R4)", () => {
  it("trims and uppercases", () => {
    expect(normaliseCode(" welcome10 ")).toBe("WELCOME10");
    expect(normaliseCode("Welcome10")).toBe("WELCOME10");
    expect(normaliseCode("   ")).toBe("");
    expect(normaliseCode("")).toBe("");
  });
});

describe("computeCodeDiscountPence (R5, R6)", () => {
  it("floors a percentage of the subtotal, in basis points (R5)", () => {
    const pct = (subtotalPence: number, value: number) =>
      computeCodeDiscountPence({ kind: "PERCENTAGE", value, subtotalPence });

    expect(pct(1000, 1000)).toBe(100);
    expect(pct(1999, 1000)).toBe(199);
    expect(pct(1000, 2500)).toBe(250);
    // 999 * 3333 / 10000 = 332.9667 — flooring, not rounding.
    expect(pct(999, 3333)).toBe(332);
  });

  it("returns a fixed amount unchanged, before clamping (R6)", () => {
    const fixed = (subtotalPence: number, value: number) =>
      computeCodeDiscountPence({ kind: "FIXED_AMOUNT", value, subtotalPence });

    expect(fixed(10000, 500)).toBe(500);
    // Larger than the basket: clamping is evaluateCode's job, not this function's.
    expect(fixed(200, 500)).toBe(500);
  });
});

describe("evaluateCode refusals (R7, R8, R9)", () => {
  it("returns the reason matching each condition (R7)", () => {
    const cases: [Partial<EvaluateCodeInput>, CodeRefusalReason][] = [
      [{ isActive: false }, "INACTIVE"],
      [{ startsAt: FUTURE }, "NOT_STARTED"],
      [{ endsAt: PAST }, "EXPIRED"],
      [{ minSubtotalPence: 5000 }, "BELOW_MINIMUM"],
      [{ remainingRedemptions: 0 }, "USAGE_LIMIT_REACHED"],
      [{ maxPerCustomer: 1, userId: null }, "SIGN_IN_REQUIRED"],
      [{ maxPerCustomer: 1, customerUseCount: 1 }, "CUSTOMER_LIMIT_REACHED"],
    ];
    for (const [overrides, reason] of cases) {
      expect(evaluateCode(code(overrides))).toEqual({ ok: false, reason });
    }
  });

  it("treats the window and minimum boundaries as inclusive (R8)", () => {
    expect(evaluateCode(code({ startsAt: NOW })).ok).toBe(true);
    expect(evaluateCode(code({ endsAt: NOW })).ok).toBe(true);
    expect(evaluateCode(code({ minSubtotalPence: 2000, subtotalPence: 2000 })).ok).toBe(true);
  });

  it("never produces a nullable field's refusal when that field is null (R9)", () => {
    const random = makeRandom(7);
    for (let i = 0; i < 100; i++) {
      const result = evaluateCode(
        code({
          subtotalPence: Math.floor(random() * 20000),
          deliveryFeePence: Math.floor(random() * 500),
          customerUseCount: Math.floor(random() * 5),
          userId: random() < 0.5 ? null : "user-1",
          endsAt: null,
          remainingRedemptions: null,
          maxPerCustomer: null,
        }),
      );
      if (!result.ok) {
        expect(result.reason).not.toBe("EXPIRED");
        expect(result.reason).not.toBe("USAGE_LIMIT_REACHED");
        expect(result.reason).not.toBe("SIGN_IN_REQUIRED");
        expect(result.reason).not.toBe("CUSTOMER_LIMIT_REACHED");
      }
    }
  });
});

describe("evaluateCode refusal precedence (R10)", () => {
  it("reports the first applicable reason in the stated order", () => {
    // Every refusal condition holds at once; each step removes the reported one.
    const all = code({
      isActive: false,
      startsAt: FUTURE,
      endsAt: PAST,
      remainingRedemptions: 0,
      maxPerCustomer: 1,
      userId: null,
      customerUseCount: 5,
      minSubtotalPence: 999999,
      subtotalPence: 0,
      deliveryFeePence: 0,
    });

    expect(evaluateCode(all)).toEqual({ ok: false, reason: "INACTIVE" });

    const active = { ...all, isActive: true };
    expect(evaluateCode(active)).toEqual({ ok: false, reason: "NOT_STARTED" });

    const started = { ...active, startsAt: PAST };
    expect(evaluateCode(started)).toEqual({ ok: false, reason: "EXPIRED" });

    const live = { ...started, endsAt: null };
    expect(evaluateCode(live)).toEqual({ ok: false, reason: "USAGE_LIMIT_REACHED" });

    const stocked = { ...live, remainingRedemptions: 5 };
    expect(evaluateCode(stocked)).toEqual({ ok: false, reason: "SIGN_IN_REQUIRED" });

    const identified = { ...stocked, userId: "user-1" };
    expect(evaluateCode(identified)).toEqual({ ok: false, reason: "CUSTOMER_LIMIT_REACHED" });

    const withinCap = { ...identified, customerUseCount: 0 };
    expect(evaluateCode(withinCap)).toEqual({ ok: false, reason: "BELOW_MINIMUM" });

    // Minimum cleared, but a £0 basket leaves no headroom for the discount.
    const noHeadroom = {
      ...withinCap,
      minSubtotalPence: 0,
      kind: "FIXED_AMOUNT" as const,
      value: 500,
    };
    expect(evaluateCode(noHeadroom)).toEqual({ ok: false, reason: "NO_HEADROOM" });
  });
});

describe("evaluateCode clamping (R11, R12)", () => {
  it("never exceeds the goods or breaches the payable floor (R11)", () => {
    const random = makeRandom(42);
    let successes = 0;

    for (let i = 0; i < 250; i++) {
      const subtotalPence = Math.floor(random() * 10000);
      const deliveryFeePence = Math.floor(random() * 500);
      const input = code({
        kind: random() < 0.5 ? "PERCENTAGE" : "FIXED_AMOUNT",
        value: Math.max(1, Math.floor(random() * 10000)),
        subtotalPence,
        deliveryFeePence,
      });

      const result = evaluateCode(input);
      if (!result.ok) continue;
      successes++;

      expect(result.discountPence).toBeGreaterThanOrEqual(1);
      expect(result.discountPence).toBeLessThanOrEqual(subtotalPence);
      expect(subtotalPence + deliveryFeePence - result.discountPence).toBeGreaterThanOrEqual(
        MIN_PAYABLE_PENCE,
      );
    }

    // Guards against the assertions above passing vacuously.
    expect(successes).toBeGreaterThan(50);
  });

  it("refuses rather than returning a zero discount (R12)", () => {
    expect(
      evaluateCode(
        code({ kind: "FIXED_AMOUNT", value: 500, subtotalPence: 0, deliveryFeePence: 0 }),
      ),
    ).toEqual({ ok: false, reason: "NO_HEADROOM" });
  });

  it("leaves exactly the floor payable when the code would cover everything", () => {
    const result = evaluateCode(
      code({ kind: "FIXED_AMOUNT", value: 100000, subtotalPence: 1000, deliveryFeePence: 0 }),
    );
    expect(result).toEqual({ ok: true, discountPence: 1000 - MIN_PAYABLE_PENCE });
  });
});

describe("refusalMessage (R2)", () => {
  it("has distinct copy for every reason", () => {
    const reasons: CodeRefusalReason[] = [
      "UNKNOWN",
      "INACTIVE",
      "NOT_STARTED",
      "EXPIRED",
      "BELOW_MINIMUM",
      "USAGE_LIMIT_REACHED",
      "CUSTOMER_LIMIT_REACHED",
      "SIGN_IN_REQUIRED",
      "NO_HEADROOM",
    ];
    const messages = reasons.map(refusalMessage);
    expect(new Set(messages).size).toBe(reasons.length);
    for (const message of messages) expect(message.length).toBeGreaterThan(0);
  });
});
