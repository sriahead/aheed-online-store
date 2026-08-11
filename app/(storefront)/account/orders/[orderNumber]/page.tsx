import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { getOrderRepository } from "@/lib/repositories/orders";
import { formatOrderDate } from "@/lib/order-status";
import { OrderItemsCard } from "@/components/orders/OrderItemsCard";
import { OrderAddressCard } from "@/components/orders/OrderAddressCard";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { OrderTimeline } from "@/components/orders/OrderTimeline";

// Reads the session and one owned order — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your order" };

/**
 * One order from the account area (P4a, #122).
 *
 * Uses getForUser(), NOT getByOrderNumber(): the latter implements P3b's
 * capability-URL rule, under which a guest order is viewable by anyone holding
 * its number. That is right for /checkout/{n} and wrong here — this page claims
 * to show *your* order history, so an order that is not yours must 404 even if
 * you paste a valid number.
 */
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
      <Link
        href="/account/orders"
        className="mb-4 inline-flex items-center gap-1 text-sm text-primary/70 hover:text-primary"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        All orders
      </Link>

      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-primary">Order {order.orderNumber}</h1>
          <p className="text-sm text-primary/70">Placed {formatOrderDate(order.createdAt)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <OrderTimeline timeline={order.timeline} />

      <OrderItemsCard
        items={order.items}
        subtotalPence={order.subtotalPence}
        discountPence={order.discountPence}
        deliveryFeePence={order.deliveryFeePence}
        totalPence={order.totalPence}
      />

      <OrderAddressCard address={order.address} />
    </main>
  );
}
