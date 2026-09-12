import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { listCategoriesForAdmin } from "@/lib/categories-service";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { CategoryForm } from "@/components/staff/CategoryForm";
import { CategoryListClient } from "@/components/staff/CategoryListClient";

// Reads the session and this vendor's categories — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Categories" };

/**
 * The category list (P6b1, #159).
 *
 * Unpaginated by design — the two-level cap plus a real department list keeps
 * this in the dozens (see listCategoriesForAdmin). Sub-categories are indented
 * under the ordering the repository already returns rather than re-sorted here.
 */
export default async function StaffCategoriesPage() {
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to manage this store's categories."
      />
    );
  }

  const categories = await listCategoriesForAdmin(auth.vendorId);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Categories</h1>
      <p className="mb-6 text-sm text-primary-muted">
        Departments shoppers browse by. Two levels deep, top level first.
      </p>

      {/* Create sits on the list page rather than a /new route of its own: a
          category is five fields, and the list is the context you need to pick a
          parent. Products get their own page because they are fourteen. */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-bold text-primary">New category</h2>
        <CategoryForm category={null} categories={categories} />
      </section>

      <CategoryListClient categories={categories} />
    </main>
  );
}
