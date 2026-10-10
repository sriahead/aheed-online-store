import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiMeter, describeAiBudgetRefusal, startOfUtcDay } from "@/lib/ai-meter";
import {
  DEFAULT_AI_DAILY_NEURON_BUDGET,
  getVendorAiDailyBudget,
  recordAiUsage,
  sumVendorMilliNeuronsSince,
} from "@/lib/repositories/ai-usage";

/**
 * #1017 — the per-vendor AI meter and its ledger, against a stubbed Prisma client. What matters:
 * the day boundary is Cloudflare's (UTC), a budget refuses at — not after — its figure, a database
 * fault refuses rather than spends, and a ledger fault never fails the feature that already spent.
 * The same code is proved against the real dev database in this slice's build notes.
 */

function fakePrisma(
  opts: {
    milliNeurons?: number | null;
    budget?: number | null;
    sumRejects?: boolean;
    createRejects?: boolean;
  } = {},
) {
  const aiUsageEvent = {
    create: vi.fn(async () => {
      if (opts.createRejects) throw new Error("write failed");
      return {};
    }),
    deleteMany: vi.fn(async () => ({ count: 0 })),
    aggregate: vi.fn(async () => {
      if (opts.sumRejects) throw new Error("read failed");
      return { _sum: { milliNeurons: opts.milliNeurons ?? null } };
    }),
  };
  const vendorConfig = {
    findUnique: vi.fn(async () =>
      opts.budget === null ? null : { aiDailyNeuronBudget: opts.budget ?? 3000 },
    ),
  };
  return { aiUsageEvent, vendorConfig } as unknown as Parameters<typeof createAiMeter>[0] & {
    aiUsageEvent: typeof aiUsageEvent;
    vendorConfig: typeof vendorConfig;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("startOfUtcDay (R23)", () => {
  it("uses the UTC day, not the local one, at both edges of a BST day", () => {
    expect(startOfUtcDay(new Date("2026-10-10T23:59:59.999+01:00")).toISOString()).toBe(
      "2026-10-10T00:00:00.000Z",
    );
    expect(startOfUtcDay(new Date("2026-10-11T00:30:00+01:00")).toISOString()).toBe(
      "2026-10-10T00:00:00.000Z",
    );
  });
});

describe("check() (R24)", () => {
  it("allows a vendor under its budget, reading today's spend in neurons", async () => {
    const prisma = fakePrisma({ milliNeurons: 2_999_500, budget: 3000 });
    const check = await createAiMeter(prisma, "v1", "LIST_NORMALISATION").check();

    expect(check).toEqual({ allowed: true, usedNeurons: 2999.5, budgetNeurons: 3000 });
    const where = (
      prisma.aiUsageEvent.aggregate.mock.calls[0] as unknown as [
        { where: { vendorId: string; createdAt: { gte: Date } } },
      ]
    )[0].where;
    expect(where.vendorId).toBe("v1");
    expect(where.createdAt.gte.toISOString()).toBe(startOfUtcDay(new Date()).toISOString());
  });

  it("refuses a vendor exactly at its budget", async () => {
    const prisma = fakePrisma({ milliNeurons: 3_000_000, budget: 3000 });
    expect((await createAiMeter(prisma, "v1", "LIST_NORMALISATION").check()).allowed).toBe(false);
  });

  it("always refuses a budget of 0", async () => {
    const prisma = fakePrisma({ milliNeurons: null, budget: 0 });
    expect(await createAiMeter(prisma, "v1", "LIST_NORMALISATION").check()).toEqual({
      allowed: false,
      usedNeurons: 0,
      budgetNeurons: 0,
    });
  });

  it("fails closed, without throwing, when the database read rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const prisma = fakePrisma({ sumRejects: true });
    await expect(createAiMeter(prisma, "v1", "SEARCH_SYNONYMS").check()).resolves.toMatchObject({
      allowed: false,
    });
  });
});

describe("record() and recordImage() (R25)", () => {
  it("writes one row for the meter's vendor and feature, neurons x1000 rounded up", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const prisma = fakePrisma();
    await createAiMeter(prisma, "v1", "SEARCH_SYNONYMS").record({
      model: "@cf/meta/llama-3.1-8b-instruct",
      usage: { inputTokens: 45, outputTokens: 7, neurons: 0.4294 },
    });

    expect(prisma.aiUsageEvent.create).toHaveBeenCalledExactlyOnceWith({
      data: {
        vendorId: "v1",
        feature: "SEARCH_SYNONYMS",
        model: "@cf/meta/llama-3.1-8b-instruct",
        inputTokens: 45,
        outputTokens: 7,
        milliNeurons: 430,
        neuronSource: "REPORTED",
      },
    });
  });

  it("charges an image its table figure, and an unlisted image model the highest figure", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const prisma = fakePrisma();
    const meter = createAiMeter(prisma, "v1", "CAMPAIGN_IMAGE");
    await meter.recordImage({ model: "@cf/black-forest-labs/flux-1-schnell" });
    await meter.recordImage({ model: "@cf/unknown/image-model" });

    const rows = prisma.aiUsageEvent.create.mock.calls.map(
      (call) => (call as unknown as [{ data: { milliNeurons: number; neuronSource: string } }])[0],
    );
    expect(rows.map((row) => row.data.milliNeurons)).toEqual([57600, 57600]);
    expect(rows.every((row) => row.data.neuronSource === "ESTIMATED")).toBe(true);
  });

  it("never throws when the ledger write rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const prisma = fakePrisma({ createRejects: true });
    const meter = createAiMeter(prisma, "v1", "PRODUCT_IMAGE");
    await expect(
      meter.record({
        model: "@cf/meta/llama-3.1-8b-instruct",
        usage: { inputTokens: 1, outputTokens: 1, neurons: null },
      }),
    ).resolves.toBeUndefined();
    await expect(
      meter.recordImage({ model: "@cf/black-forest-labs/flux-1-schnell" }),
    ).resolves.toBeUndefined();
  });
});

