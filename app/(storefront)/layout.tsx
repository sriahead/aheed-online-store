import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { StorefrontChrome } from "@/components/layout/StorefrontChrome";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { buildStoreJsonLd, serializeJsonLd } from "@/lib/seo-schema";
import { getEnv } from "@/lib/config";

// force-dynamic: the Header reads the session (getAuth → getPrisma), which only
// works in the Workers runtime — next build's Node-based static prerender can't
// load @prisma/client/wasm. Same guard as every DB-touching route here.
export const dynamic = "force-dynamic";

export default async function StorefrontLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentVendorProfile();
  if (!profile) {
    redirect("/coming-soon");
  }

  const { CDN_BASE_URL } = getEnv();
  const canonicalOrigin = profile.canonicalHost
    ? `https://${profile.canonicalHost}`
    : "https://www.aheedfoodcentre.co.uk";

  const imageUrl =
    profile.markStorageKey && CDN_BASE_URL ? `${CDN_BASE_URL}/${profile.markStorageKey}` : null;

  const storeJsonLd = buildStoreJsonLd({
    name: profile.name,
    canonicalOrigin,
    telephone: profile.contactPhone,
    location: profile.location,
    weeklyHours: profile.weeklyHours,
    imageUrl,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(storeJsonLd) }}
      />
      <StorefrontChrome profile={profile} isLanding={false}>
        {children}
      </StorefrontChrome>
    </>
  );
}
