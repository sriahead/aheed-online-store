"use client";

import { useActionState } from "react";
import { Plus, Ban } from "lucide-react";
import {
  createDiscountCode,
  deactivateDiscountCode,
  type DiscountCodeState,
} from "@/features/admin/discount-codes";
import type { CodeListRow } from "@/lib/repositories/discounts";

/**
 * Discount codes panel (P5b, #145) — create, list and deactivate, on the
 * `/staff` segment P4b created.
 *
 * There is deliberately no edit control on an existing code: changing a live
 * code's value would ask whether past orders re-price (they must not). The only
 * post-creation change is deactivation, which is why each row carries a single
 * button rather than a form of inputs.
 *
 * Colours are semantic tokens per design-system.md, never raw hex.
 */

const initialState: DiscountCodeState = { error: null, saved: false };

const inputClass =
  "w-full rounded-xl border border-black/15 bg-surface-muted px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium text-primary/70";

function formatValue(row: CodeListRow): string {
  return row.kind === "PERCENTAGE"
    ? `${(row.value / 100).toFixed(row.value % 100 === 0 ? 0 : 2)}% off`
    : `£${(row.value / 100).toFixed(2)} off`;
}

function formatUses(row: CodeListRow): string {
  const used = `${row.redemptionCount} used`;
  if (row.remainingRedemptions === null) return `${used} · unlimited`;
  return `${used} · ${row.remainingRedemptions} left`;
}

export function DiscountCodesPanel({ codes }: { codes: CodeListRow[] }) {
  const [createState, createAction, creating] = useActionState(createDiscountCode, initialState);
  const [deactivateState, deactivateAction] = useActionState(deactivateDiscountCode, initialState);

  const error = createState.error ?? deactivateState.error;

  return (
    <div className="space-y-8">
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger"
        >
          {error}
        </p>
      )}
      {(createState.saved || deactivateState.saved) && !error && (
        <p
          role="status"
          className="rounded-xl bg-action-tint px-4 py-3 text-sm font-medium text-primary"
        >
          {createState.saved ? "Discount code created." : "Discount code deactivated."}
        </p>
      )}

      <section className="rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-primary">Existing codes</h2>
        {codes.length === 0 ? (
          <p className="text-sm text-primary/60">
            No discount codes yet. Create one below — until then, no code will be accepted at
            checkout.
          </p>
        ) : (
          <ul className="divide-y divide-black/5">
            {codes.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <span className="font-mono">{row.code}</span>
                    {!row.isActive && (
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary/60">
                        Inactive
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-primary/60">
                    {formatValue(row)} · {formatUses(row)}
                    {row.maxPerCustomer !== null && ` · max ${row.maxPerCustomer} per customer`}
                    {row.minSubtotalPence > 0 &&
                      ` · min £${(row.minSubtotalPence / 100).toFixed(2)}`}
                  </p>
                </div>
                {row.isActive && (
                  <form action={deactivateAction}>
                    <input type="hidden" name="codeId" value={row.id} />
                    <button
                      type="submit"
                      className="flex shrink-0 items-center gap-1.5 rounded-xl border border-black/15 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-surface-muted active:scale-95"
                    >
                      <Ban className="h-3.5 w-3.5" aria-hidden />
                      Deactivate
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <form
        action={createAction}
        className="space-y-4 rounded-2xl border border-black/10 bg-white p-5"
      >
        <h2 className="text-sm font-bold text-primary">New code</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="code">
              Code
            </label>
            <input
              id="code"
              name="code"
              required
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="WELCOME10"
              className={`${inputClass} uppercase`}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="description">
              Description (optional)
            </label>
            <input id="description" name="description" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="kind">
              Type
            </label>
            <select id="kind" name="kind" defaultValue="PERCENTAGE" className={inputClass}>
              <option value="PERCENTAGE">Percentage off</option>
              <option value="FIXED_AMOUNT">Fixed amount off</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="value">
              Value — basis points for a percentage (1000 = 10%), pence for a fixed amount
            </label>
            <input
              id="value"
              name="value"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
              defaultValue={1000}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="minSubtotalPence">
              Minimum order (pence, 0 for none)
            </label>
            <input
              id="minSubtotalPence"
              name="minSubtotalPence"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              required
              defaultValue={0}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="remainingRedemptions">
              Total uses (blank = unlimited)
            </label>
            <input
              id="remainingRedemptions"
              name="remainingRedemptions"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="maxPerCustomer">
              Uses per customer (blank = no limit; setting this requires shoppers to sign in)
            </label>
            <input
              id="maxPerCustomer"
              name="maxPerCustomer"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="startsAt">
              Starts (blank = now)
            </label>
            <input id="startsAt" name="startsAt" type="datetime-local" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="endsAt">
              Ends (blank = never)
            </label>
            <input id="endsAt" name="endsAt" type="datetime-local" className={inputClass} />
          </div>
        </div>

        <button
          type="submit"
          disabled={creating}
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-md transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {creating ? "Creating…" : "Create code"}
        </button>
      </form>
    </div>
  );
}
