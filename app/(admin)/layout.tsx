import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getCurrentVendorProfile } from "@/lib/repositories/vendor";
import { brandStyle } from "@/lib/vendor-theme";
import { PanelNav } from "@/components/staff/PanelNav";

// force-dynamic: reads the session and the resolved vendor, which only work in
// the Workers runtime — next build's Node-based static prerender can't load
// @prisma/client/wasm. Omitting this has broken this build three times (P1b
// /login, P2 twice).
export const dynamic = "force-dynamic";

/**
 * The admin panel shell (P6a, #158) — a route group parallel to (storefront),
 * so /staff/* renders its own chrome instead of the shopper's header, hero and
 * department scroller. Route groups are URL-invisible: every path is unchanged
 * by the move.
 *
 * TWO obligations inherited from the storefront layout, both easy to lose in a
 * move and both load-bearing:
 *
 *  1. The tenant gate (ADR-004 slice 3b). `getCurrentVendorId()` THROWS on an
 *     unresolvable host, and this redirect is what stops anything reaching the
 *     throw. Without it an unknown host on /staff/orders becomes a 500 rather
 *     than a redirect to /coming-soon. The gate belongs to every top-level
 *     layout, not to one file.
 *  2. The vendor brand tokens (ADR-004 slice 4), via the shared
 *     lib/vendor-theme brandStyle() — the admin panel is vendor-branded too.
 *
 * The role lookup here is for NAVIGATION ONLY. A layout is not an authorization
 * boundary in the App Router: a page renders on its own, and every page below
 * still calls requireVendorRole itself with its own allowed roles. Resolving the
 * role here just avoids showing a packer two links that would only ever refuse
 * them.
 *
 * One requireVendorRole call, not two: `via` distinguishes admin-level access
 * ("platform-admin" or a vendor "ADMIN" membership) from plain STAFF, which is
 * exactly what a second requireVendorRole("ADMIN") call would have told us.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentVendorProfile();
  if (!profile) {
    redirect("/coming-soon");
  }

  const auth = await requireVendorRole("STAFF", "ADMIN");
  const canSeeOrders = auth.ok;
  const canSeeAdmin = auth.ok && (auth.via === "platform-admin" || auth.via === "ADMIN");

  return (
    <div style={brandStyle(profile.primitives)} className="min-h-screen bg-surface-muted">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/staff" className="font-bold text-primary">
            {profile.name} <span className="font-normal text-primary/50">· Store admin</span>
          </Link>
          <Link href="/" className="text-sm font-semibold text-primary/70 hover:text-primary">
            View store
          </Link>
        </div>
      </header>

      <PanelNav canSeeOrders={canSeeOrders} canSeeAdmin={canSeeAdmin} />

      {children}
    </div>
  );
}
