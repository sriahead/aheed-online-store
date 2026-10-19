import type { getPrisma } from "@/lib/db";
import {
  getVendorAiDailyBudget,
  recordAiUsage,
  sumPlatformMilliNeuronsSince,
  sumVendorMilliNeuronsSince,
  type AiFeature,
} from "@/lib/repositories/ai-usage";
import {
  WORKERS_AI_DAILY_ALLOWANCE_NEURONS,
  type AiBudgetCheck,
  type WorkersAiPlan,
} from "@/lib/ai-budget-message";
import { neuronsForImage, neuronsForTextCall, type WorkersAiUsage } from "@/lib/workers-ai";

export type { AiFeature } from "@/lib/repositories/ai-usage";
// The refusal text lives in an import-free module so client components that import a form-state
// module (lib/net-content-review-form.ts) do not pull the ledger into the browser bundle.
export { describeAiBudgetRefusal } from "@/lib/ai-budget-message";

/**
 * The per-vendor Workers AI meter (#1017): check a vendor's daily budget before a call, record what
 * the call cost after it.
 *
 * WHY A BUDGET AND NOT JUST A LEDGER. Every vendor shares one Cloudflare account, so the account's
 * daily allowance is one pool. On the Workers Free plan, exhausting it stops every vendor's AI until
 * 00:00 UTC; on Paid, it bills the platform without attribution.
 *
 * #1028 — THE PLAN IS A PARAMETER (`WORKERS_AI_PLAN`, Free by default). On Free, a call is also
 * refused once the PLATFORM's total since 00:00 UTC reaches the shared allowance, so the platform
 * stops itself before Cloudflare does — with a message that says it is the platform, not the store,
 * that is out. On Paid there is no shared cap; only each vendor's own budget applies. The vendor
 * check runs first, so a vendor over its own budget is told so even when the pool is also empty.
 * The shared total counts only this platform's ledger (partly estimated, see lib/workers-ai.ts):
 * other usage on the same Cloudflare account is invisible to it.
 *
 * Takes `prisma` explicitly (no request context) so scripts use it directly; the request-scoped
 * facade is lib/ai-meter-service.ts. A meter is built per request or per script run, never held at
 * module scope (CLAUDE.md's fresh-client rule).
 *
 * BEST-EFFORT, NOT COMPARE-AND-SET. Two concurrent calls can each pass a check just under budget, so
 * the overshoot is bounded by the calls in flight — the same trade the rate limiters make. A
 * `$transaction` around every AI call would cost more than the few neurons it protects.
 */

type Prisma = ReturnType<typeof getPrisma>;

export type { AiBudgetCheck } from "@/lib/ai-budget-message";

export interface AiMeter {
  check(): Promise<AiBudgetCheck>;
  /** Record a text call. Never throws: the neurons are already spent, so a ledger fault must not fail the feature. */
  record(call: { model: string; usage: WorkersAiUsage }): Promise<void>;
  /** Record one generated image. Never throws, for the same reason. */
  recordImage(call: { model: string }): Promise<void>;
}

/** 00:00 UTC on the day `now` falls in — the moment Cloudflare's daily allowance resets. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function createAiMeter(
  prisma: Prisma,
  vendorId: string,
  feature: AiFeature,
  plan: WorkersAiPlan,
): AiMeter {
  return {
    async check() {
      try {
        const since = startOfUtcDay(new Date());
        const [milliNeurons, budgetNeurons, platformMilliNeurons] = await Promise.all([
          sumVendorMilliNeuronsSince(prisma, vendorId, since),
          getVendorAiDailyBudget(prisma, vendorId),
          // Paid has no shared cap, so the platform total is not even read.
          plan === "free" ? sumPlatformMilliNeuronsSince(prisma, since) : Promise.resolve(0),
        ]);
        const usedNeurons = milliNeurons / 1000;
        if (usedNeurons >= budgetNeurons) {
          return { allowed: false, scope: "vendor", usedNeurons, budgetNeurons };
        }
        const platformNeurons = platformMilliNeurons / 1000;
        if (plan === "free" && platformNeurons >= WORKERS_AI_DAILY_ALLOWANCE_NEURONS) {
          return {
            allowed: false,
            scope: "platform",
            usedNeurons: platformNeurons,
            budgetNeurons: WORKERS_AI_DAILY_ALLOWANCE_NEURONS,
          };
        }
        return { allowed: true, scope: "vendor", usedNeurons, budgetNeurons };
      } catch (error) {
        // Fail CLOSED: this meter exists to stop spend, and every caller already has a degraded
        // path that costs nothing. A database fault is not a reason to spend unmetered.
        console.error(`ai-meter check failed vendor=${vendorId} feature=${feature}`, error);
        return { allowed: false, scope: "vendor", usedNeurons: 0, budgetNeurons: 0 };
      }
    },

    async record({ model, usage }) {
      const { neurons, source } = neuronsForTextCall(model, usage);
      await write({
        feature,
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        neurons,
        neuronSource: source,
      });
    },

    async recordImage({ model }) {
      await write({
        feature,
        model,
        inputTokens: null,
        outputTokens: null,
        neurons: neuronsForImage(model),
        neuronSource: "ESTIMATED",
      });
    },
  };

  async function write(entry: Parameters<typeof recordAiUsage>[2]): Promise<void> {
    try {
      await recordAiUsage(prisma, vendorId, entry);
    } catch (error) {
      console.error(`ai-meter record failed vendor=${vendorId} feature=${feature}`, error);
    }
  }
}
