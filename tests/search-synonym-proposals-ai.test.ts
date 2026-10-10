import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #1016/#1017 — synonym proposals get the same model override, request options and reply reader as
 * list normalisation, and the staff-triggered run is checked against the vendor's daily AI budget.
 *
 * The transport tests stub `fetch`; the service tests stub the module boundaries, so the budget
 * decision is asserted without a database.
 */

const check = vi.fn(async () => ({ allowed: true, usedNeurons: 0, budgetNeurons: 3000 }));
const record = vi.fn(async () => {});
const proposeSynonymsMock = vi.fn();
let useRealProposeSynonyms = true;

vi.mock("@/lib/ai-meter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-meter")>();
  return { ...actual, createAiMeter: vi.fn(() => ({ check, record, recordImage: vi.fn() })) };
});
vi.mock("@/lib/search-synonym-proposals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/search-synonym-proposals")>();
  return {
    ...actual,
    proposeSynonyms: (...args: Parameters<typeof actual.proposeSynonyms>) =>
      useRealProposeSynonyms ? actual.proposeSynonyms(...args) : proposeSynonymsMock(...args),
  };
});
vi.mock("@/lib/db", () => ({ getPrisma: () => ({}), getPrismaWs: () => ({}) }));
vi.mock("@/lib/repositories/search-query-log", () => ({
  listCurationCandidateQueries: vi.fn(async () => ["dhania"]),
}));
vi.mock("@/lib/repositories/products", () => ({
  listProductNameTokens: vi.fn(async () => new Set(["coriander"])),
}));
vi.mock("@/lib/repositories/vendor", () => ({
  getVendorConfig: vi.fn(async () => ({ storeDescription: null })),
}));
vi.mock("@/lib/repositories/search-synonyms", () => ({
  createProposedSynonyms: vi.fn(async () => 1),
  createSynonym: vi.fn(),
  deleteSynonym: vi.fn(),
  listSynonymsForVendor: vi.fn(),
  setBulkSynonymStatus: vi.fn(),
  setSynonymStatus: vi.fn(),
  updateSynonym: vi.fn(),
}));

const { DEFAULT_SYNONYM_MODEL, proposeSynonyms } = await import("@/lib/search-synonym-proposals");
const { generateSynonymProposals } = await import("@/lib/search-synonyms-service");

const originalFetch = globalThis.fetch;
let calls: { url: string; body: Record<string, unknown> }[];

function stubFetch(result: Record<string, unknown>) {
  calls = [];
  globalThis.fetch = vi.fn(async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) });
    return { ok: true, status: 200, json: async () => ({ result }) } as unknown as Response;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
  useRealProposeSynonyms = true;
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acct");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "token");
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
});

describe("proposeSynonyms — configurable model (#1016 R7-R10)", () => {
  it("defaults to the llama-3.1-8b id, with no extra request options", async () => {
    stubFetch({ response: "[]" });
    await proposeSynonyms(["dhania"], ["coriander"], null);

    expect(DEFAULT_SYNONYM_MODEL).toBe("@cf/meta/llama-3.1-8b-instruct");
    expect(calls[0].url).toMatch(/\/ai\/run\/@cf\/meta\/llama-3\.1-8b-instruct$/);
    expect(calls[0].body).not.toHaveProperty("chat_template_kwargs");
  });

  it("targets SEARCH_SYNONYM_AI_MODEL when set, sending Gemma's enable_thinking:false", async () => {
    vi.stubEnv("SEARCH_SYNONYM_AI_MODEL", "@cf/google/gemma-4-26b-a4b-it");
    stubFetch({ response: "[]" });
    await proposeSynonyms(["dhania"], ["coriander"], null);

    expect(calls[0].url).toMatch(/\/ai\/run\/@cf\/google\/gemma-4-26b-a4b-it$/);
    expect(calls[0].body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("reads proposals from a chat-completion reply whose response is null", async () => {
    stubFetch({
      response: null,
      choices: [
        {
          message: {
            content:
              '[{"alias":"dhania","canonical":"coriander"},{"alias":"jeera","canonical":"cumin"}]',
          },
        },
      ],
      usage: { prompt_tokens: 200, completion_tokens: 30, neurons: 2.5 },
    });
    const result = await proposeSynonyms(["dhania", "jeera"], ["coriander", "cumin"], null);

    expect(result).toMatchObject({ ok: true, model: DEFAULT_SYNONYM_MODEL });
    expect(result.ok && result.proposals).toHaveLength(2);
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 30, neurons: 2.5 });
  });
});

describe("generateSynonymProposals — the vendor's daily AI budget (#1017 R28)", () => {
  it("refuses with the store's allowance message and asks the model nothing", async () => {
    useRealProposeSynonyms = false;
    check.mockResolvedValueOnce({ allowed: false, usedNeurons: 3012.4, budgetNeurons: 3000 });

    const result = await generateSynonymProposals("v1");

    expect(result).toEqual({
      ok: false,
      error:
        "This store has used its AI allowance for today (3,013 of 3,000 neurons). It resets at 00:00 UTC.",
    });
    expect(proposeSynonymsMock).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("charges the vendor once after the model replies", async () => {
    useRealProposeSynonyms = false;
    const usage = { inputTokens: 200, outputTokens: 30, neurons: 2.5 };
    proposeSynonymsMock.mockResolvedValueOnce({
      ok: true,
      proposals: [{ alias: "dhania", canonical: "coriander" }],
      model: DEFAULT_SYNONYM_MODEL,
      usage,
    });

    const result = await generateSynonymProposals("v1");

    expect(result).toEqual({ ok: true, created: 1, considered: 1 });
    expect(record).toHaveBeenCalledExactlyOnceWith({ model: DEFAULT_SYNONYM_MODEL, usage });
  });
});
