import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunSummary } from "@/lib/net-content-run";

/**
 * #927 — the "Suggest net content" button's service wiring (R1, R3-R5) and its inline messages
 * (R6). Every side effect is mocked: `lib/db` imports `@prisma/client/wasm`, which plain Node
 * cannot load, and no test here may call Workers AI or a bucket.
 */

const mocks = vi.hoisted(() => ({
  aiEnv: { NET_CONTENT_AI_MODEL: undefined as string | undefined },
  listEligible: vi.fn(),
  createSuggestion: vi.fn(),
  getVendorConfig: vi.fn(),
  runLoop: vi.fn(),
  createSuggester: vi.fn(),
  headObject: vi.fn(),
  getObject: vi.fn(),
}));

vi.mock("@/lib/config", () => ({ getAiEnv: () => mocks.aiEnv }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ tag: "http" }), getPrismaWs: () => ({}) }));
vi.mock("@/lib/repositories/net-content-suggestions", () => ({
  listEligibleProductsForNetContent: mocks.listEligible,
  createNetContentSuggestion: mocks.createSuggestion,
  listNetContentSummaryRows: vi.fn(),
  listPendingNetContentSuggestions: vi.fn(),
  rejectNetContentSuggestion: vi.fn(),
  reviewNetContentSuggestion: vi.fn(),
}));
vi.mock("@/lib/repositories/vendor", () => ({ getVendorConfig: mocks.getVendorConfig }));
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({ headObject: mocks.headObject, getObject: mocks.getObject }),
}));
vi.mock("@/lib/net-content-run", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/net-content-run")>()),
  runNetContentSuggestions: mocks.runLoop,
}));
vi.mock("@/lib/net-content-suggester", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/net-content-suggester")>()),
  createWorkersAiNetContentSuggester: mocks.createSuggester,
}));

import {
  runNetContentSuggestionsForVendor,
  STAFF_RUN_NEURON_BUDGET,
  STAFF_RUN_PRODUCT_LIMIT,
} from "@/lib/net-content-suggestions-service";
import { NET_CONTENT_MODEL_RATES } from "@/lib/net-content-run";
import { DEFAULT_NET_CONTENT_MODEL } from "@/lib/net-content-suggester";
import { describeStaffNetContentRun } from "@/lib/net-content-review-form";

// No pack size in its name and no per-kg label, so the #697 rule step leaves it for the model.
const product = {
  id: "p1",
  name: "Basmati Rice",
  unitLabel: "£8.99",
  basePrice: 899,
  images: [],
};

function summary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    outcome: "completed",
    attempted: 10,
    pending: 8,
    noAnswer: 2,
    failed: 0,
    inputTokens: 4000,
    outputTokens: 400,
    neurons: 49.9,
    neuronsIncomplete: false,
    meanLatencyMs: 1200,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.aiEnv.NET_CONTENT_AI_MODEL = undefined;
  mocks.listEligible.mockResolvedValue([product]);
  mocks.getVendorConfig.mockResolvedValue({ storeDescription: "A UK grocer" });
  mocks.createSuggester.mockReturnValue({ model: DEFAULT_NET_CONTENT_MODEL, suggest: vi.fn() });
  mocks.runLoop.mockResolvedValue(summary());
});

describe("per-click bounds (R1)", () => {
  it("pins 10 products and 150 neurons", () => {
    expect(STAFF_RUN_PRODUCT_LIMIT).toBe(10);
    expect(STAFF_RUN_NEURON_BUDGET).toBe(150);
  });
});

