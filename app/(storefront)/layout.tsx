import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getCurrentVendorProfile } from "@/lib/repositories/vendor";
import { brandStyle } from "@/lib/vendor-theme";

// force-dynamic: the Header reads the session (getAuth → getPrisma), which only
// works in the Workers runtime — next build's Node-based static prerender can't
// load @prisma/client/wasm. Same guard as every DB-touching route here.
export const dynamic = "force-dynamic";

// Renders the shared Header above every storefront page. Deliberately does NOT
// wrap children in its own <main> — each page renders its own, and nesting
// <main> is invalid.
//
// ADR-004 slice 3b: gate the tenant here. A request host with no resolvable vendor
// is redirected to /coming-soon before any storefront page renders or queries.
// `app/(admin)/layout.tsx` carries the SAME gate for the admin panel — the gate
// belongs to each top-level layout, not to this file (P6a, #158).
// ADR-004 slice 4: the resolved vendor's brand tokens come from lib/vendor-theme's
// brandStyle(), shared with the admin layout. Plain wrapper div: full-width,
// non-positioned — transparent to layout and the sticky header.
export default async function StorefrontLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentVendorProfile();
  if (!profile) {
    redirect("/coming-soon");
  }

  return (
    <div style={brandStyle(profile.primitives)}>
      <Header />
      {children}
    </div>
  );
}
