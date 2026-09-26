import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getRewardsDataForUser } from "@/lib/rewards-service";
import { Header } from "@/components/layout/Header";
import { FloatingContact } from "@/components/layout/FloatingContact";
import { CookieBanner } from "@/components/consent/CookieBanner";
import { QuickViewProvider } from "@/components/product/quick-view-context";
import { QuickViewDrawer } from "@/components/product/QuickViewDrawer";
import { RewardsLauncher } from "@/components/rewards/RewardsLauncher";
import { brandStyle } from "@/lib/vendor-theme";
import type { VendorProfile } from "@/lib/repositories/vendor";

/**
 * Shared storefront chrome (P8.5f) — header, footer, cookie banner, and the
 * vendor's brand tokens. Extracted out of `app/(storefront)/layout.tsx` so
 * `app/(landing)/layout.tsx` can render the identical chrome for `/` while
 * passing `isLanding={true}` into `Header`, without duplicating any markup.
 */
export async function StorefrontChrome({
  children,
  profile,
  isLanding,
}: {
  children: ReactNode;
  profile: VendorProfile;
  isLanding: boolean;
}) {
  const requestHeaders = await headers();
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders });
  const host = requestHeaders.get("host") ?? "staging.aheedfoodcentre.nocaped.com";
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
  const baseUrl = `${proto}://${host}`;
  const initialRewardsData = await getRewardsDataForUser(session?.user?.id ?? null, baseUrl);

  return (
    <QuickViewProvider>
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
        <FloatingContact
          vendorName={profile.name}
          facebookUrl={profile.facebookUrl}
          instagramUrl={profile.instagramUrl}
          whatsappNumber={profile.whatsappNumber}
        />
        <CookieBanner />
        <QuickViewDrawer />
        <RewardsLauncher initialData={initialRewardsData} vendorName={profile.name} />
      </div>
    </QuickViewProvider>
  );
}
