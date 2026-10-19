/**
 * #1017 — the shape of a per-vendor AI budget check and the text a staff member sees when it
 * refuses. Import-free on purpose: `lib/net-content-review-form.ts` is imported by client
 * components, and this must reach them without dragging the ledger (lib/ai-meter.ts) along.
 *
 * #1028 added the platform half: which Workers plan the shared account is on, the shared daily
 * allowance a Free account enforces, and the Paid-plan charge estimate the staff AI page shows.
 */

/** #1028 — the shared Cloudflare account's Workers plan (`WORKERS_AI_PLAN`, lib/config.ts). */
export type WorkersAiPlan = "free" | "paid";

/**
 * #1028 — Cloudflare's shared Workers AI allowance per UTC day, in neurons. On Free, exhausting it
 * stops every vendor's AI until 00:00 UTC; on Paid, usage above it is billed.
 */
export const WORKERS_AI_DAILY_ALLOWANCE_NEURONS = 10_000;

export interface AiBudgetCheck {
  allowed: boolean;
  /**
   * #1028 — whose limit decided a refusal: this vendor's own budget, or (Free plan only) the
   * platform's shared daily allowance. Always "vendor" when the call is allowed.
   */
  scope: "vendor" | "platform";
  /** Neurons spent since 00:00 UTC today — this vendor's, or the platform's for a platform refusal. */
  usedNeurons: number;
  /** The limit those neurons are measured against — the vendor's budget, or the shared allowance. */
  budgetNeurons: number;
}

export function describeAiBudgetRefusal(
  check: Pick<AiBudgetCheck, "usedNeurons" | "budgetNeurons"> & { scope?: AiBudgetCheck["scope"] },
): string {
  const used = Math.ceil(check.usedNeurons).toLocaleString("en-GB");
  const budget = check.budgetNeurons.toLocaleString("en-GB");
  if (check.scope === "platform") {
    return `The platform's shared AI allowance for today is used up (${used} of ${budget} neurons). It resets at 00:00 UTC.`;
  }
  return `This store has used its AI allowance for today (${used} of ${budget} neurons). It resets at 00:00 UTC.`;
}

/**
 * #1029 — the estimated Paid-plan charge, in whole US cents, for `usedNeurons` of platform usage in
 * one day: $0.011 per 1,000 neurons above the shared allowance, i.e. 11 cents per 10,000, rounded
 * up to the cent. Integer arithmetic only (CLAUDE.md: no floats for money).
 */
export function estimatedPaidChargeCents(usedNeurons: number): number {
  const over = Math.max(0, Math.ceil(usedNeurons) - WORKERS_AI_DAILY_ALLOWANCE_NEURONS);
  return Math.ceil((over * 11) / 10_000);
}

/** "$0.14" — the charge estimate as dollars for display. */
export function formatUsdCents(cents: number): string {
  return `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
