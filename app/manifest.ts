import type { MetadataRoute } from "next";
import { getCurrentVendorProfile } from "@/lib/vendor-service";

// Vendor-aware PWA manifest (ADR-004 slice 4 follow-up). Resolves per request from the
// host: name/short_name from the vendor, theme/background from its brand primitives.
// Neutral platform fallback when no vendor resolves (e.g. /coming-soon hosts). Icons stay
// empty until real per-vendor brand assets exist.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const profile = await getCurrentVendorProfile();
  const name = profile?.name ?? "Aheed Online Store";
  return {
    name,
    short_name: name.split(" ")[0],
    start_url: "/",
    display: "standalone",
    background_color: profile?.primitives.cream ?? "#ffffff",
    theme_color: profile?.primitives["green-dark"] ?? "#1b5e20",
    icons: [],
  };
}
