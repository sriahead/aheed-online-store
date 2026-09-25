import { checkSuggestionAgainstUnitLabel } from "@/lib/net-content-label-check";
import { choosePhotoEvidence, type CandidateImage } from "@/lib/net-content-eligibility";
import {
  validateNetContentReply,
  type NetContentSuggester,
  type SuggesterPhoto,
  type SuggesterUsage,
} from "@/lib/net-content-suggester";
import type { NewSuggestion } from "@/lib/repositories/net-content-suggestions";

/**
 * #900 (R13-R16) — the suggestion run's loop, with every side effect injected, so its stop rules
 * are unit-tested without a model, a database or a bucket. `scripts/suggest-net-content.ts` only
 * wires real dependencies into it.
 *
 * TWO BOUNDS, both required by the owner's "free first" direction:
 * - the caller's product list is already capped by --limit (max 100);
 * - no NEW call starts once the neurons spent reach the budget. Workers AI reports neurons per
 *   call (measured on Gemma 4 at Build); when it does not, the per-model rate table estimates them
 *   from token usage. A model missing from the table cannot be budgeted, so the script refuses it
 *   unless --unpriced-ok, and then --limit is the only bound.
 */

/** Neurons per MILLION tokens, from Cloudflare's Workers AI pricing page, read 2026-09-25. */
export const NET_CONTENT_MODEL_RATES: Record<string, { input: number; output: number }> = {
  "@cf/google/gemma-4-26b-a4b-it": { input: 9091, output: 27273 },
  "@cf/meta/llama-4-scout-17b-16e-instruct": { input: 24545, output: 77273 },
};

export const DEFAULT_NEURON_BUDGET = 5000;
export const MAX_CONSECUTIVE_TRANSPORT_ERRORS = 3;

/** Neurons one call cost: reported when available, otherwise estimated, otherwise unknown. */
export function neuronsForCall(
  usage: SuggesterUsage,
  rate: { input: number; output: number } | null,
): number | null {
  if (usage.neurons !== null) return usage.neurons;
  if (rate === null || usage.inputTokens === null || usage.outputTokens === null) return null;
  return (usage.inputTokens * rate.input + usage.outputTokens * rate.output) / 1_000_000;
}

export interface RunProduct {
  id: string;
  name: string;
  unitLabel: string;
  basePrice: number;
  images: CandidateImage[];
}

export interface RunDependencies {
  products: readonly RunProduct[];
  suggester: NetContentSuggester;
  /** Fetches a chosen photo's bytes; null when the object is missing (then no photo is sent). */
  loadPhoto(image: CandidateImage): Promise<SuggesterPhoto | null>;
  saveSuggestion(input: NewSuggestion): Promise<{ status: "PENDING" | "NO_ANSWER" }>;
  neuronBudget: number;
  /** Null for an unpriced model: the budget then applies only to reported neurons. */
  rate: { input: number; output: number } | null;
  log?(line: string): void;
}

export interface RunSummary {
  outcome: "completed" | "not-configured" | "budget-reached" | "transport-errors";
  attempted: number;
  pending: number;
  noAnswer: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  neurons: number;
  /** True when at least one call's cost could be neither read nor estimated. */
  neuronsIncomplete: boolean;
  meanLatencyMs: number | null;
}

export async function runNetContentSuggestions(deps: RunDependencies): Promise<RunSummary> {
  const log = deps.log ?? (() => {});
  const summary: RunSummary = {
    outcome: "completed",
    attempted: 0,
    pending: 0,
    noAnswer: 0,
    failed: 0,
    inputTokens: 0,
    outputTokens: 0,
    neurons: 0,
    neuronsIncomplete: false,
    meanLatencyMs: null,
  };
  let latencyTotal = 0;
  let consecutiveTransportErrors = 0;

  for (const product of deps.products) {
    if (summary.neurons >= deps.neuronBudget) {
      summary.outcome = "budget-reached";
      log(`neuron budget ${deps.neuronBudget} reached; not starting another call`);
      break;
    }

    const image = choosePhotoEvidence(product.images);
    const photo = image ? await deps.loadPhoto(image) : null;

    const result = await deps.suggester.suggest({
      name: product.name,
      unitLabel: product.unitLabel,
      photo,
    });

    if (result.kind === "not-configured") {
      // No row has been written by this point for this product; stop the whole run.
      summary.outcome = "not-configured";
      return finish(summary, latencyTotal);
    }

    summary.attempted += 1;
    latencyTotal += result.latencyMs;

    if (result.kind === "transport-error") {
      // No row: a transient fault must not mark the product as attempted (R15).
      summary.failed += 1;
      consecutiveTransportErrors += 1;
      log(`  failed ${product.name}: ${result.message}`);
      if (consecutiveTransportErrors >= MAX_CONSECUTIVE_TRANSPORT_ERRORS) {
        summary.outcome = "transport-errors";
        log(`${MAX_CONSECUTIVE_TRANSPORT_ERRORS} consecutive transport errors; stopping`);
        break;
      }
      continue;
    }
    consecutiveTransportErrors = 0;

    summary.inputTokens += result.usage.inputTokens ?? 0;
    summary.outputTokens += result.usage.outputTokens ?? 0;
    const neurons = neuronsForCall(result.usage, deps.rate);
    if (neurons === null) summary.neuronsIncomplete = true;
    else summary.neurons += neurons;

    const photoSent = photo !== null;
    const validated = validateNetContentReply(result.text, {
      name: product.name,
      unitLabel: product.unitLabel,
      photoSent,
    });

    const saved = await deps.saveSuggestion({
      productId: product.id,
      productImageId: photoSent && image ? image.id : null,
      value: validated
        ? {
            ...validated,
            unitLabelCheck: checkSuggestionAgainstUnitLabel(product.basePrice, product.unitLabel, {
              amount: validated.amount,
              unit: validated.unit,
            }),
          }
        : null,
      model: deps.suggester.model,
      latencyMs: result.latencyMs,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });

    if (saved.status === "PENDING") summary.pending += 1;
    else summary.noAnswer += 1;
    log(
      `  ${saved.status === "PENDING" ? "suggested" : "no answer"} ${product.name}` +
        (validated
          ? ` -> ${validated.amount} ${validated.unit} (${validated.evidenceSource})`
          : ""),
    );
  }

  return finish(summary, latencyTotal);
}

function finish(summary: RunSummary, latencyTotal: number): RunSummary {
  summary.meanLatencyMs = summary.attempted === 0 ? null : latencyTotal / summary.attempted;
  return summary;
}
