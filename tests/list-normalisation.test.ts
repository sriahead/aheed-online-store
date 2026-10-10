import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MAX_AI_INPUT_CHARS,
  NORMALISATION_MODEL,
  NORMALISATION_TIMEOUT_MS,
  buildNormalisationPrompt,
  mergeNormalisedItems,
  normaliseList,
  parseNormalisationResponse,
} from "@/lib/list-normalisation";
import { MAX_LINE_QUANTITY, parseList, type ParsedLine } from "@/lib/shopping-list";

/**
 * P2.6 slice 4 (#567). Everything here except the `normaliseList` block is pure — no network, no
 * database, no request context — which is the property `scripts/verify-list-normalisation.ts`
 * also demonstrates in real Node.
 *
 * The `normaliseList` block stubs `globalThis.fetch` rather than reaching Cloudflare. What is
 * being asserted there is this module's own contract — one call per submission, a deadline, and
 * a typed degradation on every failure (#1016) — not the model's behaviour, which no unit test can pin.
 */

const line = (original: string, quantity = 1, terms: string[] = []): ParsedLine => ({
  original,
  quantity,
  terms: terms.length > 0 ? terms : [original.toLowerCase()],
});

const THREE_LINES = [line("atta"), line("haldi"), line("bhindi")];

describe("parseNormalisationResponse — extracting the array", () => {
  const one = '[{"index":0,"name":"flour","quantity":1,"measure":null,"brand":null}]';

  it("reads a bare JSON array", () => {
    expect(parseNormalisationResponse(one, 3)).toHaveLength(1);
  });

  it("reads an array wrapped in prose", () => {
    const raw = `Sure! Here are the items:\n${one}\nLet me know if you need more.`;
    expect(parseNormalisationResponse(raw, 3)[0].name).toBe("flour");
  });

  it("reads an array inside a fenced code block", () => {
    const raw = "```json\n" + one + "\n```";
    expect(parseNormalisationResponse(raw, 3)[0].name).toBe("flour");
  });
});

describe("parseNormalisationResponse — a broken reply degrades, never throws", () => {
  it("returns [] for invalid JSON", () => {
    expect(parseNormalisationResponse("[{not json", 3)).toEqual([]);
  });

  it("returns [] when the JSON is not an array", () => {
    expect(parseNormalisationResponse('{"index":0,"name":"flour"}', 3)).toEqual([]);
  });

  it("returns [] when the array holds no objects", () => {
    expect(parseNormalisationResponse('["flour","turmeric"]', 3)).toEqual([]);
  });

  it("does not throw on any of them", () => {
    for (const raw of ["[{not json", '{"a":1}', '["x"]', "", "[]"]) {
      expect(() => parseNormalisationResponse(raw, 3)).not.toThrow();
    }
  });
});

describe("parseNormalisationResponse — index is validated, never believed", () => {
  const at = (index: unknown) =>
    parseNormalisationResponse(JSON.stringify([{ index, name: "flour" }]), 3);

  it("drops a negative index", () => {
    expect(at(-1)).toEqual([]);
  });

  it("drops an index past the end of the shopper's list", () => {
    expect(at(99)).toEqual([]);
  });

  it("drops a fractional index", () => {
    expect(at(1.5)).toEqual([]);
  });

  it("drops a string index", () => {
    expect(at("0")).toEqual([]);
  });

  it("keeps the first of two items claiming the same line", () => {
    const raw = JSON.stringify([
      { index: 0, name: "flour" },
      { index: 0, name: "turmeric" },
    ]);
    const items = parseNormalisationResponse(raw, 3);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("flour");
  });
});

describe("parseNormalisationResponse — name hygiene", () => {
  it("drops an item whose name is only whitespace", () => {
    expect(parseNormalisationResponse('[{"index":0,"name":"   "}]', 3)).toEqual([]);
  });

  it("truncates a name longer than 100 characters rather than passing it through", () => {
    const raw = JSON.stringify([{ index: 0, name: "a".repeat(150) }]);
    expect(parseNormalisationResponse(raw, 3)[0].name).toHaveLength(100);
  });
});

