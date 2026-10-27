import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getOrderRepository } from "@/lib/orders-service";
import { formatOrderDate } from "@/lib/order-status";
import { formatPrice } from "@/components/product/format-price";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { PageContainer } from "@/components/layout/PageContainer";
import { IconMedallion } from "@/components/icons/IconMedallion";
import { Icon } from "@/components/icons/Icon";
import { reorderItems } from "@/features/orders/reorder-items";
import { saveOrderAsList } from "@/features/lists/save-order-as-list";
import { MAX_SAVED_LISTS } from "@/lib/saved-list";

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
  searchParams: Promise<{ cursor?: string; list?: string }>;
}) {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const { cursor, list } = await searchParams;
  const userId = (session.user as { id: string }).id;
  const { items, nextCursor } = await getOrderRepository().listForUser(userId, {
    take: PAGE_SIZE,
    cursor,
  });

  return (
    <PageContainer width="wide">
      <h1 className="mb-6 text-2xl font-semibold text-primary">Your orders</h1>

      {/* #1302 — Save as list from this page comes back here, so say what happened. */}
      {list === "saved" && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-black/10 bg-surface-muted px-4 py-2.5 text-xs font-semibold text-primary"
        >
          Saved — find it under Your lists.
        </p>
      )}
      {list === "capped" && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-black/10 bg-surface-muted px-4 py-2.5 text-xs font-semibold text-danger"
        >
          You already have {MAX_SAVED_LISTS} saved lists. Delete one to save another.
        </p>
      )}
      {list === "empty" && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-black/10 bg-surface-muted px-4 py-2.5 text-xs font-semibold text-danger"
        >
          There is nothing in that order to save.
        </p>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-surface-muted p-8 text-center">
          <IconMedallion icon="package" size={32} className="mx-auto mb-3" decorative />
          <p className="mb-4 text-sm text-primary-muted">
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
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((order) => (
            <li key={order.orderNumber} className="flex">
              {/* A form cannot sit inside a link, so the card is a wrapper: the details are the
                  link, the two actions are a separate row beneath it. */}
              <div className="flex flex-1 flex-col rounded-2xl border border-black/10 bg-white transition hover:border-black/20">
                <Link
                  href={`/account/orders/${order.orderNumber}`}
                  className="block flex-1 p-5 pb-3"
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-primary">{order.orderNumber}</p>
                      <p className="text-xs text-primary-muted">
                        {formatOrderDate(order.createdAt)}
                      </p>
                    </div>
                    <OrderStatusBadge status={order.status} />
                  </div>

                  <p className="mb-2 line-clamp-2 text-sm text-primary-muted">
                    {order.previewItems
                      .map((item) => `${item.quantity} × ${item.productName}`)
                      .join(", ")}
                    {order.itemCount >
                      order.previewItems.reduce((sum, item) => sum + item.quantity, 0) && " …"}
                  </p>

                  <div className="flex justify-between text-sm">
                    <span className="text-primary-muted">
                      {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                    </span>
                    <span className="font-bold text-primary">{formatPrice(order.totalPence)}</span>
                  </div>
                </Link>

                <div className="mt-auto flex flex-wrap items-center gap-2 px-5 pb-4">
                  <form action={reorderItems}>
                    <input type="hidden" name="orderNumber" value={order.orderNumber} />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-primary/90"
                    >
                      <Icon name="rotate-ccw" className="h-3.5 w-3.5" />
                      Reorder items
                    </button>
                  </form>
                  <form action={saveOrderAsList}>
                    <input type="hidden" name="orderNumber" value={order.orderNumber} />
                    <input type="hidden" name="from" value="orders-list" />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 px-3.5 py-1.5 text-xs font-bold text-primary transition-colors hover:border-primary/40"
                    >
                      <Icon name="bookmark-plus" className="h-3.5 w-3.5" />
                      Save as list
                    </button>
                  </form>
                </div>
              </div>
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
    </PageContainer>
  );
}
