"use client";

import { useActionState } from "react";
import { saveAiBudget } from "@/features/admin/ai-budget";
import { initialAiBudgetFormState, MAX_AI_DAILY_BUDGET_NEURONS } from "@/lib/ai-budget-form";
import { buttonClass, inputClass, labelClass } from "@/lib/form-classes";
import { Icon } from "@/components/icons/Icon";

/**
 * #1029 — the platform admin's control for this store's daily Workers AI budget. Rendered only for
 * a platform admin; `saveAiBudget` re-checks that itself, because hiding a form is not the control.
 */
export function AiBudgetForm({ budgetNeurons }: { budgetNeurons: number }) {
  const [state, action, saving] = useActionState(saveAiBudget, initialAiBudgetFormState);

  return (
    <form action={action} className="space-y-3">
      {state.error && (
        <p
          role="alert"
          className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger"
        >
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p
          role="status"
          className="rounded-xl bg-action-tint px-4 py-3 text-sm font-medium text-primary"
        >
          AI budget saved.
        </p>
      )}
      <div>
        <label className={labelClass} htmlFor="aiDailyNeuronBudget">
          Daily AI budget (neurons)
        </label>
        <input
          id="aiDailyNeuronBudget"
          name="aiDailyNeuronBudget"
          type="number"
          min={0}
          max={MAX_AI_DAILY_BUDGET_NEURONS}
          step={1}
          required
          defaultValue={budgetNeurons}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-primary-muted">
          0 switches AI off for this store. Resets at 00:00 UTC each day.
        </p>
      </div>
      <button type="submit" disabled={saving} className={buttonClass}>
        <Icon name="save" className="h-4 w-4" />
        {saving ? "Saving…" : "Save budget"}
      </button>
    </form>
  );
}
