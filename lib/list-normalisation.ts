import { getAiEnv } from "@/lib/config";
import { MAX_LINE_QUANTITY, type ParsedLine } from "@/lib/shopping-list";

/**
 * AI normalisation pre-pass for "Shop your list" (P2.6 slice 4, #567).
 *
 * WHAT THIS DOES AND, MORE IMPORTANTLY, WHAT IT DOES NOT.
 * Free text in, structured items out — name, quantity, measure, brand — which are handed to the
 * EXISTING, UNCHANGED matcher in `lib/shopping-list.ts`, expanded through #566's synonym
 * dictionary. The model interprets the shopper's words; it never chooses a product. Every
 * candidate still comes from `matchProductListTerms`'s single vendor-scoped query against real
 * rows, so a hallucinated product name can at worst fail to match something — it can never BE a
 * match. That split is the whole design, and it is why the AI half needs no review step of its own:
 * the review step P3d already ships is the review step.
 *
 * WHY THIS ONE IS ON THE REQUEST PATH WHEN #571 SAID NO.
 * `#571` ruled that an AI call reachable from a public, unauthenticated endpoint is
 * attacker-controlled cost, and `#565` resolved it by moving AI offline behind a staff action. That
 * resolution genuinely cannot transfer here: `/shop-your-list` is public, and interpreting the list
 * IS the feature — the shopper is waiting for their basket. So the cost is bounded here instead, in
 * three independent ways, none of which can produce an error page:
 *   1. per-caller  — `lib/repositories/list-normalisation-rate-limit.ts`, consulted by the caller
 *   2. per-submission — MAX_AI_INPUT_CHARS below, plus shopping-list's existing MAX_LIST_LINES
 *   3. per-call    — NORMALISATION_TIMEOUT_MS, so a hung upstream cannot hang a form submit
 * Every failure path returns null and the caller falls through to exactly the deterministic
 * behaviour this feature shipped with in P3d. The fallback is real and already tested, which is
 * what makes a limit here cost the shopper nothing but the enrichment.
 *
 * Transport mirrors `lib/search-synonym-proposals.ts` exactly — the Cloudflare REST API with the
 * existing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN, no proprietary AI binding, keeping the
 * vendor-agnostic constraint. Everything except `normaliseList`'s own fetch is pure, so
 * `scripts/verify-list-normalisation.ts` can exercise it in plain Node with no request context.
 */

/** The model this pre-pass runs on. Same one #566's synonym proposals use. */
export const NORMALISATION_MODEL = "@cf/meta/llama-3.1-8b-instruct";

/**
 * Ceiling on the characters one submission may send to the model.
 *
 * MAX_LIST_LINES (100) already bounds a submission's LINES, but not its size: a hundred lines of
 * two thousand characters each is a legitimate-looking submission and an illegitimate prompt. This
 * is the second direction of the bound — 4000 characters is roughly a 100-line grocery list at 40
 * characters a line, so a real shopper never meets it and an abusive payload always does.
 */
export const MAX_AI_INPUT_CHARS = 4000;

/**
 * How long the shopper waits for interpretation before getting the deterministic result instead.
 *
 * A shopper pressing "Match my list" is blocked on this call, so an upstream that never answers
 * must not translate into a form that never returns. On timeout the pre-pass is abandoned and the
 * existing matcher runs, which is the same outcome as any other degradation here.
 */
export const NORMALISATION_TIMEOUT_MS = 6000;

/** Longest normalised name kept; anything longer is truncated rather than dropped. */
const MAX_NAME_CHARS = 100;

/**
 * One interpreted list line.
 *
 * `index` is the position in the ORIGINAL parsed list, not in the model's reply — see
 * `parseNormalisationResponse` for why the model is asked to carry it and why it is never trusted.
 */
export interface NormalisedItem {
  index: number;
  name: string;
  quantity: number;
  measure: string | null;
  brand: string | null;
}

/**
 * Is an AI credential configured at all?
 *
 * Exported so a caller can answer "would this submission reach the model?" WITHOUT paying for the
 * answer. The rate limiter writes a row every time it admits a caller, so consulting it before
 * this check would charge a shopper's budget on an environment that has no AI configured and was
 * never going to call anything (R22). Cheap and synchronous: `getAiEnv()` reads validated config,
 * not the network.
 */
export function isNormalisationConfigured(): boolean {
  const env = getAiEnv();
  return Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN);
}

/**
 * The exact text one submission would send. Exported so the caller can apply MAX_AI_INPUT_CHARS to
 * the real prompt rather than to an approximation of it — an estimate based on the shopper's own
 * characters ignores this preamble, so the two would disagree near the boundary and a submission
 * could pass the caller's guard, consume a rate-limit slot, and then be refused inside
 * `normaliseList` anyway. `normaliseList` re-applies the cap regardless, so the bound holds even
 * for a caller that skips this.
 */
export function buildNormalisationPrompt(lines: readonly ParsedLine[]): string {
  return [
    "You read UK grocery shopping lists, including South Asian terms and transliterations.",
    "Each numbered line below is one item a shopper typed. Interpret it.",
    "",
    ...lines.map((line, index) => `${index}. ${line.original}`),
    "",
    "For each line, output one JSON object with these keys:",
    '  "index"    - the line number above, as a number',
    '  "name"     - the product in plain catalogue English, spelling corrected, singular',
    '  "quantity" - how many the shopper wants, as a number; use 1 if they did not say',
    '  "measure"  - the pack size or weight they asked for, exactly as written (for example',
    '               "2kg", "500g", "1L"), or null if they did not give one',
    '  "brand"    - the brand they named, or null',
    "",
    "Rules:",
    "- Output one object per line, in order, and nothing else.",
    "- Never invent a product the shopper did not ask for. If a line is unclear, copy their",
    "  own words into 'name' rather than guessing at something else.",
    "- A weight or size belongs in 'measure', never in 'name' and never in 'quantity'.",
    "  '2kg atta' is quantity 1, measure '2kg', name 'atta'. It is not two of anything.",
    "- Reply with a JSON array only, no prose.",
  ].join("\n");
}