describe("mergeNormalisedItems", () => {
  it("returns one entry per line, in order, leaving unclaimed lines untouched", () => {
    const lines = [line("a"), line("b"), line("c"), line("d")];
    const merged = mergeNormalisedItems(lines, [
      { index: 0, name: "apple", quantity: 1, measure: null, brand: null },
      { index: 2, name: "cherry", quantity: 1, measure: null, brand: null },
    ]);

    expect(merged).toHaveLength(4);
    expect(merged[1]).toEqual(lines[1]);
    expect(merged[3]).toEqual(lines[3]);
    expect(merged[0].terms).toEqual(["apple"]);
    expect(merged[2].terms).toEqual(["cherry"]);
  });

  it("clamps a quantity the model invented", () => {
    const cases: [number, number][] = [
      [0, 1],
      [-3, 1],
      [Number.NaN, 1],
      [1000, MAX_LINE_QUANTITY],
    ];
    for (const [given, expected] of cases) {
      const merged = mergeNormalisedItems(
        [line("x")],
        [{ index: 0, name: "flour", quantity: given, measure: null, brand: null }],
      );
      expect(merged[0].quantity, `quantity ${given}`).toBe(expected);
    }
  });

  it("retains brand on the line but never folds it into the match terms", () => {
    // Product has no brand column until #397/#569, so a brand can only match incidentally
    // through a product name — adding it as a required term could only turn a findable
    // product into an unmatched line.
    const merged = mergeNormalisedItems(
      [line("amul butter")],
      [{ index: 0, name: "butter", quantity: 1, measure: null, brand: "Amul" }],
    );
    expect(merged[0].terms).toEqual(["butter"]);
    expect(merged[0].terms).not.toContain("amul");
    expect(merged[0].brand).toBe("Amul");
  });

  it("keeps the measure the shopper asked for", () => {
    const merged = mergeNormalisedItems(
      [line("2kg atta")],
      [{ index: 0, name: "atta", quantity: 1, measure: "2kg", brand: null }],
    );
    expect(merged[0].measure).toBe("2kg");
    expect(merged[0].quantity).toBe(1);
  });

  it("keeps the shopper's own original text for the review screen", () => {
    const merged = mergeNormalisedItems(
      [line("2kg atta")],
      [{ index: 0, name: "chapati flour", quantity: 1, measure: "2kg", brand: null }],
    );
    expect(merged[0].original).toBe("2kg atta");
  });

  it("ignores an item that tokenises to nothing usable", () => {
    const lines = [line("atta")];
    const merged = mergeNormalisedItems(lines, [
      { index: 0, name: "!!!", quantity: 1, measure: null, brand: null },
    ]);
    expect(merged[0]).toEqual(lines[0]);
  });
});

