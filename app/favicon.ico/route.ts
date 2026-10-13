import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { getEnv } from "@/lib/config";
import { faviconRedirectUrl } from "@/lib/vendor-icons";

// #1069 — browsers and crawlers request /favicon.ico whatever the <link> tags say. A real
// multi-resolution .ico would need an ICO encoder nothing in this stack has, so this redirects to
// the vendor's 32px PNG instead, which every current browser accepts. It cannot be a file in
// public/ or app/: those are shared by every vendor (ADR-004), and one file would show one
// vendor's mark on another's site.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let target: string | null = null;
  try {
    const profile = await getCurrentVendorProfile();
    target = faviconRedirectUrl(profile?.markStorageKey, getEnv().CDN_BASE_URL);
  } catch {
    // A DB hiccup degrades to "no favicon", the same as a vendor without a mark.
  }

  if (!target) return new Response(null, { status: 404 });
  return new Response(null, {
    status: 302,
    headers: { Location: target, "Cache-Control": "public, max-age=300" },
  });
}
