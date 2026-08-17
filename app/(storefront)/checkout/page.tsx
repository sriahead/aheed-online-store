import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCartRepository } from "@/lib/repositories/cart";
import { getCartIdentity } from "@/lib/cart-identity";
import { getCurrentVendorProfile } from "@/lib/repositories/vendor";
import { getAuth } from "@/lib/auth";
import { computeTotals } from "@/lib/order-totals";
import { formatPrice } from "@/components/product/format-price";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { getLoyaltyRepository } from "@/lib/repositories/loyalty";

// Prisma's @prisma/client/wasm can't load during next build's Node-based
// static prerendering — same reason as the other DB-backed storefront routes.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const [identity, vendor] = await Promise.all([getCartIdentity(), getCurrentVendorProfile()]);
  const summary = await getCartRepository().getSummary(identity);

  // An order must never be placed against an empty cart, or one whose merge the
  // shopper never resolved (inherited from P3a).
  if (summary.lines.length === 0 || summary.mergePending) redirect("/cart");

  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  const signedInEmail = (session?.user as { email?: string } | undefined)?.email ?? null;
  const signedInUserId = (session?.user as { id?: string } | undefined)?.id ?? null;

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
          <CheckoutForm signedInEmail={signedInEmail} redeemable={redeemable} />
        </div>

        <aside className="h-fit rounded-2xl border border-black/10 bg-surface-muted p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-primary">
            Order summary
          </h2>
          <ul className="mb-3 space-y-2">
            {summary.lines.map((line) => (
              <li key={line.productId} className="flex justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-primary/70">
                  {line.quantity} × {line.name}
                </span>
                <span className="shrink-0 font-medium text-primary">
                  {formatPrice(line.lineTotalPence)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="space-y-1.5 border-t border-black/10 pt-3 text-xs">
            <div className="flex justify-between">
              <dt className="text-primary/70">Subtotal</dt>
              <dd className="font-medium text-primary">{formatPrice(totals.subtotalPence)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-primary/70">Delivery</dt>
              <dd className="font-medium text-primary">
                {totals.deliveryFeePence === 0 ? "FREE" : formatPrice(totals.deliveryFeePence)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-black/10 pt-2 text-sm font-bold">
              <dt className="text-primary">Total</dt>
              <dd className="text-primary">{formatPrice(totals.totalPence)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </main>
  );
}
