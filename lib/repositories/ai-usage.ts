import type { getPrisma } from "@/lib/db";

/**
 * The per-vendor Workers AI ledger and budget (#1017).
 *
 * Every vendor shares one Cloudflare account credential (`getAiEnv()`, lib/config.ts), so the
 * account's daily neuron allowance is one pool. This table is the only place a vendor's share of it
 * is recorded, and `VendorConfig.aiDailyNeuronBudget` is the only cap on that share. The decisions
 * built on top of it — when to refuse, how to round, what a refusal says — live in lib/ai-meter.ts;
 * this file only reads and writes rows.
 *
 * `prisma` and `vendorId` are explicit parameters (#409/#411) so the ledger can be exercised against
 * a real database from a plain tsx script — the meter is a cost control, and a cost control that can
 * only run inside a live Workers request cannot be tested before it matters.
 *
 * Every write here is a singular `create` with no nested writes, or a `deleteMany` — both confirmed
 * safe on the HTTP adapter per CLAUDE.md — so `getPrisma()` is the right client for all of it.
 */

type Prisma = ReturnType<typeof getPrisma>;

/** Platform default when a vendor has no VendorConfig row; matches the column's `@default`. */
export const DEFAULT_AI_DAILY_NEURON_BUDGET = 3000;

// Ninety days: long enough to read a quarter's spend per vendor, short enough that the ledger never
// becomes the largest table in the database. Same low-probability sweep as the rate limiters, so the
// extra deleteMany does not add latency to every AI call.
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const SWEEP_PROBABILITY = 0.01;

export type AiFeature =
  "LIST_NORMALISATION" | "SEARCH_SYNONYMS" | "NET_CONTENT" | "PRODUCT_IMAGE" | "CAMPAIGN_IMAGE";

export interface AiUsageEntry {
  feature: AiFeature;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Neurons, fractional; stored x1000 as an integer, rounded UP so the ledger never under-counts. */
  neurons: number;
  neuronSource: "REPORTED" | "ESTIMATED";
}

export async function recordAiUsage(
  prisma: Prisma,
  vendorId: string,
  entry: AiUsageEntry,
): Promise<void> {
  await prisma.aiUsageEvent.create({
    data: {
      vendorId,
      feature: entry.feature,
      model: entry.model,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      milliNeurons: Math.ceil(entry.neurons * 1000),
      neuronSource: entry.neuronSource,
    },
  });

  if (Math.random() < SWEEP_PROBABILITY) {
    await prisma.aiUsageEvent.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
    });
  }
}

/** This vendor's summed milli-neurons since `since`; 0 when there are no rows. */
export async function sumVendorMilliNeuronsSince(
  prisma: Prisma,
  vendorId: string,
  since: Date,
): Promise<number> {
  const result = await prisma.aiUsageEvent.aggregate({
    where: { vendorId, createdAt: { gte: since } },
    _sum: { milliNeurons: true },
  });
  return result._sum.milliNeurons ?? 0;
}

/** This vendor's daily budget in neurons, or the platform default when it has no VendorConfig. */
export async function getVendorAiDailyBudget(prisma: Prisma, vendorId: string): Promise<number> {
  const config = await prisma.vendorConfig.findUnique({
    where: { vendorId },
    select: { aiDailyNeuronBudget: true },
  });
  return config?.aiDailyNeuronBudget ?? DEFAULT_AI_DAILY_NEURON_BUDGET;
}
