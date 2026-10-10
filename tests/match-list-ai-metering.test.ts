import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalisationResult } from "@/lib/list-normalisation";

/**
 * #1016/#1017 — what `/shop-your-list`'s AI pre-pass does around the model call: the vendor's daily
 * budget is consulted before the throttle, the call is charged to the vendor, and the three
 * degradations a withdrawn or mis-set model produces become an ErrorEvent — while the shopper sees
 * exactly the deterministic match either way.
 *
 * `normaliseList` itself is covered in tests/list-normalisation.test.ts; here it is stubbed so each
 * degradation reason can be produced directly.
 */

const order: string[] = [];

const normaliseList = vi.fn<() => Promise<NormalisationResult>>();
const isNormalisationConfigured = vi.fn(() => true);
const check = vi.fn(async () => {
  order.push("meter.check");
  return { allowed: true, usedNeurons: 0, budgetNeurons: 3000 };
});
const record = vi.fn(async () => {});
const checkListNormalisationAllowed = vi.fn(async () => {
  order.push("rate-limit");
  return { allowed: true };
});
const recordErrorEvent = vi.fn(async () => {});

vi.mock("@/lib/list-normalisation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/list-normalisation")>();
  return {
    ...actual,
    isNormalisationConfigured: () => {
      order.push("configured");
      return isNormalisationConfigured();
    },
    normaliseList: (...args: unknown[]) => {
      order.push("normaliseList");
      return (normaliseList as unknown as (...a: unknown[]) => Promise<NormalisationResult>)(
        ...args,
      );
    },
  };
});
vi.mock("@/lib/ai-meter-service", () => ({
  getCurrentAiMeter: vi.fn(async () => ({ check, record, recordImage: vi.fn() })),
}));
vi.mock("@/lib/list-normalisation-service", () => ({ checkListNormalisationAllowed }));
vi.mock("@/lib/error-events-service", () => ({ recordHandledErrorEvent: recordErrorEvent }));
vi.mock("@/lib/vendor-service", () => ({
  getCurrentVendorProfile: vi.fn(async () => ({ storeDescription: null })),
}));
vi.mock("@/lib/products-service", () => ({
  getProductRepository: () => ({
    matchListTerms: vi.fn(async () => []),
    synonymAliasMap: vi.fn(async () => new Map()),
  }),
}));

const { matchList } = await import("@/features/cart/match-list");

const MODEL = "@cf/meta/llama-3.1-8b-instruct";
const USAGE = { inputTokens: 120, outputTokens: 40, neurons: 1.5 };

function submit(list = "2kg atta\ndhania") {
  const form = new FormData();
  form.set("list", list);
  return matchList({ lines: null }, form);
}

function degraded(
  reason: Extract<NormalisationResult, { kind: "degraded" }>["reason"],
  extra: { status?: number; usage?: typeof USAGE } = {},
): NormalisationResult {
  return { kind: "degraded", model: MODEL, reason, ...extra };
}

beforeEach(() => {
  order.length = 0;
  vi.clearAllMocks();
  isNormalisationConfigured.mockReturnValue(true);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the vendor's AI budget on /shop-your-list (#1017 R27)", () => {
  it("checks the budget after the free checks and before the throttle", async () => {
    normaliseList.mockResolvedValue({ kind: "ok", model: MODEL, items: [], usage: USAGE });
    await submit();
    expect(order).toEqual(["configured", "meter.check", "rate-limit", "normaliseList"]);
  });

  it("over budget: no model call, no throttle slot spent, skip logged as over-budget", async () => {
    check.mockResolvedValueOnce({ allowed: false, usedNeurons: 3000, budgetNeurons: 3000 });
    const result = await submit();

    expect(normaliseList).not.toHaveBeenCalled();
    expect(checkListNormalisationAllowed).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("reason=over-budget"));
    expect(result.lines).toHaveLength(2);
    expect(recordErrorEvent).not.toHaveBeenCalled();
  });

  it("charges the vendor once for a call that carried usage", async () => {
    normaliseList.mockResolvedValue({ kind: "ok", model: MODEL, items: [], usage: USAGE });
    await submit();
    expect(record).toHaveBeenCalledExactlyOnceWith({ model: MODEL, usage: USAGE });
  });

  it("charges a billed-but-useless reply too", async () => {
    normaliseList.mockResolvedValue(degraded("unparseable", { usage: USAGE }));
    await submit();
    expect(record).toHaveBeenCalledExactlyOnceWith({ model: MODEL, usage: USAGE });
  });
});

describe("a dated degradation signal (#1016 R12-R15)", () => {
  it.each([
    ["http", degraded("http", { status: 400 }), ["http", MODEL, "400"]],
    ["unreadable", degraded("unreadable"), ["unreadable", MODEL]],
    ["unparseable", degraded("unparseable", { usage: USAGE }), ["unparseable", MODEL]],
  ] as const)("writes exactly one ErrorEvent for %s", async (_name, result, fragments) => {
    normaliseList.mockResolvedValue(result);
    await submit();

    expect(recordErrorEvent).toHaveBeenCalledOnce();
    const row = (recordErrorEvent.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(row).toMatchObject({
      path: "/shop-your-list",
      method: "POST",
      routerKind: "App Router",
      routeType: "action",
      stack: null,
      digest: null,
    });
    for (const fragment of fragments) expect(row.message).toContain(fragment);
  });

  it.each(["timeout", "network", "not-configured", "over-input-cap"] as const)(
    "writes no ErrorEvent for %s",
    async (reason) => {
      normaliseList.mockResolvedValue(degraded(reason));
      await submit();
      expect(recordErrorEvent).not.toHaveBeenCalled();
    },
  );

  it("writes no ErrorEvent when the throttle refuses", async () => {
    checkListNormalisationAllowed.mockResolvedValueOnce({ allowed: false });
    await submit();
    expect(recordErrorEvent).not.toHaveBeenCalled();
  });

  it("still answers the shopper when the ErrorEvent write itself rejects (R14)", async () => {
    recordErrorEvent.mockRejectedValueOnce(new Error("db down"));
    normaliseList.mockResolvedValue(degraded("http", { status: 404 }));
    await expect(submit()).resolves.toMatchObject({ lines: expect.any(Array) });
  });

  it("gives the shopper the same lines for any degradation as with no AI at all (R15)", async () => {
    isNormalisationConfigured.mockReturnValue(false);
    const withoutAi = await submit();

    isNormalisationConfigured.mockReturnValue(true);
    normaliseList.mockResolvedValue(degraded("http", { status: 400 }));
    const afterHttp = await submit();

    normaliseList.mockResolvedValue(degraded("timeout"));
    const afterTimeout = await submit();

    expect(afterHttp.lines).toEqual(withoutAi.lines);
    expect(afterTimeout.lines).toEqual(withoutAi.lines);
  });
});
