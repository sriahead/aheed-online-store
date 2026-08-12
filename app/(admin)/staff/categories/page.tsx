import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderTree } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { listCategoriesForAdmin } from "@/lib/repositories/categories";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { CategoryForm } from "@/components/staff/CategoryForm";

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

  const categories = await listCategoriesForAdmin(auth.vendorId);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-primary">Categories</h1>
      <p className="mb-6 text-sm text-primary/60">
        Departments shoppers browse by. Two levels deep, top level first.
      </p>

      {categories.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-surface-muted p-8 text-center">
          <FolderTree className="mx-auto mb-3 h-8 w-8 text-primary/40" aria-hidden />
          <p className="text-sm text-primary/70">
            No categories yet. Create one before adding products.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {categories.map((category) => (
            <li
              key={category.id}
              className={`rounded-2xl border border-black/10 bg-white p-4 ${
                category.parentId ? "ml-6" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/staff/categories/${category.id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {category.name}
                    </Link>
                    {!category.isActive && (
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary/60">
                        Hidden
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-primary/60">
                    {category.parentName ? `in ${category.parentName} · ` : ""}
                    {category.slug}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-primary/60">
                  {category.productCount} {category.productCount === 1 ? "product" : "products"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Create sits on the list page rather than a /new route of its own: a
          category is five fields, and the list is the context you need to pick a
          parent. Products get their own page because they are fourteen. */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-bold text-primary">New category</h2>
        <CategoryForm category={null} categories={categories} />
      </section>
    </main>
  );
}
