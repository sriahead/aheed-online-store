import Link from "next/link";
import { headers, cookies } from "next/headers";
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
import { ViewSwitcher } from "./ViewSwitcher";

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
          className="w-full bg-surface-muted hover:bg-black/5 focus:bg-white pl-10 pr-4 py-2 rounded-xl text-sm border border-black/10 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition"
        />
      </div>
    </form>
  );
}

export async function Header({ isPortal = false }: { isPortal?: boolean } = {}) {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  const user = session?.user as { name: string } | undefined;
  const firstName = user?.name?.split(" ")[0];

  let isStaffOrAdmin = false;
  let canSeeAdmin = false;
  if (user) {
    const staffCheck = await requireVendorRole("STAFF", "ADMIN");
    isStaffOrAdmin = staffCheck.ok;
    canSeeAdmin =
      staffCheck.ok && (staffCheck.via === "platform-admin" || staffCheck.via === "ADMIN");
  }

  const cookieStore = await cookies();
  let currentTier: "staff" | "admin" = "staff";
  if (canSeeAdmin) {
    const saved = cookieStore.get("admin-tier")?.value;
    if (saved === "admin" || saved === "staff") {
      currentTier = saved;
    } else {
      currentTier = "admin";
    }
  }

  const profile = await getCurrentVendorProfile();
  const name = profile?.name ?? "";
  const localityName = profile?.localityName ?? "";
  const bannerNote = profile?.bannerNote ?? null;

  const cartIdentity = await getCartIdentity();
  const cartSummary =
    cartIdentity.userId || cartIdentity.guestToken
      ? await getCartRepository().getSummary(cartIdentity)
      : EMPTY_CART;
  // #239: this fallback was itself Aheed copy ("vine tomatoes, halal lamb
  // chops, basmati, lentils"). It only fires when no vendor resolves at all —
  // fetchVendorProfile already substitutes DEFAULT_SEARCH_PLACEHOLDER for a
  // vendor with none — but a platform default naming one vendor's trade is the
  // same defect this slice exists to remove.
  const searchPlaceholder = profile?.searchPlaceholder ?? "Search products…";
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
          {/* P7.5c+f (#239): both lines used to be Aheed's. The first named a
              trade ("Local Grocery & Self-Delivery") and the second was a
              literal halal claim, so SriMart — an electronics shop in Reading —
              advertised certified halal meat. The first is now derived from
              vendor data alone; the second is that vendor's own bannerNote, and
              renders nothing at all when they have none. */}
          <div className="flex items-center gap-4 text-white/90">
            <span className="flex items-center gap-1 font-medium text-white">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              {name} — local delivery across {localityName}
            </span>
            {bannerNote && (
              <>
                <span className="hidden md:inline text-white/50">|</span>
                <span className="hidden md:inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-action-tint" />
                  {bannerNote}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs">
            <Link
              href="/help"
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
        {/* Brand Logo. h-10 overflow-clip caps this container at the logo's own
            height so a third-party browser extension's content script injecting
            an element inside it (confirmed: Coupert, #333) cannot stretch it and
            reflow the row. Deliberately NOT applied to the row or <nav> below —
            ViewSwitcher's dropdown (components/layout/ViewSwitcher.tsx) renders
            below the row via `absolute top-full` and an ancestor overflow-clip
            would cut it off. */}
        <div className="flex items-center gap-3 shrink-0 h-10 overflow-clip">
          <Link
            href={isPortal ? "/staff" : "/"}
            className="flex items-center gap-2.5 group text-left"
          >
            {logoUrl ? (
              // Plain <img> by decision — see #46 / eslint.config.mjs. NOTE: this logo is
              // the storefront's dominant byte cost (1.9 MB, 83% of page weight, rendered
              // into a 40px box) and the whole of the ~12s LCP breach — tracked as #243.
              //
              // `aspect-9/5` (= 1.8) reserves the box BEFORE the bytes land. Without it, `w-auto`
              // gave the element zero width until the image decoded, and it then snapped to
              // ~72px and shoved the whole header row sideways — the visible "jerk on
              // refresh". That shift was invisible to the transition sweeps in #323/#324
              // because it is a layout shift, not an animation, and it is made far worse by
              // the 1.9 MB payload above: the bigger the file, the later the jolt.
              // Dimensions cannot come from the DB — VendorBranding stores only
              // logoStorageKey, no width/height — so the ratio is pinned in CSS instead.
              // 1.8 matches both seeded logos (298x160 and 1664x928); `object-contain` means
              // a vendor whose logo is a different shape is letterboxed inside the reserved
              // box rather than distorted, and still never shifts. If #243 later stores real
              // dimensions, replace this with width/height attributes.
              <img
                src={logoUrl}
                alt={`${name} — Your Local Store`}
                className="h-10 w-auto aspect-9/5 object-contain rounded-xl shadow-sm group-hover:opacity-90 transition-opacity"
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
                  {/* #239: was "{localityName} Groceries", which rendered
                      "Reading Groceries" under SriMart's wordmark. Only shown
                      in the logo fallback (a vendor with no logoStorageKey), so
                      it was easy to miss — the locality alone names no trade. */}
                  <p className="text-[10px] text-black/50 font-medium tracking-wide uppercase">
                    {localityName}
                  </p>
                </div>
              </>
            )}
          </Link>
        </div>

        {/* Global Search Bar */}
        <div className="flex-1 max-w-md hidden sm:block">
          {!isPortal && <SearchForm placeholder={searchPlaceholder} />}
        </div>

        {/* Action Controls & Navigation */}
        <nav aria-label="Main Navigation" className="flex shrink-0 items-center gap-2">
          {/* Shop your list link */}
          {!isPortal && (
            <Link
              href="/shop-your-list"
              className="hidden lg:flex items-center gap-1.5 bg-surface-muted hover:bg-black/5 text-black/80 px-3 py-2 rounded-xl text-xs font-bold transition border border-black/10"
              title="Shop by pasting your list"
            >
              <ShoppingBag className="w-4 h-4 text-primary" />
              <span>Shop List</span>
            </Link>
          )}

          {/* Account / Sign In & Sign Out Controls */}
          {user ? (
            <Link
              href="/account"
              className="flex items-center gap-1.5 bg-surface-muted hover:bg-black/5 p-1 pr-3 rounded-xl border border-black/10 transition-colors text-xs font-bold text-black/80 hover:text-primary"
            >
              <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold">
                {firstName?.charAt(0) ?? <User className="h-3.5 w-3.5" />}
              </div>
              <span className="hidden sm:inline">{firstName}</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 bg-surface-muted hover:bg-black/5 text-black/80 px-3 py-2 rounded-xl text-xs font-bold transition border border-black/10"
            >
              <LogIn className="w-4 h-4 text-primary" />
              <span className="hidden sm:inline">Sign In</span>
            </Link>
          )}

          {/* Cart Trigger */}
          {!isPortal && (
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
          )}

          {/* View Switcher (Anchored Far Right) */}
          {isStaffOrAdmin && (
            <div className="border-l border-black/10 pl-2 ml-1">
              <ViewSwitcher
                canSeeAdmin={canSeeAdmin}
                currentTier={currentTier}
                isPortal={isPortal}
              />
            </div>
          )}
        </nav>
      </div>

      {/* Mobile search row */}
      <div className="px-4 pb-2.5 sm:hidden">
        {!isPortal && <SearchForm placeholder={searchPlaceholder} />}
      </div>
    </header>
  );
}
