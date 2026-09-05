import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getEnv } from "@/lib/config";
import { composePublicUrl } from "@/lib/storage";
import { getProductForAdmin } from "@/lib/products-service";
import { listCategoriesForAdmin } from "@/lib/categories-service";
import { getBrandRepository } from "@/lib/brands-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { ProductForm } from "@/components/staff/ProductForm";

// Reads the session and one live product — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit product" };

/**
 * Edit a product (P6b1, #159).
 *
 * KEYED ON id, NOT slug. This slice makes a slug editable for the first time,
 * and an admin URL that changes when you rename the thing it points at breaks
 * every bookmark and back button. /staff/orders/{orderNumber} keys on an
 * immutable number for the same reason.
 *
 * getProductForAdmin() is vendor-scoped, so another vendor's product id is
 * indistinguishable from one that doesn't exist: both are notFound().
 *
 * Public image URLs are composed HERE, not in the form. composePublicUrl lives
 * beside the aws4fetch client in lib/storage, so a "use client" component
 * importing it would drag the signer into the browser bundle.
 */
export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to manage this store's catalogue."
      />
    );
  }

  const [product, categories, brands] = await Promise.all([
    getProductForAdmin(auth.vendorId, id),
    listCategoriesForAdmin(auth.vendorId),
    getBrandRepository().listSummaries(),
  ]);
  if (!product) notFound();

  const cdnBaseUrl = getEnv().CDN_BASE_URL ?? "";
  const imageUrls = product.images.map((image) => ({
    id: image.id,
    url: composePublicUrl(cdnBaseUrl, image.storageKey),
    alt: image.alt,
    isPrimary: image.isPrimary,
  }));

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-primary">{product.name}</h1>
      <p className="mb-6 text-sm text-primary/60">
        Changes apply to the shop immediately. Past orders keep the price they were charged.
      </p>
      <ProductForm
        product={product}
        categories={categories}
        brands={brands}
        imageUrls={imageUrls}
      />
    </main>
  );
}
