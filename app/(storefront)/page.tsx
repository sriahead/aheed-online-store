import { MapPin, Sparkles, Truck, ShieldCheck, CreditCard, BellRing } from "lucide-react";
import { getCategoryRepository } from "@/lib/categories-service";
import { getProductRepository } from "@/lib/products-service";
import { getEnv } from "@/lib/config";
import { DepartmentScroller } from "@/components/layout/DepartmentScroller";
import { DepartmentHero } from "@/components/layout/DepartmentHero";
import { ProductRow } from "@/components/product/ProductRow";
import { formatPrice } from "@/components/product/format-price";
import { isDeliverable } from "@/lib/delivery";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { getRequestCartQuantities } from "@/lib/cart-summary";
import { getCampaignsForHero } from "@/lib/campaigns-service";
import { isCampaignLive } from "@/lib/campaign-liveness";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const profile = await getCurrentVendorProfile();
  const name = profile?.name ?? "Aheed Food Centre";
  return { title: profile?.tagline ? `${name} — ${profile.tagline}` : name };
}

type SearchParams = { postcode?: string };

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { postcode } = await searchParams;
  const productsRepo = getProductRepository();
  const [categories, profile, newArrivalsPage, featuredPage] = await Promise.all([
    getCategoryRepository().listTopLevel(),
    getCurrentVendorProfile(),
    productsRepo.list({ take: 4 }), // recent products
    productsRepo.list({ take: 4, isFeatured: true }), // vendor-curated featured products
  ]);
  // P8.5a (#345): request-memoised, shared with the header's cart read.
  const cartQuantities = await getRequestCartQuantities();
  // P8.5b (#346): one query for every department's headline product, not one
  // per department. Depends on `categories`, so it cannot join the Promise.all
  // above.
  const spotlights = await productsRepo.categorySpotlights(categories.map((c) => c.id));
  // P8.5e (#356): campaigns are read alongside spotlights, keyed the same way.
  // Liveness is decided HERE, once, so DepartmentHero never has to re-derive it
  // from isActive/startsAt/endsAt.
  const campaigns = await getCampaignsForHero(categories.map((c) => c.id));
  const now = new Date();
  const heroDepartments = categories.map((category) => {
    const campaign = campaigns.get(category.id);
    return {
      id: category.id,
      slug: category.slug,
      name: category.name,
      // `Category` has no image column yet (#279 / P8.5b's plan.md); the hero
      // renders each department's icon until one exists.
      imageKey: null,
      spotlight: spotlights.get(category.id) ?? null,
      campaign:
        campaign && isCampaignLive(campaign, now)
          ? {
              headline: campaign.headline,
              subtitle: campaign.subtitle,
              imageKey: campaign.imageKey,
              altText: campaign.altText,
              linkUrl: campaign.linkUrl,
            }
          : null,
    };
  });
  const { CDN_BASE_URL } = getEnv();
  const localityName = profile?.localityName ?? "";
  const vendorName = profile?.name ?? "Welcome";
  const prefixes = profile?.deliveryPrefixes ?? [];
  const trimmedPostcode = postcode?.trim() ?? "";
  const deliverable = trimmedPostcode ? isDeliverable(trimmedPostcode, prefixes) : null;
  // P7.5c+f (#239): the hero used to state "Free Delivery Over £30" to every
  // vendor. Aheed's threshold IS £30, so the literal was accidentally true for
  // the vendor it was written for and wrong for SriMart, whose threshold is
  // £50 — the string was hiding a data bug, not just a copy one. Both badges
  // now read the vendor's own config and disappear when the rule doesn't apply.
  const freeDeliveryThresholdPence = profile?.freeDeliveryThresholdPence ?? null;
  const minimumOrderPence = profile?.minimumOrderPence ?? 0;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 space-y-8">
      {/* Hero Brand & Banner */}
      <section className="relative rounded-3xl bg-primary text-white p-6 md:p-10 overflow-hidden shadow-xl border border-black/10">
        {/* Background glow placeholder */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />

        {/* Two columns once this vendor has departments to show; a single
            column when they don't, so the hero never renders an empty well. */}
        <div
          className={`relative z-10 gap-8 ${heroDepartments.length > 0 ? "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-center" : ""}`}
        >
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-1.5 bg-black/20 border border-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              Local Delivery across {localityName}
            </div>

            {/* The ONE slot that keeps a fallback rather than hiding: this is the
              page's h1, and an empty h1 is an accessibility defect. The old
              fallback was Aheed's own copy ("Fresh Produce, Halal Meat &
              Cultural Staples."), so a vendor with no tagline advertised
              another's trade; the vendor's name is neutral and always true. */}
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
              {profile?.tagline ?? vendorName}
            </h1>

            {/* #239: this paragraph was a hardcoded grocery claim. A vendor with
              no heroSubtitle renders nothing here rather than borrowing
              another's voice. */}
            {profile?.heroSubtitle && (
              <p className="text-white/80 text-sm md:text-base font-normal leading-relaxed">
                {profile.heroSubtitle}
              </p>
            )}

            {/* Two badges, both DERIVED. The halal badge and a "Same-Day Local
              Dispatch" promise were removed rather than made per-vendor: the
              first belongs in bannerNote, and the second is a service claim no
              data in this system backs, for any vendor. */}
            <div className="pt-2 flex flex-wrap gap-3 text-xs font-medium text-white/90">
              {freeDeliveryThresholdPence !== null && (
                <span className="flex items-center gap-1 bg-black/20 px-2.5 py-1 rounded-lg">
                  <Truck className="w-3.5 h-3.5 text-amber-300" /> Free delivery over{" "}
                  {formatPrice(freeDeliveryThresholdPence)}
                </span>
              )}
              {minimumOrderPence > 0 && (
                <span className="flex items-center gap-1 bg-black/20 px-2.5 py-1 rounded-lg">
                  <ShieldCheck className="w-3.5 h-3.5 text-action-tint" />{" "}
                  {formatPrice(minimumOrderPence)} minimum order
                </span>
              )}
            </div>

            <div className="pt-4">
              <form method="GET" className="flex flex-wrap items-center gap-3">
                <div className="relative flex items-center">
                  <MapPin className="absolute left-3 w-4 h-4 text-black/40" />
                  <input
                    type="text"
                    name="postcode"
                    defaultValue={trimmedPostcode}
                    placeholder={prefixes.length ? `e.g. ${prefixes[0]}1 1AA` : "Enter postcode"}
                    className="w-48 pl-9 pr-4 py-2.5 rounded-l-xl text-black font-semibold text-sm focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="bg-accent text-white px-5 py-2.5 font-bold text-sm rounded-r-xl transition-colors hover:opacity-90"
                  >
                    Check Area
                  </button>
                </div>
                {deliverable !== null && (
                  <p
                    className={`text-sm font-semibold px-2 py-1 rounded ${deliverable ? "bg-action text-white" : "bg-danger text-white"}`}
                  >
                    {deliverable
                      ? `✓ We deliver to ${trimmedPostcode.toUpperCase()}`
                      : `✗ Sorry, ${localityName} ${prefixes.join("/")} only`}
                  </p>
                )}
              </form>
            </div>
          </div>

          {/* P8.5b (#346): the hero's second column. This slot has now held
              three things. A hardcoded unsplash photo, removed in #231 for
              failing P7a's CSP and for rendering identically for every vendor.
              Then this vendor's VendorPromotion rows as a carousel (#233) —
              which never had a staff UI, so the rows stayed seed-only and no
              vendor could ever edit a campaign. Now the departments themselves,
              generated from real categories and real product prices, so the
              panel cannot advertise something the catalogue does not have.
              VendorPromotion is deleted in this slice; see the spec for why
              "superseded" rather than "unused" is the accurate reason. */}
          {heroDepartments.length > 0 && (
            <div className="mt-8 lg:mt-0">
              <DepartmentHero departments={heroDepartments} cdnBaseUrl={CDN_BASE_URL ?? null} />
            </div>
          )}
        </div>
      </section>

      {/* Trust Values Strip — P7.5c+f (#239).

          Was four tiles of Aheed marketing ("Freshness / Every day, fresh
          produce", "Halal Quality / Certified fresh meats", "Community Trust /
          Serving local families") rendered for every vendor. They are now three
          claims that are TRUE OF THE PLATFORM for any vendor and checkable
          against this repo: delivery to the vendor's own locality, Stripe card
          payment (lib/payments.ts) and order-status email (lib/email.ts). None
          of them names a trade. */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="group bg-white p-4 rounded-2xl border border-black/10 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-action-tint text-primary flex items-center justify-center font-bold shrink-0 group-hover:scale-110 transition-transform">
            <Truck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-black/90 uppercase tracking-wide">
              Local Delivery
            </h4>
            <p className="text-[11px] text-black/50 leading-tight">
              Delivered across {localityName}
            </p>
          </div>
        </div>

        <div className="group bg-white p-4 rounded-2xl border border-black/10 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-accent-tint text-accent flex items-center justify-center font-bold shrink-0 group-hover:scale-110 transition-transform">
            <CreditCard className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-black/90 uppercase tracking-wide">
              Secure Checkout
            </h4>
            <p className="text-[11px] text-black/50 leading-tight">Card payments by Stripe</p>
          </div>
        </div>

        <div className="group bg-white p-4 rounded-2xl border border-black/10 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-10 h-10 rounded-xl bg-danger-tint text-danger flex items-center justify-center font-bold shrink-0 group-hover:scale-110 transition-transform">
            <BellRing className="w-5 h-5 text-danger" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-black/90 uppercase tracking-wide">
              Order Updates
            </h4>
            <p className="text-[11px] text-black/50 leading-tight">Status changes by email</p>
          </div>
        </div>
      </section>

      {/* Store Categories Nav */}
      <section className="bg-white rounded-2xl border border-black/10 p-5 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-primary">Shop by department</h2>
        <DepartmentScroller categories={categories} />
      </section>

      {/* Product Discovery Rows */}
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
