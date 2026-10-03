import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCartRepository } from "@/lib/cart-service";
import { getCartIdentity } from "@/lib/cart-identity";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { getAuth } from "@/lib/auth";
import { computeTotals } from "@/lib/order-totals";
import { formatPrice } from "@/components/product/format-price";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { getCustomerAddressService } from "@/lib/customer-addresses-service";
import { CheckoutSummary } from "@/components/checkout/CheckoutSummary";
import { getLoyaltyRepository } from "@/lib/loyalty-service";
import { getFulfilmentMethod } from "@/lib/fulfilment-service";
import { fulfilmentProgress } from "@/lib/cart-rules";
import { getShopperDeliveryRules } from "@/lib/delivery-pricing-service";
import { encodeDeliveryQuote } from "@/lib/delivery-pricing";
import { getDiscountRepository } from "@/lib/discounts-service";
import { normaliseCode, refusalMessage } from "@/lib/discounts";

// Prisma's @prisma/client/wasm can't load during next build's Node-based
// static prerendering — same reason as the other DB-backed storefront routes.
import { cookies } from "next/headers";
import { DELIVERY_POSTCODE_COOKIE } from "@/lib/delivery-cookie";
import { STORE_TIMEZONE } from "@/lib/local-datetime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const [identity, vendor, cookieStore] = await Promise.all([
    getCartIdentity(),
    getCurrentVendorProfile(),
    cookies(),
  ]);
  const summary = await getCartRepository().getSummary(identity);

  // An order must never be placed against an empty cart, or one whose merge the
  // shopper never resolved (inherited from P3a).
  if (summary.lines.length === 0 || summary.mergePending) redirect("/cart");

  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  const signedInEmail = (session?.user as { email?: string } | undefined)?.email ?? null;
  const signedInUserId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const initialPostcode = cookieStore.get(DELIVERY_POSTCODE_COOKIE)?.value ?? null;
  const initialDiscountCode = cookieStore.get("aheed_referral_code")?.value ?? null;

  // #764 — a returning signed-in shopper is offered the addresses they have already confirmed,
  // rather than being made to retype one we hold. The service returns an empty list for a guest,
  // who has no identity to own a saved address.
  const savedAddresses = await getCustomerAddressService().list();

  // P5a (#135) — offered only to a signed-in shopper at a loyalty-enabled vendor
  // whose VISIBLE balance (zero once lapsed) clears the vendor's minimum. Guests
  // have no balance to spend: P3a's guestToken identifies a cart, not a person.
  const loyalty = getLoyaltyRepository();
  const loyaltyConfig = await loyalty.config();
  const balance =
    loyaltyConfig.loyaltyEnabled && signedInUserId
      ? await loyalty.balance(signedInUserId, loyaltyConfig)
      : null;
  const redeemable =
    balance && balance.balancePoints >= loyaltyConfig.minRedeemPoints
      ? {
          balancePoints: balance.balancePoints,
          valueLabel: formatPrice(balance.balancePoints * loyaltyConfig.pencePerPointRedeemed),
          minRedeemPoints: loyaltyConfig.minRedeemPoints,
        }
      : null;

  // #748 — the method is resolved server-side from the shared cookie, so this
  // page, the header and the cart drawer cannot disagree. Passing it into
  // computeTotals is what stops a collection order being priced with a delivery
  // fee; the argument already existed and simply was not being supplied.
  const fulfilmentMethod = await getFulfilmentMethod();
  // #890 — priced for the postcode in the `delivery-postcode` cookie. The order itself is priced from
  // the address postcode; the form carries this quote so `place-order` refuses rather than silently
  // charging a different amount when the two resolve to different charges.
  const deliveryRules = await getShopperDeliveryRules(vendor, fulfilmentMethod);
  const minimumOrderPence = deliveryRules.minimumOrderPence;

  const totalsRules = {
    deliveryFeePence: deliveryRules.deliveryFeePence,
    freeDeliveryThresholdPence: deliveryRules.freeDeliveryThresholdPence,
  };
  const preDiscount = computeTotals(summary.lines, totalsRules, 0, fulfilmentMethod);

  // #967 — a code pre-filled from the referral cookie is previewed (read-only, nothing is
  // reserved) against the same pre-discount subtotal and delivery fee `placeOrder` claims
  // against, so the total shown here is the total the order will carry. A preview that throws
  // must never break checkout: it renders as if there were no cookie, and `placeOrder` still
  // decides the code on submit.
  const prefilledCode = await previewPrefilledCode(
    initialDiscountCode,
    signedInUserId,
    preDiscount.subtotalPence,
    preDiscount.deliveryFeePence,
  );
  const totals = prefilledCode?.ok
    ? computeTotals(summary.lines, totalsRules, prefilledCode.discountPence, fulfilmentMethod)
    : preDiscount;

  // The same pure function the cart and drawer render from, so the shopper is
  // told the same thing about the same cart wherever they are looking.
  const progress = fulfilmentProgress(totals.subtotalPence, {
    method: fulfilmentMethod,
    minimumOrderPence,
    freeDeliveryThresholdPence: deliveryRules.freeDeliveryThresholdPence,
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-xl font-bold text-primary">Checkout</h1>

      {progress.kind === "below-minimum" && (
        <p className="mb-4 rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger">
          This store has a minimum order of {formatPrice(minimumOrderPence)}. Add{" "}
          {formatPrice(progress.remainingPence)} more to continue.
        </p>
      )}

      {progress.kind === "delivery-remaining" && (
        <p className="mb-4 rounded-xl bg-action-tint px-4 py-3 text-sm font-medium text-primary">
          Add {formatPrice(progress.remainingPence)} more for free delivery.
        </p>
      )}

      {/*
        #959 R18a — minmax(0, …), not the implicit `auto`/`1fr` track, which cannot shrink below its
        content's min-content width. SlotPicker's day strip is about 900px of non-shrinking buttons,
        so the column grew to ~944px and the whole page rendered zoomed out at phone and tablet
        widths. With the track allowed to shrink, the strip scrolls inside its own overflow-x-auto.
      */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="rounded-2xl border border-black/10 bg-white p-5">
          <CheckoutForm
            vendorId={vendor?.id ?? ""}
            bookingWindowDays={vendor?.bookingWindowDays ?? 14}
            offerDeliverySlots={vendor?.offerDeliverySlots ?? false}
            expressCollectionEnabled={vendor?.expressCollectionEnabled ?? false}
            expressSchedules={vendor?.expressSchedules ?? []}
            timezone={vendor?.timezone ?? STORE_TIMEZONE}
            signedInEmail={signedInEmail}
            redeemable={redeemable}
            offerCollection={vendor?.offerCollection ?? false}
            initialPostcode={initialPostcode}
            savedAddresses={savedAddresses}
            method={fulfilmentMethod}
            initialDiscountCode={initialDiscountCode}
            quotedDeliveryRules={encodeDeliveryQuote(deliveryRules)}
            totalPence={preDiscount.totalPence}
            prefilledCode={
              prefilledCode?.ok
                ? { ...prefilledCode, totalPence: totals.totalPence }
                : prefilledCode
            }
          />
        </div>

        <CheckoutSummary
          lines={summary.lines}
          totals={totals}
          method={fulfilmentMethod}
          discountLabel={prefilledCode?.ok ? `Discount (${prefilledCode.code})` : undefined}
        />
      </div>
    </main>
  );
}

/**
 * #967 — the referral cookie's code, previewed. `null` when there is no code to preview, or when
 * the preview itself failed (logged, then treated as no cookie).
 */
async function previewPrefilledCode(
  rawCode: string | null,
  userId: string | null,
  subtotalPence: number,
  deliveryFeePence: number,
): Promise<
  | { code: string; ok: true; discountPence: number }
  | { code: string; ok: false; message: string }
  | null
> {
  const code = normaliseCode(rawCode ?? "");
  if (code === "") return null;
  try {
    const preview = await getDiscountRepository().preview({
      code,
      userId,
      subtotalPence,
      deliveryFeePence,
    });
    return preview.ok
      ? { code, ok: true, discountPence: preview.discountPence }
      : { code, ok: false, message: refusalMessage(preview.reason) };
  } catch (error) {
    console.error("Checkout: previewing the pre-filled discount code failed", error);
    return null;
  }
}
