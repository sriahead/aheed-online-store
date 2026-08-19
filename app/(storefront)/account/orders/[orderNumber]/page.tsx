import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, RotateCcw } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { getOrderRepository } from "@/lib/repositories/orders";
import { formatOrderDate } from "@/lib/order-status";
import { OrderItemsCard } from "@/components/orders/OrderItemsCard";
import { OrderPointsNote } from "@/components/orders/OrderPointsNote";
import { OrderAddressCard } from "@/components/orders/OrderAddressCard";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { OrderTimeline } from "@/components/orders/OrderTimeline";
import { reorderItems } from "@/features/orders/reorder-items";

// Reads the session and one owned order — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your order" };

export default async function AccountOrderPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const userId = (session.user as { id: string }).id;
  const order = await getOrderRepository().getForUser(orderNumber, userId);
  if (!order) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/account/orders"
          className="inline-flex items-center gap-1 text-sm text-primary/70 hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          All orders
        </Link>
        <form action={reorderItems}>
          <input type="hidden" name="orderNumber" value={order.orderNumber} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-primary/90 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reorder items
          </button>
        </form>
      </div>

      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-primary">Order {order.orderNumber}</h1>
          <p className="text-sm text-primary/70">Placed {formatOrderDate(order.createdAt)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <OrderTimeline timeline={order.timeline} />

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
    </main>
  );
}
