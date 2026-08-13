"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, LayoutDashboard, Package, Sparkles, TicketPercent, Layers, BookOpen } from "lucide-react";

export interface PanelNavProps {
  canSeeOrders: boolean;
  currentTier: "staff" | "admin";
}

export function PanelNav({ canSeeOrders, currentTier }: PanelNavProps) {
  const pathname = usePathname();

  if (!canSeeOrders) return null;

  const NavLink = ({ href, icon: Icon, label }: { href: string; icon: any; label: string }) => {
    // Exact match for overview, prefix match for everything else so /staff/orders/123 stays active
    const isActive = href === "/staff" ? pathname === href : pathname.startsWith(href);
    
    return (
      <Link
        href={href}
        className={`inline-flex items-center gap-2 border-b-2 px-1 pb-3 pt-4 text-sm font-bold transition-colors ${
          isActive
            ? "border-[#2e7d32] text-[#2e7d32]" // brandGreenDark or primary action color
            : "border-transparent text-black/60 hover:border-black/20 hover:text-black/80"
        }`}
      >
        <Icon className="h-4 w-4" aria-hidden />
        {label}
      </Link>
    );
  };

  return (
    <nav aria-label="Store admin" className="bg-white border-b border-black/10 shadow-sm">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-6 px-4">
        {currentTier === "staff" ? (
          <>
            <NavLink href="/staff/inventory" icon={Layers} label="Live Inventory & Availability" />
            <NavLink href="/staff/orders" icon={ClipboardList} label="Fulfillment & Orders" />
            <NavLink href="/staff/runbook" icon={BookOpen} label="Internal Operational Runbook" />
          </>
        ) : (
          <>
            <NavLink href="/staff" icon={LayoutDashboard} label="Overview" />
            <NavLink href="/staff/orders" icon={ClipboardList} label="Orders" />
            <NavLink href="/staff/products" icon={Package} label="Catalogue" />
            <NavLink href="/staff/categories" icon={LayoutDashboard} label="Categories" />
            <NavLink href="/staff/loyalty" icon={Sparkles} label="Loyalty" />
            <NavLink href="/staff/discounts" icon={TicketPercent} label="Discounts" />
          </>
        )}
      </div>
    </nav>
  );
}
