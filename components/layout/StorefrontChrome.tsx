import type { ReactNode } from "react";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getRewardsDataForUser } from "@/lib/rewards-service";
import { Header } from "@/components/layout/Header";
import { FloatingContact } from "@/components/layout/FloatingContact";
import { AssistantLauncherProvider } from "@/components/assistant/AssistantLauncher";
import { StorefrontFooter } from "@/components/layout/StorefrontFooter";
import { getPlatformBrandingEnv } from "@/lib/config";
import { CookieBanner } from "@/components/consent/CookieBanner";
import { QuickViewProvider } from "@/components/product/quick-view-context";
import { QuickViewDrawer } from "@/components/product/QuickViewDrawer";
import { CartFeedbackProvider } from "@/components/cart/CartFeedback";
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
  // #1015 — from the profile already loaded above: no query added to the page render. One value for
  // both FloatingContact and the footer's channel row (#1060), so they always list the same set.
  const assistantAvailable = profile.assistantEnabled && profile.whatsappNumber !== null;

  return (
    <QuickViewProvider>
      <div style={brandStyle(profile.primitives)} className="flex min-h-screen flex-col">
        {/*
          #956 — inside the brand-style div, not around it: the feedback region
          is painted with `bg-primary`, and `brandStyle()` sets that token inline
          here, so outside this div SriMart would get the :root (Aheed) colour.
        */}
        <CartFeedbackProvider>
          {/* #1060 — one help-assistant panel, opened from FloatingContact or the footer. */}
          <AssistantLauncherProvider vendorName={profile.name}>
            <Header isLanding={isLanding} />
            <div className="flex-1">{children}</div>
            {/* #1055 — vendor-configured footer; every value comes from `profile` (no extra query). */}
            <StorefrontFooter
              profile={profile}
              platformName={getPlatformBrandingEnv().PLATFORM_NAME}
              assistantAvailable={assistantAvailable}
            />
            <FloatingContact
              vendorName={profile.name}
              facebookUrl={profile.facebookUrl}
              instagramUrl={profile.instagramUrl}
              whatsappNumber={profile.whatsappNumber}
              assistantAvailable={assistantAvailable}
            />
          </AssistantLauncherProvider>
          <CookieBanner />
          <QuickViewDrawer />
          {/*
            #1023 — only for a vendor that runs a loyalty scheme. With loyalty off the panel still
            promised points and linked to `/account/loyalty`, which 404s. This also stops `?ref=`
            capture for that vendor, deliberately: referral codes are only issued from loyalty
            surfaces, so such a vendor has none to capture.
          */}
          {initialRewardsData.loyaltyEnabled && (
            <RewardsLauncher initialData={initialRewardsData} vendorName={profile.name} />
          )}
        </CartFeedbackProvider>
      </div>
    </QuickViewProvider>
  );
}
