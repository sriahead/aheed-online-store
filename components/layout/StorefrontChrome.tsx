import type { ReactNode } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { CookieBanner } from "@/components/consent/CookieBanner";
import { brandStyle } from "@/lib/vendor-theme";
import type { VendorProfile } from "@/lib/repositories/vendor";

/**
 * Shared storefront chrome (P8.5f) — header, footer, cookie banner, and the
 * vendor's brand tokens. Extracted out of `app/(storefront)/layout.tsx` so
 * `app/(landing)/layout.tsx` can render the identical chrome for `/` while
 * passing `isLanding={true}` into `Header`, without duplicating any markup.
 *
 * Two route groups exist (rather than one layout deriving landing-ness from
 * the request) because a layout cannot see which page it wraps, and the
 * previous fix for that — a root `proxy.ts` — cannot be built for Cloudflare
 * Workers on this project's pinned `@opennextjs/cloudflare`. See
 * `specs/architecture.md` §2.1.
 */
export function StorefrontChrome({
  children,
  profile,
  isLanding,
}: {
  children: ReactNode;
  profile: VendorProfile;
  isLanding: boolean;
}) {
  return (
    <div style={brandStyle(profile.primitives)} className="flex min-h-screen flex-col">
      <Header isLanding={isLanding} />
      <div className="flex-1">{children}</div>
      <footer className="border-t border-black/10 bg-white py-6 text-xs text-primary">
        <div className="mx-auto flex max-w-5xl flex-col sm:flex-row items-center justify-between gap-4 px-4">
          <p>
            © {new Date().getFullYear()} {profile.name}. All rights reserved.
          </p>
          <div className="flex items-center gap-4 font-medium">
            <Link href="/terms" className="hover:underline">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:underline">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
      <CookieBanner />
    </div>
  );
}
