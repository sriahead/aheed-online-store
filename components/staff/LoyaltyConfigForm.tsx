"use client";

import { useActionState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import {
  createTier,
  deleteTier,
  saveLoyaltyConfig,
  type LoyaltyConfigState,
} from "@/features/admin/loyalty-config";
import type { LoyaltyConfig } from "@/lib/repositories/loyalty";
import type { LoyaltyTier } from "@/lib/loyalty";

/**
 * Loyalty config form (P5a, #135), following docs/ui-ref/StaffAdminPanel.tsx's
 * Loyalty Config tab.
 *
 * Each tier row submits its `key` as a hidden field, which is what the config
 * action pairs the numbers back up with; the key is unique per vendor, so it
 * cannot address another store's tier.
 *
 * P7.5d+e (#136) added create and delete. THREE separate top-level forms, never
 * nested — HTML forbids a form inside a form outright, and every tier row lives
 * inside the config form. The per-row Remove button is therefore associated with
 * the delete form by the standard `form="delete-tier"` attribute while sitting
 * in the config form's DOM, and it carries the tier key as its OWN name/value,
 * so one top-level form serves every row. Same technique as /staff/orders' bulk
 * advance (P7a, #162); no client-side JS is involved in either.
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
  const [createState, createAction, creating] = useActionState(createTier, initialState);
  const [deleteState, deleteAction, deleting] = useActionState(deleteTier, initialState);

  return (
    <div className="space-y-6">
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
            Points are earned on the goods total only — never on delivery, and never on the part of
            an order paid for with points.
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
                <li
                  key={tier.key}
                  className="rounded-xl border border-black/10 bg-surface-muted p-4"
                >
                  <input type="hidden" name="tierKey" value={tier.key} />
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-primary">
                      {tier.name} <span className="font-normal text-primary/50">({tier.key})</span>
                    </p>
                    {/* Bound to the delete form by id, NOT by nesting — this button
                      is a DOM descendant of the config form above. Its own
                      name/value carries which tier to remove. */}
                    <button
                      type="submit"
                      form="delete-tier"
                      name="deleteTierKey"
                      value={tier.key}
                      disabled={deleting}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-danger/30 px-3 py-1.5 text-xs font-bold text-danger transition hover:bg-danger-tint disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Remove
                    </button>
                  </div>
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

      {/* The delete mechanism: a real top-level form with no fields of its own.
          Every tier row's Remove button targets it by id and supplies the key.
          Rendered as a SIBLING of the config form, never inside it. */}
      <form action={deleteAction} id="delete-tier" />

      {deleteState.error && (
        <p
          role="alert"
          className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger"
        >
          {deleteState.error}
        </p>
      )}
      {deleteState.saved && !deleteState.error && (
        <p
          role="status"
          className="rounded-xl bg-action-tint px-4 py-3 text-sm font-medium text-primary"
        >
          Tier removed. Points already earned keep the tier they were earned at.
        </p>
      )}

      <form
        action={createAction}
        className="space-y-4 rounded-2xl border border-black/10 bg-white p-5"
      >
        <h2 className="text-xs font-bold uppercase tracking-wide text-primary">Add a tier</h2>

        {createState.error && (
          <p
            role="alert"
            className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger"
          >
            {createState.error}
          </p>
        )}
        {createState.saved && !createState.error && (
          <p
            role="status"
            className="rounded-xl bg-action-tint px-4 py-3 text-sm font-medium text-primary"
          >
            Tier added.
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="newTierKey">
              Key (e.g. GOLD)
            </label>
            <input
              id="newTierKey"
              name="newTierKey"
              type="text"
              required
              maxLength={32}
              placeholder="GOLD"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="newTierName">
              Display name
            </label>
            <input
              id="newTierName"
              name="newTierName"
              type="text"
              required
              maxLength={60}
              placeholder="Gold"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="newTierThresholdPence">
              Qualifying spend (pence)
            </label>
            <input
              id="newTierThresholdPence"
              name="newTierThresholdPence"
              type="number"
              min={0}
              step={1}
              defaultValue={0}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="newTierMultiplierBps">
              Multiplier (basis points, 10000 = 1×)
            </label>
            <input
              id="newTierMultiplierBps"
              name="newTierMultiplierBps"
              type="number"
              min={1}
              step={1}
              defaultValue={10000}
              className={inputClass}
            />
          </div>
        </div>

        <p className="text-xs text-primary/60">
          The key is permanent — it is stamped onto every order that earns at this tier, so the
          history stays readable even after the tier changes or is removed.
        </p>

        <button
          type="submit"
          disabled={creating}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-action px-4 py-3 text-sm font-bold text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {creating ? "Adding…" : "Add tier"}
        </button>
      </form>
    </div>
  );
}
