import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { listCategoriesForAdmin } from "@/lib/categories-service";
import { listBundlesForVendor } from "@/lib/bundles-service";
import { getDiscountRepository } from "@/lib/discounts-service";
import { listEligiblePromotionalProductsForAdmin } from "@/lib/promotions-service";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { STORE_TIMEZONE } from "@/lib/local-datetime";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";
import { PromotionForm } from "@/components/staff/PromotionForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Create Promotion" };

export default async function NewPromotionPage() {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store staff only"
        message="You're signed in, but your account doesn't have permission to manage this store's promotions."
      />
    );
  }

  const [allCategories, eligibleProducts, bundles, discountCodes, profile] = await Promise.all([
    listCategoriesForAdmin(auth.vendorId),
    listEligiblePromotionalProductsForAdmin(auth.vendorId),
    listBundlesForVendor(auth.vendorId),
    getDiscountRepository().list(),
    getCurrentVendorProfile(),
  ]);

  const bundleOptions = bundles.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name }));

  const discountOptions = discountCodes
    .filter((d) => d.isActive)
    .map((d) => ({ id: d.id, code: d.code, description: d.description }));

  const timezone = profile?.timezone ?? STORE_TIMEZONE;

  return (
    <PageContainer width="wide" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary">Create Promotion</h1>
        <p className="text-sm text-primary-muted">
          Author a new promotion or deal to display on your storefront landing page.
        </p>
      </div>

      <PromotionForm
        categories={allCategories}
        products={eligibleProducts}
        bundles={bundleOptions}
        discountCodes={discountOptions}
        timezone={timezone}
      />
    </PageContainer>
  );
}
