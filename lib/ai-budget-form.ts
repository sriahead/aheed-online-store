/**
 * #1029 — the platform-admin AI budget form's state and parser. A plain module, because a
 * `"use server"` file may export only async functions (CLAUDE.md) and the form needs both.
 */

/** The largest daily budget the form accepts, in neurons. Above the shared allowance on purpose:
 * on the Paid plan a vendor may be allowed more than the free pool. */
export const MAX_AI_DAILY_BUDGET_NEURONS = 1_000_000;

export interface AiBudgetFormState {
  error: string | null;
  saved: boolean;
}

export const initialAiBudgetFormState: AiBudgetFormState = { error: null, saved: false };

/** An integer from 0 (AI off for this vendor) to `MAX_AI_DAILY_BUDGET_NEURONS`, or a reason. */
export function parseAiBudget(
  raw: unknown,
): { ok: true; value: number } | { ok: false; error: string } {
  const text = typeof raw === "string" ? raw.trim().replace(/,/g, "") : "";
  if (!/^\d+$/.test(text)) {
    return { ok: false, error: "Enter the daily budget as a whole number of neurons." };
  }
  const value = Number(text);
  if (value > MAX_AI_DAILY_BUDGET_NEURONS) {
    return {
      ok: false,
      error: `The daily budget can be at most ${MAX_AI_DAILY_BUDGET_NEURONS.toLocaleString("en-GB")} neurons.`,
    };
  }
  return { ok: true, value };
}
