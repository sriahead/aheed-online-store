import { getAiEnv } from "@/lib/config";
import { isNetContentUnit, type NetContentUnit } from "@/components/product/unit-price";

/**
 * AI-suggested net content (#900) — PROPOSED, NEVER APPLIED.
 *
 * A model reads a product's name, its free-text unit label and, when one exists, a photo that
 * STAFF sourced, and proposes the pack size. Nothing here writes to a product:
 * `scripts/suggest-net-content.ts` stores each reply as a `NetContentSuggestion` row and a person
 * accepts, edits or rejects it on `/staff/net-content`. Same posture as
 * `lib/search-synonym-proposals.ts` and `specs/architecture.md`'s AI rule: offline, bounded,
 * reviewed.
 *
 * MODEL-AGNOSTIC BY DESIGN. Callers depend on the `NetContentSuggester` interface, never on a
 * model. The one implementation below speaks the Workers AI REST API (the same transport and the
 * same `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` as `lib/search-synonym-proposals.ts` — no
 * binding, no new credential), and the model id is data: a script flag, then
 * `NET_CONTENT_AI_MODEL`, then `DEFAULT_NET_CONTENT_MODEL`. Every row records the model that made
 * it, so two models can be compared on the same catalogue.
 *
 * WHY GEMMA 4 IS THE DEFAULT. On 2026-09-25 it was the cheapest multimodal text model in the
 * Workers AI catalogue (9,091 input / 27,273 output neurons per million tokens, about 2.7x cheaper
 * than Llama 4 Scout). Build proved it live the same day: OpenAI-style `image_url` content parts
 * with a base64 data URI, WebP accepted, reply in `result.choices[0].message.content`, and a
 * separate `reasoning_content` that counts toward `max_tokens` — which is why the ceiling below is
 * well above what the JSON answer itself needs.
 */

export const DEFAULT_NET_CONTENT_MODEL = "@cf/google/gemma-4-26b-a4b-it";

/** A hung upstream must not hang a run (R10). */
export const NET_CONTENT_TIMEOUT_MS = 60_000;

/**
 * Output ceiling per call. The answer itself is one short JSON object (about 50 tokens with
 * reasoning off); the headroom covers a model with no request options below, whose reasoning
 * counts toward the ceiling.
 */
export const NET_CONTENT_MAX_TOKENS = 800;

/**
 * Extra request fields per model — the model-specific half of a model-agnostic design, kept as
 * data beside the model id rather than as branches in code. A model not listed gets none.
 *
 * Gemma 4 runs with reasoning OFF. Measured at Build (2026-09-25, dev credentials): with its
 * default reasoning on, every ambiguous product (`Whole Milk / 2pt`, `Still Water 6 x 1.5L`,
 * `Fast Phone Charger`) reasoned in circles until the token ceiling — at 800 and again at 2,500 —
 * returning NO content at ~25-71 neurons a call. With reasoning off the same calls answer in about
 * 50 tokens at ~4 neurons. Reasoning off was also more willing to CONVERT (it answered 568 ml for
 * "2pt"), which is why the prompt below forbids conversion outside metric scale changes.
 */
export const NET_CONTENT_MODEL_REQUEST_OPTIONS: Record<string, Record<string, unknown>> = {
  "@cf/google/gemma-4-26b-a4b-it": { chat_template_kwargs: { enable_thinking: false } },
};

/** The longest quoted evidence a suggestion may carry (R11). */
export const MAX_EVIDENCE_CHARS = 200;

export type NetContentEvidenceSource = "PHOTO" | "NAME" | "UNIT_LABEL";

export interface SuggesterPhoto {
  bytes: Uint8Array;
  contentType: string;
}

export interface SuggesterInput {
  name: string;
  unitLabel: string;
  /** Only ever a STAFF_UPLOAD / STAFF_CONFIRMED_PHOTO image — see lib/net-content-eligibility.ts. */
  photo: SuggesterPhoto | null;
}

export interface SuggesterUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  /** Reported by Workers AI directly when present; the script falls back to its rate table. */
  neurons: number | null;
}

/**
 * Three outcomes, kept apart on purpose (R15): a missing credential stops the whole run, a
 * transport fault writes NO row (so a transient throttle never marks a product attempted), and
 * only a genuine reply becomes a stored suggestion or NO_ANSWER.
 */
export type SuggesterResult =
  | { kind: "not-configured" }
  | { kind: "transport-error"; message: string; latencyMs: number }
  | { kind: "reply"; text: string; latencyMs: number; usage: SuggesterUsage };

export interface NetContentSuggester {
  readonly model: string;
  suggest(input: SuggesterInput): Promise<SuggesterResult>;
}

