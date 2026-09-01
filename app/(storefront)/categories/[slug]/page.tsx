import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategoryRepository } from "@/lib/categories-service";
import { getProductRepository } from "@/lib/products-service";
import { getRequestCartQuantities } from "@/lib/cart-summary";
import { getEnv } from "@/lib/config";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductFilterForm } from "@/components/product/ProductFilterForm";
import { SubcategoryLinks } from "@/components/product/SubcategoryLinks";
import { DepartmentScroller } from "@/components/layout/DepartmentScroller";
import { parsePriceInput } from "@/components/product/parse-price-input";

// See app/(storefront)/categories/page.tsx — Prisma's @prisma/client/wasm
// can't load during next build's Node-based static prerendering.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

type SearchParams = {
  minPrice?: string;
  maxPrice?: string;
  inStock?: string;
  isHalal?: string;
  isFresh?: string;
  isOrganic?: string;
  cursor?: string;
  /**
   * #498 — the stack of cursors used to reach every PRIOR page, comma-joined,
   * so "Previous" can navigate backwards without an OFFSET query (this app's
   * pagination is keyset-only, per specs/architecture.md) or a second,
   * separate COUNT query for absolute page numbers. Page 1 in the stack is
   * represented as an empty segment (no cursor was used to reach it).
   */
  back?: string;
};

function parseBack(back?: string): string[] {
  return back ? back.split(",") : [];
}

function buildHref(
  slug: string,
  params: SearchParams,
  overrides: { cursor?: string; back: string[] },
): string {
  const qs = new URLSearchParams();
  if (params.minPrice) qs.set("minPrice", params.minPrice);
  if (params.maxPrice) qs.set("maxPrice", params.maxPrice);
  if (params.inStock) qs.set("inStock", params.inStock);
  if (params.isHalal) qs.set("isHalal", params.isHalal);
  if (params.isFresh) qs.set("isFresh", params.isFresh);
  if (params.isOrganic) qs.set("isOrganic", params.isOrganic);
  if (overrides.cursor) qs.set("cursor", overrides.cursor);
  // A lone "" entry means "page 1 had no cursor" and nothing else — not worth
  // a query param at all, so the very first "Next" click stays a clean URL.
  const joinedBack = overrides.back.join(",");
  if (joinedBack !== "") qs.set("back", joinedBack);
  return `/categories/${slug}?${qs.toString()}`;
}

function nextPageHref(slug: string, params: SearchParams, nextCursor: string): string {
  const back = [...parseBack(params.back), params.cursor ?? ""];
  return buildHref(slug, params, { cursor: nextCursor, back });
}

function prevPageHref(slug: string, params: SearchParams): string {
  const back = parseBack(params.back);
  const prevCursor = back[back.length - 1] ?? "";
  return buildHref(slug, params, {
    cursor: prevCursor || undefined,
    back: back.slice(0, -1),
  });
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  const categoryRepo = getCategoryRepository();
  const [category, allCategories] = await Promise.all([
    categoryRepo.getBySlug(slug),
    categoryRepo.listTopLevel(),
  ]);
  if (!category) {
    notFound();
  }

  const products = getProductRepository();
  // #496 — aggregate the department's own products with every one of its
  // subcategories' (a subcategory itself has no children, so this is always
  // exactly [category.id] there — the array collapses to the old behaviour).
  const categoryIds = [category.id, ...category.children.map((child) => child.id)];
  const { items, nextCursor } = await products.listByCategory(categoryIds, {
    take: PAGE_SIZE,
    cursor: query.cursor,
    minPricePence: parsePriceInput(query.minPrice ?? ""),
    maxPricePence: parsePriceInput(query.maxPrice ?? ""),
    inStockOnly: query.inStock === "1",
    isHalal: query.isHalal === "1",
    isFresh: query.isFresh === "1",
    isOrganic: query.isOrganic === "1",
  });
  const specialities = await products.availableSpecialities();
  // P8.5a (#345): request-memoised, so this shares the header's cart read
  // rather than issuing a second identical query.
  const cartQuantities = await getRequestCartQuantities();
  const { CDN_BASE_URL } = getEnv();

  // #498 — a subcategory has no children of its own (two-level cap), so its
  // own tab row is its PARENT's children — its siblings, itself included —
  // rather than nothing at all. A department (no parent) shows its own
  // children, as before. `activeSlug` is whichever page is actually being
  // viewed, so exactly one pill (or "All") is ever highlighted.
  const tabParentSlug = category.parent?.slug ?? category.slug;
  const tabs = category.parent?.children ?? category.children;
  const scrollerActiveSlug = category.parent?.slug ?? category.slug;

  const isFirstPage = !query.cursor;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      {/* Departments: horizontal strip on top (arrow-scrolled). Highlights
          the DEPARTMENT even when viewing one of its subcategories. */}
      <DepartmentScroller categories={allCategories} activeSlug={scrollerActiveSlug} />

      <div className="mt-6 flex flex-col gap-6 md:flex-row">
        {/* Search & filters: vertical sidebar on the left. */}
        <aside className="shrink-0 md:w-60">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary">
            Filters
          </h2>
          <ProductFilterForm searchParams={query} specialities={specialities} />
        </aside>

        <section className="flex-1">
          <h1 className="mb-6 text-2xl font-semibold text-primary">{category.name}</h1>
          <SubcategoryLinks tabs={tabs} parentSlug={tabParentSlug} activeSlug={slug} />
          <h2 className="sr-only">Products</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                cdnBaseUrl={CDN_BASE_URL ?? ""}
                cartQuantity={cartQuantities.get(product.id) ?? 0}
              />
            ))}
          </div>
          {(nextCursor || !isFirstPage) && (
            <div className="mt-6 flex gap-3">
              {!isFirstPage && (
                <Link
                  href={prevPageHref(slug, query)}
                  className="inline-block rounded-full border border-black/10 bg-white px-4 py-2 font-semibold text-primary hover:bg-surface-muted"
                >
                  Previous page
                </Link>
              )}
              {nextCursor && (
                <Link
                  href={nextPageHref(slug, query, nextCursor)}
                  className="inline-block rounded-full bg-action px-4 py-2 font-semibold text-white"
                >
                  Next page
                </Link>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
