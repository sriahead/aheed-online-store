import { requireVendorRole } from "@/lib/auth-rbac";
import { getPrisma } from "@/lib/db";
import { StorefrontConfigForm } from "@/components/staff/StorefrontConfigForm";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function StorefrontAdminPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) return null;

  const db = getPrisma();
  const config = await db.vendorConfig.findUnique({ where: { vendorId: auth.vendorId } });
  const branding = await db.vendorBranding.findUnique({ where: { vendorId: auth.vendorId } });

  if (!config || !branding) {
    return <div className="p-8">Vendor config or branding not found.</div>;
  }

  const logoUrl = branding.logoStorageKey ? getStorage().publicUrl(branding.logoStorageKey) : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-extrabold text-black">Storefront Branding</h1>
      <StorefrontConfigForm 
        initialConfig={config} 
        initialBranding={branding}
        logoUrl={logoUrl}
      />
    </main>
  );
}

