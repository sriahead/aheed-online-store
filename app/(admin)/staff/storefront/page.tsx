import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getVendorConfig, getVendorBranding } from "@/lib/vendor-service";
import { StorefrontConfigForm } from "@/components/staff/StorefrontConfigForm";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function StorefrontAdminPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    // Never `return null` here: app/(admin)/layout.tsx renders the portal shell
    // around whatever this returns, so a bare null serves 200 with the header,
    // the nav and an empty page — indistinguishable from a loading state rather
    // than a refusal. Every other /staff/* page uses PanelRefusal (CLAUDE.md).
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to manage this store's storefront."
      />
    );
  }

  const config = await getVendorConfig(auth.vendorId);
  const branding = await getVendorBranding(auth.vendorId);

  if (!config || !branding) {
    return <div className="p-8">Vendor config or branding not found.</div>;
  }

  const logoUrl = branding.logoStorageKey ? getStorage().publicUrl(branding.logoStorageKey) : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-extrabold text-black">Storefront Branding</h1>
      <StorefrontConfigForm initialConfig={config} initialBranding={branding} logoUrl={logoUrl} />
    </main>
  );
}