/** R9 — flag, then environment, then the default. Blank values do not count. */
export function resolveNetContentModel(
  flagValue: string | null | undefined,
  envValue: string | null | undefined,
): string {
  const flag = flagValue?.trim();
  if (flag) return flag;
  const env = envValue?.trim();
  if (env) return env;
  return DEFAULT_NET_CONTENT_MODEL;
}

/**
 * The instruction. Two owner decisions live here, not just in the validator:
 * - a product where net content does not apply gets a NULL answer, never `1 EACH` (2026-09-25);
 * - `EACH` is only for a count the packaging or text actually states.
 * The validator enforces both independently, because a prompt is a request, not a guarantee.
 */
export function buildNetContentPrompt(input: {
  name: string;
  unitLabel: string;
  hasPhoto: boolean;
}): string {
  return [
    "You read the net content (pack size) of one UK grocery product for a shop's catalogue.",
    "",
    `Product name: ${input.name}`,
    `Unit label: ${input.unitLabel}`,
    input.hasPhoto
      ? "A photo of the product's packaging is attached."
      : "No photo is available; use only the name and unit label.",
    "",
    "Reply with ONE JSON object and nothing else:",
    '{"amount": <whole number or null>, "unit": "GRAM"|"KILOGRAM"|"MILLILITRE"|"LITRE"|"EACH",',
    ' "confidence": <whole number 0-100>, "evidenceSource": "PHOTO"|"NAME"|"UNIT_LABEL",',
    ' "evidence": "<the exact text you relied on, copied character for character>"}',
    "",
    "Rules:",
    "- amount must be a whole number. Use the smaller unit for fractions: 0.5kg is 500 GRAM, 1.5L is 1500 MILLILITRE.",
    "- Only use a size written in metric units (g, kg, ml, cl, l) or a stated count of items.",
    '- If the size is only given in other units (pints, oz, lb), reply {"amount": null}. Do not convert it.',
    '- If working out the size would mean multiplying (for example "6 x 1.5L"), reply {"amount": null}.',
    "- evidenceSource NAME or UNIT_LABEL means evidence is copied exactly from that text above.",
    input.hasPhoto
      ? "- evidenceSource PHOTO means evidence is the text you read on the packaging."
      : "- Do not use evidenceSource PHOTO: there is no photo.",
    "- Use EACH only when a count of items is stated, such as '6 pack' or 'pack of 4'.",
    '- If net content does not apply to this product (for example an electrical item sold singly), reply {"amount": null}. Never answer 1 EACH for that.',
    '- If the pack size is not stated anywhere you can see, reply {"amount": null}. Do not guess.',
  ].join("\n");
}

