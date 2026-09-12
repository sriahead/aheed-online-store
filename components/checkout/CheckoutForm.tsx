"use client";

import { useActionState, useEffect, useState } from "react";
import { MapPin, ShieldCheck, Sparkles, Tag, User } from "lucide-react";
import { placeOrderAction, type CheckoutState } from "@/features/checkout/place-order";
import { inputClass, labelClass } from "@/lib/form-classes";

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

export function CheckoutForm({
  signedInEmail,
  redeemable,
  offerCollection,
}: {
  signedInEmail: string | null;
  /**
   * P5a (#135) — omitted entirely when the vendor has loyalty off, or the
   * shopper is a guest, or their balance is below the vendor's minimum. The
   * server clamps whatever is submitted regardless; this only decides whether to
   * offer the control.
   */
  redeemable: { balancePoints: number; valueLabel: string; minRedeemPoints: number } | null;
  offerCollection: boolean;
}) {
  const [state, formAction, pending] = useActionState(placeOrderAction, initialState);

  // The server expects this, and it defaults to DELIVERY or nothing if collection is offered.
  // We'll let the HTML validation enforce choice if both are offered, but here we can just use state to show/hide.
  const [method, setMethod] = useState<"DELIVERY" | "COLLECTION">("DELIVERY");

  useEffect(() => {
    const saved = localStorage.getItem("aheed_checkout_details");
    if (saved) {
      try {
        const details = JSON.parse(saved);
        const form = document.querySelector("form");
        if (form) {
          Object.entries(details).forEach(([key, value]) => {
            if (key === "fulfilmentMethod") {
              setMethod(value as "DELIVERY" | "COLLECTION");
            }
            const el = form.elements.namedItem(key);
            if (el instanceof HTMLInputElement && !el.value && value) {
              // For radio buttons, we need to check the right one
              if (el.type === "radio") {
                if (el.value === value) el.checked = true;
              } else {
                el.value = value as string;
              }
            }
          });
        }
      } catch (e) {}
    }
  }, []);

  const handleFormChange = (e: React.FormEvent<HTMLFormElement>) => {
    const fd = new FormData(e.currentTarget);
    const details = Object.fromEntries(fd.entries());
    delete details.redeemPoints;
    delete details.discountCode;
    localStorage.setItem("aheed_checkout_details", JSON.stringify(details));

    const selectedMethod = fd.get("fulfilmentMethod");
    if (selectedMethod === "DELIVERY" || selectedMethod === "COLLECTION") {
      setMethod(selectedMethod);

      // Dispatch a custom event to notify the page that the method changed so it can update the summary
      window.dispatchEvent(
        new CustomEvent("fulfilment-method-changed", { detail: selectedMethod }),
      );
    }
  };

  return (
    <form action={formAction} onChange={handleFormChange} className="space-y-6">
      {state.error && (
        <p
          role="alert"
          className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger"
        >
          {state.error}
        </p>
      )}

      {offerCollection && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
            <MapPin className="h-4 w-4" aria-hidden />
            Fulfilment Method
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label
              className={`flex flex-1 cursor-pointer items-center gap-3 rounded-xl border p-4 ${method === "DELIVERY" ? "border-primary bg-primary/5" : "border-black/10 hover:bg-black/5"}`}
            >
              <input
                type="radio"
                name="fulfilmentMethod"
                value="DELIVERY"
                checked={method === "DELIVERY"}
                onChange={() => setMethod("DELIVERY")}
                className="h-5 w-5 text-primary focus:ring-primary border-black/20"
                required
              />
              <span className="font-bold text-black">Delivery</span>
            </label>
            <label
              className={`flex flex-1 cursor-pointer items-center gap-3 rounded-xl border p-4 ${method === "COLLECTION" ? "border-primary bg-primary/5" : "border-black/10 hover:bg-black/5"}`}
            >
              <input
                type="radio"
                name="fulfilmentMethod"
                value="COLLECTION"
                checked={method === "COLLECTION"}
                onChange={() => setMethod("COLLECTION")}
                className="h-5 w-5 text-primary focus:ring-primary border-black/20"
                required
              />
              <span className="font-bold text-black">Click & Collect</span>
            </label>
          </div>
        </section>
      )}
      {!offerCollection && <input type="hidden" name="fulfilmentMethod" value="DELIVERY" />}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
          <User className="h-4 w-4" aria-hidden />
          {offerCollection ? "1" : "1"}. Contact information
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
              Phone number ({method === "DELIVERY" ? "driver updates" : "collection updates"})
            </label>
            <input id="phone" name="phone" type="tel" required className={inputClass} />
          </div>
        </div>
      </section>

      {method === "DELIVERY" && (
        <section className="space-y-3 border-t border-black/5 pt-5">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
            <MapPin className="h-4 w-4" aria-hidden />
            {offerCollection ? "2" : "2"}. Delivery address &amp; instructions
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="line1">
                Street address
              </label>
              <input
                id="line1"
                name="line1"
                required={method === "DELIVERY"}
                className={inputClass}
              />
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
      )}

      {redeemable && (
        <section className="space-y-3 border-t border-black/5 pt-5">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
            <Sparkles className="h-4 w-4" aria-hidden />
            3. Loyalty points
          </h2>
          <p className="text-xs text-primary-muted">
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

      {/*
        P5b (#145) — always offered, unlike the loyalty section above. There is no
        per-vendor "discounts enabled" flag to consult: a vendor with no codes
        simply has none that validate, and hiding the field would mean a shopper
        holding a valid code had nowhere to type it.
      */}
      <section className="space-y-3 border-t border-black/5 pt-5">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
          <Tag className="h-4 w-4" aria-hidden />
          {redeemable ? "4" : "3"}. Discount code
        </h2>
        <div className="max-w-[16rem]">
          <label className={labelClass} htmlFor="discountCode">
            Have a code? (optional)
          </label>
          <input
            id="discountCode"
            name="discountCode"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className={`${inputClass} uppercase`}
            placeholder="WELCOME10"
          />
        </div>
      </section>

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-bold text-white shadow-md transition active:scale-95 motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ShieldCheck className="h-4 w-4" aria-hidden />
        {pending ? "Placing order…" : "Place order"}
      </button>
    </form>
  );
}
