/**
 * #1017 — the shape of a per-vendor AI budget check and the text a staff member sees when it
 * refuses. Import-free on purpose: `lib/net-content-review-form.ts` is imported by client
 * components, and this must reach them without dragging the ledger (lib/ai-meter.ts) along.
 */

export interface AiBudgetCheck {
  allowed: boolean;
  /** Neurons this vendor has spent since 00:00 UTC today. */
  usedNeurons: number;
  /** This vendor's daily budget in neurons. */
  budgetNeurons: number;
}

export function describeAiBudgetRefusal(
  check: Pick<AiBudgetCheck, "usedNeurons" | "budgetNeurons">,
): string {
  const used = Math.ceil(check.usedNeurons).toLocaleString("en-GB");
  const budget = check.budgetNeurons.toLocaleString("en-GB");
  return `This store has used its AI allowance for today (${used} of ${budget} neurons). It resets at 00:00 UTC.`;
}
