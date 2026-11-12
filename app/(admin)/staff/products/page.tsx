import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import { listProductsForAdminPage } from "@/lib/products-service";
import { listCategoriesForAdmin } from "@/lib/categories-service";
import { toCategoryOptionGroups } from "@/lib/catalogue-form";
import {
  CATEGORY_ALL,
  NEEDS_ALL,
  NEEDS_FILTERS,
  NEEDS_LABELS,
  PER_PAGE_OPTIONS,
  PRODUCT_STATUS_ALL,
  RESTRICTION_ALL,
  SORT_LABELS,
  SORT_OPTIONS,
  STOCK_ALL,
  parseStaffProductsQuery,
  staffProductsHref,
} from "@/lib/staff-products-query";
import { BulkProductActions } from "@/components/staff/BulkProductActions";
import { BulkQuantityBar } from "@/components/staff/BulkQuantityBar";
import { StaffProductsPagination } from "@/components/staff/StaffProductsPagination";
import { BULK_PRODUCTS_FORM_ID } from "@/lib/product-restriction-form";
import {
  BULK_QUANTITY_FORM_ID,
  MAX_BULK_QUANTITY,
  ORIG_PREFIX,
  QTY_PREFIX,
} from "@/lib/bulk-quantity";
import { RESTRICTION_LABELS, STOCK_MODE_LABELS } from "@/lib/product-restriction";
import { formatPrice } from "@/components/product/format-price";
import { multiBuyLabel, savingLabel } from "@/lib/price-psychology";
import { formatNetContentDisplay } from "@/lib/catalogue-import/net-content";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { BackfillImagesButton } from "@/components/staff/BackfillImagesButton";
import { PageContainer } from "@/components/layout/PageContainer";
import { Icon } from "@/components/icons/Icon";
import { IconMedallion } from "@/components/icons/IconMedallion";

// Reads the session and this vendor's live catalogue — must render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Products" };

type Param = string | string[] | undefined;

/**
 * A query-string value as ONE string. A repeated parameter (`?page=2&page=3`) is `string[]` at
 * runtime whatever `searchParams`' type says (specs/architecture.md, #682), and `.trim()` on an
 * array throws. So the first value wins.
 */
function one(value: Param): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const selectClass =
  "rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-primary";
const labelClass = "flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-primary";

/**
 * The catalogue product list (P6b1, #159) — the first admin surface the
 * catalogue has ever had.
 *
 * UNLIKE the storefront's lists, this one does NOT filter isActive — an owner
 * has to be able to find the product they just switched off in order to switch
 * it back on. That is the whole reason the admin list functions exist beside
 * listByCategory() rather than reusing it.
 *
 * #1523 — built for a catalogue thousands of products deep. The search has its own row and matches
 * name, PLU or barcode. Numbered pages sit above and below the list, with a total. There is a sort,
 * "needs attention" worklists that surface the next job (price needed, ready to switch on, no
 * photo), and stock counts that can be changed for many rows with one Save.
 */
