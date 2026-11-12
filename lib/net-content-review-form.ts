import { describeAiBudgetRefusal } from "@/lib/ai-budget-message";
import type { StaffNetContentRunResult } from "@/lib/net-content-suggestions-service";

/**
 * #900 — the review form's state, in a PLAIN module. `features/admin/net-content-suggestions.ts`
 * is a "use server" file and may export only async functions (CLAUDE.md: a single exported
 * constant there makes every action in the file 500 at runtime while every check stays green).
 */
export interface NetContentReviewState {
  error: string | null;
  notice: string | null;
}

export const initialNetContentReviewState: NetContentReviewState = { error: null, notice: null };

/**
 * #927 (R6) — the "Suggest net content" button's inline outcome. Pure, so every wording is
 * unit-tested; exactly one of `error`/`notice` is set.
 */
export function describeStaffNetContentRun(
  result: StaffNetContentRunResult,
): NetContentReviewState {
  const state = describeModelRun(result);
  if (!result.ruled) return state;
  // #697 — the free rule step's count leads, whatever the model step then did.
  const ruled = `Read ${result.ruled} pack size(s) from product names and per-kg prices, without AI; they are in the queue below.`;
  if (result.kind === "nothing-eligible") {
    return { error: null, notice: `${ruled} No other products were waiting for the AI.` };
  }
  // The form shows an error OR a notice, so a model-step refusal is folded into the notice rather
  // than hiding the rule step's real progress.
  return state.error
    ? { error: null, notice: `${ruled} The AI step did not run: ${state.error}` }
    : { error: null, notice: `${ruled} ${state.notice ?? ""}`.trim() };
}

function describeModelRun(result: StaffNetContentRunResult): NetContentReviewState {
  switch (result.kind) {
    case "unpriced-model":
      return {
        error: `The AI model ${result.model} has no cost rate, so it can't be run from here. Nothing was asked.`,
        notice: null,
      };
    case "nothing-eligible":
      return { error: null, notice: "No products are waiting for a net-content suggestion." };
    case "not-configured":
      return { error: "The AI isn't set up for this store, so nothing was asked.", notice: null };
    case "ran": {
      const { attempted, pending, noAnswer, failed, neurons, outcome } = result.summary;
      const counts = `Asked about ${attempted} product(s): ${pending} suggested, ${noAnswer} no answer, ${failed} failed`;
      if (outcome === "vendor-budget-reached" && result.summary.vendorBudget) {
        // #1017 — the store's whole-day AI budget, not this click's: clicking again won't help.
        return { error: describeAiBudgetRefusal(result.summary.vendorBudget), notice: null };
      }
      if (outcome === "transport-errors") {
        return {
          error: `The AI stopped responding. ${counts}. Try again later.`,
          notice: null,
        };
      }
      const completed = `${counts} (about ${Math.round(neurons)} neurons).`;
      return {
        error: null,
        notice:
          outcome === "budget-reached"
            ? `${completed} Stopped at this click's AI budget; click again for more.`
            : completed,
      };
    }
  }
}
