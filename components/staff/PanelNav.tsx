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

export function PanelNav({ canSeeOrders, currentTier }: PanelNavProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  if (!canSeeOrders) return null;

  const nudge = (direction: 1 | -1) =>
    trackRef.current?.scrollBy({ left: direction * 260, behavior: "smooth" });

  return (
    <nav
      aria-label="Store admin"
      className="bg-white border-b border-black/10 shadow-sm w-full"
    >
      <div className="mx-auto flex w-full max-w-5xl items-center px-4 relative group">
        
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => nudge(-1)}
          className="absolute left-0 sm:-left-3 z-10 hidden sm:flex h-7 w-7 items-center justify-center rounded-full border border-black/10 bg-white text-black/60 shadow hover:bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>

        <div ref={trackRef} className="no-scrollbar flex w-full gap-6 overflow-x-auto scroll-smooth">
          {currentTier === "staff" ? (
            <>
              <NavLink href="/staff" icon={LayoutDashboard} label="Overview" />
              <NavLink href="/staff/inventory" icon={Layers} label="Live Inventory & Availability" />
              <NavLink href="/staff/orders" icon={ClipboardList} label="Fulfillment & Orders" />
              <NavLink href="/staff/runbook" icon={BookOpen} label="Internal Operational Runbook" />
            </>
          ) : (
            <>
              <NavLink href="/staff" icon={LayoutDashboard} label="Overview" />
              <NavLink href="/staff/inventory" icon={Layers} label="Live Inventory & Availability" />
              <NavLink href="/staff/orders" icon={ClipboardList} label="Orders" />
              <NavLink href="/staff/products" icon={Package} label="Catalogue" />
              <NavLink href="/staff/categories" icon={LayoutDashboard} label="Categories" />
              <NavLink href="/staff/storefront" icon={Store} label="Storefront" />
              <NavLink href="/staff/loyalty" icon={Sparkles} label="Loyalty" />
              <NavLink href="/staff/discounts" icon={TicketPercent} label="Discounts" />
              <NavLink href="/staff/reports" icon={TrendingUp} label="Reports" />
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
