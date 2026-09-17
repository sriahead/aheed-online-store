import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getOrderRepository } from "@/lib/orders-service";
import { canCancel, formatOrderDate, nextStatus, orderStatusLabel } from "@/lib/order-status";
import { OrderItemsCard } from "@/components/orders/OrderItemsCard";
import { OrderAddressCard } from "@/components/orders/OrderAddressCard";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { StaffOrderTimeline } from "@/components/staff/StaffOrderTimeline";
import { advanceStatus } from "@/features/orders/advance-status";
import { cancelOrderStaff } from "@/features/orders/cancel-order-staff";

// Reads the session and one of this vendor's orders — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Order" };

/**
 * One order, as staff see it (P6a, #158) — the first order detail view staff
 * have ever had. #129, deferred out of P4b, lands here.
 *
 * Uses getForStaff(), which is neither of the two existing reads:
 * getByOrderNumber() implements P3b's capability-URL rule and getForUser()
 * P4a's owner-only rule. Staff authority is the vendor, not ownership — so a
 * guest order with no owner at all is visible here, and another vendor's order
 * number resolves to nothing because vendorId is in the WHERE.
 */
export default async function StaffOrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Staff only"
        message="This area is restricted to store staff. You're signed in, but your account doesn't have access to this store's orders."
      />
    );
  }

  const order = await getOrderRepository().getForStaff(orderNumber);
  if (!order) notFound();

  const next = nextStatus(order.status, order.fulfilmentMethod);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link
        href="/staff/orders"
        className="mb-4 inline-flex items-center gap-1 text-sm text-primary-muted hover:text-primary"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        All orders
      </Link>

      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-primary">Order {order.orderNumber}</h1>
          <p className="text-sm text-primary-muted">Placed {formatOrderDate(order.createdAt)}</p>
          {order.buyerEmail && (
            <p className="mt-1 truncate text-sm text-primary-muted">{order.buyerEmail}</p>
          )}
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {/* The same single-rung control as the queue, driving the same action —
          legality is decided by the service against the persisted status, so
          this page cannot offer a move the service would reject. */}
      {next && (
        <form action={advanceStatus} className="mb-6">
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

      <StaffOrderTimeline timeline={order.timeline} />

      {/* P7.5b (#150): the same attributed breakdown the customer sees. Staff
          answering "why was I only charged £35?" need the identical rows — two
          different stories about one order is the defect this phase removes.
          Points earned deliberately stay off this page; see OrderPointsNote. */}
      <OrderItemsCard
        items={order.items}
        subtotalPence={order.subtotalPence}
        discountPence={order.discountPence}
        discountCode={order.discountCode}
        deliveryFeePence={order.deliveryFeePence}
        totalPence={order.totalPence}
      />

      <OrderAddressCard address={order.address} />

      {/* P9.2 (#696) — staff cancellation of a PAID order.

          Deliberately last on the page and deliberately not on the queue: this
          is terminal and irreversible from the UI, and it does not belong beside
          the forward-only advance button where a mis-aimed click lands.

          `canCancel` is the same predicate the action re-applies to the
          persisted status, so this cannot offer a cancellation the action would
          then refuse. The required reason is both the friction that makes this a
          deliberate act and the OrderStatusEvent note that becomes the only
          durable record of why. */}
      {canCancel(order.status) && (
        <form action={cancelOrderStaff} className="mt-8 rounded-2xl border border-danger/30 p-4">
          <h2 className="text-sm font-bold text-primary">Cancel this order</h2>
          <p className="mt-1 text-xs leading-relaxed text-primary-muted">
            Returns the items to stock, reverses any points earned or spent, and gives back a
            discount code use. <strong className="text-primary">No refund is issued</strong> — the
            customer keeps being charged until you refund them directly.
          </p>
          <input type="hidden" name="orderNumber" value={order.orderNumber} />
          <label htmlFor="cancel-reason" className="mt-3 block text-xs font-bold text-primary">
            Reason
          </label>
          <input
            id="cancel-reason"
            name="reason"
            type="text"
            required
            maxLength={200}
            placeholder="Why is this order being cancelled?"
            className="mt-1 w-full rounded-xl border border-black/10 bg-surface px-3 py-2 text-sm text-primary"
          />
          <button
            type="submit"
            className="mt-3 w-full rounded-2xl bg-danger px-5 py-3 text-sm font-bold text-white transition-colors hover:opacity-90"
          >
            Cancel order {order.orderNumber}
          </button>
        </form>
      )}
    </main>
  );
}
