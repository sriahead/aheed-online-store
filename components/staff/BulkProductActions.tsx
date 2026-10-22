"use client";

import { useActionState } from "react";
import { bulkProductAction } from "@/features/admin/product-restrictions";
import {
  BULK_ACTION_LABELS,
  BULK_PRODUCTS_FORM_ID,
  initialBulkActionState,
  type BulkActionState,
} from "@/lib/product-restriction-form";
import {
  BULK_ACTIONS,
  BULK_SKIP_LABELS,
  ENABLE_CONFIRMATION_TEXT,
  MAX_RESTRICTION_REASON_LENGTH,
  RESTRICTION_LABELS,
  summarisePlanRisks,
  type BulkPlanEntry,
} from "@/lib/product-restriction";
import { inputClass, labelClass } from "@/lib/form-classes";

const selectClass =
  "rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm font-normal text-primary";

/**
 * #1211 (R22–R25) — bulk Make available / Hide / Mark stock as not tracked on /staff/products.
 *
 * Two steps. PREVIEW plans and writes nothing; it lists every restricted product in the selection
 * by name and class, split into "will be skipped" (hard blocks, or anything a STAFF account cannot
 * enable) and "only if you confirm" (an ADMIN's overridable products). APPLY is a separate form
 * carrying the previewed ids, and the server recomputes the plan from the database inside the
 * write — the preview shown here is never what decides.
 */
