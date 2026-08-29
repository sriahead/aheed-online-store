import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AlertCircle } from "lucide-react";
import { getOrderRepository } from "@/lib/orders-service";
import { getAuth } from "@/lib/auth";
import { formatPrice } from "@/components/product/format-price";
import { cancelOrder } from "@/features/checkout/cancel-order";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Cancel this order?" };

/**
 * Checkout cancellation confirmation (P9.1, #428).
 *
 * Stripe's `cancel_url` points here, and Stripe returns the browser with a GET.
 * This page therefore does the one thing a GET is allowed to do — ask. The
 * cancellation itself is a POST server action (`cancelOrder`), which is what
 * takes the destructive path out of reach of every prefetcher, mail scanner and
 * unfurler that follows a URL.
 *
 * Authorized exactly like the confirmation page, through the same
 * `getByOrderNumber` call: a member's order is theirs alone, a guest order needs
 * the capability token in `?t=`, and every refusal takes one branch to
 * /orders/lookup rather than a distinguishable 404.
 *
 * A plain server-rendered form, no client JS — the same progressive-enhancement
 * shape the staff panel uses.
 */
export default async function CancelOrderPage({
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

  // Nothing left to decide once the order has moved on. Sending them to the
  // confirmation page keeps the token in hand rather than dropping them at a
  // dead end.
  if (order.status !== "PENDING_PAYMENT") {
    redirect(
      `/checkout/${encodeURIComponent(orderNumber)}${t ? `?t=${encodeURIComponent(t)}` : ""}`,
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <AlertCircle className="h-8 w-8 shrink-0 text-accent" aria-hidden />
        <div>
          <h1 className="text-xl font-bold text-primary">Cancel this order?</h1>
          <p className="text-sm text-primary/70">
            Order <span className="font-semibold text-primary">{order.orderNumber}</span> has not
            been paid for.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-surface-muted p-4">
        <h2 className="text-xs font-bold text-primary">What happens if you cancel</h2>
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-primary/80">
          <li>The order is cancelled and nothing is charged.</li>
          <li>
            Its {order.items.length === 1 ? "item goes" : "items go"} back into your basket, so you
            can change anything before trying again.
          </li>
        </ul>

        <p className="mt-3 text-xs font-semibold text-primary">
          Order total {formatPrice(order.totalPence)}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {/*
          The token rides in a hidden field because the action re-proves it —
          this page having rendered is not itself authorization for the write.
        */}
        <form action={cancelOrder}>
          <input type="hidden" name="orderNumber" value={order.orderNumber} />
          <input type="hidden" name="t" value={t ?? ""} />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:opacity-90"
          >
            Cancel this order
          </button>
        </form>

        {/*
          A link, never a second submit control: a button inside the form above
          would cancel the order it is meant to preserve.
        */}
        <Link
          href="/cart"
          className="text-xs font-bold text-action underline hover:text-action-hover"
        >
          No — keep it and go to my basket
        </Link>
      </div>
    </main>
  );
}
