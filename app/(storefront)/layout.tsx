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
  // Override BOTH layers on the wrapper. Overriding only the eight primitives is
  // not enough: Tailwind v4 emits the SEMANTIC tokens at :root as
  // `--color-primary: var(--color-brand-green-dark)`, and the browser resolves
  // that inner var() at :root — so the semantic value is frozen to the default
  // palette and never re-flows when a descendant overrides a primitive. So we also
  // re-declare the semantic tokens here (same primitive→semantic mapping as
  // design-system/tokens/tokens.css), which forces them to resolve against this
  // vendor's palette. Hover shades — hardcoded ~15%-darker hex in tokens.css — are
  // derived per vendor via color-mix so they track the vendor colour too.
  const brandVars = {
    // primitives (for any brand-* utility used directly)
    "--color-brand-green-dark": p["green-dark"],
    "--color-brand-green": p.green,
    "--color-brand-orange": p.orange,
    "--color-brand-red": p.red,
    "--color-brand-cream": p.cream,
    "--color-brand-green-tint": p["green-tint"],
    "--color-brand-orange-tint": p["orange-tint"],
    "--color-brand-red-tint": p["red-tint"],
    // semantic (what components actually use)
    "--color-primary": p["green-dark"],
    "--color-action": p.green,
    "--color-accent": p.orange,
    "--color-danger": p.red,
    "--color-surface-muted": p.cream,
    "--color-action-tint": p["green-tint"],
    "--color-accent-tint": p["orange-tint"],
    "--color-danger-tint": p["red-tint"],
    // derived hover shades (~15% darker), per vendor
    "--color-action-hover": `color-mix(in srgb, ${p.green} 85%, black)`,
    "--color-accent-hover": `color-mix(in srgb, ${p.orange} 85%, black)`,
  } as CSSProperties;

  return (
    <div style={brandVars}>
      <Header />
      {children}
    </div>
  );
}
