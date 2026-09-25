import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_NET_CONTENT_MODEL,
  NET_CONTENT_MODEL_REQUEST_OPTIONS,
  buildNetContentPrompt,
  buildNetContentRequestBody,
  createWorkersAiNetContentSuggester,
  readWorkersAiReply,
  resolveNetContentModel,
  statesCount,
  validateNetContentReply,
} from "@/lib/net-content-suggester";

/**
 * #900 — the model-agnostic suggester (R9, R10) and its reply validator (R11).
 *
 * The validator is the slice's anti-hallucination guard: every rule here is a way a model reply
 * could otherwise put a wrong pack size — and so a wrong price per kg — in front of staff with
 * false confidence. No test here calls a real model.
 */

const CRISPS = { name: "Salted Crisps 6 pack", unitLabel: "£1.79 / 6 pack", photoSent: false };
const RICE = { name: "Basmati Rice 5kg", unitLabel: "£8.99 / 5kg", photoSent: false };

function reply(fields: Record<string, unknown>): string {
  return JSON.stringify(fields);
}

describe("resolveNetContentModel (R9)", () => {
  it("prefers the flag, then the environment, then the default", () => {
    expect(resolveNetContentModel("@cf/flag/model", "@cf/env/model")).toBe("@cf/flag/model");
    expect(resolveNetContentModel(undefined, "@cf/env/model")).toBe("@cf/env/model");
    expect(resolveNetContentModel(undefined, undefined)).toBe(DEFAULT_NET_CONTENT_MODEL);
  });

  it("ignores blank values", () => {
    expect(resolveNetContentModel("  ", "")).toBe(DEFAULT_NET_CONTENT_MODEL);
  });

  it("defaults to Gemma 4", () => {
    expect(DEFAULT_NET_CONTENT_MODEL).toBe("@cf/google/gemma-4-26b-a4b-it");
  });
});

describe("validateNetContentReply (R11)", () => {
  const good = {
    amount: 5,
    unit: "KILOGRAM",
    confidence: 90,
    evidenceSource: "NAME",
    evidence: "5kg",
  };

  it("accepts a reply that satisfies every rule", () => {
    expect(validateNetContentReply(reply(good), RICE)).toEqual({
      amount: 5,
      unit: "KILOGRAM",
      confidence: 90,
      evidenceSource: "NAME",
      evidenceText: "5kg",
    });
  });

  it("tolerates prose and a markdown code fence around the JSON (as Gemma 4 replies)", () => {
    const fenced = "Here you go:\n```json\n" + reply(good) + "\n```";
    expect(validateNetContentReply(fenced, RICE)?.amount).toBe(5);
  });

  it("accepts UNIT_LABEL evidence that appears in the unit label", () => {
    expect(
      validateNetContentReply(
        reply({ ...good, evidenceSource: "UNIT_LABEL", evidence: "5KG" }),
        RICE,
      ),
    ).not.toBeNull();
  });

  it("accepts PHOTO evidence only when a photo was sent", () => {
    const photo = reply({ ...good, evidenceSource: "PHOTO", evidence: "NET WT 5KG" });
    expect(validateNetContentReply(photo, { ...RICE, photoSent: true })).not.toBeNull();
    expect(validateNetContentReply(photo, RICE)).toBeNull();
  });

  it.each([
    ["a fractional amount", { ...good, amount: 0.5 }],
    ["a zero amount", { ...good, amount: 0 }],
    ["an unknown unit", { ...good, unit: "POUND" }],
    ["confidence 101", { ...good, confidence: 101 }],
    ["a fractional confidence", { ...good, confidence: 50.5 }],
    ["an unknown evidence source", { ...good, evidenceSource: "GUESS" }],
    ["empty evidence", { ...good, evidence: "  " }],
    ["evidence over 200 characters", { ...good, evidence: "5kg".padEnd(201, "x") }],
    ["NAME evidence absent from the name", { ...good, evidence: "10kg" }],
    ["an explicit null answer", { amount: null }],
    ["a missing unit", { amount: 5, confidence: 90, evidenceSource: "NAME", evidence: "5kg" }],
  ])("rejects %s", (_label, fields) => {
    expect(validateNetContentReply(reply(fields), RICE)).toBeNull();
  });

  it("rejects malformed JSON and replies with no object", () => {
    expect(validateNetContentReply("{amount: 5,", RICE)).toBeNull();
    expect(validateNetContentReply("I cannot tell.", RICE)).toBeNull();
    expect(validateNetContentReply("[1,2]", RICE)).toBeNull();
  });

  describe("EACH needs a stated count (owner decision, 2026-09-25)", () => {
    const each = { unit: "EACH", confidence: 80, evidenceSource: "NAME" };

    it("accepts 6 EACH quoting '6 pack'", () => {
      expect(
        validateNetContentReply(
          reply({ ...each, amount: 6, evidence: "Salted Crisps 6 pack" }),
          CRISPS,
        ),
      ).not.toBeNull();
    });

    it("rejects 1 EACH for a product whose evidence states no count", () => {
      const charger = { name: "Fast Phone Charger", unitLabel: "£12.99 each", photoSent: false };
      expect(
        validateNetContentReply(
          reply({ ...each, amount: 1, evidence: "Fast Phone Charger" }),
          charger,
        ),
      ).toBeNull();
    });

    it("rejects 6 EACH quoting '16 pack'", () => {
      const sixteen = { name: "Tea Bags 16 pack", unitLabel: "£1.00 / pack", photoSent: false };
      expect(
        validateNetContentReply(reply({ ...each, amount: 6, evidence: "16 pack" }), sixteen),
      ).toBeNull();
    });
  });
});

