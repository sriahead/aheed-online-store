import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Package, Plus } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { listProductsForAdmin } from "@/lib/repositories/products";
import { formatPrice } from "@/components/product/format-price";
import { PanelRefusal } from "@/components/staff/PanelRefusal";

// Reads the session and this vendor's live catalogue — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Products" };

const PAGE_SIZE = 25;

/**
 * The catalogue product list (P6b1, #159) — the first admin surface the
 * catalogue has ever had.
 *
 * ADMIN only, matching /staff/loyalty and /staff/discounts: prices and what the
 * shop sells are owner decisions, not packing-floor ones.
 *
 * UNLIKE the storefront's lists, this one does NOT filter isActive — an owner
 * has to be able to find the product they just switched off in order to switch
 * it back on. That is the whole reason listProductsForAdmin() exists beside
 * listByCategory() rather than reusing it.
 */
export default async function StaffProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
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

  const { cursor } = await searchParams;
  const { items, nextCursor } = await listProductsForAdmin(auth.vendorId, {
    take: PAGE_SIZE,
    cursor,
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-semibold text-primary">Products</h1>
          <p className="text-sm text-primary/60">
            Everything this store sells, including items hidden from shoppers.
          </p>
        </div>
        <Link
          href="/staff/products/new"
          className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-white"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New product
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-surface-muted p-8 text-center">
          <Package className="mx-auto mb-3 h-8 w-8 text-primary/40" aria-hidden />
          <p className="text-sm text-primary/70">
            No products yet. Create a category first, then add your first product.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((product) => (
            <li key={product.id} className="rounded-2xl border border-black/10 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/staff/products/${product.id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {product.name}
                    </Link>
                    {!product.isActive && (
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary/60">
                        Hidden
                      </span>
                    )}
                    {product.quantity === 0 && (
                      <span className="rounded-full bg-danger-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger">
                        Out of stock
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-primary/60">
                    {product.categoryName} · {product.slug}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold text-primary">{formatPrice(product.basePrice)}</p>
                  <p className="text-xs text-primary/60">{product.quantity} in stock</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <Link
          href={`/staff/products?cursor=${encodeURIComponent(nextCursor)}`}
          className="mt-6 inline-block rounded-full bg-action px-4 py-2 font-semibold text-white"
        >
          Older products
        </Link>
      )}
    </main>
  );
}
