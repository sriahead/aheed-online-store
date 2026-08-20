import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getOrderRepository } from "@/lib/repositories/orders";
import { formatOrderDate, nextStatus, orderStatusLabel } from "@/lib/order-status";
import { OrderItemsCard } from "@/components/orders/OrderItemsCard";
import { OrderAddressCard } from "@/components/orders/OrderAddressCard";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { StaffOrderTimeline } from "@/components/staff/StaffOrderTimeline";
import { advanceStatus } from "@/features/orders/advance-status";

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

  const next = nextStatus(order.status);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link
        href="/staff/orders"
        className="mb-4 inline-flex items-center gap-1 text-sm text-primary/70 hover:text-primary"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        All orders
      </Link>

      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-primary">Order {order.orderNumber}</h1>
          <p className="text-sm text-primary/70">Placed {formatOrderDate(order.createdAt)}</p>
          {order.buyerEmail && (
            <p className="mt-1 truncate text-sm text-primary/70">{order.buyerEmail}</p>
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
    </main>
  );
}
