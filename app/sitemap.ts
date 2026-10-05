import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getCurrentVendorIdOrNull } from "@/lib/tenant";
import { getProductRepository } from "@/lib/products-service";
import { getCategoryRepository } from "@/lib/categories-service";

/**
 * Per-vendor sitemap (#955).
 *
 * WHAT THIS REPLACED. This route returned a single URL — `/` — under a comment saying it "grows as
 * real routes (catalogue, etc.) land in P1+". It never did, through every catalogue slice. So a
 * crawler could reach the homepage and the category pages and nothing below them, while `#830`'s
 * plan asserted the product route stayed "accessible for deep links, SEO, direct sharing, and
 * sitemap crawling". The sitemap half of that was never true.
 *
 * EVERY URL IS BUILT ON THE REQUESTING HOST, which is what makes this multi-tenant (ADR-004). The
 * old code carried `?? "aheedfoodcentre.nocaped.com"` as its fallback, so a request arriving with
 * no `Host` header would have published Aheed's URLs in any vendor's sitemap. There is now no
 * hostname literal in this file at all, and `tests/vendor-neutral-copy.test.ts` scans it
 * explicitly — it could not before, because that guard's glob is `app/**\/*.tsx` and this is a
 * `.ts` file, which is precisely how `app/robots.ts` carried a hardcoded vendor host for months
 * with the guard green.
 *
 * READING `headers()` IS LOAD-BEARING, NOT INCIDENTAL. Next treats a sitemap as a Route Handler
 * that is cached by default unless it uses a request-time API. Without the header read this route
 * would be evaluated once at build time and serve one vendor's URL list to every host — the
 * multi-tenancy defect above, reintroduced in a form no local check would show. Do not remove it,
 * and do not add a `revalidate` that would reinstate caching.
 *
 * NO `lastModified` ANYWHERE, DELIBERATELY. `Product` carries `createdAt` and no `updatedAt`
 * (`prisma/schema.prisma`), and `Category` carries neither, so there is no truthful last-modified
 * date for a product or a category; `createdAt` would assert a false one after every edit. The
 * field is optional in the sitemap protocol, and an omitted value is better than a wrong one. The
 * previous code's `lastModified: new Date()` on `/` is gone for the same reason: it claimed the
 * homepage had changed at the instant of each fetch. Publishing trustworthy values would need a
 * schema change, which is out of this slice's scope.
 */

/**
 * Public, crawlable paths that are not a product or a category.
 *
 * Deliberately minimal and deliberately NOT derived from the route tree: most of
 * `app/(storefront)` is a signed-in surface, a transactional step or an auth page, and a sitemap
 * that listed them would invite crawlers into pages that cannot be usefully indexed. `/search` is
 * excluded because its content is a query parameter; `/shop-your-list` and `/feedback` are
 * defensible future additions and are left out of a first honest sitemap rather than guessed at.
 */
const STATIC_PATHS = ["/", "/categories", "/bundles", "/help", "/privacy", "/terms"] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Request-time: see the note above. Also what resolves the vendor, via getCurrentVendorIdOrNull.
  const host = (await headers()).get("host");
  const vendorId = await getCurrentVendorIdOrNull();

  /**
   * A host that resolves to no vendor gets a well-formed but EMPTY sitemap, rather than a guess.
   * `app/(storefront)/layout.tsx` redirects such a host to `/coming-soon`, so there is genuinely
   * nothing there to crawl, and naming a vendor's pages here would be the hostname-literal bug in
   * another place.
   */
  if (!host || !vendorId) return [];

  const base = `https://${host}`;

  /**
   * Read through the request-scoped SERVICE facades, not `getPrisma()` directly: an ESLint
   * `no-restricted-imports` rule forbids `@/lib/db` in the app layer, because a repository is
   * what enforces `vendorId` scoping (ADR-004 slice 2). `listTree()` is also memoised per
   * request, so sharing it with any other reader on the same request costs one query, not two.
   *
   * `getCurrentVendorIdOrNull()` above is still what decides whether to answer at all — the
   * facades resolve the vendor themselves and THROW on an unresolvable host, which is the wrong
   * shape for a sitemap that should degrade to an empty document.
   */
  const [productSlugs, categories] = await Promise.all([
    getProductRepository().listActiveSlugs(),
    // Reused rather than adding a second categories read: `listTree()` already returns every
    // ACTIVE category for the vendor, both tiers (#681).
    getCategoryRepository().listTree(),
  ]);

  return [
    ...STATIC_PATHS.map((path) => ({ url: `${base}${path}` })),
    ...categories.map((category) => ({ url: `${base}/categories/${category.slug}` })),
    ...productSlugs.map((slug) => ({ url: `${base}/products/${slug}` })),
  ];
}
