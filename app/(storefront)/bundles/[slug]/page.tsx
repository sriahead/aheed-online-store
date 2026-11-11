import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveBundleBySlugForStorefront } from "@/lib/bundles-service";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { getEnv } from "@/lib/config";
import { BundleCard } from "@/components/bundle/BundleCard";
import { hasAvailableItems } from "@/lib/bundle-pricing";
import { PageContainer } from "@/components/layout/PageContainer";

// Same reason as /bundles: Prisma's wasm client cannot load during static prerendering.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [bundle, profile] = await Promise.all([
    getActiveBundleBySlugForStorefront(slug),
    getCurrentVendorProfile(),
  ]);
  if (!bundle) return { title: "Offer not found" };
  return { title: profile?.name ? `${bundle.name} — ${profile.name}` : bundle.name };
}

/**
 * #1517 — one bundle's own page: where a promotion banner's "Buy This Offer" lands, and where a
 * bundle card's name links. The card is the same `BundleCard` the listing uses, so the price shown
 * (tier-aware, `lib/bundle-pricing.ts`) and the one-click "Buy this offer" form are identical.
 *
 * An unknown, inactive or other-vendor slug, or a bundle with nothing currently buyable, is a 404 —
 * the same "renders nowhere rather than as an empty card" rule `/bundles` applies.
 */
export default async function BundlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bundle = await getActiveBundleBySlugForStorefront(slug);
  if (!bundle || !hasAvailableItems(bundle.items)) notFound();
  const { CDN_BASE_URL } = getEnv();

  return (
    <PageContainer width="narrow">
      <nav aria-label="Breadcrumb" className="text-sm text-primary-muted">
        <Link href="/bundles" className="hover:underline">
          Value Bundles
        </Link>
      </nav>
      <h1 className="mt-2 text-2xl font-semibold text-primary">{bundle.name}</h1>
      {bundle.tagline ? <p className="mt-1 text-sm text-primary-muted">{bundle.tagline}</p> : null}
      <ul className="mt-6">
        <BundleCard
          id={bundle.id}
          slug={bundle.slug}
          linkToPage={false}
          name={bundle.name}
          tagline={null}
          imageKey={bundle.imageKey}
          altText={bundle.altText}
          items={bundle.items}
          cdnBaseUrl={CDN_BASE_URL ?? ""}
        />
      </ul>
    </PageContainer>
  );
}
