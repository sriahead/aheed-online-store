import Link from "next/link";
import { headers } from "next/headers";
import {
  MapPin,
  Search,
  User,
  LogIn,
  Sparkles,
  HelpCircle,
  UserCheck,
  LogOut,
  ShoppingBag,
  Clock,
} from "lucide-react";
import { getAuth } from "@/lib/auth";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getEnv } from "@/lib/config";
import { composePublicUrl } from "@/lib/storage";
import { getCurrentVendorProfile } from "@/lib/repositories/vendor";
import { getCartRepository, EMPTY_CART } from "@/lib/repositories/cart";
import { getCartIdentity } from "@/lib/cart-identity";
import { CartDrawerShell } from "@/components/cart/CartDrawerShell";
import { CartContents } from "@/components/cart/CartContents";

/**
 * Storefront header — a Server Component (no "use client"), so it reads the
 * session and renders auth state with zero client JS, matching the
 * progressive-enhancement pattern used everywhere since P2a.
 */

function SearchForm({ className = "", placeholder }: { className?: string; placeholder: string }) {
  return (
    <form method="GET" action="/search" className={className}>
      <div className="relative">
        <Search
          className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40"
          aria-hidden
        />
        <input
          type="text"
          name="q"
          placeholder={placeholder}
          aria-label="Search products"
          className="w-full bg-surface-muted hover:bg-black/5 focus:bg-white pl-10 pr-4 py-2 rounded-xl text-sm border border-black/10 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all"
        />
      </div>
    </form>
  );
}

export async function Header() {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  const user = session?.user as { name: string } | undefined;
  const firstName = user?.name?.split(" ")[0];

  let isStaffOrAdmin = false;
  if (user) {
    const staffCheck = await requireVendorRole("STAFF", "ADMIN");
    isStaffOrAdmin = staffCheck.ok;
  }

  const profile = await getCurrentVendorProfile();
  const name = profile?.name ?? "";
  const localityName = profile?.localityName ?? "";

  const cartIdentity = await getCartIdentity();
  const cartSummary =
    cartIdentity.userId || cartIdentity.guestToken
      ? await getCartRepository().getSummary(cartIdentity)
      : EMPTY_CART;
  const searchPlaceholder =
    profile?.searchPlaceholder ?? "Search vine tomatoes, halal lamb chops, basmati, lentils...";
  const { CDN_BASE_URL } = getEnv();
  const logoUrl =
    profile?.logoStorageKey && CDN_BASE_URL
      ? composePublicUrl(CDN_BASE_URL, profile.logoStorageKey)
      : null;

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-black/10 shadow-sm">
      {/* Top Banner - Delivery Promise & Trust bar */}
      <div className="bg-primary text-white text-xs py-1.5 px-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-4 text-white/90">
            <span className="flex items-center gap-1 font-medium text-white">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              {name} — {localityName} Local Grocery &amp; Self-Delivery
            </span>
            <span className="hidden md:inline text-white/50">|</span>
            <span className="hidden md:inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-action-tint" />
              100% Certified HMC Halal Fresh Meat Cut Daily
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <Link
              href="#"
              className="flex items-center gap-1 text-white/80 hover:text-white px-2 py-0.5 rounded font-medium text-[11px]"
            >
              <HelpCircle className="w-3 h-3 text-action-tint" />
              <span>Help Guide</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Nav Header */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/" className="flex items-center gap-2.5 group text-left">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={`${name} — Your Local Store`}
                className="h-10 w-auto rounded-xl shadow-sm group-hover:opacity-90 transition-opacity"
              />
            ) : (
              <>
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white font-extrabold text-xl shadow-md group-hover:bg-primary/90 transition-colors">
                  {name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-bold text-xl text-primary tracking-tight group-hover:text-primary/80 transition-colors">
                      {name.split(" ")[0]}
                    </span>
                    <span className="font-semibold text-xs text-accent uppercase tracking-wider">
                      {name.split(" ").slice(1).join(" ")}
                    </span>
                  </div>
                  <p className="text-[10px] text-black/50 font-medium tracking-wide uppercase">
                    {localityName} Groceries
                  </p>
                </div>
              </>
            )}
          </Link>
        </div>

        {/* Global Search Bar */}
        <div className="flex-1 max-w-md hidden sm:block">
          <SearchForm placeholder={searchPlaceholder} />
        </div>

        {/* Action Controls & Navigation */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Account / Sign In & Sign Out Controls */}
          {user ? (
            <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-xl border border-black/10">
              <Link
                href="/account"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-black/80 hover:text-primary transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold">
                  {firstName?.charAt(0) ?? <User className="h-3.5 w-3.5" />}
                </div>
                <span className="hidden sm:inline">{firstName}</span>
              </Link>
              {isStaffOrAdmin && (
                <>
                  <div className="w-px h-4 bg-black/10 mx-1 hidden sm:block"></div>
                  <Link
                    href="/staff"
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                  >
                    Staff Panel
                  </Link>
                </>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 bg-surface-muted hover:bg-black/5 text-black/80 px-3 py-2 rounded-xl text-xs font-bold transition-all border border-black/10"
            >
              <LogIn className="w-4 h-4 text-primary" />
              <span className="hidden sm:inline">Sign In</span>
            </Link>
          )}

          {/* Cart Trigger */}
          <CartDrawerShell
            itemCount={cartSummary.itemCount}
            subtotalPence={cartSummary.subtotalPence}
          >
            <CartContents
              summary={cartSummary}
              freeDeliveryThresholdPence={profile?.freeDeliveryThresholdPence ?? null}
              localityName={localityName}
              cdnBaseUrl={CDN_BASE_URL ?? ""}
              showViewCartLink
            />
          </CartDrawerShell>
        </div>
      </div>

      {/* Mobile search row */}
      <div className="px-4 pb-2.5 sm:hidden">
        <SearchForm placeholder={searchPlaceholder} />
      </div>
    </header>
  );
}
