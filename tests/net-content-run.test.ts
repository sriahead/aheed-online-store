import { describe, expect, it, vi } from "vitest";
import {
  MAX_CONSECUTIVE_TRANSPORT_ERRORS,
  NET_CONTENT_MODEL_RATES,
  neuronsForCall,
  runNetContentSuggestions,
  type RunDependencies,
  type RunProduct,
} from "@/lib/net-content-run";
import type { NetContentSuggester, SuggesterResult } from "@/lib/net-content-suggester";

/**
 * #900 (R15, R16) — the run loop's stop rules, with a stubbed suggester and store. What matters
 * is what gets WRITTEN: a missing credential or a transport fault must write nothing, and the
 * budget and error limits must stop new calls.
 */

const rice: RunProduct = {
  id: "p-rice",
  name: "Basmati Rice 5kg",
  unitLabel: "£8.99 / 5kg",
  basePrice: 899,
  images: [],
};

function product(id: string): RunProduct {
  return { ...rice, id };
}

const RICE_REPLY: SuggesterResult = {
  kind: "reply",
  text: '{"amount":5,"unit":"KILOGRAM","confidence":95,"evidenceSource":"NAME","evidence":"5kg"}',
  latencyMs: 100,
  usage: { inputTokens: 400, outputTokens: 50, neurons: 5 },
};

function suggesterReturning(...results: SuggesterResult[]): NetContentSuggester {
  const suggest = vi.fn(async () => results.shift() ?? RICE_REPLY);
  return { model: "@cf/google/gemma-4-26b-a4b-it", suggest };
}

function deps(overrides: Partial<RunDependencies>): RunDependencies & {
  saveSuggestion: ReturnType<typeof vi.fn>;
} {
  const saveSuggestion = vi.fn(async (input: { value: unknown }) => ({
    status: input.value ? ("PENDING" as const) : ("NO_ANSWER" as const),
  }));
  return {
    products: [rice],
    suggester: suggesterReturning(RICE_REPLY),
    loadPhoto: vi.fn(async () => null),
    saveSuggestion,
    neuronBudget: 5000,
    rate: NET_CONTENT_MODEL_RATES["@cf/google/gemma-4-26b-a4b-it"],
    ...overrides,
  } as RunDependencies & { saveSuggestion: ReturnType<typeof vi.fn> };
}

