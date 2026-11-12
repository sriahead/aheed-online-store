"use client";

import { useActionState, useEffect, useState } from "react";
import { saveBulkQuantities } from "@/features/admin/product-quantities";
import {
  BULK_QUANTITY_FORM_ID,
  MAX_BULK_QUANTITY,
  ORIG_PREFIX,
  QTY_PREFIX,
  initialBulkQuantityState,
} from "@/lib/bulk-quantity";
import { BULK_PRODUCTS_FORM_ID } from "@/lib/product-restriction-form";
import { inputClass } from "@/lib/form-classes";
import { Icon } from "@/components/icons/Icon";

/** The quantity boxes on this page (bound to the form by `form=`, not nesting). */
function quantityInputs(): HTMLInputElement[] {
  return [
    ...document.querySelectorAll<HTMLInputElement>(
      `input[form="${BULK_QUANTITY_FORM_ID}"][name^="${QTY_PREFIX}"]`,
    ),
  ];
}

function originalOf(input: HTMLInputElement): string {
  const id = input.name.slice(QTY_PREFIX.length);
  const orig = document.querySelector<HTMLInputElement>(
    `input[form="${BULK_QUANTITY_FORM_ID}"][name="${ORIG_PREFIX}${id}"]`,
  );
  return (orig?.value ?? "").trim();
}

function countChanged(): number {
  return quantityInputs().filter((input) => {
    const value = input.value.trim();
    return value !== "" && value !== originalOf(input);
  }).length;
}

/**
 * #1523 — bulk stock counts on /staff/products.
 *
 * Two ways in, one Save: type into any row's quantity box, or tick rows (the same checkboxes the
 * bulk-actions bar uses) and "Set selected to N". Nothing is written until Save, and the bar shows
 * how many rows are changed, so a person always knows what Save will do before pressing it.
 * Changed boxes are highlighted by the `data-changed` attribute this component maintains.
 */
export function BulkQuantityBar() {
  const [state, action, pending] = useActionState(saveBulkQuantities, initialBulkQuantityState);
  const [changed, setChanged] = useState(0);
  const [setTo, setSetTo] = useState("");

  useEffect(() => {
    const refresh = () => {
      for (const input of quantityInputs()) {
        const value = input.value.trim();
        input.toggleAttribute("data-changed", value !== "" && value !== originalOf(input));
      }
      setChanged(countChanged());
    };
    const onInput = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      if (target?.getAttribute("form") === BULK_QUANTITY_FORM_ID) refresh();
    };
    document.addEventListener("input", onInput);
    refresh();
    return () => document.removeEventListener("input", onInput);
  }, [state]);

  const applyToSelected = () => {
    const value = setTo.trim();
    if (!/^[0-9]{1,7}$/.test(value) || Number(value) > MAX_BULK_QUANTITY) return;
    const selected = document.querySelectorAll<HTMLInputElement>(
      `input[type="checkbox"][name="productId"][form="${BULK_PRODUCTS_FORM_ID}"]:checked`,
    );
    for (const box of selected) {
      const input = document.querySelector<HTMLInputElement>(
        `input[form="${BULK_QUANTITY_FORM_ID}"][name="${QTY_PREFIX}${box.value}"]`,
      );
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  };

  const discard = () => {
    for (const input of quantityInputs()) {
      input.value = originalOf(input);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-black/10 bg-white p-4">
      <form id={BULK_QUANTITY_FORM_ID} action={action} className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="text-sm font-bold text-primary">Update stock counts</p>
          <p className="text-xs text-primary-muted">
            Type a count in any row, or tick rows and set them all at once. Entering a count marks
            the product as tracked.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-primary">
          Set selected to
          <span className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_BULK_QUANTITY}
              step={1}
              value={setTo}
              onChange={(event) => setSetTo(event.target.value)}
              className={`${inputClass} w-24 font-normal normal-case tracking-normal`}
              aria-label="Quantity to set on every selected product"
            />
            <button
              type="button"
              onClick={applyToSelected}
              className="rounded-2xl border border-black/10 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-primary hover:bg-surface-muted"
            >
              Apply to selected
            </button>
          </span>
        </label>
        {changed > 0 && (
          <button
            type="button"
            onClick={discard}
            className="rounded-2xl px-3 py-2.5 text-sm font-semibold text-primary-muted hover:underline"
          >
            Discard changes
          </button>
        )}
        <button
          type="submit"
          disabled={pending || changed === 0}
          className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          <Icon name="check" className="h-4 w-4" />
          {pending
            ? "Saving…"
            : changed > 0
              ? `Save ${changed} ${changed === 1 ? "quantity" : "quantities"}`
              : "Save quantities"}
        </button>
      </form>
      {state.status !== "idle" && (
        <p
          role="status"
          className={`mt-3 text-sm font-semibold ${state.status === "ok" ? "text-emerald-700" : "text-danger"}`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
