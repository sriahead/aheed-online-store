import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Package, Plus, Search } from "lucide-react";
import { requireVendorRole } from "@/lib/auth-rbac";
import { listProductsForAdmin } from "@/lib/products-service";
import { listCategoriesForAdmin } from "@/lib/categories-service";
import { toCategoryOptionGroups } from "@/lib/catalogue-form";
import {
  CATEGORY_ALL,
  PER_PAGE_OPTIONS,
  PRODUCT_STATUS_ALL,
  RESTRICTION_ALL,
  STOCK_ALL,
  parseStaffProductsQuery,
  staffProductsHref,
} from "@/lib/staff-products-query";
import { BulkProductActions } from "@/components/staff/BulkProductActions";
import { BULK_PRODUCTS_FORM_ID } from "@/lib/product-restriction-form";
import { RESTRICTION_LABELS, STOCK_MODE_LABELS } from "@/lib/product-restriction";
import { formatPrice } from "@/components/product/format-price";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { BackfillImagesButton } from "@/components/staff/BackfillImagesButton";
import { PageContainer } from "@/components/layout/PageContainer";

// Reads the session and this vendor's live catalogue — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Products" };

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
  searchParams: Promise<{
    cursor?: string;
    status?: string;
    q?: string;
    category?: string;
    restriction?: string;
    stock?: string;
    perPage?: string;
  }>;
}) {
  const { cursor, status, q, category, restriction, stock, perPage } = await searchParams;
  const auth = await requireVendorRole("STAFF", "ADMIN");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to manage this store's catalogue."
      />
    );
  }

  // Categories are fetched BEFORE the product query, not alongside it — the two
  // are not independent (#503). Validating the selected id and expanding a
  // department to its subcategories both need this vendor's real category list,
  // and the product `where` depends on the result, so the calls are ordered.
  // The cost is one extra round-trip on this admin page; the alternative was
  // pushing expansion into a Prisma relation filter, which would move the one
  // rule worth testing out of a pure function and into a query shape that needs
  // a database to assert — and would still not supply the forged-id guard.
  // Round-trip economics on this app are #670's subject.
  const categories = await listCategoriesForAdmin(auth.vendorId);
  const query = parseStaffProductsQuery(
    { status, q, category, restriction, stock, perPage },
    categories,
  );

  const { items, nextCursor } = await listProductsForAdmin(auth.vendorId, {
    take: query.perPage,
    cursor,
    search: query.search,
    isActive: query.isActive,
    categoryIds: query.categoryIds,
    restriction: query.restriction,
    stockMode: query.stockMode,
  });

  const isFiltered =
    query.search !== null ||
    query.status !== PRODUCT_STATUS_ALL ||
    query.category !== CATEGORY_ALL ||
    query.restriction !== undefined ||
    query.stockMode !== undefined;

  return (
    <PageContainer width="wide">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-semibold text-primary">Products</h1>
          <p className="text-sm text-primary-muted">
            Everything this store sells, including items hidden from shoppers.
          </p>
        </div>
        <div className="flex gap-3">
          <BackfillImagesButton />
          <Link
            href="/staff/products/new"
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New product
          </Link>
        </div>
      </div>

      {/* A plain GET form, matching /staff/orders: no client component, no JS,
          and the resulting URL is shareable. */}
      <form method="get" action="/staff/products" className="mb-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-primary">
          Status
          <select
            name="status"
            defaultValue={query.status}
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-primary"
          >
            <option value={PRODUCT_STATUS_ALL}>All products</option>
            <option value="active">Visible to shoppers</option>
            <option value="inactive">Hidden</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-primary">
          Category
          <select
            name="category"
            defaultValue={query.category}
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-primary"
          >
            <option value={CATEGORY_ALL}>All categories</option>
            {/* Same optgroup shape as the product form's picker (#630), reused
                rather than rebuilt. The department option's wording differs on
                purpose: on the form it means "assign directly here", but as a
                FILTER it means the department and everything beneath it. */}
            {toCategoryOptionGroups(categories).map((group) => (
              <optgroup key={group.parent.id} label={group.parent.name}>
                <option value={group.parent.id}>All of {group.parent.name}</option>
                {group.children.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.name}
                    {!child.isActive && " (inactive)"}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {/* #1211 — review filters: a client import arrives hidden, restricted and stock-UNKNOWN,
            and these are how a reviewer finds each group. */}
        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-primary">
          Restriction
          <select
            name="restriction"
            defaultValue={query.restrictionFilter}
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-primary"
          >
            <option value={RESTRICTION_ALL}>Any</option>
            <option value="any">Restricted</option>
            <option value="none">Not restricted</option>
            {(["PROHIBITED", "AGE_RESTRICTED", "NOT_DELIVERABLE", "NEEDS_REVIEW"] as const).map(
              (value) => (
                <option key={value} value={value}>
                  {RESTRICTION_LABELS[value]}
                </option>
              ),
            )}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-primary">
          Stock
          <select
            name="stock"
            defaultValue={query.stockFilter}
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-primary"
          >
            <option value={STOCK_ALL}>Any</option>
            {(["TRACKED", "UNTRACKED", "UNKNOWN"] as const).map((value) => (
              <option key={value} value={value}>
                {STOCK_MODE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-primary">
          Per page
          <select
            name="perPage"
            defaultValue={String(query.perPage)}
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-primary"
          >
            {PER_PAGE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-1 flex-col gap-1 text-xs font-bold uppercase tracking-wide text-primary">
          Search
          <input
            type="search"
            name="q"
            defaultValue={query.search ?? ""}
            placeholder="Product name"
            className="w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-primary"
          />
        </label>

        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white"
        >
          <Search className="h-4 w-4" aria-hidden />
          Apply
        </button>
      </form>

      {items.length > 0 && <BulkProductActions />}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-surface-muted p-8 text-center">
          <Package className="mx-auto mb-3 h-8 w-8 text-primary-subtle" aria-hidden />
          <p className="text-sm text-primary-muted">
            {isFiltered
              ? "No products match this view. Clear the filters to see the whole catalogue."
              : "No products yet. Create a category first, then add your first product."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((product) => (
            <li key={product.id} className="rounded-2xl border border-black/10 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                {/* #1211 — bound to the bulk form by `form=`, not nesting (one form per page). */}
                <input
                  type="checkbox"
                  name="productId"
                  value={product.id}
                  form={BULK_PRODUCTS_FORM_ID}
                  aria-label={`Select ${product.name}`}
                  className="mt-1 h-4 w-4 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/staff/products/${product.id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {product.name}
                    </Link>
                    {!product.isActive && (
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-muted">
                        Hidden
                      </span>
                    )}
                    {product.restriction !== null && (
                      <span className="rounded-full bg-danger-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger">
                        {RESTRICTION_LABELS[product.restriction]}
                      </span>
                    )}
                    {product.stockMode === "TRACKED" && product.quantity <= 0 && (
                      <span className="rounded-full bg-danger-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger">
                        Out of stock
                      </span>
                    )}
                    {product.stockMode === "UNKNOWN" && (
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-muted">
                        Stock unknown
                      </span>
                    )}
                    {product.imageNeedsReview && (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">
                        Image Needs Review
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-primary-muted">
                    {product.categoryName} · {product.slug}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold text-primary">{formatPrice(product.basePrice)}</p>
                  <p className="text-xs text-primary-muted">
                    {product.stockMode === "TRACKED"
                      ? `${product.quantity} in stock`
                      : STOCK_MODE_LABELS[product.stockMode]}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        /* The cursor link MUST carry the active filter — a next page that quietly
           widened back to the whole catalogue would be worse than no paging. */
        <Link
          href={staffProductsHref(query, nextCursor)}
          className="mt-6 inline-block rounded-full bg-action px-4 py-2 font-semibold text-white"
        >
          Older products
        </Link>
      )}
    </PageContainer>
  );
}
