import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { CookieBanner } from "@/components/consent/CookieBanner";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { brandStyle } from "@/lib/vendor-theme";

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
    <div style={brandStyle(profile.primitives)} className="flex min-h-screen flex-col">
      <Header />
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
