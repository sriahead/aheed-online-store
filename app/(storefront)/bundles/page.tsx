import { getBundlesForStorefront } from "@/lib/bundles-service";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { getEnv } from "@/lib/config";
import { BundleCard } from "@/components/bundle/BundleCard";
import { hasAvailableItems } from "@/lib/bundle-pricing";

// See app/(storefront)/categories/page.tsx — Prisma's @prisma/client/wasm
// can't load during next build's Node-based static prerendering.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const profile = await getCurrentVendorProfile();
  const name = profile?.name ?? "Aheed Food Centre";
  return { title: `Value Bundles — ${name}` };
}

/**
 * #501 — the destination for the shop page's Value Bundles "View all", which
 * had nowhere to point because no bundles route existed.
 *
 * IT LISTS THE SAME SET THE ROW DOES, and that is expected rather than a
 * defect: `listActiveBundles` (`lib/repositories/bundles.ts`) takes no `take`
 * and no cursor, so `BundleRow` on `/categories` already renders every active
 * bundle for the vendor. The page earns its place as somewhere for the bundle
 * count to grow into and as an addressable destination; if that count ever
 * outgrows a screen, paginating it is a change to the repository function, not
 * to this file.
 *
 * `hasAvailableItems` is applied here for the same reason `BundleRow` applies
 * it — a bundle whose every constituent is unavailable renders nowhere rather
 * than as an empty card with a zero total. Sharing the one predicate is what
 * stops the page and the row disagreeing about which bundles exist.
 *
 * `BundleCard` stays a non-navigable card: there is still no bundle detail page
 * (#498), so this is a listing whose cards add to the cart, not a gateway.
 */
export default async function BundlesPage() {
  const bundles = await getBundlesForStorefront();
  const renderable = bundles.filter((bundle) => hasAvailableItems(bundle.items));
  const { CDN_BASE_URL } = getEnv();

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-primary">Value Bundles</h1>
      <p className="mt-1 text-sm text-primary/70">
        Curated sets, added to your basket in a single tap.
      </p>

      {renderable.length === 0 ? (
        <p className="mt-6 text-primary/70">No bundles are available right now.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {renderable.map((bundle) => (
            <BundleCard
              key={bundle.id}
              id={bundle.id}
              name={bundle.name}
              tagline={bundle.tagline}
              imageKey={bundle.imageKey}
              altText={bundle.altText}
              items={bundle.items}
              cdnBaseUrl={CDN_BASE_URL ?? ""}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
