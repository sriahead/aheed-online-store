import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, FolderTree, Package, Sparkles, TicketPercent, Layers, BookOpen, TrendingUp } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getOrderRepository } from "@/lib/repositories/orders";
import { PanelRefusal } from "@/components/staff/PanelRefusal";

// Reads the session and this vendor's live order counts — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Store admin" };

/**
 * The admin panel's front door (P6a, #158).
 *
 * Before this slice, /staff/orders, /staff/loyalty and /staff/discounts were
 * three orphan pages with no index and no navigation — reachable only by typing
 * a URL from memory. This page (and the layout's nav) is what makes them a
 * panel.
 *
 * STAFF and ADMIN, matching /staff/orders: the two admin-only cards are hidden
 * from a STAFF viewer, exactly as the layout's nav hides their links. Hiding is
 * courtesy — each page still gates itself.
 */
export default async function StaffHomePage() {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Staff only"
        message="This area is restricted to store staff. You're signed in, but your account doesn't have access to this store's admin panel."
      />
    );
  }

  const isAdmin = auth.via === "platform-admin" || auth.via === "ADMIN";
  const awaitingAction = await getOrderRepository().countForStaff();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Store admin</h1>
      <p className="mb-6 text-sm text-primary/60">
        {awaitingAction === 0
          ? "No orders are awaiting action."
          : `${awaitingAction} ${awaitingAction === 1 ? "order is" : "orders are"} awaiting action.`}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/staff/inventory"
          className="rounded-2xl border border-black/10 bg-white p-5 hover:border-action"
        >
          <Layers className="mb-3 h-6 w-6 text-action" aria-hidden />
          <p className="font-semibold text-primary">Live Inventory & Availability</p>
          <p className="mt-1 text-sm text-primary/70">
            Quickly adjust stock levels and toggle product availability.
          </p>
        </Link>

        <Link
          href="/staff/orders"
          className="rounded-2xl border border-black/10 bg-white p-5 hover:border-action"
        >
          <ClipboardList className="mb-3 h-6 w-6 text-action" aria-hidden />
          <p className="font-semibold text-primary">Orders</p>
          <p className="mt-1 text-sm text-primary/70">
            Work the queue, search past orders, and open one for its full history.
          </p>
        </Link>

        <Link
          href="/staff/runbook"
          className="rounded-2xl border border-black/10 bg-white p-5 hover:border-action"
        >
          <BookOpen className="mb-3 h-6 w-6 text-action" aria-hidden />
          <p className="font-semibold text-primary">Internal Operational Runbook</p>
          <p className="mt-1 text-sm text-primary/70">
            Zero-trust guide to store operations and procedures.
          </p>
        </Link>

        {isAdmin && (
          <>
            <Link
              href="/staff/products"
              className="rounded-2xl border border-black/10 bg-white p-5 hover:border-action"
            >
              <Package className="mb-3 h-6 w-6 text-accent" aria-hidden />
              <p className="font-semibold text-primary">Products</p>
              <p className="mt-1 text-sm text-primary/70">
                Add products, correct prices, and set what&apos;s in stock.
              </p>
            </Link>

            <Link
              href="/staff/categories"
              className="rounded-2xl border border-black/10 bg-white p-5 hover:border-action"
            >
              <FolderTree className="mb-3 h-6 w-6 text-accent" aria-hidden />
              <p className="font-semibold text-primary">Categories</p>
              <p className="mt-1 text-sm text-primary/70">
                The departments shoppers browse by, and how they&apos;re ordered.
              </p>
            </Link>

            <Link
              href="/staff/loyalty"
              className="rounded-2xl border border-black/10 bg-white p-5 hover:border-action"
            >
              <Sparkles className="mb-3 h-6 w-6 text-accent" aria-hidden />
              <p className="font-semibold text-primary">Loyalty</p>
              <p className="mt-1 text-sm text-primary/70">
                Earn and redemption rates, tier thresholds and multipliers.
              </p>
            </Link>

            <Link
              href="/staff/discounts"
              className="rounded-2xl border border-black/10 bg-white p-5 hover:border-action"
            >
              <TicketPercent className="mb-3 h-6 w-6 text-accent" aria-hidden />
              <p className="font-semibold text-primary">Discount codes</p>
              <p className="mt-1 text-sm text-primary/70">
                Create, review and deactivate this store&apos;s codes.
              </p>
            </Link>

            <Link
              href="/staff/reports"
              className="rounded-2xl border border-black/10 bg-white p-5 hover:border-action"
            >
              <TrendingUp className="mb-3 h-6 w-6 text-accent" aria-hidden />
              <p className="font-semibold text-primary">Reports</p>
              <p className="mt-1 text-sm text-primary/70">
                Sales, total orders, and average basket value financials.
              </p>
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
