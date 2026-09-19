import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { BookmarkPlus, ChevronLeft, RotateCcw } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { getOrderRepository } from "@/lib/orders-service";
import { formatOrderDate } from "@/lib/order-status";
import { OrderItemsCard } from "@/components/orders/OrderItemsCard";
import { OrderPointsNote } from "@/components/orders/OrderPointsNote";
import { OrderAddressCard } from "@/components/orders/OrderAddressCard";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { OrderTimeline } from "@/components/orders/OrderTimeline";
import { reorderItems } from "@/features/orders/reorder-items";
import { saveOrderAsList } from "@/features/lists/save-order-as-list";
import { MAX_SAVED_LISTS } from "@/lib/saved-list";

// Reads the session and one owned order — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your order" };

export default async function AccountOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ list?: string }>;
}) {
  const [{ orderNumber }, listStatus] = await Promise.all([params, searchParams]);
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
          className="inline-flex items-center gap-1 text-sm text-primary-muted hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          All orders
        </Link>
        {/*
          Two sibling forms, two different questions. Reorder (P4) puts these exact products in
          the cart now; "Save as list" (P10, #116) keeps the product NAMES as a standing list that
          re-matches against next week's catalogue. Neither replaces the other.
        */}
        <div className="flex items-center gap-2">
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

          <form action={saveOrderAsList}>
            <input type="hidden" name="orderNumber" value={order.orderNumber} />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 px-3.5 py-1.5 text-xs font-bold text-primary transition-colors hover:border-primary/40"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              Save as list
            </button>
          </form>
        </div>
      </div>

      {listStatus.list === "saved" && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-black/10 bg-surface-muted px-4 py-2.5 text-xs font-semibold text-primary"
        >
          Saved — find it under Your lists.
        </p>
      )}
      {listStatus.list === "capped" && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-black/10 bg-surface-muted px-4 py-2.5 text-xs font-semibold text-danger"
        >
          You already have {MAX_SAVED_LISTS} saved lists. Delete one to save another.
        </p>
      )}

      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-primary">Order {order.orderNumber}</h1>
          <p className="text-sm text-primary-muted">Placed {formatOrderDate(order.createdAt)}</p>
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
