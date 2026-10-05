"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { previewDiscountCode } from "@/features/checkout/preview-code";
import { normaliseCode } from "@/lib/discounts";
import { clampRedemption, type ClampedRedemption } from "@/lib/loyalty";
import { PREVIEW_FAILED_MESSAGE, type CodePreview } from "@/lib/checkout-code-preview";

/**
 * #973 — the checkout's live pricing, shared by `CheckoutForm` and `CheckoutSummary`.
 *
 * Before this the summary was a Server Component showing only the code pre-filled from the referral
 * cookie, and the form's mobile total row could show nothing a shopper typed. Both now render from
 * this one provider, so the two totals on the page can never disagree.
 *
 * No money is decided here. The code's discount is the server's answer (`previewDiscountCode`), and
 * the points discount is `clampRedemption`, the same pure function `placeOrder`'s `spendPoints`
 * applies, given the same inputs. The total is then `subtotal − (code + points) + delivery`, which is
 * exactly `computeTotals` once both are clamped. `placeOrder` still recomputes everything from the
 * database on submit.
 */

/** The page's pre-discount figures — what `placeOrder` claims a code and points against. */
export interface PricingBasis {
  subtotalPence: number;
  deliveryFeePence: number;
}

export interface RedeemableConfig {
  balancePoints: number;
  pencePerPointRedeemed: number;
  minRedeemPoints: number;
}

interface CheckedCode {
  result: CodePreview;
  /** The figures this result was priced against. A different basis means a re-check (R14). */
  basis: PricingBasis;
}

export interface CheckoutPricing {
  basis: PricingBasis;
  codeValue: string;
  setCodeValue: (value: string) => void;
  pointsValue: string;
  setPointsValue: (value: string) => void;
  /** Check the field's code now (the Apply control). A blank field does nothing. */
  applyCode: () => void;
  pending: boolean;
  /** The checked result, only while the field still holds that code and nothing is pending. */
  currentCode: CodePreview | null;
  codeDiscountPence: number;
  /** Points the shopper asked for, by `redeemPointsIntent`'s rule: not a positive integer → 0. */
  requestedPoints: number;
  points: ClampedRedemption;
  totalPence: number;
}

const PricingContext = createContext<CheckoutPricing | null>(null);

export function useCheckoutPricing(): CheckoutPricing {
  const pricing = useContext(PricingContext);
  if (!pricing) throw new Error("useCheckoutPricing must be used inside CheckoutPricingProvider");
  return pricing;
}

/** The same parse `features/checkout/place-order.ts`'s `redeemPointsIntent` applies on submit. */
export function parseRequestedPoints(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") return 0;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

const sameBasis = (a: PricingBasis, b: PricingBasis) =>
  a.subtotalPence === b.subtotalPence && a.deliveryFeePence === b.deliveryFeePence;

export function CheckoutPricingProvider({
  basis,
  initialDiscountCode,
  prefilledCode,
  redeemable,
  children,
}: {
  basis: PricingBasis;
  initialDiscountCode: string | null;
  /** #967 — the referral cookie's code as the page previewed it, or `null`. */
  prefilledCode: CodePreview | null;
  /** `null` when points are not on offer (loyalty off, a guest, or a balance below the minimum). */
  redeemable: RedeemableConfig | null;
  children: React.ReactNode;
}) {
  const [codeValue, setCodeValue] = useState(initialDiscountCode ?? "");
  const [pointsValue, setPointsValue] = useState("0");
  const [checked, setChecked] = useState<CheckedCode | null>(
    prefilledCode ? { result: prefilledCode, basis } : null,
  );
  const [pending, setPending] = useState(false);
  // Only the latest check may land: an answer to an earlier Apply must not overwrite a later one.
  const sequence = useRef(0);

  const runCheck = useCallback(async (code: string, at: PricingBasis) => {
    const mine = ++sequence.current;
    setPending(true);
    let result: CodePreview | null;
    try {
      result = await previewDiscountCode(code);
    } catch {
      result = { code: normaliseCode(code), ok: false, message: PREVIEW_FAILED_MESSAGE };
    }
    if (mine !== sequence.current) return;
    setChecked(result ? { result, basis: at } : null);
    setPending(false);
  }, []);

  const applyCode = () => {
    if (codeValue.trim() === "") return;
    void runCheck(codeValue, basis);
  };

  // R14 — the page re-renders from the server after a method switch, or after the header's cart
  // drawer changes the cart, and a code checked against the old figures may no longer be right (a
  // percentage of a different subtotal; a different delivery fee in the headroom cap). Check it
  // again, and treat it as not applied until the answer arrives.
  const stale = checked !== null && !sameBasis(checked.basis, basis);
  useEffect(() => {
    if (stale && !pending && checked) {
      // Re-checking IS the point of this effect: it reacts to new server figures arriving.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void runCheck(checked.result.code, basis);
    }
  }, [stale, pending, checked, basis, runCheck]);

  const currentCode =
    checked && !stale && !pending && normaliseCode(codeValue) === checked.result.code
      ? checked.result
      : null;
  const codeDiscountPence = currentCode?.ok ? currentCode.discountPence : 0;

  const requestedPoints = parseRequestedPoints(pointsValue);
  const points: ClampedRedemption = redeemable
    ? clampRedemption({
        requestedPoints,
        balancePoints: redeemable.balancePoints,
        pencePerPointRedeemed: redeemable.pencePerPointRedeemed,
        minRedeemPoints: redeemable.minRedeemPoints,
        subtotalPence: basis.subtotalPence,
        deliveryFeePence: basis.deliveryFeePence,
        existingDiscountPence: codeDiscountPence,
      })
    : { pointsSpent: 0, discountPence: 0 };

  const totalPence =
    basis.subtotalPence - codeDiscountPence - points.discountPence + basis.deliveryFeePence;

  return (
    <PricingContext.Provider
      value={{
        basis,
        codeValue,
        setCodeValue,
        pointsValue,
        setPointsValue,
        applyCode,
        pending,
        currentCode,
        codeDiscountPence,
        requestedPoints,
        points,
        totalPence,
      }}
    >
      {children}
    </PricingContext.Provider>
  );
}