export default async function StaffProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, Param>>;
}) {
  const params = await searchParams;
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
  const categories = await listCategoriesForAdmin(auth.vendorId);
  const query = parseStaffProductsQuery(
    {
      status: one(params.status),
      q: one(params.q),
      category: one(params.category),
      restriction: one(params.restriction),
      stock: one(params.stock),
      perPage: one(params.perPage),
      sort: one(params.sort),
      needs: one(params.needs),
      page: one(params.page),
    },
    categories,
  );

  const { items, total, page, pageCount } = await listProductsForAdminPage(auth.vendorId, {
    page: query.page,
    perPage: query.perPage,
    sort: query.sort,
    search: query.search,
    isActive: query.isActive,
    categoryIds: query.categoryIds,
    restriction: query.restriction,
    stockMode: query.stockMode,
    needs: query.needs,
  });

  const isFiltered =
    query.search !== null ||
    query.status !== PRODUCT_STATUS_ALL ||
    query.category !== CATEGORY_ALL ||
    query.restriction !== undefined ||
    query.stockMode !== undefined ||
    query.needs !== undefined;

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
            <Icon name="plus" className="h-4 w-4" />
            New product
          </Link>
        </div>
      </div>

      {/* A plain GET form, matching /staff/orders: no client component, no JS, and the resulting
          URL is shareable. Submitting it starts again at page 1 (it carries no `page`), because
          a new filter makes the old page number meaningless. */}
      <form method="get" action="/staff/products" className="mb-4 space-y-3">
        {/* #1523 — search gets its own full-width row: it is the most-used control. */}
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="product-search">
            Search products
          </label>
          <div className="relative flex-1">
            <Icon
              name="search"
              className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-primary-muted"
            />
            <input
              id="product-search"
              type="search"
              name="q"
              defaultValue={query.search ?? ""}
              placeholder="Search by product name, PLU or barcode"
              className="w-full rounded-2xl border border-black/10 bg-white py-3 pr-3 pl-10 text-base text-primary"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white"
          >
            Search
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className={labelClass}>
            Status
            <select name="status" defaultValue={query.status} className={selectClass}>
              <option value={PRODUCT_STATUS_ALL}>All products</option>
              <option value="active">Visible to shoppers</option>
              <option value="inactive">Hidden</option>
            </select>
          </label>

          <label className={labelClass}>
            Category
            <select name="category" defaultValue={query.category} className={selectClass}>
              <option value={CATEGORY_ALL}>All categories</option>
              {/* Same optgroup shape as the product form's picker (#630). As a FILTER the
                  department option means the department and everything beneath it. */}
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
          <label className={labelClass}>
            Restriction
            <select
              name="restriction"
              defaultValue={query.restrictionFilter}
              className={selectClass}
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

          <label className={labelClass}>
            Stock
            <select name="stock" defaultValue={query.stockFilter} className={selectClass}>
              <option value={STOCK_ALL}>Any</option>
              {(["TRACKED", "UNTRACKED", "UNKNOWN"] as const).map((value) => (
                <option key={value} value={value}>
                  {STOCK_MODE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <label className={labelClass}>
            Needs attention
            <select name="needs" defaultValue={query.needsFilter} className={selectClass}>
              <option value={NEEDS_ALL}>Any</option>
              {NEEDS_FILTERS.map((value) => (
                <option key={value} value={value}>
                  {NEEDS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <label className={labelClass}>
            Sort
            <select name="sort" defaultValue={query.sort} className={selectClass}>
              {SORT_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {SORT_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <label className={labelClass}>
            Per page
            <select name="perPage" defaultValue={String(query.perPage)} className={selectClass}>
              {PER_PAGE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-bold text-primary hover:bg-surface-muted"
          >
            Apply filters
          </button>
          {isFiltered && (
            <Link
              href="/staff/products"
              className="px-1 py-2.5 text-sm font-semibold text-primary-muted hover:underline"
            >
              Clear all
            </Link>
          )}
        </div>
      </form>

      {/* #1523 — one-click worklists. Each keeps the rest of the view and starts at page 1. */}
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-bold uppercase tracking-wide text-primary-muted">
          Quick views:
        </span>
        {NEEDS_FILTERS.map((value) => {
          const active = query.needs === value;
          return (
            <Link
              key={value}
              href={staffProductsHref({ ...query, needs: active ? undefined : value })}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1 font-semibold ${
                active
                  ? "border-primary bg-primary text-white"
                  : "border-black/10 bg-white text-primary hover:bg-surface-muted"
              }`}
            >
              {NEEDS_LABELS[value]}
            </Link>
          );
        })}
      </div>

      {items.length > 0 && <BulkProductActions />}
      {items.length > 0 && <BulkQuantityBar />}

      <StaffProductsPagination
        query={query}
        page={page}
        pageCount={pageCount}
        total={total}
        shown={items.length}
        position="top"
      />

      {items.length === 0 ? (
        <div className="rounded-2xl border border-black/10 bg-surface-muted p-8 text-center">
          <IconMedallion icon="package" size={32} className="mx-auto mb-3" decorative />
          <p className="text-sm text-primary-muted">
            {isFiltered
              ? "No products match this view. Clear the filters to see the whole catalogue."
              : "No products yet. Create a category first, then add your first product."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((product) => {
            const discountLabel = savingLabel(product.originalPrice, product.basePrice);
            const tierLabel = multiBuyLabel(product.basePrice, product.tier);
            const tracked = product.stockMode === "TRACKED";
            const currentQty = tracked ? String(product.quantity) : "";
            return (
              <li key={product.id} className="rounded-2xl border border-black/10 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
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
                      {product.basePrice <= 0 && (
                        <span className="rounded-full bg-danger-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger">
                          Price needed
                        </span>
                      )}
                      {product.restriction !== null && (
                        <span className="rounded-full bg-danger-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger">
                          {RESTRICTION_LABELS[product.restriction]}
                        </span>
                      )}
                      {tracked && product.quantity <= 0 && (
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
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-primary-muted">
                      <span className="font-medium text-primary">{product.categoryName}</span>
                      {product.brandName && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                            Brand: {product.brandName}
                          </span>
                        </>
                      )}
                      {product.netContentAmount && product.netContentUnit && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center rounded bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-primary">
                            {formatNetContentDisplay({
                              amount: product.netContentAmount,
                              unit: product.netContentUnit,
                            })}
                          </span>
                        </>
                      )}
                      {product.plu && (
                        <>
                          <span>·</span>
                          <span className="font-mono text-[11px] text-black/60">
                            PLU {product.plu}
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span className="truncate text-black/60">{product.slug}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-start gap-4">
                    <div className="text-right">
                      <p className="flex items-baseline justify-end gap-1.5">
                        {discountLabel && product.originalPrice !== null && (
                          <span className="text-xs text-black/60 line-through">
                            {formatPrice(product.originalPrice)}
                          </span>
                        )}
                        <span className="font-bold text-primary">
                          {formatPrice(product.basePrice)}
                        </span>
                      </p>
                      {discountLabel && (
                        <p className="text-[11px] font-semibold text-danger">{discountLabel}</p>
                      )}
                      {tierLabel && (
                        <p className="text-[11px] font-semibold text-action">{tierLabel}</p>
                      )}
                      <p className="text-xs text-primary-muted">
                        {tracked ? "Tracked" : STOCK_MODE_LABELS[product.stockMode]}
                      </p>
                    </div>
                    {/* #1523 — the row's stock count, bound to the bulk quantity form. Blank for
                        a product whose stock is not tracked; typing a count tracks it. */}
                    <label className="flex flex-col items-end gap-1 text-[10px] font-bold uppercase tracking-wide text-primary-muted">
                      Qty
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={MAX_BULK_QUANTITY}
                        step={1}
                        name={`${QTY_PREFIX}${product.id}`}
                        form={BULK_QUANTITY_FORM_ID}
                        defaultValue={currentQty}
                        placeholder="—"
                        aria-label={`Stock count for ${product.name}`}
                        className="w-20 rounded-xl border border-black/10 bg-white px-2 py-1.5 text-right text-sm font-normal text-primary data-changed:border-action data-changed:bg-action-tint"
                      />
                      <input
                        type="hidden"
                        name={`${ORIG_PREFIX}${product.id}`}
                        form={BULK_QUANTITY_FORM_ID}
                        value={currentQty}
                      />
                    </label>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {items.length > 0 && (
        <StaffProductsPagination
          query={query}
          page={page}
          pageCount={pageCount}
          total={total}
          shown={items.length}
          position="bottom"
        />
      )}
    </PageContainer>
  );
}
