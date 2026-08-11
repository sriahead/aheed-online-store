"use client";

import { useActionState } from "react";
import { MapPin, ShieldCheck, Sparkles, User } from "lucide-react";
import { placeOrderAction, type CheckoutState } from "@/features/checkout/place-order";

/**
 * Checkout form (P3b, #96), following docs/ui-ref/CheckoutModal.tsx's structure —
 * contact information, then delivery address — as a page rather than a modal, so
 * it has a URL, survives refresh and works without client JS beyond this island.
 *
 * Deliberately absent vs. the reference: the delivery-slot picker (P4 — slots
 * without capacity limits would let 40 deliveries sell into one window) and the
 * payment-method toggle (Cash on Delivery is out of scope; card is P3c).
 *
 * Colours are semantic tokens per design-system.md's mockup→token table, never
 * the reference's #1B5E20 literals.
 */

const initialState: CheckoutState = { error: null };

const inputClass =
  "w-full rounded-xl border border-black/15 bg-surface-muted px-3 py-2 text-sm focus:border-primary focus:bg-white focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium text-primary/70";

export function CheckoutForm({
  signedInEmail,
  redeemable,
}: {
  signedInEmail: string | null;
  /**
   * P5a (#135) — omitted entirely when the vendor has loyalty off, or the
   * shopper is a guest, or their balance is below the vendor's minimum. The
   * server clamps whatever is submitted regardless; this only decides whether to
   * offer the control.
   */
  redeemable: { balancePoints: number; valueLabel: string; minRedeemPoints: number } | null;
}) {
  const [state, formAction, pending] = useActionState(placeOrderAction, initialState);

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

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
          <User className="h-4 w-4" aria-hidden />
          1. Contact information
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="recipientName">
              Full name
            </label>
            <input id="recipientName" name="recipientName" required className={inputClass} />
          </div>
          {signedInEmail ? (
            // Signed-in shoppers are never asked for their email again.
            <div>
              <label className={labelClass} htmlFor="email-display">
                Email (order confirmation)
              </label>
              <input
                id="email-display"
                value={signedInEmail}
                readOnly
                disabled
                className={`${inputClass} opacity-70`}
              />
            </div>
          ) : (
            <div>
              <label className={labelClass} htmlFor="email">
                Email (order confirmation)
              </label>
              <input id="email" name="email" type="email" required className={inputClass} />
            </div>
          )}
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="phone">
              Phone number (driver updates)
            </label>
            <input id="phone" name="phone" type="tel" required className={inputClass} />
          </div>
        </div>
      </section>

      <section className="space-y-3 border-t border-black/5 pt-5">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
          <MapPin className="h-4 w-4" aria-hidden />
          2. Delivery address &amp; instructions
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="line1">
              Street address
            </label>
            <input id="line1" name="line1" required className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="line2">
              Flat, building (optional)
            </label>
            <input id="line2" name="line2" className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="city">
              Town or city
            </label>
            <input id="city" name="city" required className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="postcode">
              Postcode
            </label>
            <input id="postcode" name="postcode" required className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="notes">
              Delivery notes / gate code (optional)
            </label>
            <input id="notes" name="notes" className={inputClass} />
          </div>
        </div>
      </section>

      {redeemable && (
        <section className="space-y-3 border-t border-black/5 pt-5">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
            <Sparkles className="h-4 w-4" aria-hidden />
            3. Loyalty points
          </h2>
          <p className="text-xs text-primary/70">
            You have <strong className="text-primary">{redeemable.balancePoints} points</strong>{" "}
            worth {redeemable.valueLabel}. Spend as many as you like — we&apos;ll cap it at what
            this order can take.
          </p>
          <div className="max-w-[12rem]">
            <label className={labelClass} htmlFor="redeemPoints">
              Points to spend
            </label>
            <input
              id="redeemPoints"
              name="redeemPoints"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              max={redeemable.balancePoints}
              defaultValue={0}
              className={inputClass}
            />
          </div>
        </section>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-bold text-white shadow-md transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ShieldCheck className="h-4 w-4" aria-hidden />
        {pending ? "Placing order…" : "Place order"}
      </button>
    </form>
  );
}
