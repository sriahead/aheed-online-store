"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { MapPin, ShieldCheck, Sparkles, Tag, User, Clock } from "lucide-react";
import { placeOrderAction, type CheckoutState } from "@/features/checkout/place-order";
import { inputClass, labelClass } from "@/lib/form-classes";
import { lookupAddressForCheckout } from "@/features/checkout/address-lookup";
import { setDeliveryPostcode, setFulfilmentMethod } from "@/features/storefront/delivery";
import type { FulfilmentMethodChoice } from "@/lib/fulfilment-cookie";
import type { CustomerAddressRow } from "@/lib/repositories/customer-addresses";
import { formatPrice } from "@/components/product/format-price";
import { useCheckoutPricing } from "./CheckoutPricing";
import {
  CHECKOUT_SECTION_TITLES,
  checkoutSections,
  type CheckoutSectionKey,
} from "@/lib/checkout-sections";
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
  timezone,
  method,
  savedAddresses = [],
  quotedDeliveryRules,
}: {
  signedInEmail: string | null;
  /**
   * P5a (#135) — omitted entirely when the vendor has loyalty off, or the
   * shopper is a guest, or their balance is below the vendor's minimum. The
   * server clamps whatever is submitted regardless; this only decides whether to
   * offer the control.
   */
  redeemable: {
    balancePoints: number;
    valueLabel: string;
    minRedeemPoints: number;
    pencePerPointRedeemed: number;
  } | null;
  offerCollection: boolean;
  initialPostcode?: string | null;
  vendorId: string;
  bookingWindowDays: number;
  offerDeliverySlots: boolean;
  expressCollectionEnabled?: boolean;
  expressSchedules?: { dayOfWeek: number; openTime: string; closeTime: string }[];
  /** #363/#811 — the vendor's IANA zone, passed straight through to `SlotPicker`. */
  timezone: string;
  /**
   * #748 — resolved server-side from the shared fulfilment cookie, NOT held in
   * local state. This component used to own a `useState` for it and broadcast
   * changes over a `window` CustomEvent, which meant the cart, the header and
   * this page could each believe something different. Changing the radio now
   * writes the cookie and the server re-renders both this form and the summary
   * from one value.
   */
  method: FulfilmentMethodChoice;
  /**
   * #764 — addresses this signed-in shopper has confirmed before. Always empty for a guest.
   *
   * Offered rather than applied: picking one fills the form, and the shopper can still edit every
   * field afterwards. Nothing is preselected, because silently populating an address a returning
   * shopper did not choose is how an order goes to last year's flat.
   */
  savedAddresses?: CustomerAddressRow[];
  /**
   * #890 R23 — the delivery charges this page was priced with (`encodeDeliveryQuote`). Submitted
   * unchanged so `place-order` can refuse, rather than silently charge a different amount, when the
   * address postcode typed below resolves to different per-area charges.
   */
  quotedDeliveryRules: string;
}) {
  const [state, formAction, pending] = useActionState(placeOrderAction, initialState);
  // #973 — the code, the points and every figure derived from them live in `CheckoutPricing`, which
  // the order summary reads too, so the two totals on this page can never disagree.
  const pricing = useCheckoutPricing();
  const { currentCode, points } = pricing;
  const codeBlank = pricing.codeValue.trim() === "";
  const codeUnchecked = !codeBlank && currentCode === null;
  const codeNote: { text: string; className: string } | null = currentCode
    ? currentCode.ok
      ? {
          text: `Code ${currentCode.code} applied: −${formatPrice(currentCode.discountPence)}.`,
          className: "text-action",
        }
      : { text: currentCode.message, className: "text-danger" }
    : codeUnchecked && !pricing.pending
      ? { text: "Press Apply to check this code.", className: "text-primary-muted" }
      : null;
  const pointsNote =
    pricing.requestedPoints === 0
      ? null
      : points.pointsSpent === 0
        ? "Those points can't be used on this order."
        : points.pointsSpent === pricing.requestedPoints
          ? `${points.pointsSpent} points: −${formatPrice(points.discountPence)}`
          : `${points.pointsSpent} of ${pricing.requestedPoints} points can be used on this order: −${formatPrice(points.discountPence)}`;
  const [, startMethodTransition] = useTransition();

  const chooseMethod = (next: FulfilmentMethodChoice) => {
    if (next === method) return;
    const formData = new FormData();
    formData.append("fulfilmentMethod", next);
    startMethodTransition(async () => {
      await setFulfilmentMethod(formData);
    });
  };

  const [savedAddressError, setSavedAddressError] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  /** Street names near this postcode, offered as hints on Address line 1 (#764). Never auto-filled. */
  const [streetSuggestions, setStreetSuggestions] = useState<string[]>([]);

  /**
   * Fields the shopper has typed into since the last lookup (#764).
   *
   * A lookup must never overwrite something a person has already corrected — that is the behaviour
   * that makes an autofill feel like it is fighting you. Tracked in a ref rather than state
   * because nothing renders from it and a re-render on every keystroke would be wasteful.
   */
  const editedFields = useRef<Set<string>>(new Set());

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

  /**
   * Fill a field from a lookup, unless the shopper has already touched it (#764).
   *
   * An empty field is always safe to fill. A field the shopper typed into is never overwritten,
   * even if it is "wrong" by the lookup's reckoning — they know their own address better than a
   * dataset does.
   */
  const fillIfUntouched = (name: string, value: string | null) => {
    if (!value) return;
    const input = fieldIn(name);
    if (!input) return;
    if (editedFields.current.has(name)) return;
    if (input.value.trim() !== "") return;
    input.value = value;
  };

  /**
   * Apply a saved address to the form, then re-check it (#764).
   *
   * Two things happen, and the second is the important one. Filling the fields is the convenience;
   * **re-validating** is the correctness. A saved address is a snapshot of what was true when the
   * shopper last ordered, and the vendor's delivery areas can have changed since — so a returning
   * customer must not be allowed to sail through with an address this shop no longer serves.
   * `handleLookup` re-runs postcode validity AND the current vendor's delivery eligibility.
   *
   * Every field is written unconditionally here, unlike a lookup: the shopper explicitly chose
   * this address, so overwriting what is in the form is exactly what they asked for. The edited-
   * field record is cleared for the same reason.
   */
  const applySavedAddress = async (id: string) => {
    const saved = savedAddresses.find((address) => address.id === id);
    if (!saved) return;

    setSavedAddressError(null);
    editedFields.current.clear();

    const assign = (name: string, value: string | null) => {
      const input = fieldIn(name);
      if (input) input.value = value ?? "";
    };

    assign("recipientName", saved.recipientName);
    assign("phone", saved.phone);
    assign("line1", saved.line1);
    assign("line2", saved.line2);
    assign("city", saved.city);
    assign("county", saved.county);
    assign("postcode", saved.postcode);
    assign("notes", saved.notes);

    // Re-check against the CURRENT vendor configuration, not against whatever was true when this
    // address was saved.
    const outcome = await lookupAddressForCheckout(saved.postcode);
    if (outcome.ok && !outcome.result.deliverable) {
      setSavedAddressError(
        `We no longer deliver to ${outcome.result.postcode}. Choose another address, or enter a new one.`,
      );
    }
  };

  const handleLookup = async (postcode: string) => {
    if (!postcode) return;
    setAddressLoading(true);
    setAddressError(null);

    // Runs on the server for two reasons: this app's CSP blocks outbound browser calls (#749), and
    // since #764 the answer comes from our own reference tables rather than any third party.
    const outcome = await lookupAddressForCheckout(postcode);
    const postcodeInput = fieldIn("postcode");

    if (outcome.ok) {
      const { status, town, county, streetSuggestions: streets } = outcome.result;

      // INVALID_POSTCODE is the only verdict that contradicts the shopper, and it is only ever
      // reached when reference data IS loaded and genuinely has no such postcode. UNVERIFIED —
      // this environment has not imported the data yet — must never surface as a validation
      // error: it is our gap, not their mistake.
      if (status === "INVALID_POSTCODE") {
        setAddressError("That postcode doesn't look right. Please check it, or enter your address manually."); // prettier-ignore
        postcodeInput?.setCustomValidity("Invalid postcode");
      } else {
        postcodeInput?.setCustomValidity("");
        fillIfUntouched("city", town);
        fillIfUntouched("county", county);
      }

      // Hints only, and only on the address line the shopper still completes themselves. These say
      // where the postcode is, never that a property is on that street, which is why they are a
      // datalist rather than a value.
      setStreetSuggestions(status === "INVALID_POSTCODE" ? [] : streets);
    } else {
      // Malformed input, or a lookup we could not complete. Never block checkout on either — the
      // shopper can type the address themselves, which is the whole point of manual entry always
      // being available.
      postcodeInput?.setCustomValidity("");
      setStreetSuggestions([]);
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

  // #959 — numbered from the sections that actually render, so the sequence never repeats or skips.
  const sections = checkoutSections({
    offerCollection,
    method,
    offerDeliverySlots,
    hasRedeemable: redeemable !== null,
  });
  const heading = (key: CheckoutSectionKey) =>
    `${sections.indexOf(key) + 1}. ${CHECKOUT_SECTION_TITLES[key]}`;

  const handleFormChange = (e: React.FormEvent<HTMLFormElement>) => {
    // #764 — remember which address fields the shopper has touched, so a later lookup cannot
    // overwrite them. Recorded here rather than per-input because this handler already sees every
    // change in the form.
    const target = e.target;
    if (target instanceof HTMLInputElement && target.name) {
      editedFields.current.add(target.name);
    }

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
    <form
      ref={formRef}
      action={formAction}
      onChange={handleFormChange}
      className="space-y-6"
      data-checkout-form
    >
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
            {heading("fulfilment")}
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
      <input type="hidden" name="quotedDeliveryRules" value={quotedDeliveryRules} />

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
          <User className="h-4 w-4" aria-hidden />
          {heading("contact")}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="recipientName">
              Full name
            </label>
            <input
              id="recipientName"
              name="recipientName"
              autoComplete="name"
              required
              className={inputClass}
            />
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
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className={inputClass}
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="phone">
              Phone number ({method === "DELIVERY" ? "driver updates" : "collection updates"})
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              required
              className={inputClass}
            />
          </div>
        </div>
      </section>

      {method === "DELIVERY" && (
        <section className="space-y-3 border-t border-black/5 pt-5">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
            <MapPin className="h-4 w-4" aria-hidden />
            {heading("address")}
          </h2>
          {savedAddresses.length > 0 && (
            <div className="rounded-xl border border-black/10 bg-surface-muted p-4">
              <label className={labelClass} htmlFor="savedAddress">
                Use a saved address
              </label>
              <select
                id="savedAddress"
                // Deliberately NOT part of the submitted form data: this control only fills the
                // real address inputs below, which remain the single source of what is submitted.
                // A shopper who picks one and then edits a field sends what they edited.
                name="savedAddressPicker"
                className={inputClass}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) void applySavedAddress(e.target.value);
                }}
              >
                <option value="">Enter a new address</option>
                {savedAddresses.map((address) => (
                  <option key={address.id} value={address.id}>
                    {[address.label, address.line1, address.city, address.postcode]
                      .filter(Boolean)
                      .join(", ")}
                  </option>
                ))}
              </select>
              {savedAddressError && (
                <p role="alert" className="mt-2 text-sm font-medium text-danger">
                  {savedAddressError}
                </p>
              )}
              <p className="mt-2 text-xs text-primary-muted">
                You can change any of the details below after choosing.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="line1">
                Street address
              </label>
              <input
                id="line1"
                name="line1"
                autoComplete="address-line1"
                required={method === "DELIVERY"}
                className={inputClass}
                // #764 — nearby street names offered as browser suggestions. A datalist SUGGESTS
                // without filling: the field stays empty and fully editable, the shopper still
                // types their house number, and an absent or unhelpful hint costs nothing. Putting
                // these in the field's value instead would assert that the property is on that
                // street, which the data cannot support.
                list={streetSuggestions.length > 0 ? "line1-street-suggestions" : undefined}
              />
              {streetSuggestions.length > 0 && (
                <>
                  <datalist id="line1-street-suggestions">
                    {streetSuggestions.map((street) => (
                      <option key={street} value={street} />
                    ))}
                  </datalist>
                  <p className="mt-1 text-xs text-primary-muted">
                    Streets near this postcode: {streetSuggestions.join(", ")}. Add your house name
                    or number.
                  </p>
                </>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="line2">
                Flat, building (optional)
              </label>
              <input id="line2" name="line2" autoComplete="address-line2" className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="city">
                Town or city
              </label>
              <input
                id="city"
                name="city"
                autoComplete="address-level2"
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="county">
                County (optional)
              </label>
              <input
                id="county"
                name="county"
                autoComplete="address-level1"
                className={inputClass}
              />
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
                  autoComplete="postal-code"
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
            {heading("time")}
          </h2>
          <SlotPicker
            vendorId={vendorId}
            method={method}
            bookingWindowDays={bookingWindowDays}
            required={true}
            expressCollectionEnabled={expressCollectionEnabled}
            expressSchedules={expressSchedules}
            timezone={timezone}
          />
        </section>
      )}

      {redeemable && (
        <section className="space-y-3 border-t border-black/5 pt-5">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
            <Sparkles className="h-4 w-4" aria-hidden />
            {heading("loyalty")}
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
              value={pricing.pointsValue}
              onChange={(event) => pricing.setPointsValue(event.target.value)}
              aria-describedby={pointsNote ? "redeemPoints-note" : undefined}
              className={inputClass}
            />
          </div>
          {pointsNote && (
            <p
              id="redeemPoints-note"
              data-points-note
              className="text-xs font-medium text-primary-muted"
            >
              {pointsNote}
            </p>
          )}
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
          {heading("discount")}
        </h2>
        <div className="max-w-sm">
          <label className={labelClass} htmlFor="discountCode">
            Have a code? (optional)
          </label>
          <div className="flex gap-2">
            <input
              id="discountCode"
              name="discountCode"
              value={pricing.codeValue}
              onChange={(event) => pricing.setCodeValue(event.target.value)}
              onKeyDown={(event) => {
                // #973 — Enter here checks the code. It must not place the order.
                if (event.key === "Enter") {
                  event.preventDefault();
                  pricing.applyCode();
                }
              }}
              aria-describedby={codeNote ? "discountCode-note" : undefined}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} uppercase`}
              placeholder="WELCOME10"
            />
            <button
              type="button"
              data-discount-code-apply
              aria-label="Apply discount code"
              onClick={pricing.applyCode}
              disabled={pricing.pending}
              className="min-h-tap lg:min-h-0 shrink-0 rounded-lg bg-black/5 px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-black/10 disabled:opacity-50"
            >
              {pricing.pending ? "Checking…" : "Apply"}
            </button>
          </div>
          <div aria-live="polite">
            {codeNote && (
              <p
                id="discountCode-note"
                data-discount-code-note
                className={`mt-1.5 text-xs font-medium ${codeNote.className}`}
              >
                {codeNote.text}
              </p>
            )}
          </div>
        </div>
      </section>

      {/*
        #959 — below md the order summary stacks under the form, so without this the shopper would
        reach the button before seeing what they will pay. Hidden from md, where the summary sits
        beside the form. Not "Pay £X" on the button: `place-order` decides the code and points again
        on the server, so the exact amount is only certain on the payment page. #973 — the figure here
        is `CheckoutPricing`'s, the same one the summary shows.
      */}
      <div data-checkout-total className="rounded-xl bg-surface-muted px-4 py-3 md:hidden">
        <p className="flex justify-between text-sm font-bold text-primary">
          <span>Total</span>
          <span>{formatPrice(pricing.totalPence)}</span>
        </p>
        {currentCode?.ok && (
          <p className="mt-1 text-xs text-primary-muted">
            Includes code {currentCode.code} (−{formatPrice(currentCode.discountPence)}).
          </p>
        )}
        {points.discountPence > 0 && (
          <p className="mt-1 text-xs text-primary-muted">
            Includes {points.pointsSpent} points (−{formatPrice(points.discountPence)}).
          </p>
        )}
        {codeUnchecked && (
          <p className="mt-1 text-xs text-primary-muted">
            Your code isn&apos;t included until you press Apply.
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-bold text-white shadow-md transition active:scale-95 motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ShieldCheck className="h-4 w-4" aria-hidden />
        {pending ? "Continuing to payment…" : "Continue to payment"}
      </button>
    </form>
  );
}
