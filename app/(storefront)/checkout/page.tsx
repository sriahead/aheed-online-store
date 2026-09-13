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
import { CheckoutSummary } from "@/components/checkout/CheckoutSummary";
import { getLoyaltyRepository } from "@/lib/loyalty-service";

// Prisma's @prisma/client/wasm can't load during next build's Node-based
// static prerendering — same reason as the other DB-backed storefront routes.
import { cookies } from "next/headers";
import { DELIVERY_POSTCODE_COOKIE } from "@/lib/delivery-cookie";

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

  const totals = computeTotals(summary.lines, {
    deliveryFeePence: vendor?.deliveryFeePence ?? 0,
    freeDeliveryThresholdPence: vendor?.freeDeliveryThresholdPence ?? null,
  });
  const belowMinimum = totals.subtotalPence < (vendor?.minimumOrderPence ?? 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-xl font-bold text-primary">Checkout</h1>

      {belowMinimum && (
        <p className="mb-4 rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger">
          This store has a minimum order of {formatPrice(vendor?.minimumOrderPence ?? 0)}. Add a
          little more to continue.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_18rem]">
        <div className="rounded-2xl border border-black/10 bg-white p-5">
          <CheckoutForm
            vendorId={vendor?.id ?? ""}
            bookingWindowDays={vendor?.bookingWindowDays ?? 14}
            offerDeliverySlots={vendor?.offerDeliverySlots ?? false}
            signedInEmail={signedInEmail}
            redeemable={redeemable}
            offerCollection={vendor?.offerCollection ?? false}
            initialPostcode={initialPostcode}
          />
        </div>

        <CheckoutSummary lines={summary.lines} initialTotals={totals} />
      </div>
    </main>
  );
}
