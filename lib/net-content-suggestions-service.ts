import { createAiMeter } from "@/lib/ai-meter";
import { getAiEnv } from "@/lib/config";
import { getPrisma, getPrismaWs } from "@/lib/db";
import {
  NET_CONTENT_MODEL_RATES,
  runNetContentSuggestions,
  type RunSummary,
} from "@/lib/net-content-run";
import {
  createWorkersAiNetContentSuggester,
  resolveNetContentModel,
} from "@/lib/net-content-suggester";
import {
  createNetContentSuggestion,
  listEligibleProductsForNetContent,
  listNetContentSummaryRows,
  listPendingNetContentSuggestions,
  rejectNetContentSuggestion,
  reviewNetContentSuggestion,
  type ReviewDecision,
} from "@/lib/repositories/net-content-suggestions";
import { getVendorConfig } from "@/lib/repositories/vendor";
import { RULES_MODEL, suggestNetContentByRule } from "@/lib/net-content-rules";
import { getStorage } from "@/lib/storage";

/**
 * #900 — request-scoped facade over lib/repositories/net-content-suggestions.ts, per CLAUDE.md's
 * repository rule. Client choice (#382): the reads and the singular-update reject use the HTTP
 * client; accept/edit run an interactive transaction with `updateMany`, so they take WebSocket.
 */

export function listPendingNetContentSuggestionsForVendor(vendorId: string) {
  return listPendingNetContentSuggestions(getPrisma(), vendorId);
}

export function listNetContentSummaryRowsForVendor(vendorId: string) {
  return listNetContentSummaryRows(getPrisma(), vendorId);
}

export function reviewNetContentSuggestionForVendor(
  vendorId: string,
  suggestionId: string,
  reviewerUserId: string,
  decision: ReviewDecision,
) {
  return reviewNetContentSuggestion(
    getPrismaWs(),
    vendorId,
    suggestionId,
    reviewerUserId,
    decision,
  );
}

/**
 * #927 — one click of `/staff/net-content`'s "Suggest net content" button. Deliberately small: the
 * image backfill's batch size, and roughly three times the measured cost of ten calls (≈50 neurons
 * on Gemma 4 in #901's production pilot), so one click cannot drain the shared daily allowance.
 */
export const STAFF_RUN_PRODUCT_LIMIT = 10;
export const STAFF_RUN_NEURON_BUDGET = 150;

/**
 * #697 — how many products the free rule step reads per click. Generous on purpose: a rule costs
 * nothing, and every product it answers is one fewer for the paid model.
 */
export const RULE_RUN_PRODUCT_LIMIT = 500;

/** `ruled` (#697) is how many suggestions the rule step queued this click; absent when none. */
export type StaffNetContentRunResult = { ruled?: number } & (
  | { kind: "unpriced-model"; model: string }
  | { kind: "nothing-eligible" }
  | { kind: "not-configured" }
  | { kind: "ran"; summary: RunSummary }
);

/**
 * #927 — the same wiring `scripts/suggest-net-content.ts` does, for the signed-in vendor, bounded
 * per click. The run loop, eligibility and validation are #900's, unchanged; like the script, this
 * only writes `NetContentSuggestion` rows, never `Product`.
 *
 * A model missing from the rate table is refused outright: the script's `--unpriced-ok` escape
 * hatch has no button equivalent, because a click's spend must always be budgeted.
 */
export async function runNetContentSuggestionsForVendor(
  vendorId: string,
): Promise<StaffNetContentRunResult> {
  // #697 — rules first: free and exact where they apply. Each answer becomes a PENDING suggestion,
  // which also takes that product out of the model's eligible list below.
  const ruled = await queueRuleSuggestions(vendorId);
  const result = await runModelSuggestions(vendorId);
  return ruled > 0 ? { ...result, ruled } : result;
}

/**
 * #697 — queue a rule-read suggestion (`lib/net-content-rules.ts`) for every eligible product the
 * rules can read. Products they cannot read get no row, so the model is still asked about them.
 */
async function queueRuleSuggestions(vendorId: string): Promise<number> {
  const prisma = getPrisma();
  const products = await listEligibleProductsForNetContent(
    prisma,
    vendorId,
    { includeAttempted: false },
    RULE_RUN_PRODUCT_LIMIT,
  );
  let queued = 0;
  for (const product of products) {
    const value = suggestNetContentByRule(product);
    if (!value) continue;
    await createNetContentSuggestion(prisma, vendorId, {
      productId: product.id,
      productImageId: null,
      value,
      model: RULES_MODEL,
      latencyMs: 0,
      inputTokens: null,
      outputTokens: null,
    });
    queued++;
  }
  return queued;
}

async function runModelSuggestions(vendorId: string): Promise<StaffNetContentRunResult> {
  const model = resolveNetContentModel(undefined, getAiEnv().NET_CONTENT_AI_MODEL);
  const rate = NET_CONTENT_MODEL_RATES[model];
  if (!rate) return { kind: "unpriced-model", model };

  const prisma = getPrisma();
  const products = await listEligibleProductsForNetContent(
    prisma,
    vendorId,
    { includeAttempted: false },
    STAFF_RUN_PRODUCT_LIMIT,
  );
  if (products.length === 0) return { kind: "nothing-eligible" };

  const config = await getVendorConfig(prisma, vendorId);
  const storage = getStorage();

  const summary = await runNetContentSuggestions({
    products,
    suggester: createWorkersAiNetContentSuggester(model),
    storeDescription: config?.storeDescription ?? null,
    neuronBudget: STAFF_RUN_NEURON_BUDGET,
    rate,
    aiMeter: createAiMeter(prisma, vendorId, "NET_CONTENT", getAiEnv().WORKERS_AI_PLAN),
    async loadPhoto(image) {
      const [head, bytes] = await Promise.all([
        storage.headObject(image.storageKey),
        storage.getObject(image.storageKey),
      ]);
      if (!bytes) return null;
      return { bytes: new Uint8Array(bytes), contentType: head?.contentType ?? "image/webp" };
    },
    saveSuggestion: (input) => createNetContentSuggestion(prisma, vendorId, input),
  });

  if (summary.outcome === "not-configured") return { kind: "not-configured" };
  return { kind: "ran", summary };
}

export function rejectNetContentSuggestionForVendor(
  vendorId: string,
  suggestionId: string,
  reviewerUserId: string,
) {
  return rejectNetContentSuggestion(getPrisma(), vendorId, suggestionId, reviewerUserId);
}
