import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { getOrderRepository } from "@/lib/orders-service";
import { getAuth } from "@/lib/auth";
import { OrderItemsCard } from "@/components/orders/OrderItemsCard";
import { OrderAddressCard } from "@/components/orders/OrderAddressCard";
import { OrderPointsNote } from "@/components/orders/OrderPointsNote";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Order confirmed" };

/**
 * Order confirmation (P3b, #96). Served entirely from the persisted order, not
 * session state, so a refresh shows the same thing.
 *
 * Access (P9.1, #427): a member's order is theirs alone. A guest order is
 * authorized by the capability token in `?t=`, which checkout puts on both of
 * Stripe's return URLs — the order number is NOT a credential, because it
 * travels through emails, shared links, browser history and support threads.
 *
 * Every refusal takes ONE branch to /orders/lookup, whether the order does not
 * exist, the token is wrong, or the viewer is not the owner. That is deliberate:
 * a distinct 404 for "no such order" would confirm which order numbers are real,
 * and lookup is somewhere the shopper can actually recover with the order
 * number + email pair they do have.
 */
export default async function OrderConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { orderNumber } = await params;
  const { t } = await searchParams;
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  const viewerUserId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const order = await getOrderRepository().getByOrderNumber(orderNumber, viewerUserId, t ?? null);
  if (!order) redirect(`/orders/lookup?orderNumber=${encodeURIComponent(orderNumber)}`);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      {/* Status comes from the DB on every request — never from the fact that the
          shopper arrived at the provider's success_url. That redirect routinely
          races the webhook, and a closed tab means it never happens at all. */}
      <div className="mb-6 flex items-center gap-3">
        {order.status === "CONFIRMED" && (
          <CheckCircle2 className="h-8 w-8 shrink-0 text-action" aria-hidden />
        )}
        {order.status === "PENDING_PAYMENT" && (
          <Clock className="h-8 w-8 shrink-0 text-accent" aria-hidden />
        )}
        {order.status === "CANCELLED" && (
          <XCircle className="h-8 w-8 shrink-0 text-danger" aria-hidden />
        )}
        <div>
          <h1 className="text-xl font-bold text-primary">
            {order.status === "CONFIRMED" && "Thanks — your order is confirmed"}
            {order.status === "PENDING_PAYMENT" && "Confirming your payment…"}
            {order.status === "CANCELLED" && "This order was not completed"}
            {!["CONFIRMED", "PENDING_PAYMENT", "CANCELLED"].includes(order.status) && "Your order"}
          </h1>
          <p className="text-sm text-primary/70">
            Order <span className="font-semibold text-primary">{order.orderNumber}</span>
          </p>
        </div>
      </div>

      {order.status === "PENDING_PAYMENT" && (
        <p className="mb-5 rounded-2xl bg-accent-tint px-4 py-3 text-sm text-primary">
          We&apos;re waiting for your payment to be confirmed. This page updates once it clears —
          refresh in a moment if it hasn&apos;t already.
        </p>
      )}

      {order.status === "CANCELLED" && (
        <p className="mb-5 rounded-2xl bg-danger-tint px-4 py-3 text-sm text-danger">
          Payment wasn&apos;t completed, so this order was cancelled and the items were returned to
          stock. Nothing has been charged.
        </p>
      )}

      <OrderPointsNote
        status={order.status}
        pointsEarned={order.pointsEarned}
        hasAccount={order.hasAccount}
      />

      <OrderItemsCard
        items={order.items}
        subtotalPence={order.subtotalPence}
        discountPence={order.discountPence}
        discountCode={order.discountCode}
        deliveryFeePence={order.deliveryFeePence}
        totalPence={order.totalPence}
      />

      <OrderAddressCard address={order.address} />

      <Link
        href={order.status === "CANCELLED" ? "/cart" : "/categories"}
        className="inline-flex rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white"
      >
        {order.status === "CANCELLED" ? "Back to your cart" : "Continue shopping"}
      </Link>
    </main>
  );
}
