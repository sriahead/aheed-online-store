import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getCurrentVendorProfile } from "@/lib/repositories/vendor";
import { brandStyle } from "@/lib/vendor-theme";
import { PanelNav } from "@/components/staff/PanelNav";
import { PortalHeader } from "@/components/staff/PortalHeader";

// force-dynamic: reads the session and the resolved vendor, which only work in
// the Workers runtime — next build's Node-based static prerender can't load
// @prisma/client/wasm. Omitting this has broken this build three times (P1b
// /login, P2 twice).
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const profile = await getCurrentVendorProfile();
  if (!profile) {
    redirect("/coming-soon");
  }

  const auth = await requireVendorRole("STAFF", "ADMIN");
  const canSeeOrders = auth.ok;
  const canSeeAdmin = auth.ok && (auth.via === "platform-admin" || auth.via === "ADMIN");

  // Read tier preference from cookie. If a STAFF user hacks their cookie to 'admin',
  // it's harmless because the actual pages still enforce requireVendorRole("ADMIN").
  const cookieStore = await cookies();
  let currentTier: "staff" | "admin" = "staff";
  if (canSeeAdmin) {
    const saved = cookieStore.get("admin-tier")?.value;
    if (saved === "admin" || saved === "staff") {
      currentTier = saved;
    } else {
      currentTier = "admin"; // default to admin for ADMIN users
    }
  }

  return (
    <div style={brandStyle(profile.primitives)} className="min-h-screen bg-surface-muted">
      <PortalHeader
        profileName={profile.name}
        localityName={profile.localityName}
        canSeeAdmin={canSeeAdmin}
        currentTier={currentTier}
      />

      <PanelNav canSeeOrders={canSeeOrders} currentTier={currentTier} />

      {children}
    </div>
  );
}
