"use client";

import Link from "next/link";
import { Icon3D } from "@/components/icons/Icon3D";

/**
 * The header's Quick Shop link (#1142, #1145, #1251), positioned in the main header navigation
 * alongside Shop so both primary storefront navigation actions sit side-by-side on all viewports.
 *
 * Sized with a minimum 44x44px touch target on mobile/tablet and enhanced 3D artwork (size={24}).
 * Uses `prefetch={false}` to prevent App Router prefetch cache corruption across route groups (#1251).
 */
export function ShoppingListLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/quick-shop"
      prefetch={false}
      aria-label="Quick Shop"
      onClick={(e) => {
        if (typeof window !== "undefined" && window.location.pathname === "/quick-shop") {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }}
      className={`flex min-h-tap min-w-tap shrink-0 justify-center lg:min-h-0 lg:min-w-0 items-center gap-1.5 bg-surface-muted hover:bg-black/5 text-black/80 px-2 sm:px-3 py-2 rounded-xl text-xs font-bold transition border border-black/10 ${className}`}
      title="Quick Shop — Favourites, regulars, lists and bundles"
    >
      <Icon3D name="quick-shop" size={24} className="-my-0.5" animated={false} decorative />
      <span className="hidden sm:inline whitespace-nowrap">Quick Shop</span>
    </Link>
  );
}
