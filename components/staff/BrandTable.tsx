"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createBrand,
  deleteBrand,
  renameBrand,
  setBrandImage,
  getBrandProducts,
  unassignProductFromBrandAction,
} from "@/features/admin/brands";
import { initialCatalogueState } from "@/lib/catalogue-form";
import { confirmDeleteLabel } from "@/lib/attribute-form";
import type { AdminBrandRow, BrandProductQuickViewItem } from "@/lib/repositories/brands";
import { inputClass, labelClass } from "@/lib/form-classes";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/icons/Icon";
import { formatPrice } from "@/components/product/format-price";

type FilterTab = "ALL" | "WITH_PRODUCTS" | "EMPTY";
type SortOrder = "MOST_PRODUCTS" | "LEAST_PRODUCTS" | "NAME_ASC" | "NAME_DESC";

interface BrandTableProps {
  initialBrands: AdminBrandRow[];
}

export function BrandTable({ initialBrands }: BrandTableProps) {
  const router = useRouter();
  const [brands, setBrands] = useState<AdminBrandRow[]>(initialBrands);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("ALL");
  const [sortBy, setSortBy] = useState<SortOrder>("MOST_PRODUCTS");

  // Modal / Drawer states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<AdminBrandRow | null>(null);
  const [deletingBrand, setDeletingBrand] = useState<AdminBrandRow | null>(null);
  const [quickViewBrand, setQuickViewBrand] = useState<AdminBrandRow | null>(null);
  const [quickViewProducts, setQuickViewProducts] = useState<BrandProductQuickViewItem[]>([]);
  const [isLoadingQuickView, setIsLoadingQuickView] = useState(false);
  const [quickViewSearch, setQuickViewSearch] = useState("");

  // Server action states
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Behavioral Economics / Neuromarketing Metric Anchors
  const stats = useMemo(() => {
    const totalBrands = brands.length;
    const withProducts = brands.filter((b) => b.productCount > 0);
    const emptyBrands = brands.filter((b) => b.productCount === 0);
    const totalProducts = brands.reduce((sum, b) => sum + b.productCount, 0);
    const maxProductCount = Math.max(...brands.map((b) => b.productCount), 1);
    const topBrand = [...brands].sort((a, b) => b.productCount - a.productCount)[0];

    return {
      totalBrands,
      activeBrandsCount: withProducts.length,
      emptyBrandsCount: emptyBrands.length,
      totalProducts,
      maxProductCount,
      topBrandName: topBrand?.productCount > 0 ? topBrand.name : "None",
      topBrandCount: topBrand?.productCount ?? 0,
      coveragePercent: totalBrands > 0 ? Math.round((withProducts.length / totalBrands) * 100) : 0,
    };
  }, [brands]);

  // Filtering & Sorting (Hick's Law & Cognitive Load Reduction)
  const filteredBrands = useMemo(() => {
    let result = [...brands];

    // Filter tab
    if (activeTab === "WITH_PRODUCTS") {
      result = result.filter((b) => b.productCount > 0);
    } else if (activeTab === "EMPTY") {
      result = result.filter((b) => b.productCount === 0);
    }

    // Search query
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (b) => b.name.toLowerCase().includes(q) || b.slug.toLowerCase().includes(q),
      );
    }

    // Sort order
    result.sort((a, b) => {
      switch (sortBy) {
        case "MOST_PRODUCTS":
          return b.productCount - a.productCount || a.name.localeCompare(b.name);
        case "LEAST_PRODUCTS":
          return a.productCount - b.productCount || a.name.localeCompare(b.name);
        case "NAME_ASC":
          return a.name.localeCompare(b.name);
        case "NAME_DESC":
          return b.name.localeCompare(a.name);
        default:
          return 0;
      }
    });

    return result;
  }, [brands, activeTab, searchQuery, sortBy]);

  // Quick View handler (Cognitive Scent & Visual Verification)
  const handleOpenQuickView = async (brand: AdminBrandRow) => {
    setQuickViewBrand(brand);
    setQuickViewSearch("");
    setIsLoadingQuickView(true);
    setActionError(null);

    try {
      const res = await getBrandProducts(brand.id);
      if (res.ok) {
        setQuickViewProducts(res.products);
      } else {
        setActionError(res.error ?? "Failed to load products for brand");
      }
    } catch {
      setActionError("An unexpected error occurred while loading products.");
    } finally {
      setIsLoadingQuickView(false);
    }
  };

  // Quick View Product Unassign handler
  const handleUnassignProduct = (productId: string) => {
    startTransition(async () => {
      try {
        const res = await unassignProductFromBrandAction(productId);
        if (res.ok) {
          setQuickViewProducts((prev) => prev.filter((p) => p.id !== productId));
          setBrands((prev) =>
            prev.map((b) =>
              b.id === quickViewBrand?.id
                ? { ...b, productCount: Math.max(0, b.productCount - 1) }
                : b,
            ),
          );
          if (quickViewBrand) {
            setQuickViewBrand({
              ...quickViewBrand,
              productCount: Math.max(0, quickViewBrand.productCount - 1),
            });
          }
          router.refresh();
        } else {
          setActionError(res.error ?? "Could not unassign product");
        }
      } catch {
        setActionError("Failed to unassign product.");
      }
    });
  };

  // Quick View filtered products
  const quickViewFiltered = useMemo(() => {
    if (!quickViewSearch.trim()) return quickViewProducts;
    const q = quickViewSearch.trim().toLowerCase();
    return quickViewProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.categoryName.toLowerCase().includes(q) ||
        (p.plu && p.plu.toLowerCase().includes(q)),
    );
  }, [quickViewProducts, quickViewSearch]);

  // Pricing psychology summary within quick view
  const quickViewPricing = useMemo(() => {
    if (quickViewProducts.length === 0) return null;
    const prices = quickViewProducts.map((p) => p.basePrice);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    const inStockCount = quickViewProducts.filter(
      (p) => p.stockMode === "UNTRACKED" || p.stockQuantity > 0,
    ).length;

    return { minPrice, maxPrice, avgPrice, inStockCount };
  }, [quickViewProducts]);

  return (
    <div className="space-y-6">
      {/* 1. Anchoring & Overview Metrics (Neuromarketing KPI Cards) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Card className="flex flex-col justify-between p-4 bg-card border border-border shadow-sm">
          <div className="flex items-center justify-between text-primary-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Brands</span>
            <Icon name="tag" className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-primary">{stats.totalBrands}</div>
            <p className="text-xs text-primary-muted mt-0.5">Active catalog facets</p>
          </div>
        </Card>

        <Card className="flex flex-col justify-between p-4 bg-card border border-border shadow-sm">
          <div className="flex items-center justify-between text-primary-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Branded Products</span>
            <Icon name="package" className="h-4 w-4 text-action" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-action">
              {stats.totalProducts.toLocaleString()}
            </div>
            <p className="text-xs text-primary-muted mt-0.5">Assigned & shoppable</p>
          </div>
        </Card>

        <Card className="flex flex-col justify-between p-4 bg-card border border-border shadow-sm">
          <div className="flex items-center justify-between text-primary-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Top Brand</span>
            <Icon name="featured-star" className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-primary truncate" title={stats.topBrandName}>
              {stats.topBrandName}
            </div>
            <p className="text-xs text-primary-muted mt-0.5">{stats.topBrandCount} catalog items</p>
          </div>
        </Card>

        <Card className="flex flex-col justify-between p-4 bg-card border border-border shadow-sm">
          <div className="flex items-center justify-between text-primary-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">Empty Brands</span>
            <Icon
              name={stats.emptyBrandsCount > 0 ? "circle-alert" : "circle-check"}
              className={`h-4 w-4 ${stats.emptyBrandsCount > 0 ? "text-amber-500" : "text-emerald-500"}`}
            />
          </div>
          <div className="mt-2">
            <div
              className={`text-2xl font-bold ${
                stats.emptyBrandsCount > 0 ? "text-amber-600" : "text-emerald-600"
              }`}
            >
              {stats.emptyBrandsCount}
            </div>
            <p className="text-xs text-primary-muted mt-0.5">
              {stats.emptyBrandsCount > 0 ? "Needs products or cleanup" : "All brands populated"}
            </p>
          </div>
        </Card>
      </div>

      {/* Global Action Alerts */}
      {actionSuccess && (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800"
        >
          <div className="flex items-center gap-2">
            <Icon name="circle-check" className="h-4 w-4 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-600 hover:text-emerald-800"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-800"
        >
          <div className="flex items-center gap-2">
            <Icon name="circle-alert" className="h-4 w-4 text-rose-600" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-600 hover:text-rose-800"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 2. Controls & Search Toolbar (Hick's Law & Low Friction) */}
      <Card className="p-4 bg-card border border-border shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Search bar with visual icon */}
          <div className="relative flex-1 max-w-md">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-muted pointer-events-none"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by brand name or slug..."
              className={`${inputClass} pl-9`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-muted hover:text-primary"
                aria-label="Clear search"
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filter Pills & Sort Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-xl bg-surface-muted p-1 border border-border/60">
              <button
                type="button"
                onClick={() => setActiveTab("ALL")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === "ALL"
                    ? "bg-card text-primary shadow-sm font-semibold"
                    : "text-primary-muted hover:text-primary"
                }`}
              >
                All ({stats.totalBrands})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("WITH_PRODUCTS")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === "WITH_PRODUCTS"
                    ? "bg-card text-primary shadow-sm font-semibold"
                    : "text-primary-muted hover:text-primary"
                }`}
              >
                With Products ({stats.activeBrandsCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("EMPTY")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === "EMPTY"
                    ? "bg-card text-amber-700 shadow-sm font-semibold"
                    : "text-primary-muted hover:text-primary"
                }`}
              >
                Empty ({stats.emptyBrandsCount})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="brand-sort" className="text-xs text-primary-muted whitespace-nowrap">
                Sort:
              </label>
              <select
                id="brand-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOrder)}
                className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs text-primary focus:outline-none focus:ring-2 focus:ring-action"
              >
                <option value="MOST_PRODUCTS">Most Products</option>
                <option value="LEAST_PRODUCTS">Fewest Products</option>
                <option value="NAME_ASC">Name (A → Z)</option>
                <option value="NAME_DESC">Name (Z → A)</option>
              </select>
            </div>

            <Button
              type="button"
              onClick={() => {
                setShowAddModal(true);
                setActionError(null);
                setActionSuccess(null);
              }}
              className="inline-flex items-center gap-1.5 shadow-sm"
            >
              <Icon name="plus" className="h-4 w-4" />
              <span>Add Brand</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* 3. The Brands Table (High Information Scent & Scannability) */}
      <Card className="overflow-hidden bg-card border border-border shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-muted/60 text-xs font-semibold text-primary-muted uppercase tracking-wider">
                <th className="py-3.5 pl-6 pr-4">Brand</th>
                <th className="py-3.5 px-4">Slug</th>
                <th className="py-3.5 px-4">Catalog Breadth</th>
                <th className="py-3.5 px-4">Storefront Status</th>
                <th className="py-3.5 pl-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredBrands.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-primary-muted">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Icon name="tag" className="h-8 w-8 text-primary-muted/50" />
                      <p className="font-medium text-base text-primary">
                        No brands match your filter
                      </p>
                      <p className="text-xs text-primary-muted">
                        Try adjusting your search query or reset the filter.
                      </p>
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery("");
                            setActiveTab("ALL");
                          }}
                          className="mt-2 text-xs font-semibold text-action hover:underline"
                        >
                          Clear all filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredBrands.map((brand) => {
                  const relativePct = Math.round(
                    (brand.productCount / stats.maxProductCount) * 100,
                  );
                  return (
                    <tr
                      key={brand.id}
                      className="group transition-colors hover:bg-surface-muted/40"
                    >
                      {/* Brand Name & Image Key */}
                      <td className="py-4 pl-6 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-primary font-bold text-sm">
                            {brand.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-semibold text-primary block">{brand.name}</span>
                            {brand.imageKey ? (
                              <span
                                className="text-[11px] text-primary-muted truncate max-w-[180px] block"
                                title={brand.imageKey}
                              >
                                {brand.imageKey}
                              </span>
                            ) : (
                              <span className="text-[11px] text-primary-muted/70 italic">
                                No logo set
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Slug */}
                      <td className="py-4 px-4 text-xs">
                        <code className="rounded-md bg-surface-muted px-2 py-1 text-primary-muted font-mono">
                          {brand.slug}
                        </code>
                      </td>

                      {/* Catalog Breadth (Relative Volume & Count Badge) */}
                      <td className="py-4 px-4">
                        <div className="space-y-1.5 max-w-[180px]">
                          <div className="flex items-center justify-between text-xs">
                            <span
                              className={`font-semibold ${
                                brand.productCount > 0 ? "text-primary" : "text-amber-700"
                              }`}
                            >
                              {brand.productCount}{" "}
                              {brand.productCount === 1 ? "product" : "products"}
                            </span>
                            {brand.productCount > 0 && (
                              <span className="text-[11px] text-primary-muted font-mono">
                                {relativePct}%
                              </span>
                            )}
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-surface-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                brand.productCount > 20
                                  ? "bg-action"
                                  : brand.productCount > 0
                                    ? "bg-primary"
                                    : "bg-transparent"
                              }`}
                              style={{ width: `${relativePct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Storefront Filter Status */}
                      <td className="py-4 px-4">
                        {brand.productCount > 0 ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                            Active in filter
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            Hidden (no items)
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 pl-4 pr-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Quick View Products */}
                          <button
                            type="button"
                            onClick={() => handleOpenQuickView(brand)}
                            className="inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-surface-muted transition"
                            title="Quick view brand products"
                          >
                            <Icon name="eye" className="h-3.5 w-3.5 text-primary-muted" />
                            <span>Products ({brand.productCount})</span>
                          </button>

                          {/* Edit / Rename */}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBrand(brand);
                              setActionError(null);
                            }}
                            className="inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-surface-muted transition"
                            title="Edit brand name & logo"
                          >
                            <Icon name="pencil" className="h-3.5 w-3.5 text-primary-muted" />
                            <span>Edit</span>
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => {
                              setDeletingBrand(brand);
                              setActionError(null);
                            }}
                            className="inline-flex items-center justify-center rounded-xl p-1.5 text-danger hover:bg-danger-tint transition"
                            title="Delete brand"
                          >
                            <Icon name="trash" className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 4. Brand Products Quick View Drawer (Pricing Psychology & Inventory Inspection) */}
      {quickViewBrand && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-sm transition-opacity"
        >
          <div className="h-full w-full max-w-2xl bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-6 border-b border-border bg-surface-muted/30">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-tint text-primary font-bold text-xs">
                      {quickViewBrand.name.slice(0, 2).toUpperCase()}
                    </span>
                    <h2 className="text-xl font-bold text-primary">{quickViewBrand.name}</h2>
                    <code className="text-xs text-primary-muted bg-surface-muted px-2 py-0.5 rounded">
                      {quickViewBrand.slug}
                    </code>
                  </div>
                  <p className="text-xs text-primary-muted mt-1">
                    {quickViewProducts.length}{" "}
                    {quickViewProducts.length === 1 ? "catalog item" : "catalog items"} linked to
                    this brand
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickViewBrand(null)}
                  className="rounded-lg p-1.5 text-primary-muted hover:text-primary hover:bg-surface-muted transition"
                  aria-label="Close drawer"
                >
                  <Icon name="x" className="h-5 w-5" />
                </button>
              </div>

              {/* Pricing Psychology & Inventory Anchors */}
              {quickViewPricing && (
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl border border-border bg-card p-2.5">
                    <span className="text-primary-muted block">Price Range</span>
                    <span className="font-bold text-primary">
                      {formatPrice(quickViewPricing.minPrice)} –{" "}
                      {formatPrice(quickViewPricing.maxPrice)}
                    </span>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-2.5">
                    <span className="text-primary-muted block">Average Price</span>
                    <span className="font-bold text-action">
                      {formatPrice(quickViewPricing.avgPrice)}
                    </span>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-2.5">
                    <span className="text-primary-muted block">Availability</span>
                    <span className="font-bold text-emerald-700">
                      {quickViewPricing.inStockCount} / {quickViewProducts.length} In Stock
                    </span>
                  </div>
                </div>
              )}

              {/* Drawer Search */}
              <div className="relative mt-4">
                <Icon
                  name="search"
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary-muted"
                />
                <input
                  type="search"
                  value={quickViewSearch}
                  onChange={(e) => setQuickViewSearch(e.target.value)}
                  placeholder={`Filter ${quickViewBrand.name} products...`}
                  className={`${inputClass} pl-8 py-1.5 text-xs`}
                />
              </div>
            </div>

            {/* Drawer Body (Products List) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {isLoadingQuickView ? (
                <div className="py-16 text-center text-primary-muted">
                  <Icon name="loader-circle" className="h-8 w-8 animate-spin mx-auto text-action" />
                  <p className="mt-2 text-sm">Loading brand products...</p>
                </div>
              ) : quickViewFiltered.length === 0 ? (
                <div className="py-12 text-center text-primary-muted">
                  <p className="font-semibold text-primary">
                    {quickViewProducts.length === 0
                      ? "No products currently linked to this brand."
                      : "No products match your search filter."}
                  </p>
                  <p className="text-xs mt-1">
                    Assign products to this brand from the product edit screen or through Excel
                    import.
                  </p>
                </div>
              ) : (
                quickViewFiltered.map((product) => {
                  const inStock = product.stockMode === "UNTRACKED" || product.stockQuantity > 0;
                  return (
                    <div
                      key={product.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border p-3.5 bg-card hover:border-action/40 transition-colors"
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-primary">{product.name}</span>
                          {product.plu && (
                            <span className="text-[11px] font-mono text-primary-muted bg-surface-muted px-1.5 py-0.5 rounded">
                              PLU {product.plu}
                            </span>
                          )}
                          <span className="text-[11px] text-primary-muted">
                            {product.categoryName}
                          </span>
                        </div>

                        {/* Pricing & Net Content */}
                        <div className="flex items-center gap-3 text-xs">
                          <span className="font-bold text-action text-sm">
                            {formatPrice(product.basePrice)}
                          </span>
                          {product.unitLabel && (
                            <span className="text-primary-muted">{product.unitLabel}</span>
                          )}
                          {product.netContentAmount && product.netContentUnit && (
                            <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] text-primary-muted">
                              {product.netContentAmount} {product.netContentUnit.toLowerCase()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Stock Status Badge & Actions */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                        <div>
                          {inStock ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                              {product.stockMode === "UNTRACKED"
                                ? "Untracked"
                                : `${product.stockQuantity} in stock`}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[11px] font-medium text-rose-800">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
                              Out of stock
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/staff/products/${product.id}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-1 text-xs font-medium text-primary hover:bg-surface-muted transition"
                          >
                            <span>Edit</span>
                            <Icon name="external-link" className="h-3 w-3 text-primary-muted" />
                          </Link>

                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleUnassignProduct(product.id)}
                            className="inline-flex items-center justify-center rounded-xl p-1 text-primary-muted hover:text-danger hover:bg-danger-tint transition"
                            title="Unlink product from brand"
                            aria-label={`Unlink ${product.name} from ${quickViewBrand.name}`}
                          >
                            <Icon name="trash" className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-border bg-surface-muted/20 flex items-center justify-between">
              <span className="text-xs text-primary-muted">
                Showing {quickViewFiltered.length} of {quickViewProducts.length} items
              </span>
              <Button
                type="button"
                onClick={() => setQuickViewBrand(null)}
                className="text-xs py-1.5 px-4"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Add Brand Modal */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Icon name="tag" className="h-5 w-5 text-action" />
                <h3 className="text-lg font-bold text-primary">Add a Brand</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-primary-muted hover:text-primary"
              >
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-primary-muted mb-4">
              Create a new brand facet. Shoppers can filter products by this brand across search and
              category pages once products are assigned.
            </p>

            <form
              action={async (formData) => {
                startTransition(async () => {
                  const res = await createBrand(initialCatalogueState, formData);
                  if (res.error) {
                    setActionError(res.error);
                  } else {
                    const name = String(formData.get("name") ?? "").trim();
                    setActionSuccess(`Brand "${name}" added successfully.`);
                    setShowAddModal(false);
                    router.refresh();
                  }
                });
              }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="modal-brand-name" className={labelClass}>
                  Brand name
                </label>
                <input
                  id="modal-brand-name"
                  name="name"
                  placeholder="e.g. Laila, TRS, Shan"
                  className={inputClass}
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="bg-transparent text-primary hover:bg-surface-muted border border-border"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  <Icon name="plus" className="h-4 w-4" />
                  {isPending ? "Adding…" : "Add Brand"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Edit Brand Modal */}
      {editingBrand && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl p-6 animate-in zoom-in-95 duration-150 space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Icon name="pencil" className="h-5 w-5 text-action" />
                <h3 className="text-lg font-bold text-primary">Edit Brand: {editingBrand.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingBrand(null)}
                className="rounded-lg p-1 text-primary-muted hover:text-primary"
              >
                <Icon name="x" className="h-5 w-5" />
              </button>
            </div>

            {/* Rename Form */}
            <form
              action={async (formData) => {
                startTransition(async () => {
                  const res = await renameBrand(initialCatalogueState, formData);
                  if (res.error) {
                    setActionError(res.error);
                  } else {
                    const newName = String(formData.get("name") ?? "").trim();
                    setBrands((prev) =>
                      prev.map((b) => (b.id === editingBrand.id ? { ...b, name: newName } : b)),
                    );
                    setActionSuccess(`Brand renamed to "${newName}".`);
                    setEditingBrand(null);
                    router.refresh();
                  }
                });
              }}
              className="space-y-3"
            >
              <input type="hidden" name="brandId" value={editingBrand.id} />
              <div>
                <label htmlFor="edit-brand-name" className={labelClass}>
                  Brand Name
                </label>
                <input
                  id="edit-brand-name"
                  name="name"
                  defaultValue={editingBrand.name}
                  className={inputClass}
                  required
                />
                <p className="text-[11px] text-primary-muted mt-1">
                  Slug: <code>{editingBrand.slug}</code> (kept stable so bookmarked filter links
                  remain valid)
                </p>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={isPending} className="text-xs py-1.5">
                  <Icon name="save" className="h-3.5 w-3.5" />
                  {isPending ? "Saving…" : "Save Name"}
                </Button>
              </div>
            </form>

            <hr className="border-border/60" />

            {/* Image Key Form */}
            <form
              action={async (formData) => {
                startTransition(async () => {
                  const res = await setBrandImage(initialCatalogueState, formData);
                  if (res.error) {
                    setActionError(res.error);
                  } else {
                    const key = String(formData.get("imageKey") ?? "").trim();
                    setBrands((prev) =>
                      prev.map((b) =>
                        b.id === editingBrand.id ? { ...b, imageKey: key || null } : b,
                      ),
                    );
                    setActionSuccess(`Logo storage key updated.`);
                    setEditingBrand(null);
                    router.refresh();
                  }
                });
              }}
              className="space-y-3"
            >
              <input type="hidden" name="brandId" value={editingBrand.id} />
              <div>
                <label htmlFor="edit-image-key" className={labelClass}>
                  Logo storage key (optional)
                </label>
                <input
                  id="edit-image-key"
                  name="imageKey"
                  placeholder="brands/brand-name/logo.webp"
                  defaultValue={editingBrand.imageKey ?? ""}
                  className={inputClass}
                />
                <p className="mt-1 text-[11px] text-primary-muted">
                  A relative storage key, never a full URL. Leave blank to clear.
                </p>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={isPending} className="text-xs py-1.5">
                  <Icon name="save" className="h-3.5 w-3.5" />
                  {isPending ? "Saving…" : "Save Key"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Safe Delete Confirmation Modal (Loss Aversion & Error Prevention) */}
      {deletingBrand && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl p-6 animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center gap-3 text-danger">
              <div className="rounded-xl bg-danger-tint p-2">
                <Icon name="trash" className="h-5 w-5 text-danger" />
              </div>
              <h3 className="text-lg font-bold text-primary">Delete {deletingBrand.name}?</h3>
            </div>

            <p className="text-sm text-primary-muted">
              {deletingBrand.productCount > 0 ? (
                <>
                  This brand is currently linked to{" "}
                  <strong className="text-primary font-bold">
                    {deletingBrand.productCount}{" "}
                    {deletingBrand.productCount === 1 ? "product" : "products"}
                  </strong>
                  . Deleting this brand will unassign it from all products.{" "}
                  <span className="text-primary font-medium">
                    Products themselves are kept safely in your catalog.
                  </span>
                </>
              ) : (
                "Are you sure you want to delete this brand? It has no products assigned."
              )}
            </p>

            <form
              action={async (formData) => {
                startTransition(async () => {
                  const res = await deleteBrand(initialCatalogueState, formData);
                  if (res.error) {
                    setActionError(res.error);
                  } else {
                    setBrands((prev) => prev.filter((b) => b.id !== deletingBrand.id));
                    setActionSuccess(`Brand "${deletingBrand.name}" deleted.`);
                    setDeletingBrand(null);
                    router.refresh();
                  }
                });
              }}
              className="space-y-4 pt-2"
            >
              <input type="hidden" name="brandId" value={deletingBrand.id} />

              {deletingBrand.productCount > 0 && (
                <label className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-tint/30 p-3 text-xs text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    name="confirmDelete"
                    required
                    className="mt-0.5 rounded text-danger focus:ring-danger"
                  />
                  <span>{confirmDeleteLabel(deletingBrand.productCount)}</span>
                </label>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  onClick={() => setDeletingBrand(null)}
                  className="bg-transparent text-primary hover:bg-surface-muted border border-border"
                >
                  Cancel
                </Button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:bg-danger/90 disabled:opacity-60"
                >
                  <Icon name="trash" className="h-4 w-4" />
                  {isPending ? "Deleting…" : "Delete Brand"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
