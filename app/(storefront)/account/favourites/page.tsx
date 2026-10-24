import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getEnv } from "@/lib/config";
import { getFavouritesRepository } from "@/lib/favourites-service";
import { FAVOURITES_EMPTY_MESSAGE } from "@/lib/favourites";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { getRequestCartQuantities } from "@/lib/cart-summary";
import { PageContainer } from "@/components/layout/PageContainer";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductGrid } from "@/components/product/ProductGrid";
import { DEFAULT_PRODUCT_GRID_DENSITY } from "@/lib/product-grid-density";
import { Icon } from "@/components/icons/Icon";

/**
 * Favourites (#232).
 *
 * Reads the session and the shopper's own rows — must render per-request, same as
 * `/account/lists` and `/account/orders`. `force-dynamic` is also what keeps `@prisma/client/wasm`
 * out of `next build`'s Node-based static prerendering, which cannot load it.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your favourites" };

export default async function AccountFavouritesPage() {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  // Favourites are authenticated-only, so the id is the session's — not resolved a second time.
  const [products, cartQuantities, profile] = await Promise.all([
    getFavouritesRepository().listProducts(session.user.id),
    getRequestCartQuantities(),
    getCurrentVendorProfile(),
  ]);
  const { CDN_BASE_URL } = getEnv();
  const gridDensity = profile?.productGridDensity ?? DEFAULT_PRODUCT_GRID_DENSITY;

  return (
    <PageContainer width="wide">
      <Link
        href="/account"
        className="mb-4 inline-flex items-center gap-1 text-sm text-primary-muted hover:text-primary"
      >
        <Icon name="chevron-left" className="h-4 w-4" />
        Your account
      </Link>

      <h1 className="text-xl font-bold text-primary">Your favourites</h1>

      {products.length === 0 ? (
        /* The empty state is reachable with rows still in the table: a favourited product that has
           since been deactivated or moved into a hidden department is dropped by
           `listProductsByIds` rather than rendered as a gap. Reconciling those rows is out of scope
           (see the slice's plan.md, and the open #1139). */
        <p className="mt-6 text-sm text-primary-muted">{FAVOURITES_EMPTY_MESSAGE}</p>
      ) : (
        /* `as="div"` (the default), not `as="ul"`: that variant exists for bundles, whose
           `BundleCard` renders its own `<li>`. `ProductCard` renders a `<div>`, so this matches
           `/categories/[slug]` and `/search`. */
        <ProductGrid density={gridDensity}>
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              cdnBaseUrl={CDN_BASE_URL ?? ""}
              cartQuantity={cartQuantities.get(product.id) ?? 0}
              /* Every product on this page is favourited by definition, so the state is a constant
                 rather than another lookup — tapping a heart here un-favourites it. */
              favouriteState="on"
            />
          ))}
        </ProductGrid>
      )}
    </PageContainer>
  );
}
