import Link from "next/link";
import { headers } from "next/headers";
import { MapPin, Search, ShoppingBag, User, LogIn } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { getEnv } from "@/lib/config";
import { composePublicUrl } from "@/lib/storage";
import { getCurrentVendorProfile } from "@/lib/repositories/vendor";

/**
 * Storefront header — a Server Component (no "use client"), so it reads the
 * session and renders auth state with zero client JS, matching the
 * progressive-enhancement pattern used everywhere since P2a. Cart is inert
 * (visual only) until P3 wires a real cart.
 */

function SearchForm({ className = "", placeholder }: { className?: string; placeholder: string }) {
  return (
    <form method="GET" action="/search" className={className}>
      <div className="relative">
        <Search
          className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/40"
          aria-hidden
        />
        <input
          type="text"
          name="q"
          placeholder={placeholder}
          aria-label="Search products"
          className="w-full rounded-full border border-black/15 bg-surface-muted py-2 pl-10 pr-4 text-sm focus:border-primary focus:bg-white focus:outline-none"
        />
      </div>
    </form>
  );
}

export async function Header() {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  const user = session?.user as { name: string } | undefined;
  const firstName = user?.name?.split(" ")[0];

  // Vendor branding/locality (ADR-004 slice 4). The storefront layout already
  // gated the tenant, so a profile always resolves here.
  const profile = await getCurrentVendorProfile();
  const name = profile?.name ?? "";
  const localityName = profile?.localityName ?? "";
  const searchPlaceholder = profile?.searchPlaceholder ?? "Search products…";
  const { CDN_BASE_URL } = getEnv();
  const logoUrl =
    profile?.logoStorageKey && CDN_BASE_URL
      ? composePublicUrl(CDN_BASE_URL, profile.logoStorageKey)
      : null;

  return (
    <header className="sticky top-0 z-40 border-b border-black/10 bg-white">
      {/* Promo / trust bar */}
      <div className="bg-primary text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-1.5 text-center text-[11px] sm:justify-between sm:text-xs">
          <span className="font-medium">
            {name} — {localityName} Grocery &amp; Delivery
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-accent" aria-hidden />
            Local delivery across the {localityName} area
          </span>
        </div>
      </div>

      {/* Main nav */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:gap-4 sm:py-3">
        {/* Logo — from VendorBranding.logoStorageKey via the CDN when set, else a
            text wordmark from the vendor name (ADR-004 slice 4). */}
        <Link href="/" className="flex shrink-0 items-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- storefront uses plain <img>; next/image loader is tracked in #46
            <img src={logoUrl} alt={`${name} — Your Local Store`} className="h-11 w-auto sm:h-16" />
          ) : (
            <span className="text-xl font-bold text-primary sm:text-2xl">{name}</span>
          )}
        </Link>

        {/* Inline search (desktop/tablet only; mobile gets its own row below) */}
        <SearchForm className="hidden max-w-md flex-1 sm:block" placeholder={searchPlaceholder} />

        {/* Account + cart */}
        <div className="flex shrink-0 items-center gap-2">
          {user ? (
            <Link
              href="/account"
              className="flex items-center gap-1.5 rounded-full border border-black/10 bg-surface-muted px-2.5 py-2 text-xs font-bold text-primary sm:px-3"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                {firstName?.charAt(0) ?? <User className="h-3.5 w-3.5" aria-hidden />}
              </span>
              <span className="hidden sm:inline">{firstName}</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 rounded-full border border-black/10 bg-surface-muted px-2.5 py-2 text-xs font-bold text-primary sm:px-3"
            >
              <LogIn className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Sign in</span>
            </Link>
          )}

          {/* Inert cart button — no cart exists until P3, so no count is shown. */}
          <button
            type="button"
            aria-label="Cart (available soon)"
            className="flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-xs font-bold text-white sm:px-3.5"
          >
            <ShoppingBag className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Cart</span>
          </button>
        </div>
      </div>

      {/* Mobile search row — the inline search is hidden below sm, so surface it here. */}
      <div className="px-4 pb-2.5 sm:hidden">
        <SearchForm placeholder={searchPlaceholder} />
      </div>
    </header>
  );
}