describe("runNetContentSuggestions (R15)", () => {
  it("writes a PENDING row with its label check for a valid reply", async () => {
    const d = deps({});
    const summary = await runNetContentSuggestions(d);

    expect(summary).toMatchObject({ outcome: "completed", attempted: 1, pending: 1, noAnswer: 0 });
    expect(d.saveSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "p-rice",
        productImageId: null,
        model: "@cf/google/gemma-4-26b-a4b-it",
        inputTokens: 400,
        outputTokens: 50,
        value: expect.objectContaining({ amount: 5, unit: "KILOGRAM", unitLabelCheck: "AGREES" }),
      }),
    );
  });

  it("writes a NO_ANSWER row with a null value for an invalid reply", async () => {
    const d = deps({
      suggester: suggesterReturning({ ...RICE_REPLY, text: '{"amount": null}' }),
    });
    const summary = await runNetContentSuggestions(d);

    expect(summary.noAnswer).toBe(1);
    expect(d.saveSuggestion).toHaveBeenCalledWith(expect.objectContaining({ value: null }));
  });

  it("stops with no row written when the suggester is not configured", async () => {
    const d = deps({
      products: [product("a"), product("b")],
      suggester: suggesterReturning({ kind: "not-configured" }),
    });
    const summary = await runNetContentSuggestions(d);

    expect(summary.outcome).toBe("not-configured");
    expect(d.saveSuggestion).not.toHaveBeenCalled();
  });

  it("writes no row for a transport error and counts it as failed", async () => {
    const d = deps({
      products: [product("a"), product("b")],
      suggester: suggesterReturning(
        { kind: "transport-error", message: "429", latencyMs: 5 },
        RICE_REPLY,
      ),
    });
    const summary = await runNetContentSuggestions(d);

    expect(summary).toMatchObject({ failed: 1, pending: 1, attempted: 2, outcome: "completed" });
    expect(d.saveSuggestion).toHaveBeenCalledTimes(1);
    expect(d.saveSuggestion.mock.calls[0][0].productId).toBe("b");
  });

  it(`stops after ${MAX_CONSECUTIVE_TRANSPORT_ERRORS} consecutive transport errors`, async () => {
    const failure: SuggesterResult = { kind: "transport-error", message: "down", latencyMs: 5 };
    const suggester = suggesterReturning(failure, failure, failure, failure);
    const d = deps({
      products: [product("a"), product("b"), product("c"), product("d")],
      suggester,
    });
    const summary = await runNetContentSuggestions(d);

    expect(summary.outcome).toBe("transport-errors");
    expect(summary.failed).toBe(3);
    expect(suggester.suggest).toHaveBeenCalledTimes(3);
    expect(d.saveSuggestion).not.toHaveBeenCalled();
  });

  it("sends a staff photo and records its image id", async () => {
    const withPhoto: RunProduct = {
      ...rice,
      images: [
        { id: "img-ai", storageKey: "k1", sortOrder: 0, source: "AI_GENERATED" },
        { id: "img-staff", storageKey: "k2", sortOrder: 1, source: "STAFF_UPLOAD" },
      ],
    };
    const loadPhoto = vi.fn(async () => ({
      bytes: new Uint8Array([1]),
      contentType: "image/webp",
    }));
    const d = deps({ products: [withPhoto], loadPhoto });
    await runNetContentSuggestions(d);

    expect(loadPhoto).toHaveBeenCalledWith(expect.objectContaining({ id: "img-staff" }));
    expect(d.saveSuggestion.mock.calls[0][0].productImageId).toBe("img-staff");
    expect(vi.mocked(d.suggester.suggest).mock.calls[0][0].photo).not.toBeNull();
  });

  it("records no image id when the chosen photo's object is missing", async () => {
    const withPhoto: RunProduct = {
      ...rice,
      images: [{ id: "img-staff", storageKey: "k2", sortOrder: 0, source: "STAFF_UPLOAD" }],
    };
    const d = deps({ products: [withPhoto], loadPhoto: vi.fn(async () => null) });
    await runNetContentSuggestions(d);

    expect(d.saveSuggestion.mock.calls[0][0].productImageId).toBeNull();
  });
});

describe("the neuron budget (R16)", () => {
  it("stops starting new calls once the budget is reached", async () => {
    const suggester = suggesterReturning(); // every call costs 5 reported neurons
    const d = deps({
      products: [product("a"), product("b"), product("c"), product("d")],
      suggester,
      neuronBudget: 10,
    });
    const summary = await runNetContentSuggestions(d);

    expect(summary.outcome).toBe("budget-reached");
    expect(suggester.suggest).toHaveBeenCalledTimes(2);
    expect(summary.neurons).toBe(10);
  });

  it("prefers reported neurons, then estimates from the rate table", () => {
    const rate = { input: 9091, output: 27273 };
    expect(neuronsForCall({ inputTokens: 400, outputTokens: 50, neurons: 4.9 }, rate)).toBe(4.9);
    expect(neuronsForCall({ inputTokens: 1_000_000, outputTokens: 0, neurons: null }, rate)).toBe(
      9091,
    );
    expect(neuronsForCall({ inputTokens: 400, outputTokens: 50, neurons: null }, null)).toBeNull();
  });

  it("carries the rates read from Cloudflare's pricing page for the two known models", () => {
    expect(NET_CONTENT_MODEL_RATES["@cf/google/gemma-4-26b-a4b-it"]).toEqual({
      input: 9091,
      output: 27273,
    });
    expect(NET_CONTENT_MODEL_RATES["@cf/meta/llama-4-scout-17b-16e-instruct"]).toEqual({
      input: 24545,
      output: 77273,
    });
  });
});
