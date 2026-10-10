/**
 * #1016/#1017 — the one home for what every Workers AI call site needs to know about a model:
 * what it costs, which extra request fields it needs, and how to read its reply and usage.
 *
 * Before this module the knowledge was split three ways: the rate table lived in the net-content
 * run, the per-model request options in the net-content suggester, and the reply-shape handling
 * was written twice (list normalisation read both shapes, synonym proposals read only one). That
 * split is why a model override was not "config only": pointing synonym proposals at Gemma 4 would
 * have silently returned zero proposals, because Gemma answers in `choices` and needs
 * `enable_thinking: false`.
 *
 * Pure — no request context, no Prisma — so scripts, the meter and unit tests all use it directly.
 */

/**
 * Neurons per MILLION tokens, from Cloudflare's Workers AI pricing page
 * (developers.cloudflare.com/workers-ai/platform/pricing), read 2026-10-10.
 *
 * `@cf/meta/llama-3.1-8b-instruct` is still listed on the pricing page at the figures below, even
 * though it is deprecated (2026-05-30) and absent from the account's model catalogue (#1016). A real
 * call on 2026-10-10 was answered by `@cf/meta/llama-3.1-8b-fast-v2` and REPORTED 0.43 neurons for
 * 45 input / 7 output tokens — well under what these rates estimate (1.68), so a reported figure
 * always wins over this table (see `neuronsForTextCall`).
 *
 * The Gemma 4 and Llama 4 Scout rows are unchanged from the net-content run's table (#900, read
 * 2026-09-25) and were re-confirmed on 2026-10-10.
 */
export const WORKERS_AI_TEXT_RATES: Record<string, { input: number; output: number }> = {
  "@cf/meta/llama-3.1-8b-instruct": { input: 25608, output: 75147 },
  "@cf/google/gemma-4-26b-a4b-it": { input: 9091, output: 27273 },
  "@cf/meta/llama-4-scout-17b-16e-instruct": { input: 24545, output: 77273 },
};

/**
 * Neurons per GENERATED IMAGE, from the same pricing page, read 2026-10-10.
 *
 * flux-1-schnell is priced per 512x512 output tile (4.80 neurons) and per diffusion step
 * (9.60 neurons). `lib/image-generation.ts` sends only a `prompt`, so the model's defaults apply:
 * 4 steps (documented), and a 1024x1024 output (not documented on the model page; assumed, which is
 * the larger of the plausible defaults and so over-counts rather than under-counts if wrong).
 *   4 tiles x 4.80 + 4 steps x 9.60 = 19.2 + 38.4 = 57.6 neurons per image.
 */
export const WORKERS_AI_IMAGE_NEURONS: Record<string, number> = {
  "@cf/black-forest-labs/flux-1-schnell": 57.6,
};

/**
 * Extra request fields per model — the model-specific half of a model-agnostic design, kept as
 * data beside the model id rather than as branches in code. A model not listed gets none.
 *
 * Gemma 4 runs with reasoning OFF. Measured at #900's Build (2026-09-25): with its default
 * reasoning on, ambiguous prompts reasoned until the token ceiling and returned NO content; with it
 * off the same calls answered in about 50 tokens. #1016's measurement (2026-10-10) found the same
 * on the list-normalisation prompt: without this kwarg Gemma returned an empty response entirely.
 */
export const WORKERS_AI_MODEL_REQUEST_OPTIONS: Record<string, Record<string, unknown>> = {
  "@cf/google/gemma-4-26b-a4b-it": { chat_template_kwargs: { enable_thinking: false } },
};

/**
 * The fallback charge for a text call that carries neither a reported neuron figure nor token
 * counts, so nothing can be computed. Deliberately generous — a few hundred tokens at the most
 * expensive listed rate — because a budget must over-count an unknown, never treat it as free.
 */
export const UNMETERED_CALL_NEURONS = 50;

export interface WorkersAiUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  /** Reported by Workers AI directly when present (measured on Llama 3.1 and Gemma 4). */
  neurons: number | null;
}

export type NeuronSource = "REPORTED" | "ESTIMATED";

interface WorkersAiPayload {
  result?: { response?: unknown; choices?: unknown; usage?: unknown } | null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The reply text of a Workers AI text call, whichever shape the model answers in.
 *
 * Older text models answer in `result.response` — a string, or (measured on Llama 3.1 for a JSON
 * answer) an already-parsed value, which is re-serialised so a JSON parser downstream sees the same
 * text it would have. Chat-completion models (Gemma 4) leave `response` null and answer in
 * `result.choices[0].message.content`. Anything else is `""`.
 */
export function extractWorkersAiReplyText(payload: unknown): string {
  const result = (payload as WorkersAiPayload | null)?.result;
  const response = result?.response;
  if (typeof response === "string") return response;
  if (response !== undefined && response !== null) return JSON.stringify(response);

  const choices = result?.choices;
  const content = Array.isArray(choices)
    ? (choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content
    : undefined;
  return typeof content === "string" ? content : "";
}

/** Token counts and reported neurons of a Workers AI text call; each is `null` when absent. */
export function extractWorkersAiUsage(payload: unknown): WorkersAiUsage {
  const usage = ((payload as WorkersAiPayload | null)?.result?.usage ?? {}) as Record<
    string,
    unknown
  >;
  return {
    inputTokens: numberOrNull(usage.prompt_tokens),
    outputTokens: numberOrNull(usage.completion_tokens),
    neurons: numberOrNull(usage.neurons),
  };
}

function highestTextRate(): { input: number; output: number } {
  const rates = Object.values(WORKERS_AI_TEXT_RATES);
  return {
    input: Math.max(...rates.map((rate) => rate.input)),
    output: Math.max(...rates.map((rate) => rate.output)),
  };
}

/**
 * What one text call cost, for the per-vendor ledger (#1017).
 *
 * Reported neurons win. Otherwise tokens times the model's rate. A model missing from the table
 * (a mistyped or new override) is charged at the most expensive listed rate rather than refused:
 * refusing would turn a config typo into a silently disabled feature, which is exactly the invisible
 * failure #1016 exists to prevent. With no token counts at all, `UNMETERED_CALL_NEURONS`. Never 0.
 */
export function neuronsForTextCall(
  model: string,
  usage: WorkersAiUsage,
): { neurons: number; source: NeuronSource } {
  if (usage.neurons !== null) return { neurons: usage.neurons, source: "REPORTED" };
  if (usage.inputTokens !== null && usage.outputTokens !== null) {
    const rate = WORKERS_AI_TEXT_RATES[model] ?? highestTextRate();
    return {
      neurons: (usage.inputTokens * rate.input + usage.outputTokens * rate.output) / 1_000_000,
      source: "ESTIMATED",
    };
  }
  return { neurons: UNMETERED_CALL_NEURONS, source: "ESTIMATED" };
}

/** What one generated image cost; an unlisted image model is charged at the highest listed figure. */
export function neuronsForImage(model: string): number {
  return WORKERS_AI_IMAGE_NEURONS[model] ?? Math.max(...Object.values(WORKERS_AI_IMAGE_NEURONS));
}