export function BulkProductActions() {
  const [state, action, pending] = useActionState(bulkProductAction, initialBulkActionState);

  const selectAllOnPage = (checked: boolean) => {
    document
      .querySelectorAll<HTMLInputElement>(`input[type="checkbox"][form="${BULK_PRODUCTS_FORM_ID}"]`)
      .forEach((box) => {
        box.checked = checked;
      });
  };

  return (
    <div className="mb-6 rounded-2xl border border-black/10 bg-white p-4">
      <form id={BULK_PRODUCTS_FORM_ID} action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="intent" value="preview" />
        <label className="flex items-center gap-2 text-sm text-primary">
          <input
            type="checkbox"
            className="h-4 w-4"
            aria-label="Select all products on this page"
            onChange={(event) => selectAllOnPage(event.target.checked)}
          />
          Select all on this page
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-primary">
          With selected
          <select name="bulkAction" defaultValue="ENABLE" className={selectClass}>
            {BULK_ACTIONS.map((value) => (
              <option key={value} value={value}>
                {BULK_ACTION_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          Preview
        </button>
      </form>

      {state.error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {state.error}
        </p>
      )}

      {state.phase === "preview" && <Preview state={state} action={action} pending={pending} />}
      {state.phase === "applied" && <Summary state={state} />}
    </div>
  );
}

function Preview({
  state,
  action,
  pending,
}: {
  state: Extract<BulkActionState, { phase: "preview" }>;
  action: (form: FormData) => void;
  pending: boolean;
}) {
  // The preview plan is made with no confirmation, so for ENABLE each restricted product is
  // already SKIPPED with the reason that applies to THIS actor: HARD_BLOCK, ADMIN_ONLY (a STAFF
  // account), or NEEDS_CONFIRMATION (an ADMIN, who may confirm below).
  const skipReason = (e: BulkPlanEntry) => (e.outcome.kind === "SKIPPED" ? e.outcome.reason : null);
  const willUpdate = state.plan.filter(
    (e) => e.outcome.kind !== "SKIPPED" && e.outcome.kind !== "NO_CHANGE",
  ).length;
  const skippedRestricted = state.plan.filter(
    (e) => skipReason(e) === "HARD_BLOCK" || skipReason(e) === "ADMIN_ONLY",
  );
  const confirmable = state.plan.filter((e) => skipReason(e) === "NEEDS_CONFIRMATION");
  // For Hide / Mark untracked nothing is refused, but a reviewer still sees which of the
  // selection is restricted.
  const { hardBlocked, overridable } = summarisePlanRisks(state.plan);
  const isEnable = state.action === "ENABLE";

  return (
    <div className="mt-4 space-y-3 border-t border-black/10 pt-4">
      <p className="text-sm text-primary">
        <strong>{BULK_ACTION_LABELS[state.action]}</strong>: {state.plan.length} selected,{" "}
        {willUpdate} will change now.
      </p>

      {isEnable && skippedRestricted.length > 0 && (
        <div className="rounded-xl bg-danger-tint p-3">
          <p className="text-sm font-semibold text-danger">
            Restricted products — these will be skipped
          </p>
          <EntryList entries={skippedRestricted} />
        </div>
      )}

      {!isEnable && hardBlocked.length + overridable.length > 0 && (
        <div className="rounded-xl bg-surface-muted/60 p-3">
          <p className="text-sm font-semibold text-primary">
            Restricted products in this selection (they stay restricted)
          </p>
          <EntryList entries={[...hardBlocked, ...overridable]} />
        </div>
      )}

      {confirmable.length > 0 && (
        <div className="rounded-xl bg-surface-muted/60 p-3">
          <p className="text-sm font-semibold text-danger">
            Warning: restricted products — made available only if you confirm
          </p>
          <EntryList entries={confirmable} />
        </div>
      )}

      {/* No hidden `intent` here: each button names its own, so Cancel cannot submit "apply". */}
      <form action={action} className="space-y-2">
        <input type="hidden" name="bulkAction" value={state.action} />
        {state.productIds.map((id) => (
          <input key={id} type="hidden" name="productId" value={id} />
        ))}
        {confirmable.length > 0 && (
          <>
            <label className="flex items-start gap-2 text-sm text-primary">
              <input type="checkbox" name="confirmed" className="mt-0.5 h-4 w-4" />
              {ENABLE_CONFIRMATION_TEXT} This applies to every product listed under “made available
              only if you confirm”.
            </label>
            <label className={labelClass} htmlFor="bulk-reason">
              Reason (required to make restricted products available)
            </label>
            <input
              id="bulk-reason"
              name="reason"
              maxLength={MAX_RESTRICTION_REASON_LENGTH}
              className={inputClass}
            />
          </>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            name="intent"
            value="apply"
            disabled={pending}
            className="rounded-2xl bg-action px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            Apply
          </button>
          <button
            type="submit"
            name="intent"
            value="reset"
            disabled={pending}
            className="rounded-2xl border border-black/10 px-4 py-2 text-sm font-bold text-primary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function EntryList({ entries }: { entries: BulkPlanEntry[] }) {
  return (
    <ul className="mt-1 list-disc pl-5 text-sm text-primary">
      {entries.map((entry) => (
        <li key={entry.productId}>
          {entry.name ?? entry.productId}
          {entry.restriction ? ` — ${RESTRICTION_LABELS[entry.restriction]}` : ""}
          {entry.outcome.kind === "SKIPPED" && entry.outcome.reason === "ADMIN_ONLY"
            ? ` (${BULK_SKIP_LABELS.ADMIN_ONLY})`
            : ""}
        </li>
      ))}
    </ul>
  );
}

function Summary({ state }: { state: Extract<BulkActionState, { phase: "applied" }> }) {
  const { updated, skipped, failed } = state.result;
  return (
    <div className="mt-4 space-y-3 border-t border-black/10 pt-4 text-sm" role="status">
      <p className="font-semibold text-primary">
        {BULK_ACTION_LABELS[state.action]}: {updated.length} updated, {skipped.length} skipped,{" "}
        {failed.length} failed.
      </p>
      <ResultList title="Updated" lines={updated} />
      <ResultList title="Skipped" lines={skipped} />
      <ResultList title="Failed" lines={failed} />
    </div>
  );
}

function ResultList({
  title,
  lines,
}: {
  title: string;
  lines: { productId: string; name: string; reason?: string }[];
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-black/60">
        {title} ({lines.length})
      </p>
      {lines.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-primary">
          {lines.map((line) => (
            <li key={line.productId}>
              {line.name}
              {line.reason ? ` — ${line.reason}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
