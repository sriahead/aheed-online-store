import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { getOrderRepository } from "@/lib/repositories/orders";
import { getAuth } from "@/lib/auth";
import { formatPrice } from "@/components/product/format-price";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Order confirmed" };

/**
 * Order confirmation (P3b, #96). Served entirely from the persisted order, not
 * session state, so a refresh or a shared link shows the same thing.
 *
 * Access: a member's order is theirs alone (enforced in the repository). A guest
 * order has no owner, so the random order number is its only credential — a
 * capability URL. Stronger guest access (emailed link / lookup by email + number)
 * is P4; see the spec's R19a.
 */
export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  const viewerUserId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const order = await getOrderRepository().getByOrderNumber(orderNumber, viewerUserId);
  if (!order) notFound();

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

      <section className="mb-5 rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-primary">Your items</h2>
        <ul className="space-y-2">
          {order.items.map((item, index) => (
            <li key={index} className="flex justify-between gap-3 text-sm">
              <span className="min-w-0 text-primary/80">
                {item.quantity} × {item.productName}
                <span className="ml-1 text-xs text-primary/50">
                  ({formatPrice(item.unitPricePence)} each)
                </span>
              </span>
              <span className="shrink-0 font-medium text-primary">
                {formatPrice(item.lineTotalPence)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-1.5 border-t border-black/10 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-primary/70">Subtotal</dt>
            <dd className="font-medium text-primary">{formatPrice(order.subtotalPence)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-primary/70">Delivery</dt>
            <dd className="font-medium text-primary">
              {order.deliveryFeePence === 0 ? "FREE" : formatPrice(order.deliveryFeePence)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-black/10 pt-2 text-base font-bold">
            <dt className="text-primary">Total</dt>
            <dd className="text-primary">{formatPrice(order.totalPence)}</dd>
          </div>
        </dl>
      </section>

      <section className="mb-6 rounded-2xl border border-black/10 bg-white p-5">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">
          Delivering to
        </h2>
        <address className="text-sm not-italic leading-relaxed text-primary/80">
          {order.address.recipientName}
          <br />
          {order.address.line1}
          {order.address.line2 && (
            <>
              <br />
              {order.address.line2}
            </>
          )}
          <br />
          {order.address.city}
          <br />
          {order.address.postcode}
          <br />
          <span className="text-primary/60">{order.address.phone}</span>
        </address>
        {order.address.notes && (
          <p className="mt-2 text-xs text-primary/60">Notes: {order.address.notes}</p>
        )}
      </section>

      <Link
        href={order.status === "CANCELLED" ? "/cart" : "/categories"}
        className="inline-flex rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white"
      >
        {order.status === "CANCELLED" ? "Back to your cart" : "Continue shopping"}
      </Link>
    </main>
  );
}