describe("runNetContentSuggestionsForVendor", () => {
  it("refuses a model with no rate before listing products or calling the model (R3)", async () => {
    mocks.aiEnv.NET_CONTENT_AI_MODEL = "@cf/unpriced/model";
    const result = await runNetContentSuggestionsForVendor("v1");
    expect(result).toEqual({ kind: "unpriced-model", model: "@cf/unpriced/model" });
    // Only the free #697 rule step listed products (limit 500); the model's list (10) never ran.
    expect(mocks.listEligible).toHaveBeenCalledTimes(1);
    expect(mocks.listEligible.mock.calls[0][3]).toBe(500);
    expect(mocks.createSuggester).not.toHaveBeenCalled();
    expect(mocks.runLoop).not.toHaveBeenCalled();
  });

  it("returns nothing-eligible without calling the model (R4)", async () => {
    mocks.listEligible.mockResolvedValue([]);
    const result = await runNetContentSuggestionsForVendor("v1");
    expect(result).toEqual({ kind: "nothing-eligible" });
    expect(mocks.listEligible).toHaveBeenCalledWith(
      expect.anything(),
      "v1",
      { includeAttempted: false },
      10,
    );
    expect(mocks.runLoop).not.toHaveBeenCalled();
  });

  it("runs the loop once with the click's budget, the model's rate and the vendor's description (R5)", async () => {
    const result = await runNetContentSuggestionsForVendor("v1");
    expect(result).toEqual({ kind: "ran", summary: summary() });
    expect(mocks.runLoop).toHaveBeenCalledTimes(1);
    const deps = mocks.runLoop.mock.calls[0][0];
    expect(deps.products).toEqual([product]);
    expect(deps.neuronBudget).toBe(150);
    expect(deps.rate).toBe(NET_CONTENT_MODEL_RATES[DEFAULT_NET_CONTENT_MODEL]);
    expect(deps.storeDescription).toBe("A UK grocer");
    expect(mocks.createSuggester).toHaveBeenCalledWith(DEFAULT_NET_CONTENT_MODEL);

    const input = { productId: "p1" };
    await deps.saveSuggestion(input);
    expect(mocks.createSuggestion).toHaveBeenCalledWith(expect.anything(), "v1", input);
  });

  it("passes a null description when the vendor has no config (R5)", async () => {
    mocks.getVendorConfig.mockResolvedValue(null);
    await runNetContentSuggestionsForVendor("v1");
    expect(mocks.runLoop.mock.calls[0][0].storeDescription).toBeNull();
  });

  it("loads a photo's bytes from storage, and null when the object is missing (R5)", async () => {
    await runNetContentSuggestionsForVendor("v1");
    const { loadPhoto } = mocks.runLoop.mock.calls[0][0];
    const image = {
      id: "i1",
      storageKey: "products/p1/a.webp",
      sortOrder: 0,
      source: "STAFF_UPLOAD",
    };

    mocks.headObject.mockResolvedValue({ contentType: "image/jpeg" });
    mocks.getObject.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    const photo = await loadPhoto(image);
    expect(mocks.getObject).toHaveBeenCalledWith("products/p1/a.webp");
    expect(photo.contentType).toBe("image/jpeg");
    expect(Array.from(photo.bytes)).toEqual([1, 2, 3]);

    mocks.getObject.mockResolvedValue(null);
    expect(await loadPhoto(image)).toBeNull();
  });

  it("maps the loop's outcomes (R5)", async () => {
    mocks.runLoop.mockResolvedValue(summary({ outcome: "not-configured", attempted: 0 }));
    expect(await runNetContentSuggestionsForVendor("v1")).toEqual({ kind: "not-configured" });

    const budget = summary({ outcome: "budget-reached" });
    mocks.runLoop.mockResolvedValue(budget);
    expect(await runNetContentSuggestionsForVendor("v1")).toEqual({ kind: "ran", summary: budget });
  });
});

