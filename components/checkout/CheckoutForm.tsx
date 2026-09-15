"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { MapPin, ShieldCheck, Sparkles, Tag, User, Clock } from "lucide-react";
import { placeOrderAction, type CheckoutState } from "@/features/checkout/place-order";
import { inputClass, labelClass } from "@/lib/form-classes";
import { lookupPostcodeForCheckout } from "@/features/checkout/postcode-lookup";
import { setDeliveryPostcode, setFulfilmentMethod } from "@/features/storefront/delivery";
import type { FulfilmentMethodChoice } from "@/lib/fulfilment-cookie";
import { SlotPicker } from "./SlotPicker";

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
  initialPostcode,
  vendorId,
  bookingWindowDays,
  offerDeliverySlots,
  expressCollectionEnabled,
  expressSchedules,
  method,
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
  initialPostcode?: string | null;
  vendorId: string;
  bookingWindowDays: number;
  offerDeliverySlots: boolean;
  expressCollectionEnabled?: boolean;
  expressSchedules?: { dayOfWeek: number; openTime: string; closeTime: string }[];
  /**
   * #748 — resolved server-side from the shared fulfilment cookie, NOT held in
   * local state. This component used to own a `useState` for it and broadcast
   * changes over a `window` CustomEvent, which meant the cart, the header and
   * this page could each believe something different. Changing the radio now
   * writes the cookie and the server re-renders both this form and the summary
   * from one value.
   */
  method: FulfilmentMethodChoice;
}) {
  const [state, formAction, pending] = useActionState(placeOrderAction, initialState);
  const [, startMethodTransition] = useTransition();

  const chooseMethod = (next: FulfilmentMethodChoice) => {
    if (next === method) return;
    const formData = new FormData();
    formData.append("fulfilmentMethod", next);
    startMethodTransition(async () => {
      await setFulfilmentMethod(formData);
    });
  };

  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  /**
   * #749 — every element is resolved from THIS form, never from the document.
   *
   * The previous implementation used `document.querySelector("form")`, which returns the FIRST form
   * in the document. Since #748 that is the fulfilment-method form rendered above the address
   * fields, so a successful lookup wrote `city`/`county` into the wrong element entirely. The bug
   * was invisible while CSP blocked the lookup from ever succeeding.
   */
  const formRef = useRef<HTMLFormElement>(null);

  const fieldIn = (name: string): HTMLInputElement | null => {
    const el = formRef.current?.elements.namedItem(name);
    return el instanceof HTMLInputElement ? el : null;
  };

  const handleLookup = async (postcode: string) => {
    if (!postcode) return;
    setAddressLoading(true);
    setAddressError(null);

    // Runs on the server: api.postcodes.io is blocked by this app's CSP in the browser (#749).
    const outcome = await lookupPostcodeForCheckout(postcode);
    const postcodeInput = fieldIn("postcode");

    if (outcome.ok) {
      const cityInput = fieldIn("city");
      const countyInput = fieldIn("county");
      if (cityInput && outcome.result.admin_district) {
        cityInput.value = outcome.result.admin_district;
      }
      if (countyInput && outcome.result.admin_county) {
        countyInput.value = outcome.result.admin_county;
      }
      postcodeInput?.setCustomValidity("");
    } else if (outcome.reason === "not-found") {
      setAddressError("Invalid postcode. Please enter a valid UK postcode.");
      postcodeInput?.setCustomValidity("Invalid postcode");
    } else {
      // A 5xx, a timeout or a network failure. Never block checkout on a third-party lookup —
      // the shopper can type the address themselves.
      postcodeInput?.setCustomValidity("");
    }

    setAddressLoading(false);
  };

  useEffect(() => {
    if (initialPostcode) {
      // `handleLookup` sets loading/error state, which `react-hooks/set-state-in-effect` flags.
      // Prefilling the address from a postcode the shopper already gave us is the whole point of
      // this effect, so the rule is silenced here rather than the behaviour changed — the same
      // resolution CLAUDE.md's Hooks section records for the self-closing drawer.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleLookup(initialPostcode);
    }
    // `handleLookup` is deliberately omitted below. It is re-created on every render, so including it
    // would re-run this effect on every render — one server round-trip to the postcode API per
    // render, for as long as the page is open. The effect's real trigger is a NEW postcode
    // arriving, which `initialPostcode` expresses exactly. Same class of trap as the drawer that
    // closed itself the moment it opened (CLAUDE.md's React & Next.js Hooks section): satisfying
    // the dependency rule literally would change what the effect means.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPostcode]);

  useEffect(() => {
    const saved = localStorage.getItem("aheed_checkout_details");
    if (saved) {
      try {
        const details = JSON.parse(saved);
        // Same #749 fix as handleLookup above: this form, not the document's first one.
        const form = formRef.current;
        if (form) {
          Object.entries(details).forEach(([key, value]) => {
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
    // #748 — the method is no longer client state, so it must not be restored
    // from here either: the cookie is the single source of truth, and a stale
    // localStorage copy would fight it on the next visit.
    delete details.fulfilmentMethod;
    localStorage.setItem("aheed_checkout_details", JSON.stringify(details));
  };

  return (
    <form ref={formRef} action={formAction} onChange={handleFormChange} className="space-y-6">
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
                onChange={() => chooseMethod("DELIVERY")}
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
                onChange={() => chooseMethod("COLLECTION")}
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
              <label className={labelClass} htmlFor="county">
                County (optional)
              </label>
              <input id="county" name="county" className={inputClass} />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <label className={labelClass} htmlFor="postcode">
                Postcode
              </label>
              {addressError && <p className="text-xs font-medium text-danger">{addressError}</p>}
              <div className="flex gap-2">
                <input
                  id="postcode"
                  name="postcode"
                  defaultValue={initialPostcode || ""}
                  required
                  className={inputClass}
                  placeholder="e.g. SW1A 1AA"
                />
                <button
                  type="button"
                  onClick={() => {
                    const el = fieldIn("postcode");
                    if (el) handleLookup(el.value);
                  }}
                  disabled={addressLoading}
                  className="rounded-lg bg-black/5 px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-black/10 disabled:opacity-50"
                >
                  {addressLoading ? "Looking up..." : "Find Address"}
                </button>
              </div>
              {initialPostcode && (
                <button
                  type="button"
                  onClick={async () => {
                    const fd = new FormData();
                    fd.append("postcode", "");
                    await setDeliveryPostcode(fd);
                    window.location.reload();
                  }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Change postcode / Delivery area
                </button>
              )}
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

      {((method === "DELIVERY" && offerDeliverySlots) || method === "COLLECTION") && (
        <section className="space-y-3 border-t border-black/5 pt-5">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
            <Clock className="h-4 w-4" aria-hidden />
            {offerCollection ? "3" : "2"}. Choose a Time
          </h2>
          <SlotPicker
            vendorId={vendorId}
            method={method}
            bookingWindowDays={bookingWindowDays}
            required={true}
            expressCollectionEnabled={expressCollectionEnabled}
            expressSchedules={expressSchedules}
          />
        </section>
      )}

      {redeemable && (
        <section className="space-y-3 border-t border-black/5 pt-5">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
            <Sparkles className="h-4 w-4" aria-hidden />
            {offerCollection ? "4" : "3"}. Loyalty points
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
