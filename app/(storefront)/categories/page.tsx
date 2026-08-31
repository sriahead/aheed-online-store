import { getCategoryRepository } from "@/lib/categories-service";
import { getProductRepository } from "@/lib/products-service";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { getRequestCartQuantities } from "@/lib/cart-summary";
import { getEnv } from "@/lib/config";
import { DepartmentScroller } from "@/components/layout/DepartmentScroller";
import { ProductRow } from "@/components/product/ProductRow";
import { BundleRow } from "@/components/bundle/BundleRow";
import { getBundlesForStorefront } from "@/lib/bundles-service";

// Without this, Next's build-time static optimization tries to prerender this
// page in plain Node — but lib/db.ts loads Prisma via @prisma/client/wasm,
// which only works in the Workers runtime, so `next build` hard-fails trying
// to run it. Same root cause as P1b's /login and /register fix.
export const dynamic = "force-dynamic";

/**
 * P8.5f: was a bare `<ul>` of department links; it is now the SHOP page, holding
 * what the landing page gave up — the department scroller and the New Arrivals /
 * Featured Products rows. The landing page keeps only its hero and trust strip,
 * so this is the first stop for anyone actually browsing.
 *
 * The title was previously a hardcoded `metadata` export reading "Categories —
 * Aheed Food Centre", which rendered under SriMart too. Same defect class #239
 * spent a slice removing, so it is now derived from the vendor like the landing
 * page's own `generateMetadata`.
 */
export async function generateMetadata() {
  const profile = await getCurrentVendorProfile();
  const name = profile?.name ?? "Aheed Food Centre";
  return { title: `Shop — ${name}` };
}

export default async function CategoriesPage() {
  const productsRepo = getProductRepository();
  const [categories, newArrivalsPage, featuredPage, bundles] = await Promise.all([
    getCategoryRepository().listTopLevel(),
    productsRepo.list({ take: 4 }), // recent products
    productsRepo.list({ take: 4, isFeatured: true }), // vendor-curated featured products
    // P8.5c (#347): one nested query for every bundle and its constituents —
    // adding a fourth bundle adds no query.
    getBundlesForStorefront(),
  ]);
  // P8.5a (#345): request-memoised, shared with the header's cart read — the
  // cards need it to render the cart-aware stepper rather than a plain add.
  const cartQuantities = await getRequestCartQuantities();
  const { CDN_BASE_URL } = getEnv();

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 space-y-8">
      <section className="bg-white rounded-2xl border border-black/10 p-5 shadow-sm">
        <h1 className="mb-4 text-xl font-bold text-primary">Shop by department</h1>
        <DepartmentScroller categories={categories} />
      </section>

      {/* P8.5c (#347): after the departments, before the product rows — the
          shop page's merchandising slot. The landing page stays as P8.5f left
          it: hero and trust strip only. */}
      <BundleRow title="Value Bundles" bundles={bundles} cdnBaseUrl={CDN_BASE_URL ?? ""} />

      <ProductRow
        title="New Arrivals"
        products={newArrivalsPage.items}
        cdnBaseUrl={CDN_BASE_URL ?? ""}
        viewAllLink="/search"
        cartQuantities={cartQuantities}
      />
      <ProductRow
        title="Featured Products"
        products={featuredPage.items}
        cdnBaseUrl={CDN_BASE_URL ?? ""}
        cartQuantities={cartQuantities}
      />
    </main>
  );
}
