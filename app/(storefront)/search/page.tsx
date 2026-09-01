import Link from "next/link";
import { getProductRepository } from "@/lib/products-service";
import { getRequestCartQuantities } from "@/lib/cart-summary";
import { getCategoryRepository } from "@/lib/categories-service";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { getEnv } from "@/lib/config";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductFilterForm } from "@/components/product/ProductFilterForm";
import { DepartmentScroller } from "@/components/layout/DepartmentScroller";
import { parsePriceInput } from "@/components/product/parse-price-input";
import { searchPageHref } from "@/components/product/search-href";

// See app/(storefront)/categories/page.tsx — Prisma's @prisma/client/wasm
// can't load during next build's Node-based static prerendering.
export const dynamic = "force-dynamic";

/**
 * #501 — the title was a hardcoded `metadata = { title: "Search — Aheed Food
 * Centre" }`, which rendered that name under SriMart too. Same defect class
 * #239 spent a slice removing; derived from the vendor here exactly as
 * `categories/page.tsx` and the landing page already do.
 */
export async function generateMetadata() {
  const profile = await getCurrentVendorProfile();
  const name = profile?.name ?? "Aheed Food Centre";
  return { title: `Search — ${name}` };
}

const PAGE_SIZE = 12;

type SearchParams = {
  q?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: string;
  isHalal?: string;
  isFresh?: string;
  isOrganic?: string;
  featured?: string;
  cursor?: string;
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";

  const allCategories = await getCategoryRepository().listTopLevel();

  const products = getProductRepository();

  /*
   * #501 — BROWSE MODE. This page used to run its query inside `if (query)` and
   * gate the grid on `query &&`, so a bare `/search` returned 200 with an empty
   * content column. That made the shop page's only "View all" (a bare
   * `/search`, no `q`) a dead end, and the header's search box did the same
   * thing when submitted empty.
   *
   * The fix is confined to THIS page. `searchProducts`'s own empty-query guard
   * in `lib/repositories/products.ts` is untouched and `list()`/`search()`
   * remain two functions — #211's split is structural and still correct. What
   * changed is only what an empty box means HERE: browse everything, rather
   * than show nothing.
   */
  const options = {
    take: PAGE_SIZE,
    cursor: params.cursor,
    minPricePence: parsePriceInput(params.minPrice ?? ""),
    maxPricePence: parsePriceInput(params.maxPrice ?? ""),
    inStockOnly: params.inStock === "1",
    isHalal: params.isHalal === "1",
    isFresh: params.isFresh === "1",
    isOrganic: params.isOrganic === "1",
    // Only the exact value "1" enables it — an absent or any other value leaves
    // the filter off, so a stray `?featured=0` browses the full catalogue.
    isFeatured: params.featured === "1",
  };

  const result = query ? await products.search(query, options) : await products.list(options);
  const items = result.items;
  const nextCursor = result.nextCursor;

  const specialities = await products.availableSpecialities();
  // P8.5a (#345): request-memoised, shared with the header's cart read.
  const cartQuantities = await getRequestCartQuantities();

  const { CDN_BASE_URL } = getEnv();

  const heading = query ? `Results for “${query}”` : "All products";

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      {/* Departments: horizontal strip on top (arrow-scrolled). */}
      <DepartmentScroller categories={allCategories} activeSlug={null} />

      <div className="mt-6 flex flex-col gap-6 md:flex-row">
        {/* Search & filters: vertical sidebar on the left. */}
        <aside className="shrink-0 md:w-60">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary/60">
            Search &amp; filters
          </h2>
          <ProductFilterForm showQuery searchParams={params} specialities={specialities} />
        </aside>

        <div className="flex-1">
          <h1 className="mb-6 text-2xl font-semibold text-primary">{heading}</h1>

          {items.length === 0 ? (
            /*
             * #501 — without this, a search with no matches (or an over-narrow
             * price filter) still renders the same blank content column this
             * slice exists to remove, just reached by a different route.
             */
            <p className="text-primary/70">
              No products match. Try a different search or clear your filters.
            </p>
          ) : (
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
          )}

          {nextCursor && (
            <Link
              href={searchPageHref(params, nextCursor)}
              className="mt-6 inline-block rounded-full bg-action px-4 py-2 font-semibold text-white"
            >
              Next page
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