describe("describeAiBudgetRefusal (R26)", () => {
  it("states the store's spend and budget in whole neurons, and when it resets", () => {
    expect(describeAiBudgetRefusal({ usedNeurons: 3012.4, budgetNeurons: 3000 })).toBe(
      "This store has used its AI allowance for today (3,013 of 3,000 neurons). It resets at 00:00 UTC.",
    );
  });
});

describe("the ledger repository (R20, R21)", () => {
  it("falls back to the platform default when the vendor has no VendorConfig row", async () => {
    expect(await getVendorAiDailyBudget(fakePrisma({ budget: null }), "v1")).toBe(
      DEFAULT_AI_DAILY_NEURON_BUDGET,
    );
    expect(DEFAULT_AI_DAILY_NEURON_BUDGET).toBe(3000);
  });

  it("sums to 0 when the vendor has no rows", async () => {
    expect(
      await sumVendorMilliNeuronsSince(fakePrisma({ milliNeurons: null }), "v1", new Date()),
    ).toBe(0);
  });

  it("rounds fractional neurons UP into milli-neurons", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const prisma = fakePrisma();
    await recordAiUsage(prisma, "v1", {
      feature: "NET_CONTENT",
      model: "m",
      inputTokens: null,
      outputTokens: null,
      neurons: 4.0001,
      neuronSource: "ESTIMATED",
    });
    expect(
      (
        prisma.aiUsageEvent.create.mock.calls[0] as unknown as [{ data: { milliNeurons: number } }]
      )[0].data.milliNeurons,
    ).toBe(4001);
  });

  it("sweeps rows older than 90 days only when the low-probability draw hits", async () => {
    const entry = {
      feature: "NET_CONTENT" as const,
      model: "m",
      inputTokens: null,
      outputTokens: null,
      neurons: 1,
      neuronSource: "ESTIMATED" as const,
    };
    const prisma = fakePrisma();

    vi.spyOn(Math, "random").mockReturnValue(0.5);
    await recordAiUsage(prisma, "v1", entry);
    expect(prisma.aiUsageEvent.deleteMany).not.toHaveBeenCalled();

    vi.spyOn(Math, "random").mockReturnValue(0.001);
    const before = Date.now();
    await recordAiUsage(prisma, "v1", entry);
    const cutoff = (
      prisma.aiUsageEvent.deleteMany.mock.calls[0] as unknown as [
        { where: { createdAt: { lt: Date } } },
      ]
    )[0].where.createdAt.lt.getTime();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    expect(Math.abs(before - ninetyDays - cutoff)).toBeLessThan(5000);
  });
});
