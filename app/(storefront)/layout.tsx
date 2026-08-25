import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { StorefrontChrome } from "@/components/layout/StorefrontChrome";
import { getCurrentVendorProfile } from "@/lib/vendor-service";

// force-dynamic: the Header reads the session (getAuth → getPrisma), which only
// works in the Workers runtime — next build's Node-based static prerender can't
// load @prisma/client/wasm. Same guard as every DB-touching route here.
export const dynamic = "force-dynamic";

export default async function StorefrontLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentVendorProfile();
  if (!profile) {
    redirect("/coming-soon");
  }

  return (
    <StorefrontChrome profile={profile} isLanding={false}>
      {children}
    </StorefrontChrome>
  );
}
