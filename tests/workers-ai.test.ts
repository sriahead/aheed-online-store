import { describe, expect, it } from "vitest";
import {
  extractWorkersAiReplyText,
  extractWorkersAiUsage,
  neuronsForImage,
  neuronsForTextCall,
  UNMETERED_CALL_NEURONS,
  WORKERS_AI_IMAGE_NEURONS,
  WORKERS_AI_MODEL_REQUEST_OPTIONS,
  WORKERS_AI_TEXT_RATES,
} from "@/lib/workers-ai";
import { NET_CONTENT_MODEL_RATES } from "@/lib/net-content-run";
import { NET_CONTENT_MODEL_REQUEST_OPTIONS } from "@/lib/net-content-suggester";

/**
 * #1016/#1017 — the shared Workers AI module. Pure, so every rule here is asserted directly: the
 * reply shapes the models are measured to answer in, and what a call is charged to a vendor.
 */

describe("one source of truth for model facts (R3)", () => {
  it("the net-content tables are the shared tables, not copies", () => {
    expect(NET_CONTENT_MODEL_RATES).toBe(WORKERS_AI_TEXT_RATES);
    expect(NET_CONTENT_MODEL_REQUEST_OPTIONS).toBe(WORKERS_AI_MODEL_REQUEST_OPTIONS);
  });

  it("prices every model a call site defaults to (R2)", () => {
    for (const model of [
      "@cf/meta/llama-3.1-8b-instruct",
      "@cf/google/gemma-4-26b-a4b-it",
      "@cf/meta/llama-4-scout-17b-16e-instruct",
    ]) {
      expect(WORKERS_AI_TEXT_RATES[model].input).toBeGreaterThan(0);
      expect(WORKERS_AI_TEXT_RATES[model].output).toBeGreaterThan(0);
    }
    expect(WORKERS_AI_IMAGE_NEURONS["@cf/black-forest-labs/flux-1-schnell"]).toBeGreaterThan(0);
  });
});

describe("extractWorkersAiReplyText (R4)", () => {
  it("returns a string result.response unchanged", () => {
    expect(extractWorkersAiReplyText({ result: { response: "[1,2]" } })).toBe("[1,2]");
  });

  it("re-serialises an already-parsed result.response (Llama 3.1 on a JSON answer)", () => {
    expect(extractWorkersAiReplyText({ result: { response: [1, 2] } })).toBe("[1,2]");
  });

  it("falls back to choices[0].message.content when response is null (Gemma 4)", () => {
    expect(
      extractWorkersAiReplyText({
        result: { response: null, choices: [{ message: { content: "[3]" } }] },
      }),
    ).toBe("[3]");
  });

  it("returns an empty string when neither shape carries text", () => {
    expect(extractWorkersAiReplyText({ result: {} })).toBe("");
    expect(extractWorkersAiReplyText(null)).toBe("");
  });
});

describe("extractWorkersAiUsage", () => {
  it("reads tokens and reported neurons, null where absent", () => {
    expect(
      extractWorkersAiUsage({
        result: { usage: { prompt_tokens: 45, completion_tokens: 7, neurons: 0.43 } },
      }),
    ).toEqual({ inputTokens: 45, outputTokens: 7, neurons: 0.43 });
    expect(extractWorkersAiUsage({ result: {} })).toEqual({
      inputTokens: null,
      outputTokens: null,
      neurons: null,
    });
  });
});

describe("neuronsForTextCall (R5)", () => {
  const llama = "@cf/meta/llama-3.1-8b-instruct";

  it("(a) uses Workers AI's reported figure when there is one", () => {
    expect(neuronsForTextCall(llama, { inputTokens: 45, outputTokens: 7, neurons: 0.43 })).toEqual({
      neurons: 0.43,
      source: "REPORTED",
    });
  });

  it("(b) estimates from the model's own rate when only tokens are known", () => {
    const rate = WORKERS_AI_TEXT_RATES[llama];
    expect(
      neuronsForTextCall(llama, { inputTokens: 1_000_000, outputTokens: 0, neurons: null }),
    ).toEqual({ neurons: rate.input, source: "ESTIMATED" });
  });

  it("(c) charges an unlisted model at the most expensive listed rate, never as free", () => {
    const highestInput = Math.max(...Object.values(WORKERS_AI_TEXT_RATES).map((r) => r.input));
    const highestOutput = Math.max(...Object.values(WORKERS_AI_TEXT_RATES).map((r) => r.output));
    expect(
      neuronsForTextCall("@cf/meta/not-a-real-model", {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        neurons: null,
      }),
    ).toEqual({ neurons: highestInput + highestOutput, source: "ESTIMATED" });
  });

  it("(d) falls back to a fixed positive charge when nothing can be computed", () => {
    const result = neuronsForTextCall(llama, { inputTokens: null, outputTokens: 7, neurons: null });
    expect(result).toEqual({ neurons: UNMETERED_CALL_NEURONS, source: "ESTIMATED" });
    expect(UNMETERED_CALL_NEURONS).toBeGreaterThan(0);
  });
});

describe("neuronsForImage", () => {
  it("charges a listed image model its own figure, and an unlisted one the highest", () => {
    expect(neuronsForImage("@cf/black-forest-labs/flux-1-schnell")).toBe(57.6);
    expect(neuronsForImage("@cf/unknown/image-model")).toBe(
      Math.max(...Object.values(WORKERS_AI_IMAGE_NEURONS)),
    );
  });
});
