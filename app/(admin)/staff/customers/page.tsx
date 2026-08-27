import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, UserX } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { listCustomersForVendor } from "@/lib/customers-service";
import { formatPrice } from "@/components/product/format-price";
import { PanelRefusal } from "@/components/staff/PanelRefusal";

// Reads the session and this vendor's live order history — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Customers" };

const PAGE_SIZE = 25;

/**
 * The customer directory (P7.5d+e, #160) — named on P6's roadmap line and never
 * built until now.
 *
 * ADMIN only, matching /staff/reports and /staff/loyalty rather than
 * /staff/orders: this is the whole customer list with contact details and spend
 * attached, which is an owner's view, not a packing-floor one.
 *
 * Responses carry `Cache-Control: private, no-store, must-revalidate` from
 * next.config.mjs's /staff/:path* rule (P7.5a, #237). Nothing on the panel needs
 * that more than this page does.
 */
export default async function StaffCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to view this store's customers."
      />
    );
  }

  const requestedPage = Number.parseInt(page ?? "0", 10);
  const {
    items,
    page: currentPage,
    hasMore,
  } = await listCustomersForVendor(auth.vendorId, {
    take: PAGE_SIZE,
    page: Number.isNaN(requestedPage) ? 0 : requestedPage,
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="mb-1 text-2xl font-semibold text-primary">Customers</h1>
        <p className="text-sm text-primary/60">
          Everyone who has placed a paid order with this store, highest spend first. Abandoned and
          cancelled orders don&apos;t count towards spend.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-surface-muted p-8 text-center">
          <Users className="mx-auto mb-3 h-8 w-8 text-primary/40" aria-hidden />
          <p className="text-sm text-primary/70">
            No customers yet. They appear here once an order has been paid for.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((customer) => (
            <li
              key={customer.userId ?? customer.email ?? "erased"}
              className="rounded-2xl border border-black/10 bg-white p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-primary">
                      {customer.kind === "ACCOUNT"
                        ? (customer.name ?? customer.email ?? "Account holder")
                        : customer.kind === "GUEST"
                          ? customer.email
                          : "Erased customers"}
                    </span>
                    {customer.kind === "GUEST" && (
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary/60">
                        Guest
                      </span>
                    )}
                    {customer.kind === "ERASED" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary/60">
                        <UserX className="h-3 w-3" aria-hidden />
                        Erased
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-primary/60">
                    {customer.kind === "ACCOUNT" && customer.email
                      ? customer.email
                      : customer.kind === "ERASED"
                        ? "Personal details removed under a data-erasure request. Orders still count towards store revenue."
                        : "No account — ordered as a guest."}
                  </p>
                  {customer.loyaltyPoints !== null && (
                    <p className="mt-1 text-xs text-primary/60">
                      {customer.loyaltyPoints.toLocaleString("en-GB")} loyalty points
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold text-primary">{formatPrice(customer.totalSpendPence)}</p>
                  <p className="text-xs text-primary/60">
                    {customer.orderCount} {customer.orderCount === 1 ? "order" : "orders"}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex gap-3">
        {currentPage > 0 && (
          <Link
            href={
              currentPage === 1 ? "/staff/customers" : `/staff/customers?page=${currentPage - 1}`
            }
            className="inline-block rounded-full border border-black/10 px-4 py-2 font-semibold text-primary"
          >
            Previous
          </Link>
        )}
        {hasMore && (
          <Link
            href={`/staff/customers?page=${currentPage + 1}`}
            className="inline-block rounded-full bg-action px-4 py-2 font-semibold text-white"
          >
            Next
          </Link>
        )}
      </div>
    </main>
  );
}
