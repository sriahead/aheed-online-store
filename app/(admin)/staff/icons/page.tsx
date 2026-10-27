import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getStorage } from "@/lib/storage";
import { listCategoriesForAdmin } from "@/lib/categories-service";
import { listCategoryAssetsForVendor } from "@/lib/category-assets-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { PageContainer } from "@/components/layout/PageContainer";
import { IconGalleryClient } from "@/components/staff/IconGalleryClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Icon & Asset Gallery" };

export default async function StaffIconsPage() {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store staff only"
        message="You're signed in, but your account doesn't have permission to manage visual assets."
      />
    );
  }

  const storage = getStorage();

  const [categories, rawAssets] = await Promise.all([
    listCategoriesForAdmin(auth.vendorId),
    listCategoryAssetsForVendor(auth.vendorId, { limit: 200 }),
  ]);

  const initialAssets = rawAssets.map((a) => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
    imageUrl: storage.publicUrl(a.storageKey),
  }));

  const categoryOptions = categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
  }));

  return (
    <PageContainer width="wide">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary">Icon &amp; Visual Asset Gallery</h1>
        <p className="mt-1 text-sm text-primary-muted">
          Unified library of category photographs, app icons, and realistic system visual assets
          across your store.
        </p>
      </div>

      <IconGalleryClient initialAssets={initialAssets} categories={categoryOptions} />
    </PageContainer>
  );
}
