import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { getOrderRepository } from "@/lib/repositories/orders";
import { formatOrderDate } from "@/lib/order-status";
import { formatPrice } from "@/components/product/format-price";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";

// Reads the session and the viewer's own orders — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your orders" };

const PAGE_SIZE = 10;

/**
 * Order history (P4a, #122). Vendor-scoped in the repository, so a shopper on
 * Aheed's host sees Aheed orders only — the same rule as P3a's per-vendor cart.
 *
 * Deliberately unfiltered by status: an abandoned PENDING_PAYMENT order and a
 * CANCELLED one are both real history, and hiding them just leaves the shopper
 * wondering where their attempted order went.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const { cursor } = await searchParams;
  const userId = (session.user as { id: string }).id;
  const { items, nextCursor } = await getOrderRepository().listForUser(userId, {
    take: PAGE_SIZE,
    cursor,
  });

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-primary">Your orders</h1>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-surface-muted p-8 text-center">
          <Package className="mx-auto mb-3 h-8 w-8 text-primary/40" aria-hidden />
          <p className="mb-4 text-sm text-primary/70">
            You haven&apos;t placed any orders with us yet.
          </p>
          <Link
            href="/categories"
            className="inline-flex rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((order) => (
            <li key={order.orderNumber}>
              <Link
                href={`/account/orders/${order.orderNumber}`}
                className="block rounded-2xl border border-black/10 bg-white p-5 transition hover:border-black/20"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-primary">{order.orderNumber}</p>
                    <p className="text-xs text-primary/60">{formatOrderDate(order.createdAt)}</p>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </div>

                <p className="mb-2 truncate text-sm text-primary/70">
                  {order.previewItems
                    .map((item) => `${item.quantity} × ${item.productName}`)
                    .join(", ")}
                  {order.itemCount >
                    order.previewItems.reduce((sum, item) => sum + item.quantity, 0) && " …"}
                </p>

                <div className="flex justify-between text-sm">
                  <span className="text-primary/60">
                    {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                  </span>
                  <span className="font-bold text-primary">{formatPrice(order.totalPence)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <Link
          href={`/account/orders?cursor=${encodeURIComponent(nextCursor)}`}
          className="mt-6 inline-block rounded-full bg-action px-4 py-2 font-semibold text-white"
        >
          Older orders
        </Link>
      )}
    </main>
  );
}