describe("statesCount", () => {
  it("matches a whole number standing on its own", () => {
    expect(statesCount("pack of 4", 4)).toBe(true);
    expect(statesCount("6 x 1.5L", 6)).toBe(true);
  });

  it("does not match inside a larger or decimal number", () => {
    expect(statesCount("16 pack", 6)).toBe(false);
    expect(statesCount("1.5L", 5)).toBe(false);
    expect(statesCount("1.5L", 1)).toBe(false);
  });
});

describe("buildNetContentPrompt", () => {
  it("tells the model to give no answer, never 1 EACH, when net content does not apply", () => {
    const prompt = buildNetContentPrompt({
      name: "Charger",
      unitLabel: "£9 each",
      hasPhoto: false,
    });
    expect(prompt).toContain('reply {"amount": null}. Never answer 1 EACH');
    expect(prompt).toContain("Use EACH only when a count of items is stated");
  });

  it("forbids converting non-metric units and multiplying packs", () => {
    const prompt = buildNetContentPrompt({ name: "Milk", unitLabel: "£1 / 2pt", hasPhoto: false });
    expect(prompt).toContain("Do not convert it.");
    expect(prompt).toContain("multiplying");
  });

  it("forbids PHOTO evidence when there is no photo", () => {
    expect(buildNetContentPrompt({ name: "x", unitLabel: "y", hasPhoto: false })).toContain(
      "Do not use evidenceSource PHOTO",
    );
  });
});

describe("buildNetContentRequestBody (R10)", () => {
  const photo = { bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp" };

  it("sends plain text when there is no photo", () => {
    const body = buildNetContentRequestBody({ name: "Rice 5kg", unitLabel: "£1", photo: null });
    const [message] = body.messages as Array<{ content: unknown }>;
    expect(typeof message.content).toBe("string");
  });

  it("sends the photo as an image_url data URI when given one", () => {
    const body = buildNetContentRequestBody({ name: "Rice 5kg", unitLabel: "£1", photo });
    const [message] = body.messages as Array<{ content: Array<Record<string, any>> }>;
    const image = message.content.find((part) => part.type === "image_url");
    expect(image?.image_url.url).toBe("data:image/webp;base64,AQID");
  });

  it("applies the model's own request options, and none for an unlisted model", () => {
    const gemma = buildNetContentRequestBody({ name: "a", unitLabel: "b", photo: null });
    expect(gemma.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(NET_CONTENT_MODEL_REQUEST_OPTIONS[DEFAULT_NET_CONTENT_MODEL]).toBeDefined();

    const other = buildNetContentRequestBody({ name: "a", unitLabel: "b", photo: null }, "@cf/x/y");
    expect(other.chat_template_kwargs).toBeUndefined();
  });
});

describe("readWorkersAiReply", () => {
  it("reads a chat-completion reply, its usage and its finish reason", () => {
    const parsed = readWorkersAiReply({
      result: {
        choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 400, completion_tokens: 40, neurons: 4.9 },
      },
    });
    expect(parsed).toEqual({
      text: "{}",
      truncated: false,
      usage: { inputTokens: 400, outputTokens: 40, neurons: 4.9 },
    });
  });

  it("falls back to result.response for older text models", () => {
    expect(readWorkersAiReply({ result: { response: "{}" } }).text).toBe("{}");
  });

  it("flags a reply cut off at the token ceiling", () => {
    const parsed = readWorkersAiReply({
      result: { choices: [{ message: { content: "" }, finish_reason: "length" }] },
    });
    expect(parsed.truncated).toBe(true);
  });
});

describe("createWorkersAiNetContentSuggester (R10)", () => {
  const input = { name: "Rice 5kg", unitLabel: "£8.99 / 5kg", photo: null };
  const credentials = { accountId: "acct", apiToken: "tok" };

  it("returns not-configured without calling fetch when a credential is missing", async () => {
    const fetchImpl = vi.fn();
    const suggester = createWorkersAiNetContentSuggester("m", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      credentials: { accountId: "acct" },
    });
    expect(await suggester.suggest(input)).toEqual({ kind: "not-configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a transport error, never throws, on a non-OK status", async () => {
    const fetchImpl = vi.fn(async () => new Response("busy", { status: 429 }));
    const suggester = createWorkersAiNetContentSuggester("m", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      credentials,
    });
    expect((await suggester.suggest(input)).kind).toBe("transport-error");
  });

  it("returns a transport error when fetch throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const suggester = createWorkersAiNetContentSuggester("m", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      credentials,
    });
    const result = await suggester.suggest(input);
    expect(result).toMatchObject({ kind: "transport-error", message: "fetch failed" });
  });

  it("aborts and returns a transport error when no reply arrives in time", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const suggester = createWorkersAiNetContentSuggester("m", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      credentials,
      timeoutMs: 10,
    });
    const result = await suggester.suggest(input);
    expect(result).toMatchObject({ kind: "transport-error", message: "No reply within 10 ms" });
  });

  it("treats a truncated reply as a transport error, so no row is written for it", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        result: { choices: [{ message: { content: "" }, finish_reason: "length" }] },
      }),
    );
    const suggester = createWorkersAiNetContentSuggester("m", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      credentials,
    });
    expect((await suggester.suggest(input)).kind).toBe("transport-error");
  });

  it("returns the reply text and usage, posting to the model's own URL", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({
        result: {
          choices: [{ message: { content: '{"amount":5}' }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        },
      }),
    );
    const suggester = createWorkersAiNetContentSuggester("@cf/some/model", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      credentials,
    });
    const result = await suggester.suggest(input);
    expect(result).toMatchObject({
      kind: "reply",
      text: '{"amount":5}',
      usage: { inputTokens: 10, outputTokens: 5, neurons: null },
    });
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/some/model",
    );
  });
});
