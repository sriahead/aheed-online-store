"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { saveLoyaltyConfig, type LoyaltyConfigState } from "@/features/admin/loyalty-config";
import type { LoyaltyConfig } from "@/lib/repositories/loyalty";
import type { LoyaltyTier } from "@/lib/loyalty";

/**
 * Loyalty config form (P5a, #135), following docs/ui-ref/StaffAdminPanel.tsx's
 * Loyalty Config tab.
 *
 * Tier rows are editable but not creatable or deletable — P5a ships no tier
 * CRUD, so there is deliberately no add/remove control here. Each row submits
 * its `key` as a hidden field, which is what the action pairs the numbers back
 * up with; the key is unique per vendor, so it cannot address another store's
 * tier.
 *
 * Colours are semantic tokens per design-system.md, never raw hex.
 */

const initialState: LoyaltyConfigState = { error: null, saved: false };

const inputClass =
  "w-full rounded-xl border border-black/15 bg-surface-muted px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium text-primary/70";

export function LoyaltyConfigForm({
  config,
  tiers,
}: {
  config: LoyaltyConfig;
  tiers: LoyaltyTier[];
}) {
  const [state, formAction, pending] = useActionState(saveLoyaltyConfig, initialState);

  return (
    <form action={formAction} className="space-y-6">
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
          Loyalty settings saved.
        </p>
      )}

      <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="loyaltyEnabled"
            defaultChecked={config.loyaltyEnabled}
            className="h-4 w-4"
          />
          <span className="text-sm font-medium text-primary">
            Run a loyalty scheme at this store
          </span>
        </label>
        <p className="text-xs text-primary/60">
          Turning this off hides points from checkout and the account area. Existing balances are
          kept, not deleted.
        </p>
      </section>

      <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-primary">Earning</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="pointsPerPoundEarned">
              Points earned per £1 spent
            </label>
            <input
              id="pointsPerPoundEarned"
              name="pointsPerPoundEarned"
              type="number"
              min={0}
              step={1}
              defaultValue={config.pointsPerPoundEarned}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="pointsExpiryMonths">
              Points expire after (months, blank = never)
            </label>
            <input
              id="pointsExpiryMonths"
              name="pointsExpiryMonths"
              type="number"
              min={1}
              step={1}
              defaultValue={config.pointsExpiryMonths ?? ""}
              className={inputClass}
            />
          </div>
        </div>
        <p className="text-xs text-primary/60">
          Points are earned on the goods total only — never on delivery, and never on the part of an
          order paid for with points.
        </p>
      </section>

      <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-primary">Spending</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="pencePerPointRedeemed">
              Pence each point is worth
            </label>
            <input
              id="pencePerPointRedeemed"
              name="pencePerPointRedeemed"
              type="number"
              min={1}
              step={1}
              defaultValue={config.pencePerPointRedeemed}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="minRedeemPoints">
              Minimum points per redemption
            </label>
            <input
              id="minRedeemPoints"
              name="minRedeemPoints"
              type="number"
              min={0}
              step={1}
              defaultValue={config.minRedeemPoints}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-primary">Tiers</h2>
        <div>
          <label className={labelClass} htmlFor="tierWindowDays">
            Tier qualifying window (days)
          </label>
          <input
            id="tierWindowDays"
            name="tierWindowDays"
            type="number"
            min={1}
            step={1}
            defaultValue={config.tierWindowDays}
            className={`${inputClass} max-w-[10rem]`}
          />
        </div>

        {tiers.length === 0 ? (
          <p className="text-xs text-primary/60">
            No tiers configured for this store. Every order earns at the base rate.
          </p>
        ) : (
          <ul className="space-y-3">
            {tiers.map((tier) => (
              <li key={tier.key} className="rounded-xl border border-black/10 bg-surface-muted p-4">
                <input type="hidden" name="tierKey" value={tier.key} />
                <p className="mb-2 text-sm font-semibold text-primary">{tier.name}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor={`threshold-${tier.key}`}>
                      Qualifying spend (pence)
                    </label>
                    <input
                      id={`threshold-${tier.key}`}
                      name="tierThresholdPence"
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={tier.thresholdPence}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor={`multiplier-${tier.key}`}>
                      Multiplier (basis points, 10000 = 1×)
                    </label>
                    <input
                      id={`multiplier-${tier.key}`}
                      name="tierMultiplierBps"
                      type="number"
                      min={1}
                      step={1}
                      defaultValue={tier.multiplierBps}
                      className={inputClass}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-bold text-white shadow-md transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Save className="h-4 w-4" aria-hidden />
        {pending ? "Saving…" : "Save loyalty settings"}
      </button>
    </form>
  );
}
