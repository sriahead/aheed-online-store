import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getOrderRepository } from "@/lib/repositories/orders";
import { formatOrderDate, nextStatus, orderStatusLabel } from "@/lib/order-status";
import { formatPrice } from "@/components/product/format-price";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { advanceStatus } from "@/features/orders/advance-status";

// Reads the session and this vendor's live orders — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Order queue" };

const PAGE_SIZE = 20;

/**
 * Staff order queue (P4b, #125) — a deliberate P4 stopgap that P6's admin panel
 * supersedes. A plain table with one advance control: no filters, no search, no
 * bulk actions, no order editing.
 *
 * Gated by requireVendorRole, so SriMart's staff cannot see or touch Aheed's
 * orders — the first real consumer of ADR-004 slice 3a's VendorMembership.
 *
 * Shows only actionable statuses (see STAFF_QUEUE_STATUSES). That inverts P4a's
 * customer list, which is deliberately unfiltered — the difference is audience:
 * a shopper is hunting one specific order, a packer is working a queue.
 */
export default async function StaffOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    // 403 — signed in, but not staff for THIS vendor. A message, never the queue.
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-primary">Staff only</h1>
        <p className="mt-3 text-primary/70">
          This area is restricted to store staff. You&apos;re signed in, but your account
          doesn&apos;t have access to this store&apos;s orders.
        </p>
      </main>
    );
  }

  const { cursor } = await searchParams;
  const { items, nextCursor } = await getOrderRepository().listForStaff({
    take: PAGE_SIZE,
    cursor,
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Order queue</h1>
      <p className="mb-6 text-sm text-primary/60">
        Orders awaiting action. Delivered and cancelled orders aren&apos;t shown.
      </p>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-surface-muted p-8 text-center">
          <ClipboardList className="mx-auto mb-3 h-8 w-8 text-primary/40" aria-hidden />
          <p className="text-sm text-primary/70">Nothing to action right now.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((order) => {
            const next = nextStatus(order.status);
            return (
              <li
                key={order.orderNumber}
                className="rounded-2xl border border-black/10 bg-white p-5"
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

                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-primary/60">
                    {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                  </span>
                  <span className="font-bold text-primary">{formatPrice(order.totalPence)}</span>
                </div>

                {/* One button, labelled by the single legal next rung — the UI
                    cannot offer a move the service would reject. */}
                {next && (
                  <form action={advanceStatus} className="mt-4">
                    <input type="hidden" name="orderNumber" value={order.orderNumber} />
                    <input type="hidden" name="toStatus" value={next} />
                    <button
                      type="submit"
                      className="w-full rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white"
                    >
                      Mark {orderStatusLabel(next).toLowerCase()}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor && (
        <Link
          href={`/staff/orders?cursor=${encodeURIComponent(nextCursor)}`}
          className="mt-6 inline-block rounded-full bg-action px-4 py-2 font-semibold text-white"
        >
          Older orders
        </Link>
      )}
    </main>
  );
}
