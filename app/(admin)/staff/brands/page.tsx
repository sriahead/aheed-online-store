import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getBrandRepository } from "@/lib/brands-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { AddBrandForm, BrandRowForms } from "@/components/staff/BrandManager";
import { Card } from "@/components/ui/Card";
import { PageContainer } from "@/components/layout/PageContainer";
import { Icon } from "@/components/icons/Icon";

// Reads the session and this vendor's brands — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Brands" };

/**
 * Brand management (P2.6 slice 6, #569).
 *
 * Brands are a storefront filter facet, and a facet over a column nobody can populate is dead UI —
 * so this page ships in the same slice as the filter itself rather than as follow-up work.
 *
 * The refusal branch renders <PanelRefusal>, never `return null`. `app/(admin)/layout.tsx` wraps
 * whatever a page returns in the portal shell, so returning null would serve a 200 with a header
 * and a blank content area — indistinguishable from a loading state rather than a refusal.
 */
export default async function StaffBrandsPage() {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to manage this store's brands."
      />
    );
  }

  const brands = await getBrandRepository().listForAdmin();

  return (
    <PageContainer width="wide">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-primary">
        <Icon name="tag" className="h-5 w-5" />
        Brands
      </h1>
      <p className="mb-6 text-sm text-primary-muted">
        Brands a shopper can filter the catalogue by. Assign one to a product on its own edit page.
      </p>

      <Card as="section" className="mb-8">
        <h2 className="mb-3 text-sm font-bold text-primary">Add a brand</h2>
        <AddBrandForm />
      </Card>

      <h2 className="mb-3 text-sm font-bold text-primary">
        {brands.length === 0 ? "No brands yet" : `${brands.length} brands`}
      </h2>
      {brands.length === 0 ? (
        <p className="text-sm text-primary-muted">
          Add a brand above. Until one exists, the storefront offers no brand filter — a control
          with nothing behind it is worse than no control at all.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {brands.map((brand) => (
            <Card as="li" key={brand.id}>
              <BrandRowForms brand={brand} />
            </Card>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
