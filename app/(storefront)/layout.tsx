import type { CSSProperties, ReactNode } from "react";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { getCurrentVendorProfile } from "@/lib/repositories/vendor";

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
// ADR-004 slice 4: the resolved vendor's eight brand PRIMITIVES are injected as
// CSS custom properties on a wrapper. The semantic tokens in tokens.css reference
// these via var(), so this recolours the whole storefront with zero component
// changes. Plain wrapper div: full-width, non-positioned — transparent to layout
// and the sticky header.
export default async function StorefrontLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentVendorProfile();
  if (!profile) {
    redirect("/coming-soon");
  }

  const p = profile.primitives;
  const brandVars = {
    "--color-brand-green-dark": p["green-dark"],
    "--color-brand-green": p.green,
    "--color-brand-orange": p.orange,
    "--color-brand-red": p.red,
    "--color-brand-cream": p.cream,
    "--color-brand-green-tint": p["green-tint"],
    "--color-brand-orange-tint": p["orange-tint"],
    "--color-brand-red-tint": p["red-tint"],
  } as CSSProperties;

  return (
    <div style={brandVars}>
      <Header />
      {children}
    </div>
  );
}