describe("describeStaffNetContentRun (R6)", () => {
  it("unpriced model", () => {
    expect(describeStaffNetContentRun({ kind: "unpriced-model", model: "@cf/x/y" })).toEqual({
      error:
        "The AI model @cf/x/y has no cost rate, so it can't be run from here. Nothing was asked.",
      notice: null,
    });
  });

  it("nothing eligible", () => {
    expect(describeStaffNetContentRun({ kind: "nothing-eligible" })).toEqual({
      error: null,
      notice: "No products are waiting for a net-content suggestion.",
    });
  });

  it("not configured", () => {
    expect(describeStaffNetContentRun({ kind: "not-configured" })).toEqual({
      error: "The AI isn't set up for this store, so nothing was asked.",
      notice: null,
    });
  });

  it("completed, rounding neurons", () => {
    expect(describeStaffNetContentRun({ kind: "ran", summary: summary() })).toEqual({
      error: null,
      notice: "Asked about 10 product(s): 8 suggested, 2 no answer, 0 failed (about 50 neurons).",
    });
  });

  it("budget reached", () => {
    const result = describeStaffNetContentRun({
      kind: "ran",
      summary: summary({
        outcome: "budget-reached",
        attempted: 3,
        pending: 3,
        noAnswer: 0,
        neurons: 151,
      }),
    });
    expect(result).toEqual({
      error: null,
      notice:
        "Asked about 3 product(s): 3 suggested, 0 no answer, 0 failed (about 151 neurons). Stopped at this click's AI budget; click again for more.",
    });
  });

  it("transport errors", () => {
    const result = describeStaffNetContentRun({
      kind: "ran",
      summary: summary({
        outcome: "transport-errors",
        attempted: 3,
        pending: 0,
        noAnswer: 0,
        failed: 3,
      }),
    });
    expect(result).toEqual({
      error:
        "The AI stopped responding. Asked about 3 product(s): 0 suggested, 0 no answer, 3 failed. Try again later.",
      notice: null,
    });
  });
});

describe("#697 rule step (no AI)", () => {
  const sized = {
    id: "p2",
    name: "Squid Block – 2kg",
    unitLabel: "£17.99",
    basePrice: 1799,
    images: [],
  };
  const perKg = {
    id: "p3",
    name: "Barracuda",
    unitLabel: "£6.49 / kg",
    basePrice: 649,
    images: [],
  };
  const range = {
    id: "p4",
    name: "Tilapia 500–800g",
    unitLabel: "£10.99",
    basePrice: 1099,
    images: [],
  };

  it("queues a PENDING rule suggestion for each product the rules can read, before the model", async () => {
    mocks.listEligible.mockResolvedValueOnce([sized, perKg, range, product]);
    const result = await runNetContentSuggestionsForVendor("v1");

    expect(result).toEqual({ kind: "ran", summary: summary(), ruled: 2 });
    expect(mocks.createSuggestion).toHaveBeenCalledTimes(2);
    const [first, second] = mocks.createSuggestion.mock.calls.map((call) => call[2]);
    expect(first).toMatchObject({
      productId: "p2",
      model: "rules (no AI)",
      productImageId: null,
      value: { amount: 2, unit: "KILOGRAM", evidenceSource: "NAME", evidenceText: "2kg" },
    });
    expect(second).toMatchObject({
      productId: "p3",
      value: {
        amount: 1,
        unit: "KILOGRAM",
        evidenceSource: "UNIT_LABEL",
        unitLabelCheck: "AGREES",
      },
    });
    // The rule step ran first, then the model's own (10-product) list.
    expect(mocks.listEligible.mock.calls.map((call) => call[3])).toEqual([500, 10]);
  });

  it("never treats a range as a fixed pack size", async () => {
    mocks.listEligible.mockResolvedValueOnce([range]);
    const result = await runNetContentSuggestionsForVendor("v1");
    expect(mocks.createSuggestion).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("ruled");
  });

  it("leads the message with the rule count, and folds a model refusal into it", () => {
    expect(describeStaffNetContentRun({ kind: "nothing-eligible", ruled: 3 })).toEqual({
      error: null,
      notice:
        "Read 3 pack size(s) from product names and per-kg prices, without AI; they are in the queue below. No other products were waiting for the AI.",
    });
    const refused = describeStaffNetContentRun({ kind: "not-configured", ruled: 1 });
    expect(refused.error).toBeNull();
    expect(refused.notice).toContain("Read 1 pack size(s)");
    expect(refused.notice).toContain("The AI step did not run: The AI isn't set up");
  });
});
