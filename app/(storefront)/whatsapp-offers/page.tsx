import Link from "next/link";
import { headers } from "next/headers";
import { buildOffersMetadata } from "@/lib/page-metadata";
import { getCategoryRepository } from "@/lib/categories-service";
import { getProductRepository } from "@/lib/products-service";
import { getBundlesForStorefront } from "@/lib/bundles-service";
import { getCampaignsForHero } from "@/lib/campaigns-service";
import { isCampaignLive } from "@/lib/campaign-liveness";
import { hasAvailableItems } from "@/lib/bundle-pricing";
import { getRequestCartQuantities } from "@/lib/cart-summary";
import { getRequestFavouriteState } from "@/lib/favourites-summary";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { getEnv } from "@/lib/config";
import { composePublicUrl } from "@/lib/storage";
import { DEFAULT_PRODUCT_GRID_DENSITY, type ProductGridDensity } from "@/lib/product-grid-density";
import { groupOfferProductsByDepartment, type DepartmentOfferGroup } from "@/lib/whatsapp-offers";
import type { CategorySummary } from "@/lib/repositories/categories";
import type { BundleWithItems } from "@/lib/repositories/bundles";
import type { CampaignRow } from "@/lib/repositories/campaigns";
import type { FavouriteState } from "@/lib/favourites";
import { PageContainer } from "@/components/layout/PageContainer";
import { DepartmentScroller } from "@/components/layout/DepartmentScroller";
import { WhatsappCommunityBanner } from "@/components/layout/WhatsappCommunityBanner";
import { CollectionNav } from "@/components/product/CollectionNav";
import { ProductGrid } from "@/components/product/ProductGrid";
import { ProductCard } from "@/components/product/ProductCard";
import { BundleRow } from "@/components/bundle/BundleRow";
import { Icon } from "@/components/icons/Icon";
import { WhatsappGlyph } from "@/components/layout/contact-channel-icons";

// See app/(storefront)/categories/page.tsx — Prisma's @prisma/client/wasm
// can't load during next build's Node-based static prerendering.
export const dynamic = "force-dynamic";

const CAMPAIGN_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatCampaignValidity(startsAt: Date | null, endsAt: Date | null): string | null {
  if (startsAt && endsAt) {
    return `Valid ${CAMPAIGN_DATE_FORMAT.format(startsAt)} – ${CAMPAIGN_DATE_FORMAT.format(endsAt)}`;
  }
  if (endsAt) {
    return `Valid until ${CAMPAIGN_DATE_FORMAT.format(endsAt)}`;
  }
  if (startsAt) {
    return `From ${CAMPAIGN_DATE_FORMAT.format(startsAt)}`;
  }
  return null;
}

export async function generateMetadata() {
  try {
    const host = (await headers()).get("host");
    const profile = await getCurrentVendorProfile();
    if (!host || !profile) return {};

    return buildOffersMetadata({ host, vendorName: profile.name });
  } catch {
    return {};
  }
}

export interface LiveDepartmentCampaign {
  department: CategorySummary;
  campaign: CampaignRow;
}

export interface WhatsappOffersViewProps {
  vendorName: string;
  whatsappCommunityUrl: string | null;
  qrImageUrl: string | null;
  departments: CategorySummary[];
  liveCampaigns: LiveDepartmentCampaign[];
  bundles: BundleWithItems[];
  offerGroups: DepartmentOfferGroup[];
  gridDensity: ProductGridDensity;
  cdnBaseUrl: string;
  cartQuantities: ReadonlyMap<string, number>;
  favouriteState: (productId: string) => FavouriteState;
}

/**
 * Pure presentational view for `/whatsapp-offers` (#1233), exported so `tests/whatsapp-offers.test.tsx`
 * can verify multi-tenant banner visibility (`#239`), QR code rendering, department grouping, and
 * the empty state without needing a live request or database.
 */
