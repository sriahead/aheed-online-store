import type { ReactNode } from "react";
import { Poppins } from "next/font/google";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-poppins",
});

// Vendor-aware metadata (ADR-004 slice 4). This layout also wraps /coming-soon,
// where no vendor resolves — fall back to a neutral platform default. Guarded so
// a DB hiccup degrades the title rather than breaking every page's <head>.
export async function generateMetadata() {
  try {
    const profile = await getCurrentVendorProfile();
    if (profile) {
      const description = profile.tagline ?? `Local delivery across ${profile.localityName}.`;
      return {
        title: profile.tagline ? `${profile.name} — ${profile.tagline}` : profile.name,
        description,
      };
    }
  } catch {
    /* fall through to the platform default */
  }
  return {
    title: "Aheed Online Store",
    description: "A multi-vendor grocery platform with local delivery.",
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  // No width/padding constraint here — the storefront layout owns the header and
  // each page owns its own width container. (This body used to force max-w-2xl,
  // which silently constrained every page since P2a.)
  return (
    <html lang="en" className={poppins.variable} suppressHydrationWarning>
      <body className="leading-relaxed" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
