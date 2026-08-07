import Link from "next/link";
import { headers } from "next/headers";
import { MapPin, Search, ShoppingBag, User, LogIn } from "lucide-react";
import { getAuth } from "@/lib/auth";

/**
 * Storefront header — a Server Component (no "use client"), so it reads the
 * session and renders auth state with zero client JS, matching the
 * progressive-enhancement pattern used everywhere since P2a. Cart is inert
 * (visual only) until P3 wires a real cart.
 */
export async function Header() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const user = session?.user as { name: string } | undefined;
  const firstName = user?.name?.split(" ")[0];

  return (
    <header className="sticky top-0 z-40 border-b border-black/10 bg-white">
      {/* Promo / trust bar */}
      <div className="bg-primary text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-1.5 text-xs">
          <span className="font-medium">
            Aheed Food Centre — Leicester Local Grocery &amp; Self-Delivery
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-accent" aria-hidden />
            Local delivery across Leicester LE1–LE5
          </span>
        </div>
      </div>

      {/* Main nav */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-xl font-bold text-white">
            A
          </span>
          <span className="flex items-baseline gap-1">
            <span className="text-xl font-bold tracking-tight text-primary">Aheed</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-accent">
              Food Centre
            </span>
          </span>
        </Link>

        {/* Global search */}
        <form method="GET" action="/search" className="hidden max-w-md flex-1 sm:block">
          <div className="relative">
            <Search
              className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/40"
              aria-hidden
            />
            <input
              type="text"
              name="q"
              placeholder="Search halal lamb, basmati, lentils…"
              aria-label="Search products"
              className="w-full rounded-full border border-black/15 bg-surface-muted py-2 pl-10 pr-4 text-sm focus:border-primary focus:bg-white focus:outline-none"
            />
          </div>
        </form>

        {/* Account + cart */}
        <div className="flex items-center gap-2">
          {user ? (
            <Link
              href="/account"
              className="flex items-center gap-1.5 rounded-full border border-black/10 bg-surface-muted px-3 py-2 text-xs font-bold text-primary"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                {firstName?.charAt(0) ?? <User className="h-3.5 w-3.5" aria-hidden />}
              </span>
              <span className="hidden sm:inline">{firstName}</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 rounded-full border border-black/10 bg-surface-muted px-3 py-2 text-xs font-bold text-primary"
            >
              <LogIn className="h-4 w-4" aria-hidden />
              <span>Sign in</span>
            </Link>
          )}

          {/* Inert cart button — no cart exists until P3, so no count is shown. */}
          <button
            type="button"
            aria-label="Cart (available soon)"
            className="flex items-center gap-2 rounded-full bg-primary px-3.5 py-2 text-xs font-bold text-white"
          >
            <ShoppingBag className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Cart</span>
          </button>
        </div>
      </div>
    </header>
  );
}