describe("normaliseList — bounded, deadlined, and a typed degradation on every failure", () => {
  const originalFetch = globalThis.fetch;
  let calls: { url: string; init: RequestInit }[];

  const stubFetch = (impl: () => Promise<Response>) => {
    calls = [];
    globalThis.fetch = vi.fn(async (url: unknown, init: unknown) => {
      calls.push({ url: String(url), init: init as RequestInit });
      return impl();
    }) as unknown as typeof fetch;
  };

  const ITEM = '[{"index":0,"name":"chapati flour","quantity":1,"measure":"2kg","brand":null}]';
  const USAGE = { prompt_tokens: 120, completion_tokens: 40, neurons: 1.5 };
  const okPayload = (result: Record<string, unknown>) =>
    ({ ok: true, status: 200, json: async () => ({ result }) }) as unknown as Response;
  const okBody = (text: string) => okPayload({ response: text, usage: USAGE });

  beforeEach(() => {
    calls = [];
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acct");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("issues exactly one fetch for a 100-line list", async () => {
    stubFetch(async () => okBody(ITEM));
    const lines = parseList(Array.from({ length: 100 }, (_, i) => `item${i}`).join("\n"));
    expect(lines).toHaveLength(100);

    await normaliseList(lines, null);
    expect(calls).toHaveLength(1);
  });

  it("targets the default model endpoint with a bearer token when no override is set", async () => {
    stubFetch(async () => okBody(ITEM));
    await normaliseList(THREE_LINES, null);

    expect(calls[0].url).toContain(`/ai/run/${NORMALISATION_MODEL}`);
    expect(NORMALISATION_MODEL).toBe("@cf/meta/llama-3.1-8b-instruct");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization.startsWith("Bearer ")).toBe(true);
  });

  it("targets LIST_NORMALISATION_AI_MODEL when it is set (#1016 R8)", async () => {
    vi.stubEnv("LIST_NORMALISATION_AI_MODEL", "@cf/google/gemma-4-26b-a4b-it");
    stubFetch(async () => okBody(ITEM));
    const result = await normaliseList(THREE_LINES, null);

    expect(calls[0].url).toMatch(/\/ai\/run\/@cf\/google\/gemma-4-26b-a4b-it$/);
    expect(result.model).toBe("@cf/google/gemma-4-26b-a4b-it");
  });

  it("sends Gemma's enable_thinking:false, and nothing extra for Llama (#1016 R9)", async () => {
    stubFetch(async () => okBody(ITEM));
    await normaliseList(THREE_LINES, null);
    expect(JSON.parse(String(calls[0].init.body))).not.toHaveProperty("chat_template_kwargs");

    vi.stubEnv("LIST_NORMALISATION_AI_MODEL", "@cf/google/gemma-4-26b-a4b-it");
    stubFetch(async () => okBody(ITEM));
    await normaliseList(THREE_LINES, null);
    expect(JSON.parse(String(calls[0].init.body)).chat_template_kwargs).toEqual({
      enable_thinking: false,
    });
  });

  it("passes an abort signal derived from the timeout", async () => {
    stubFetch(async () => okBody(ITEM));
    await normaliseList(THREE_LINES, null);

    expect(NORMALISATION_TIMEOUT_MS).toBe(6000);
    expect(calls[0].init.signal).toBeDefined();
  });

  it("degrades as not-configured without fetching when no account id is configured", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    stubFetch(async () => okBody(ITEM));
    expect(await normaliseList(THREE_LINES, null)).toMatchObject({
      kind: "degraded",
      reason: "not-configured",
    });
    expect(calls).toHaveLength(0);
  });

  it("degrades as not-configured without fetching when no api token is configured", async () => {
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
    stubFetch(async () => okBody(ITEM));
    expect(await normaliseList(THREE_LINES, null)).toMatchObject({ reason: "not-configured" });
    expect(calls).toHaveLength(0);
  });

  it("degrades as http, carrying the status, on a non-OK response", async () => {
    stubFetch(async () => ({ ok: false, status: 400 }) as Response);
    const result = await normaliseList(THREE_LINES, null);
    expect(result).toEqual({
      kind: "degraded",
      model: NORMALISATION_MODEL,
      reason: "http",
      status: 400,
    });
  });

  it("degrades as unreadable when a 200's body will not parse", async () => {
    stubFetch(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("not json");
          },
        }) as unknown as Response,
    );
    const result = await normaliseList(THREE_LINES, null);
    expect(result).toMatchObject({ kind: "degraded", reason: "unreadable" });
    expect(result).not.toHaveProperty("status");
  });

  it("degrades as network when fetch itself rejects", async () => {
    stubFetch(async () => {
      throw new Error("network down");
    });
    expect(await normaliseList(THREE_LINES, null)).toMatchObject({ reason: "network" });
  });

  it("degrades as unparseable, keeping the billed usage, when the reply yields no items", async () => {
    stubFetch(async () => okBody("Sorry, I cannot help with that."));
    const result = await normaliseList(THREE_LINES, null);
    expect(result).toMatchObject({
      kind: "degraded",
      reason: "unparseable",
      usage: { inputTokens: 120, outputTokens: 40, neurons: 1.5 },
    });
  });

  it("does not throw on any failure mode", async () => {
    stubFetch(async () => {
      throw new Error("network down");
    });
    await expect(normaliseList(THREE_LINES, null)).resolves.toMatchObject({ kind: "degraded" });
  });

  it("degrades as over-input-cap without issuing a fetch", async () => {
    expect(MAX_AI_INPUT_CHARS).toBe(4000);
    stubFetch(async () => okBody(ITEM));

    const lines = parseList(Array.from({ length: 100 }, () => "x".repeat(60)).join("\n"));
    expect(buildNormalisationPrompt(lines, null).length).toBeGreaterThan(MAX_AI_INPUT_CHARS);

    expect(await normaliseList(lines, null)).toMatchObject({ reason: "over-input-cap" });
    expect(calls).toHaveLength(0);
  });

  it("returns parsed items and the call's usage on a good reply", async () => {
    stubFetch(async () => okBody(ITEM));
    const result = await normaliseList(THREE_LINES, null);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.items).toHaveLength(1);
    expect(result.items[0].measure).toBe("2kg");
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 40, neurons: 1.5 });
  });

  /**
   * Found live at /validate (#567), not from a stub: the real `@cf/meta/llama-3.1-8b-instruct`
   * endpoint returns `result.response` as an ALREADY-PARSED array, not a string — the string form
   * of the same content sits at `result.choices[0].message.content` instead. The original
   * `typeof response === "string"` check made every real call resolve to an empty text and every
   * real submission silently degrade, passing every test here because this describe block's own
   * stub always returned `response` as a string. These cases pin the real shape (re-measured
   * 2026-10-10, #1016: still true).
   */
  it("parses items when the model's reply arrives as an already-parsed array, not a string", async () => {
    stubFetch(async () =>
      okPayload({
        response: [{ index: 0, name: "chapati flour", quantity: 1, measure: "2kg", brand: null }],
      }),
    );
    const result = await normaliseList(THREE_LINES, null);
    expect(result.kind === "ok" && result.items[0].measure).toBe("2kg");
  });

  it("falls back to choices[0].message.content when result.response is absent", async () => {
    stubFetch(async () => okPayload({ choices: [{ message: { content: ITEM } }] }));
    const result = await normaliseList(THREE_LINES, null);
    expect(result.kind === "ok" && result.items[0].measure).toBe("2kg");
  });

  it("degrades as unparseable rather than throwing when neither response nor choices carries content", async () => {
    stubFetch(async () => okPayload({}));
    expect(await normaliseList(THREE_LINES, null)).toMatchObject({ reason: "unparseable" });
  });

  it(
    "degrades as timeout rather than hang when the upstream fetch never settles",
    { timeout: NORMALISATION_TIMEOUT_MS + 3000 },
    async () => {
      calls = [];
      globalThis.fetch = vi.fn((_url: unknown, init: unknown) => {
        calls.push({ url: String(_url), init: init as RequestInit });
        return new Promise<Response>((_resolve, reject) => {
          const signal = (init as RequestInit).signal;
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      }) as unknown as typeof fetch;

      const result = await normaliseList(THREE_LINES, null);
      expect(result).toMatchObject({ kind: "degraded", reason: "timeout" });
      expect(calls[0].init.signal?.aborted).toBe(true);
    },
  );
});

describe("buildNormalisationPrompt", () => {
  it("numbers each line so the model's index can be checked against it", () => {
    const prompt = buildNormalisationPrompt(THREE_LINES, null);
    expect(prompt).toContain("0. atta");
    expect(prompt).toContain("1. haldi");
    expect(prompt).toContain("2. bhindi");
  });

  it("tells the model a weight is a measure and not a count", () => {
    expect(buildNormalisationPrompt(THREE_LINES, null)).toContain("It is not two of anything.");
  });
});