export function WhatsappOffersView({
  vendorName,
  whatsappCommunityUrl,
  qrImageUrl,
  departments,
  liveCampaigns,
  bundles,
  offerGroups,
  gridDensity,
  cdnBaseUrl,
  cartQuantities,
  favouriteState,
}: WhatsappOffersViewProps) {
  const renderableBundles = bundles.filter((b) => hasAvailableItems(b.items));
  const hasAnyOffers =
    liveCampaigns.length > 0 || renderableBundles.length > 0 || offerGroups.length > 0;

  return (
    <PageContainer width="wide" padY="tight">
      <DepartmentScroller categories={departments} activeSlug={null} use3D />

      <div className="mt-6 flex flex-col gap-6 md:flex-row">
        <div className="md:w-60 md:shrink-0">
          <CollectionNav activeHref="/whatsapp-offers" />
        </div>

        <div className="flex-1 space-y-10">
          {/* Top WhatsApp Promotions Banner — rendered only when the vendor has configured a
              community group link (#239 null-hides rule). */}
          <WhatsappCommunityBanner
            vendorName={vendorName}
            whatsappCommunityUrl={whatsappCommunityUrl}
            qrImageUrl={qrImageUrl}
            headingAs="h1"
          />

          {/* All Offers Section */}
          <section aria-labelledby="latest-offers-heading" className="space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 pb-4">
              <div>
                {whatsappCommunityUrl ? (
                  <h2 id="latest-offers-heading" className="text-2xl font-bold text-primary">
                    Latest Offers &amp; Deals
                  </h2>
                ) : (
                  <h1 id="latest-offers-heading" className="text-2xl font-bold text-primary">
                    Latest Offers &amp; Deals
                  </h1>
                )}
                <p className="mt-1 text-sm text-primary-muted">
                  Verified price drops, multi-buy deals, and value bundles available right now at{" "}
                  {vendorName}.
                </p>
              </div>
              <Link
                href="/categories"
                className="inline-flex min-h-tap items-center gap-1.5 text-sm font-semibold text-action hover:underline lg:min-h-0"
              >
                <span>Browse all departments</span>
                <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
            </div>

            {!hasAnyOffers ? (
              <div className="rounded-3xl border border-black/10 bg-white p-8 text-center shadow-sm sm:p-12">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-action-tint text-primary">
                  <Icon name="tag" className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-primary">
                  New promotions are on the way
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-primary-muted">
                  {whatsappCommunityUrl
                    ? `There are no active offers right now. Join the ${vendorName} WhatsApp group to be the first to hear when our next deals go live.`
                    : `There are no active offers right now. Check back soon or browse our departments for the full catalogue.`}
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  {whatsappCommunityUrl && (
                    <a
                      href={whatsappCommunityUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-tap items-center justify-center gap-2 rounded-2xl bg-action px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-action-hover"
                    >
                      <WhatsappGlyph className="h-4 w-4" />
                      <span>Join Our WhatsApp Group</span>
                    </a>
                  )}
                  <Link
                    href="/categories"
                    className="inline-flex min-h-tap items-center justify-center gap-2 rounded-2xl border border-black/10 bg-surface-muted px-5 py-2.5 text-sm font-bold text-primary transition hover:bg-black/5"
                  >
                    <Icon name="store" className="h-4 w-4" />
                    <span>Shop all departments</span>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-10">
                {/* Live Department Campaigns (with validity dates when present) */}
                {liveCampaigns.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-primary">Special Promotions</h3>
                    <div className="flex flex-wrap gap-4">
                      {liveCampaigns.map(({ department, campaign }) => {
                        const validity = formatCampaignValidity(campaign.startsAt, campaign.endsAt);
                        const href = campaign.linkUrl ?? `/categories/${department.slug}`;
                        return (
                          <div
                            key={campaign.id}
                            className="flex min-w-[280px] flex-1 flex-col justify-between rounded-2xl border border-black/10 bg-white p-5 shadow-sm"
                          >
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1 rounded-full bg-action-tint px-2.5 py-0.5 text-xs font-bold text-primary">
                                  <Icon name="tag" className="h-3 w-3" />
                                  {department.name}
                                </span>
                                {validity && (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-muted">
                                    <Icon name="calendar-clock" className="h-3.5 w-3.5" />
                                    {validity}
                                  </span>
                                )}
                              </div>
                              <h4 className="text-base font-bold text-primary">
                                {campaign.headline}
                              </h4>
                              {campaign.subtitle && (
                                <p className="text-sm text-primary-muted">{campaign.subtitle}</p>
                              )}
                            </div>

                            <div className="mt-4 pt-2">
                              <Link
                                href={href}
                                className="inline-flex min-h-tap items-center gap-1.5 rounded-xl bg-action px-4 py-2 text-xs font-bold text-white transition hover:bg-action-hover lg:min-h-0"
                              >
                                <span>Shop Now</span>
                                <Icon name="arrow-right" className="h-3.5 w-3.5" />
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Active Value Bundles */}
                <BundleRow
                  title="Value Bundles"
                  bundles={bundles}
                  cdnBaseUrl={cdnBaseUrl}
                  viewAllLink="/bundles"
                />

                {/* Offer Products Grouped by Real Vendor Department */}
                {offerGroups.map(({ department, products }) => (
                  <div key={department.id} className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xl font-bold text-primary">{department.name}</h3>
                      <Link
                        href={`/categories/${department.slug}`}
                        className="inline-flex min-h-tap items-center gap-1.5 rounded-xl bg-surface-muted px-3.5 py-1.5 text-xs font-bold text-primary transition hover:bg-black/5 lg:min-h-0"
                      >
                        <span>Shop Now</span>
                        <Icon name="arrow-right" className="h-3.5 w-3.5" />
                      </Link>
                    </div>

                    <ProductGrid as="ul" density={gridDensity}>
                      {products.map((product) => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          cdnBaseUrl={cdnBaseUrl}
                          cartQuantity={cartQuantities.get(product.id) ?? 0}
                          favouriteState={favouriteState(product.id)}
                        />
                      ))}
                    </ProductGrid>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </PageContainer>
  );
}

export default async function WhatsappOffersPage() {
  const [profile, categoryTree, offerItems, bundles, cartQuantities, favouriteState] =
    await Promise.all([
      getCurrentVendorProfile(),
      getCategoryRepository().listTree(),
      getProductRepository().listOfferProducts(100),
      getBundlesForStorefront(),
      getRequestCartQuantities(),
      getRequestFavouriteState(),
    ]);

  const departments = categoryTree.filter((c) => c.parentId === null);
  const campaignsByCategory = await getCampaignsForHero(departments.map((d) => d.id));
  const now = new Date();
  const liveCampaigns: LiveDepartmentCampaign[] = [];
  for (const department of departments) {
    const campaign = campaignsByCategory.get(department.id);
    if (campaign && isCampaignLive(campaign, now)) {
      liveCampaigns.push({ department, campaign });
    }
  }

  const offerGroups = groupOfferProductsByDepartment(offerItems, categoryTree);
  const { CDN_BASE_URL } = getEnv();
  const qrImageUrl =
    profile?.whatsappCommunityQrKey && CDN_BASE_URL
      ? composePublicUrl(CDN_BASE_URL, profile.whatsappCommunityQrKey)
      : null;

  return WhatsappOffersView({
    vendorName: profile?.name ?? "",
    whatsappCommunityUrl: profile?.whatsappCommunityUrl ?? null,
    qrImageUrl,
    departments,
    liveCampaigns,
    bundles,
    offerGroups,
    gridDensity: profile?.productGridDensity ?? DEFAULT_PRODUCT_GRID_DENSITY,
    cdnBaseUrl: CDN_BASE_URL ?? "",
    cartQuantities,
    favouriteState,
  });
}
