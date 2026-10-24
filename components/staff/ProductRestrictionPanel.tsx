"use client";

import { useActionState } from "react";
import { clearAndEnableAction, setRestrictionAction } from "@/features/admin/product-restrictions";
import { initialRestrictionFormState } from "@/lib/product-restriction-form";
import {
  ENABLE_CONFIRMATION_TEXT,
  MAX_RESTRICTION_REASON_LENGTH,
  RESTRICTION_LABELS,
  allowedRestrictionTargets,
  isHardBlock,
  type ProductRestriction,
  type RestrictionActor,
} from "@/lib/product-restriction";
import type { RestrictionAuditEntry } from "@/lib/repositories/product-restrictions";
import { inputClass, labelClass } from "@/lib/form-classes";

/**
 * #1211 (R29) — the restriction section of /staff/products/[id]. What renders is decided by the
 * same rules the server actions apply (lib/product-restriction.ts); the actions re-decide from the
 * session, so hiding a control here is presentation, never the enforcement.
 *
 * - Everyone sees the current restriction and the newest audit entries.
 * - An ADMIN sees a selector offering only tightening targets.
 * - An ADMIN sees clear-and-enable only for an overridable restriction, behind the confirmation
 *   and a required reason. A hard block shows why, and no enable control at all.
 */
export function ProductRestrictionPanel({
  productId,
  restriction,
  actor,
  audit,
}: {
  productId: string;
  restriction: ProductRestriction | null;
  actor: RestrictionActor;
  audit: RestrictionAuditEntry[];
}) {
  const [setState, setAction, setting] = useActionState(
    setRestrictionAction,
    initialRestrictionFormState,
  );
  const [clearState, clearAction, clearing] = useActionState(
    clearAndEnableAction,
    initialRestrictionFormState,
  );
  const targets = allowedRestrictionTargets(restriction).filter((r) => r !== restriction);

  return (
    <section
      aria-labelledby="restriction-heading"
      className="mt-8 rounded-2xl border border-black/10 bg-white p-5"
    >
      <h2 id="restriction-heading" className="text-sm font-bold text-primary">
        Restriction
      </h2>
      <p className="mt-1 text-sm text-primary">
        {restriction === null ? "None" : RESTRICTION_LABELS[restriction]}
      </p>

      {restriction !== null && isHardBlock(restriction) && (
        <p className="mt-2 text-sm text-primary-muted">
          This product cannot be made available. Selling it needs compliance controls this store
          does not have yet, so no account can switch it on.
        </p>
      )}

      {actor === "ADMIN" && targets.length > 0 && (
        <form action={setAction} className="mt-4 space-y-2">
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="currentRestriction" value={restriction ?? ""} />
          <label className={labelClass} htmlFor="restriction">
            {restriction === null ? "Restrict this product" : "Tighten the restriction"}
          </label>
          <select id="restriction" name="restriction" className={inputClass} defaultValue="">
            <option value="" disabled>
              Choose…
            </option>
            {targets.map((target) => (
              <option key={target} value={target}>
                {RESTRICTION_LABELS[target]}
              </option>
            ))}
          </select>
          <label className={labelClass} htmlFor="restriction-set-reason">
            Reason (optional)
          </label>
          <input
            id="restriction-set-reason"
            name="reason"
            maxLength={MAX_RESTRICTION_REASON_LENGTH}
            className={inputClass}
          />
          <p className="text-xs text-primary-muted">
            Restricting a product hides it straight away.
          </p>
          <button
            type="submit"
            disabled={setting}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save restriction
          </button>
          {setState.error && (
            <p role="alert" className="text-sm text-danger">
              {setState.error}
            </p>
          )}
        </form>
      )}

      {actor === "ADMIN" && restriction !== null && !isHardBlock(restriction) && (
        <form action={clearAction} className="mt-6 space-y-2 rounded-xl bg-surface-muted/40 p-4">
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="confirmedRestriction" value={restriction} />
          <p className="text-sm font-semibold text-danger">
            Warning: this product is restricted ({RESTRICTION_LABELS[restriction]}). Clearing the
            restriction makes it visible and purchasable immediately.
          </p>
          <label className="flex items-start gap-2 text-sm text-primary">
            <input type="checkbox" name="confirmed" className="mt-0.5 h-4 w-4" required />
            {ENABLE_CONFIRMATION_TEXT}
          </label>
          <label className={labelClass} htmlFor="restriction-clear-reason">
            Reason (required)
          </label>
          <input
            id="restriction-clear-reason"
            name="reason"
            required
            maxLength={MAX_RESTRICTION_REASON_LENGTH}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={clearing}
            className="rounded-xl bg-action px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Clear restriction and make available
          </button>
          {clearState.error && (
            <p role="alert" className="text-sm text-danger">
              {clearState.error}
            </p>
          )}
        </form>
      )}

      <h3 className="mt-6 text-xs font-bold uppercase tracking-wider text-black/60">
        Restriction history
      </h3>
      {audit.length === 0 ? (
        <p className="mt-1 text-sm text-primary-muted">No restriction changes recorded.</p>
      ) : (
        <ul className="mt-2 divide-y divide-black/5 text-sm">
          {audit.map((entry) => (
            <li key={entry.id} className="py-2">
              <p className="text-primary">
                <time dateTime={entry.createdAt.toISOString()}>
                  {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                </time>{" "}
                · {entry.action === "RESTRICTION_SET" ? "Restricted" : "Cleared"} ·{" "}
                {entry.fromRestriction ? RESTRICTION_LABELS[entry.fromRestriction] : "None"} →{" "}
                {entry.toRestriction ? RESTRICTION_LABELS[entry.toRestriction] : "None"}
              </p>
              <p className="text-xs text-primary-muted">
                {entry.actorName ?? (entry.source === "IMPORT" ? "Import" : "Unknown user")} ·{" "}
                {SOURCE_LABELS[entry.source]}
                {entry.reason ? ` · “${entry.reason}”` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const SOURCE_LABELS: Record<RestrictionAuditEntry["source"], string> = {
  PRODUCT_FORM: "Product page",
  BULK_ACTION: "Bulk action",
  IMPORT: "Catalogue import",
};