function toBase64(bytes: Uint8Array): string {
  // btoa exists in Node 16+ and on Workers; chunked so a large image cannot overflow the
  // argument list of String.fromCharCode.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** The request body. Exported so a unit test can assert an image travels only when given one. */
export function buildNetContentRequestBody(
  input: SuggesterInput,
  model: string = DEFAULT_NET_CONTENT_MODEL,
): Record<string, unknown> {
  const prompt = buildNetContentPrompt({
    name: input.name,
    unitLabel: input.unitLabel,
    hasPhoto: input.photo !== null,
  });
  const content = input.photo
    ? [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: {
            url: `data:${input.photo.contentType};base64,${toBase64(input.photo.bytes)}`,
          },
        },
      ]
    : prompt;
  return {
    ...(NET_CONTENT_MODEL_REQUEST_OPTIONS[model] ?? {}),
    messages: [{ role: "user", content }],
    max_tokens: NET_CONTENT_MAX_TOKENS,
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Pulls the answer text and usage out of a Workers AI response. Chat-completion models (Gemma 4,
 * measured) answer in `result.choices[0].message.content`; older text models answer in
 * `result.response`. Both are read so swapping the model id is enough.
 */
export function readWorkersAiReply(payload: unknown): {
  text: string;
  usage: SuggesterUsage;
  truncated: boolean;
} {
  const result = (payload as { result?: Record<string, unknown> } | null)?.result ?? {};
  const choices = result.choices as
    | Array<{ message?: { content?: unknown }; finish_reason?: unknown }>
    | undefined;
  const choiceText = choices?.[0]?.message?.content;
  const text =
    typeof choiceText === "string"
      ? choiceText
      : typeof result.response === "string"
        ? result.response
        : "";
  const usage = (result.usage ?? {}) as Record<string, unknown>;
  return {
    text,
    truncated: choices?.[0]?.finish_reason === "length",
    usage: {
      inputTokens: numberOrNull(usage.prompt_tokens),
      outputTokens: numberOrNull(usage.completion_tokens),
      neurons: numberOrNull(usage.neurons),
    },
  };
}

export interface WorkersAiSuggesterOptions {
  /** Test seam; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Test seam; defaults to `getAiEnv()`. */
  credentials?: { accountId?: string; apiToken?: string };
  /** Test seam; defaults to NET_CONTENT_TIMEOUT_MS. */
  timeoutMs?: number;
}

/** The Workers AI implementation of `NetContentSuggester` (R10). Never throws. */
export function createWorkersAiNetContentSuggester(
  model: string,
  options: WorkersAiSuggesterOptions = {},
): NetContentSuggester {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? NET_CONTENT_TIMEOUT_MS;

  return {
    model,
    async suggest(input) {
      const credentials = options.credentials ?? {
        accountId: getAiEnv().CLOUDFLARE_ACCOUNT_ID,
        apiToken: getAiEnv().CLOUDFLARE_API_TOKEN,
      };
      if (!credentials.accountId || !credentials.apiToken) return { kind: "not-configured" };

      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(
          `https://api.cloudflare.com/client/v4/accounts/${credentials.accountId}/ai/run/${model}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${credentials.apiToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(buildNetContentRequestBody(input, model)),
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          return {
            kind: "transport-error",
            message: `Workers AI returned HTTP ${response.status}`,
            latencyMs: Date.now() - started,
          };
        }
        const payload: unknown = await response.json();
        const { text, usage, truncated } = readWorkersAiReply(payload);
        if (truncated) {
          // A reply cut off at the token ceiling is not an answer — storing it as NO_ANSWER would
          // permanently mark the product attempted over a budget artefact (measured at Build).
          return {
            kind: "transport-error",
            message: `Reply truncated at ${NET_CONTENT_MAX_TOKENS} tokens`,
            latencyMs: Date.now() - started,
          };
        }
        return { kind: "reply", text, latencyMs: Date.now() - started, usage };
      } catch (error) {
        return {
          kind: "transport-error",
          message: controller.signal.aborted
            ? `No reply within ${timeoutMs} ms`
            : error instanceof Error
              ? error.message
              : String(error),
          latencyMs: Date.now() - started,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export interface ValidatedSuggestion {
  amount: number;
  unit: NetContentUnit;
  confidence: number;
  evidenceSource: NetContentEvidenceSource;
  evidenceText: string;
}

const EVIDENCE_SOURCES: readonly NetContentEvidenceSource[] = ["PHOTO", "NAME", "UNIT_LABEL"];

function normaliseText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Does `text` state `count` as a whole number of its own? `6 pack` states 6; `16 pack` does not,
 * and neither does `1.5L` state 5 (R11's EACH rule).
 */
export function statesCount(text: string, count: number): boolean {
  return new RegExp(`(?<![\\d.,])${count}(?![\\d]|[.,]\\d)`).test(text);
}

function isWholeNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * R11 — the model's reply is untrusted input. Returns a suggestion only when every rule holds,
 * otherwise null (stored as NO_ANSWER). The two checks that matter most are anti-hallucination:
 * quoted NAME/UNIT_LABEL evidence must literally occur in that text, and PHOTO is only possible
 * when a photo was actually sent.
 */
export function validateNetContentReply(
  raw: string,
  context: { name: string; unitLabel: string; photoSent: boolean },
): ValidatedSuggestion | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end < start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const reply = parsed as Record<string, unknown>;

  const { amount, unit, confidence, evidenceSource, evidence } = reply;
  if (!isWholeNumberInRange(amount, 1, Number.MAX_SAFE_INTEGER)) return null;
  if (typeof unit !== "string" || !isNetContentUnit(unit)) return null;
  if (!isWholeNumberInRange(confidence, 0, 100)) return null;
  if (
    typeof evidenceSource !== "string" ||
    !(EVIDENCE_SOURCES as readonly string[]).includes(evidenceSource)
  ) {
    return null;
  }
  if (typeof evidence !== "string") return null;
  const evidenceText = evidence.trim();
  if (evidenceText === "" || evidenceText.length > MAX_EVIDENCE_CHARS) return null;

  const source = evidenceSource as NetContentEvidenceSource;
  if (source === "PHOTO" && !context.photoSent) return null;
  if (source === "NAME" && !normaliseText(context.name).includes(normaliseText(evidenceText))) {
    return null;
  }
  if (
    source === "UNIT_LABEL" &&
    !normaliseText(context.unitLabel).includes(normaliseText(evidenceText))
  ) {
    return null;
  }
  // Owner decision (2026-09-25): EACH only for a stated count, never "1 each" by default.
  if (unit === "EACH" && !statesCount(evidenceText, amount)) return null;

  return { amount, unit, confidence, evidenceSource: source, evidenceText };
}
