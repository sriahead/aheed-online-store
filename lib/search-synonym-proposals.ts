import { getAiEnv } from "@/lib/config";

/**
 * AI-proposed synonyms for staff approval (P2.6 slice 3, #566).
 *
 * WHY THIS IS NOT ON THE REQUEST PATH, AND MUST NEVER BE.
 * `#571` ruled that an AI call reachable from `/search` — a public, unauthenticated endpoint, on a
 * stack with no middleware layer available to rate-limit it centrally (see CLAUDE.md on `proxy.ts`)
 * — is attacker-controlled cost against a Workers AI quota already shared with the product-image
 * pipeline. So AI here only ever PROPOSES rows, offline, when a signed-in store admin presses a
 * button; every proposal lands as `PENDING` and reaches a shopper only once a human approves it.
 * The storefront read path never imports this module.
 *
 * Transport is the plain Cloudflare REST API with the existing `CLOUDFLARE_ACCOUNT_ID` /
 * `CLOUDFLARE_API_TOKEN`, exactly as `lib/image-generation.ts` does — no new credential, no new
 * infrastructure, and no proprietary AI binding, keeping the vendor-agnostic constraint.
 */

/**
 * How many distinct failing queries one run sends to the model.
 *
 * Bounded because the prompt is built from them and a run is a paid call: an unbounded log read
 * would make the cost of pressing the button a function of how long the log has been accumulating.
 */
export const PROPOSAL_QUERY_LIMIT = 50;

/** Ceiling on what one run will write, however many the model returns. */
export const PROPOSAL_RESULT_LIMIT = 25;

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

export interface SynonymProposal {
  alias: string;
  canonical: string;
}

export type ProposalResult =
  | { ok: true; proposals: SynonymProposal[] }
  | { ok: false; error: string };

function buildPrompt(queries: readonly string[], vocabulary: readonly string[]): string {
  return [
    "You map words UK grocery shoppers type into the words a South Asian grocery catalogue uses.",
    "",
    "Failed or near-miss searches:",
    ...queries.map((query) => `- ${query}`),
    "",
    "Words that appear in this shop's product names:",
    vocabulary.join(", "),
    "",
    "For each failed search that is a genuine synonym, transliteration or regional name for",
    "something in the vocabulary list, output one JSON object with keys 'alias' (what the shopper",
    "typed) and 'canonical' (the catalogue's word). Skip anything you are unsure about, and skip",
    "misspellings — those are handled elsewhere. Reply with a JSON array only, no prose.",
  ].join("\n");
}

/**
 * Parses the model's reply defensively.
 *
 * A language model's output is untrusted input, not a return value: it may wrap the array in prose
 * despite the instruction, emit malformed JSON, or invent fields. Anything that is not two non-empty
 * strings is dropped rather than repaired, and the whole batch is capped. Nothing here reaches a
 * shopper regardless — every row lands `PENDING` — but a staff approval queue full of garbage is
 * its own way of making the feature useless.
 */
export function parseProposalResponse(raw: string): SynonymProposal[] {
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

  const proposals: SynonymProposal[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const { alias, canonical } = entry as { alias?: unknown; canonical?: unknown };
    if (typeof alias !== "string" || typeof canonical !== "string") continue;
    const a = alias.trim().toLowerCase();
    const c = canonical.trim().toLowerCase();
    if (a === "" || c === "" || a === c) continue;
    proposals.push({ alias: a, canonical: c });
    if (proposals.length >= PROPOSAL_RESULT_LIMIT) break;
  }
  return proposals;
}

/**
 * Ask the model for alias mappings. Degrades to a message rather than throwing when the account
 * credentials are absent, matching `lib/image-generation.ts` — a store without AI configured must
 * still be able to open and use the dictionary page.
 */
export async function proposeSynonyms(
  queries: readonly string[],
  vocabulary: readonly string[],
): Promise<ProposalResult> {
  if (queries.length === 0) {
    return { ok: false, error: "No failed searches to learn from yet." };
  }

  const env = getAiEnv();
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    return {
      ok: false,
      error: "AI suggestions are not configured for this environment. Add entries by hand instead.",
    };
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: buildPrompt(queries, vocabulary) }],
        }),
      },
    );
  } catch {
    return { ok: false, error: "Could not reach the AI service. Try again in a moment." };
  }

  if (!response.ok) {
    return {
      ok: false,
      error:
        response.status === 429
          ? "The AI service is busy right now. Try again in a few seconds."
          : `The AI service returned an error (${response.status}).`,
    };
  }

  const payload = (await response.json()) as { result?: { response?: unknown } };
  const text = typeof payload.result?.response === "string" ? payload.result.response : "";
  return { ok: true, proposals: parseProposalResponse(text) };
}
