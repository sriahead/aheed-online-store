import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, Search } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getOrderRepository } from "@/lib/repositories/orders";
import { ORDER_STATUSES, formatOrderDate, nextStatus, orderStatusLabel } from "@/lib/order-status";
import { STATUS_ALL, parseStaffOrdersQuery, staffOrdersHref } from "@/lib/staff-orders-query";
import { formatPrice } from "@/components/product/format-price";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { advanceStatus } from "@/features/orders/advance-status";
import { advanceStatusBulk } from "@/features/orders/advance-status-bulk";

// Reads the session and this vendor's live orders — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Orders" };

const PAGE_SIZE = 20;

/**
 * The staff order dashboard (P6a, #158) — P4b's stopgap queue, grown up.
 *
 * Gated by requireVendorRole, so SriMart's staff cannot see or touch Aheed's
 * orders — the first real consumer of ADR-004 slice 3a's VendorMembership.
 *
 * WITH NO QUERY STRING THIS IS STILL P4b'S QUEUE: only actionable statuses,
 * newest first. That default is deliberate and unchanged — a worklist padded
 * with rows whose only control is disabled is a worse worklist, and the packing
 * floor's page should not have moved under it. What P6a adds is a way OUT of
 * the queue: an explicit ?status= (including ?status=all) plus search, so a
 * delivered order from last week is reachable at all. See
 * lib/staff-orders-query.ts for why an unrecognised status falls back to the
 * queue rather than to everything.
 */
export default async function StaffOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; status?: string; q?: string }>;
}) {
  const { cursor, status, q } = await searchParams;
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    // 403 — signed in, but not staff for THIS vendor. A message, never the queue.
    return (
      <PanelRefusal
        title="Staff only"
        message="This area is restricted to store staff. You're signed in, but your account doesn't have access to this store's orders."
      />
    );
  }

  const query = parseStaffOrdersQuery({ status, q });
  const { items, nextCursor } = await getOrderRepository().listForStaff({
    take: PAGE_SIZE,
    cursor,
    filter: query,
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Orders</h1>
      <p className="mb-6 text-sm text-primary/60">
        {query.status === "" && query.search === null
          ? "Orders awaiting action. Delivered and cancelled orders aren't shown — filter to see them."
          : "Filtered view. Clear the filters to return to the action queue."}
      </p>

      {/* A plain GET form: no client component, no JS, and the resulting URL is
          shareable — which is what a staff member phoning about an order wants. */}
      <form method="get" action="/staff/orders" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-primary">
          Status
          <select
            name="status"
            defaultValue={query.status}
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-primary"
          >
            <option value="">Awaiting action</option>
            <option value={STATUS_ALL}>All statuses</option>
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {orderStatusLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-1 flex-col gap-1 text-xs font-bold uppercase tracking-wide text-primary">
          Search
          <input
            type="search"
            name="q"
            defaultValue={query.search ?? ""}
            placeholder="Order number or customer email"
            className="w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-primary"
          />
        </label>

        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white"
        >
          <Search className="h-4 w-4" aria-hidden />
          Apply
        </button>
      </form>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-surface-muted p-8 text-center">
          <ClipboardList className="mx-auto mb-3 h-8 w-8 text-primary/40" aria-hidden />
          <p className="text-sm text-primary/70">No orders match this view.</p>
        </div>
      ) : (
        <>
          {/* Bound to each row's checkbox by `form="bulk-advance"`, not by DOM
              nesting — a <form> cannot contain another <form>, and every row
              below still needs its own single-order "Mark X" form untouched.
              Each checkbox's value is `orderNumber:toStatus`: the queue mixes
              orders at different stages, so there is no one shared target
              status to submit as a plain hidden field. */}
          <form id="bulk-advance" action={advanceStatusBulk} className="mb-3">
            <button
              type="submit"
              className="rounded-xl border border-primary/20 bg-white px-4 py-2 text-xs font-bold text-primary hover:bg-gray-50"
            >
              Advance selected
            </button>
          </form>

          <ul className="space-y-3">
            {items.map((order) => {
              const next = nextStatus(order.status);
              return (
                <li
                  key={order.orderNumber}
                  className="rounded-2xl border border-black/10 bg-white p-5"
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      {next && (
                        <input
                          type="checkbox"
                          name="selection"
                          value={`${order.orderNumber}:${next}`}
                          form="bulk-advance"
                          aria-label={`Select order ${order.orderNumber} for bulk advance`}
                          className="mt-1.5 h-4 w-4 rounded border-black/20"
                        />
                      )}
                      <div className="min-w-0">
                        <Link
                          href={`/staff/orders/${encodeURIComponent(order.orderNumber)}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                        <p className="text-xs text-primary/60">
                          {formatOrderDate(order.createdAt)}
                        </p>
                      </div>
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
        </>
      )}

      {/* The cursor link MUST carry the active filter — a next page that quietly
          reverted to the default queue would look like data loss. */}
      {nextCursor && (
        <Link
          href={staffOrdersHref(query, nextCursor)}
          className="mt-6 inline-block rounded-full bg-action px-4 py-2 font-semibold text-white"
        >
          Older orders
        </Link>
      )}
    </main>
  );
}
