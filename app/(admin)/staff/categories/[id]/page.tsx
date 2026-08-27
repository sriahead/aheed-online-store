import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getCategoryForAdmin, listCategoriesForAdmin } from "@/lib/categories-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { CategoryForm } from "@/components/staff/CategoryForm";

// Reads the session and one live category — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit category" };

/**
 * Edit a category (P6b1, #159).
 *
 * Keyed on id, not slug, for the same reason the product edit page is: this
 * slice makes the slug editable.
 *
 * getCategoryForAdmin() is vendor-scoped, so another vendor's category id is
 * indistinguishable from one that doesn't exist.
 */
export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to manage this store's categories."
      />
    );
  }

  const [category, categories] = await Promise.all([
    getCategoryForAdmin(auth.vendorId, id),
    listCategoriesForAdmin(auth.vendorId),
  ]);
  if (!category) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-primary">{category.name}</h1>
      <p className="mb-6 text-sm text-primary/60">
        Hiding a category needs its products and sub-categories hidden or moved first.
      </p>
      <CategoryForm category={category} categories={categories} />
    </main>
  );
}
