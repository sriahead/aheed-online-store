import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { listCategoriesForAdmin } from "@/lib/categories-service";
import { listBundlesForVendor } from "@/lib/bundles-service";
import { getDiscountRepository } from "@/lib/discounts-service";
import { getPromotionForAdmin } from "@/lib/promotions-service";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { STORE_TIMEZONE } from "@/lib/local-datetime";
import { getEnv } from "@/lib/config";
import { composePublicUrl } from "@/lib/storage";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";
import { PromotionForm } from "@/components/staff/PromotionForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit Promotion" };

export default async function EditPromotionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const [promotion, allCategories, bundles, discountCodes, profile] = await Promise.all([
    getPromotionForAdmin(auth.vendorId, id),
    listCategoriesForAdmin(auth.vendorId),
    listBundlesForVendor(auth.vendorId),
    getDiscountRepository().list(),
    getCurrentVendorProfile(),
  ]);

  if (!promotion) notFound();

  const departments = allCategories
    .filter((c) => c.parentId === null)
    .map((c) => ({ id: c.id, name: c.name }));

  const bundleOptions = bundles.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name }));

  const discountOptions = discountCodes
    .filter((d) => d.isActive)
    .map((d) => ({ id: d.id, code: d.code, description: d.description }));

  const timezone = profile?.timezone ?? STORE_TIMEZONE;
  const { CDN_BASE_URL } = getEnv();
  const currentImageUrl =
    promotion.imageKey && CDN_BASE_URL ? composePublicUrl(CDN_BASE_URL, promotion.imageKey) : null;

  return (
    <PageContainer width="narrow" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary">Edit Promotion</h1>
        <p className="text-sm text-primary-muted">
          Update promotional messaging, schedule, or target associations.
        </p>
      </div>

      <PromotionForm
        promotion={promotion}
        categories={departments}
        bundles={bundleOptions}
        discountCodes={discountOptions}
        currentImageUrl={currentImageUrl}
        timezone={timezone}
      />
    </PageContainer>
  );
}
