import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getBrandRepository } from "@/lib/brands-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { BrandTable } from "@/components/staff/BrandTable";
import { PageContainer } from "@/components/layout/PageContainer";
import { Icon } from "@/components/icons/Icon";

// Reads the session and this vendor's brands — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Brands" };

/**
 * Brand management (P2.6 slice 6, #569, P10 UX improvements).
 *
 * Brands are a storefront filter facet, and a facet over a column nobody can populate is dead UI.
 * Now equipped with cognitive metrics, interactive quick-view drawer, and full CRUD operations.
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
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-primary">
          <Icon name="tag" className="h-6 w-6 text-action" />
          Brand Management
        </h1>
        <p className="mt-1 text-sm text-primary-muted">
          Organise brands, inspect linked products, monitor catalog breadth, and configure
          storefront filters.
        </p>
      </div>

      <BrandTable initialBrands={brands} />
    </PageContainer>
  );
}
