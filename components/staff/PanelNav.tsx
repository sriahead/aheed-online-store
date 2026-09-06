"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  LayoutDashboard,
  Package,
  Sparkles,
  TicketPercent,
  Layers,
  BookOpen,
  TrendingUp,
  Users,
  ChevronLeft,
  ChevronRight,
  Store,
  Megaphone,
  Boxes,
  Tag,
  Contact,
  ShieldAlert,
  Truck,
} from "lucide-react";

export interface PanelNavProps {
  canSeeOrders: boolean;
  currentTier: "staff" | "admin";
}

function NavLink({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
  const pathname = usePathname();
  // Exact match for overview, prefix match for everything else so /staff/orders/123 stays active
  const isActive = href === "/staff" ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 border-b-2 px-1 pb-3 pt-4 text-sm font-bold transition-colors whitespace-nowrap ${
        isActive
          ? "border-primary text-primary"
          : "border-transparent text-black/60 hover:border-black/20 hover:text-black/80"
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  );
}

/**
 * The persistent admin-panel nav.
 *
 * THIS IS ONE OF TWO NAVIGATION SURFACES, and they must list the same pages. The other is the hub
 * at `app/(admin)/staff/page.tsx`. Before P9.2 (#612) neither was a superset of the other — this
 * nav omitted brands, customers and payments while the hub omitted bundles, promotions and
 * storefront, so three pages vanished from the chrome the moment a user navigated off the hub and
 * three more were unreachable from it. `tests/staff-nav-parity.test.ts` now pins the two together:
 * add a link here and the test fails until the hub gains it too.
 *
 * Two pages are deliberately excluded from that parity set, not forgotten:
 * `/staff/errors` is platform-admin-only (this nav's `currentTier` cannot express that, so the hub
 * carries it behind its own check), and `/staff/search-synonyms` is #602's open work.
 *
 * THE PARITY TEST ABOVE IS TIER-BLIND, AND THAT COST US ONE LINK (#626, fixed in #633). It collects
 * every href in each file and compares the two sets, so the staff-tier branch below was never
 * compared against anything — it omitted `/staff/payments` for months even though that page admits
 * STAFF (`requireVendorRole("STAFF", "ADMIN")`) and the hub renders its card to them, so the link
 * vanished the moment a staff member navigated off the hub. `tests/staff-nav-parity.test.ts` now
 * additionally derives the expected staff-tier set from the pages' OWN gates, so a future
 * reallocation between the tiers is self-verifying rather than trusted.
 */
export function PanelNav({ canSeeOrders, currentTier }: PanelNavProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  if (!canSeeOrders) return null;

  const nudge = (direction: 1 | -1) =>
    trackRef.current?.scrollBy({ left: direction * 260, behavior: "smooth" });

  return (
    <nav aria-label="Store admin" className="bg-white border-b border-black/10 shadow-sm w-full">
      <div className="mx-auto flex w-full max-w-5xl items-center px-4 relative group">
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => nudge(-1)}
          className="absolute left-0 sm:-left-3 z-10 hidden sm:flex h-7 w-7 items-center justify-center rounded-full border border-black/10 bg-white text-black/60 shadow hover:bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>

        <div
          ref={trackRef}
          className="no-scrollbar flex w-full gap-6 overflow-x-auto scroll-smooth"
        >
          {currentTier === "staff" ? (
            <>
              <NavLink href="/staff" icon={LayoutDashboard} label="Overview" />
              <NavLink
                href="/staff/inventory"
                icon={Layers}
                label="Live Inventory & Availability"
              />
              <NavLink href="/staff/orders" icon={ClipboardList} label="Fulfillment & Orders" />
              <NavLink href="/staff/payments" icon={ShieldAlert} label="Payment Issues" />
              <NavLink href="/staff/runbook" icon={BookOpen} label="Internal Operational Runbook" />
            </>
          ) : (
            <>
              <NavLink href="/staff" icon={LayoutDashboard} label="Overview" />
              <NavLink
                href="/staff/inventory"
                icon={Layers}
                label="Live Inventory & Availability"
              />
              <NavLink href="/staff/orders" icon={ClipboardList} label="Orders" />
              <NavLink href="/staff/payments" icon={ShieldAlert} label="Payment Issues" />
              <NavLink href="/staff/products" icon={Package} label="Catalogue" />
              <NavLink href="/staff/categories" icon={LayoutDashboard} label="Categories" />
              <NavLink href="/staff/brands" icon={Tag} label="Brands" />
              <NavLink href="/staff/promotions" icon={Megaphone} label="Promotions" />
              <NavLink href="/staff/bundles" icon={Boxes} label="Bundles" />
              <NavLink href="/staff/storefront" icon={Store} label="Storefront" />
              <NavLink href="/staff/delivery-areas" icon={Truck} label="Delivery areas" />
              <NavLink href="/staff/loyalty" icon={Sparkles} label="Loyalty" />
              <NavLink href="/staff/discounts" icon={TicketPercent} label="Discounts" />
              <NavLink href="/staff/reports" icon={TrendingUp} label="Reports" />
              <NavLink href="/staff/customers" icon={Contact} label="Customers" />
              <NavLink href="/staff/team" icon={Users} label="Team" />
              <NavLink href="/staff/runbook" icon={BookOpen} label="Runbook" />
            </>
          )}
        </div>

        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => nudge(1)}
          className="absolute right-0 sm:-right-3 z-10 hidden sm:flex h-7 w-7 items-center justify-center rounded-full border border-black/10 bg-white text-black/60 shadow hover:bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </nav>
  );
}