/**
 * Parses the model's reply defensively.
 *
 * A language model's output is untrusted input, not a return value: it may wrap the array in prose
 * despite the instruction, fence it as code, emit malformed JSON, skip lines, repeat lines, invent
 * fields, or return a hundred items for a three-line list.
 *
 * The defence is that `index` is validated rather than believed. An out-of-range, non-integer or
 * repeated index is dropped, so the model can never move an item onto a line the shopper did not
 * write, and `mergeNormalisedItems` then leaves every unclaimed line on its deterministic parse.
 * The worst a broken reply can do is degrade the list to today's behaviour, line by line.
 */
export function parseNormalisationResponse(raw: string, lineCount: number): NormalisedItem[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const items: NormalisedItem[] = [];
  const seen = new Set<number>();

  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const { index, name, quantity, measure, brand } = entry as {
      index?: unknown;
      name?: unknown;
      quantity?: unknown;
      measure?: unknown;
      brand?: unknown;
    };

    // The index must address a line the shopper actually typed. Not Number.isFinite: a
    // fractional or string index is a broken reply, not a roundable one.
    if (typeof index !== "number" || !Number.isInteger(index)) continue;
    if (index < 0 || index >= lineCount) continue;
    if (seen.has(index)) continue;

    if (typeof name !== "string") continue;
    const trimmed = name.trim();
    if (trimmed === "") continue;

    seen.add(index);
    items.push({
      index,
      name: trimmed.slice(0, MAX_NAME_CHARS),
      quantity: typeof quantity === "number" ? quantity : 1,
      measure: typeof measure === "string" && measure.trim() !== "" ? measure.trim() : null,
      brand: typeof brand === "string" && brand.trim() !== "" ? brand.trim() : null,
    });

    if (items.length >= lineCount) break;
  }

  return items;
}

/** Same clamp the deterministic parser applies, reused so both paths agree. */
function clampQuantity(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(Math.trunc(value), MAX_LINE_QUANTITY);
}

/** Lowercase word tokens of a normalised name; punctuation dropped, empties removed. */
function nameToTerms(name: string): string[] {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((token) => token.length > 0);
}

/**
 * Fold the model's items back onto the deterministically parsed lines.
 *
 * Returns exactly one entry per input line, in the input order, always. A line the model did not
 * claim comes back untouched — not merely equivalent but the same object's contents — so a partial
 * or empty reply degrades per line instead of corrupting the review.
 *
 * `brand` is deliberately NOT folded into `terms`. `Product` has no brand column (that is
 * #397/#569's facet work), so a brand can only ever match incidentally through a product's name:
 * adding it as a required term could only narrow an already-narrow AND, turning a findable product
 * into an unmatched line. It is retained on the line so the review step can show what the shopper
 * asked for, and so the facet work has somewhere to plug in.
 */
export function mergeNormalisedItems(
  lines: readonly ParsedLine[],
  items: readonly NormalisedItem[],
): ParsedLine[] {
  const byIndex = new Map<number, NormalisedItem>();
  for (const item of items) byIndex.set(item.index, item);

  return lines.map((line, index) => {
    const item = byIndex.get(index);
    if (!item) return line;

    const terms = nameToTerms(item.name);
    // A normalisation that tokenises to nothing usable is worse than no normalisation.
    if (terms.length === 0) return line;

    return {
      original: line.original,
      quantity: clampQuantity(item.quantity),
      terms,
      measure: item.measure,
      brand: item.brand,
    };
  });
}

/**
 * Ask the model to interpret the list. Returns null on EVERY failure — the caller falls through to
 * the deterministic matcher, so this function never throws and never surfaces an error to a
 * shopper.
 *
 * Exactly one fetch per invocation regardless of list length: the whole list goes in one prompt.
 * A 100-line list must not become 100 AI calls, for the same reason it must not become 100 queries.
 */
export async function normaliseList(lines: ParsedLine[]): Promise<NormalisedItem[] | null> {
  if (lines.length === 0) return null;

  const prompt = buildNormalisationPrompt(lines);
  if (prompt.length > MAX_AI_INPUT_CHARS) return null;

  const env = getAiEnv();
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) return null;

  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${NORMALISATION_MODEL}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
        // A shopper is blocked on this call, so it gets a deadline rather than a retry. The 429
        // backoff lib/image-generation.ts uses is right for a staff-triggered batch and wrong
        // here: waiting 2s then 4s to enrich a form submit is worse than not enriching it.
        signal: AbortSignal.timeout(NORMALISATION_TIMEOUT_MS),
      },
    );
  } catch {
    // Includes the abort: a timeout is a degradation, not an error.
    return null;
  }

  if (!response.ok) return null;

  // Unlike lib/search-synonym-proposals.ts, this parse is guarded: a 200 carrying a non-JSON body
  // is exactly the kind of upstream hiccup that must degrade rather than throw on the request path.
  let payload: { result?: { response?: unknown } };
  try {
    payload = (await response.json()) as { result?: { response?: unknown } };
  } catch {
    return null;
  }

  const text = typeof payload.result?.response === "string" ? payload.result.response : "";
  return parseNormalisationResponse(text, lines.length);
}
