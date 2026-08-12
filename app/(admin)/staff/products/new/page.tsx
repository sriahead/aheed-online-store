import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { listCategoriesForAdmin } from "@/lib/repositories/categories";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { ProductForm } from "@/components/staff/ProductForm";

// Reads the session and this vendor's categories — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New product" };

/**
 * Create a product (P6b1, #159).
 *
 * A static segment, so Next resolves /staff/products/new here rather than
 * treating "new" as a product id in [id]/.
 *
 * A product REQUIRES a category (Product.categoryId is non-null), so with none
 * created yet this page says so instead of rendering a form whose only
 * outcome is a refusal.
 */
export default async function NewProductPage() {
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

  const categories = await listCategoriesForAdmin(auth.vendorId);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-primary">New product</h1>
      <p className="mb-6 text-sm text-primary/60">
        It goes live as soon as it&apos;s visible and has stock.
      </p>

      {categories.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-surface-muted p-8 text-center">
          <p className="text-sm text-primary/70">
            Every product belongs to a category, and this store doesn&apos;t have one yet.
          </p>
          <Link
            href="/staff/categories"
            className="mt-4 inline-block rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-white"
          >
            Create a category first
          </Link>
        </div>
      ) : (
        <ProductForm product={null} categories={categories} imageUrls={[]} />
      )}
    </main>
  );
}
