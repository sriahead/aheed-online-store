import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { StorefrontChrome } from "@/components/layout/StorefrontChrome";
import { getCurrentVendorProfile } from "@/lib/vendor-service";

/**
 * P8.5f: the landing page's own route group, sharing a route (`/`) and the
 * same chrome as `(storefront)` but rendering `Header` with `isLanding={true}`
 * — see `components/layout/StorefrontChrome.tsx` for why this is a second
 * route group rather than a request-scoped `proxy.ts`.
 */

// force-dynamic: same reason as app/(storefront)/layout.tsx — the Header reads
// the session, which only works in the Workers runtime.
export const dynamic = "force-dynamic";

export default async function LandingLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentVendorProfile();
  if (!profile) {
    redirect("/coming-soon");
  }

  return (
    <StorefrontChrome profile={profile} isLanding={true}>
      {children}
    </StorefrontChrome>
  );
}
