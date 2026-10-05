import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getCartIdentity } from "@/lib/cart-identity";
import { getCartRepository } from "@/lib/cart-service";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { getFulfilmentMethod } from "@/lib/fulfilment-service";
import { getShopperDeliveryRules } from "@/lib/delivery-pricing-service";
import { computeTotals } from "@/lib/order-totals";
import { getDiscountRepository } from "@/lib/discounts-service";
import { normaliseCode, refusalMessage } from "@/lib/discounts";
import { PREVIEW_FAILED_MESSAGE, type CodePreview } from "@/lib/checkout-code-preview";

/**
 * #973 — the one place a checkout code is previewed (read-only; nothing is reserved), shared by the
 * checkout page (a code pre-filled from the referral cookie) and `previewDiscountCode` (a code the
 * shopper typed and applied). Only the code comes from the caller: the cart, the method, the
 * delivery rules and the shopper are all resolved here, so no figure the browser sends can change a
 * price, and the page and the action cannot price one code differently.
 *
 * The figures are the ones `placeOrder` claims against — the pre-discount subtotal and delivery fee —
 * priced from the `delivery-postcode` cookie, as the page is (#890). A preview is a snapshot, not a
 * hold: `claimCode`'s compare-and-set still decides the code on submit.
 *
 * `null` means there is nothing to preview: a blank code, or no cart a checkout could be placed from.
 * A preview that throws must never break checkout; it is logged and reported as a refusal the
 * shopper can read.
 */
export async function previewCheckoutCode(rawCode: string | null): Promise<CodePreview | null> {
  const code = normaliseCode(rawCode ?? "");
  if (code === "") return null;

  try {
    const identity = await getCartIdentity();
    const summary = await getCartRepository().getSummary(identity);
    if (summary.lines.length === 0 || summary.mergePending) return null;

    const [vendor, method, session] = await Promise.all([
      getCurrentVendorProfile(),
      getFulfilmentMethod(),
      (async () => (await getAuth()).api.getSession({ headers: await headers() }))(),
    ]);
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
    const rules = await getShopperDeliveryRules(vendor, method);
    const preDiscount = computeTotals(
      summary.lines,
      {
        deliveryFeePence: rules.deliveryFeePence,
        freeDeliveryThresholdPence: rules.freeDeliveryThresholdPence,
      },
      0,
      method,
    );

    const preview = await getDiscountRepository().preview({
      code,
      userId,
      subtotalPence: preDiscount.subtotalPence,
      deliveryFeePence: preDiscount.deliveryFeePence,
    });
    return preview.ok
      ? { code, ok: true, discountPence: preview.discountPence }
      : { code, ok: false, message: refusalMessage(preview.reason) };
  } catch (error) {
    console.error("Checkout: previewing a discount code failed", error);
    return { code, ok: false, message: PREVIEW_FAILED_MESSAGE };
  }
}
