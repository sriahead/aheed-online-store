import { getPrisma } from "@/lib/db";
import { getAiEnv } from "@/lib/config";
import { startOfUtcDay } from "@/lib/ai-meter";
import type { WorkersAiPlan } from "@/lib/ai-budget-message";
import {
  AI_FEATURES,
  getVendorAiDailyBudget,
  setVendorAiDailyBudget,
  sumPlatformMilliNeuronsSince,
  sumVendorMilliNeuronsByFeatureSince,
  sumVendorMilliNeuronsSince,
  type AiFeature,
} from "@/lib/repositories/ai-usage";

/**
 * #1029 — request-scoped reads and the one write behind `/staff/ai-usage`. Beside, not inside,
 * `lib/repositories/` (tests/repository-purity.test.ts): the repository functions take their client
 * and `vendorId` explicitly; this file supplies a fresh client per call (never cached, CLAUDE.md).
 * The caller passes the vendor it already holds from `requireVendorRole`, never one from a form.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AiUsageOverview {
  plan: WorkersAiPlan;
  /** This vendor's neurons since 00:00 UTC today. */
  usedNeuronsToday: number;
  budgetNeurons: number;
  /** Every vendor's neurons since 00:00 UTC today — the shared allowance's consumption. */
  platformNeuronsToday: number;
  /** One row per metered feature: today, and the last seven UTC days (today plus the six before). */
  features: { feature: AiFeature; todayNeurons: number; sevenDayNeurons: number }[];
}

export async function getAiUsageOverview(vendorId: string): Promise<AiUsageOverview> {
  const prisma = getPrisma();
  const today = startOfUtcDay(new Date());
  const sevenDaysAgo = new Date(today.getTime() - 6 * DAY_MS);
  const [used, budgetNeurons, platform, todayByFeature, weekByFeature] = await Promise.all([
    sumVendorMilliNeuronsSince(prisma, vendorId, today),
    getVendorAiDailyBudget(prisma, vendorId),
    sumPlatformMilliNeuronsSince(prisma, today),
    sumVendorMilliNeuronsByFeatureSince(prisma, vendorId, today),
    sumVendorMilliNeuronsByFeatureSince(prisma, vendorId, sevenDaysAgo),
  ]);
  return {
    plan: getAiEnv().WORKERS_AI_PLAN,
    usedNeuronsToday: used / 1000,
    budgetNeurons,
    platformNeuronsToday: platform / 1000,
    features: AI_FEATURES.map((feature) => ({
      feature,
      todayNeurons: (todayByFeature.get(feature) ?? 0) / 1000,
      sevenDayNeurons: (weekByFeature.get(feature) ?? 0) / 1000,
    })),
  };
}

/**
 * Write a vendor's daily budget. Authorisation and validation are the caller's (the server action).
 * `false` when the vendor has no `VendorConfig` row to write to (#1161).
 */
export async function setAiDailyBudgetForVendor(
  vendorId: string,
  budgetNeurons: number,
): Promise<boolean> {
  return setVendorAiDailyBudget(getPrisma(), vendorId, budgetNeurons);
}
