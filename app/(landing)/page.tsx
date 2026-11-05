import Link from "next/link";
import { getCategoryRepository } from "@/lib/categories-service";
import { getEnv } from "@/lib/config";
import { PromotionHero } from "@/components/layout/PromotionHero";
import { DepartmentScroller } from "@/components/layout/DepartmentScroller";
import { formatPrice } from "@/components/product/format-price";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { getShopperDeliveryRules } from "@/lib/delivery-pricing-service";
import { getLivePromotionsForStorefront } from "@/lib/promotions-service";
import {
  CustomerFeedbackCards,
  ReviewLinkGroup,
} from "@/components/storefront/CustomerFeedbackCards";
import { getCustomerFeedbackRepository } from "@/lib/customer-feedback-service";
import { getVendorReviewLinkRepository } from "@/lib/vendor-review-links-service";
import { PageContainer } from "@/components/layout/PageContainer";
import { Icon } from "@/components/icons/Icon";
import { IconMedallion } from "@/components/icons/IconMedallion";

/** How many approved cards the stack holds. Beyond this the fan is unreadable anyway. */
const FEEDBACK_CARD_LIMIT = 12;

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const profile = await getCurrentVendorProfile();
  const name = profile?.name ?? "Aheed Food Centre";
  return { title: profile?.tagline ? `${name} — ${profile.tagline}` : name };
}

/**
 * P8.5f: the landing page is now hero-first. The department scroller and the New
 * Arrivals / Featured Products rows moved to `/categories`, which this slice
 * rebuilt as the shop page, and the postcode checker moved into the header. What
 * remains is the one thing this page is FOR: the vendor's hero and the three
 * platform-true trust claims.
 */
export default async function HomePage() {
  const [categories, profile, livePromotions] = await Promise.all([
    getCategoryRepository().listTopLevel(),
    getCurrentVendorProfile(),
    getLivePromotionsForStorefront(),
  ]);

  // P9.2 (#818) — three reads from this vendor's own database, in parallel with each other.
  // No external call is on this path: the feedback is first-party and the review links are
  // outbound URLs, not fetched content.
  const feedbackRepo = getCustomerFeedbackRepository();
  const [approvedFeedback, feedbackSummary, reviewLinks] = await Promise.all([
    feedbackRepo.listApproved(FEEDBACK_CARD_LIMIT),
    feedbackRepo.approvedSummary(),
    getVendorReviewLinkRepository().listActive(),
  ]);

  const { CDN_BASE_URL } = getEnv();
  const localityName = profile?.localityName ?? "";
  const vendorName = profile?.name ?? "Welcome";
  // P7.5c+f (#239): the hero used to state "Free Delivery Over £30" to every
  // vendor. Aheed's threshold IS £30, so the literal was accidentally true for
  // the vendor it was written for and wrong for SriMart, whose threshold is
  // £50 — the string was hiding a data bug, not just a copy one. Both badges
  // now read the vendor's own config and disappear when the rule doesn't apply.
  // #890: resolved for this shopper's own delivery area (the `delivery-postcode` cookie), so a
  // district that charges differently never sees the store-wide claim. A threshold of 0 means free
  // delivery is not offered there, so it hides the badge exactly as null does.
  const deliveryRules = await getShopperDeliveryRules(profile, "DELIVERY");
  const freeDeliveryThresholdPence =
    deliveryRules.freeDeliveryThresholdPence && deliveryRules.freeDeliveryThresholdPence > 0
      ? deliveryRules.freeDeliveryThresholdPence
      : null;
  const minimumOrderPence = deliveryRules.minimumOrderPence;

  return (
    <PageContainer width="wide" padY="tight" className="space-y-8">
      {/* Hero Brand & Banner */}
      <section className="relative rounded-3xl bg-primary text-white p-6 md:p-10 overflow-hidden shadow-xl border border-black/10">
        {/* Background glow placeholder */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />

        {/* Two columns once this vendor has live promotions to show; a single
            column when they don't, so the hero never renders an empty well or fallback icons. */}
        <div
          className={`relative z-10 gap-8 ${livePromotions.length > 0 ? "lg:grid lg:grid-cols-2 lg:items-stretch" : ""}`}
        >
          <div className="max-w-2xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 bg-black/25 border border-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm backdrop-blur-sm">
                <IconMedallion icon3d="delivery-van" size={24} className="-my-1" decorative />
                <span>
                  {profile?.offerCollection
                    ? `Local Delivery across ${localityName} & Click & Collect`
                    : `Local Delivery across ${localityName}`}
                </span>
              </div>
              <div className="inline-flex items-center gap-2 bg-black/25 border border-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm backdrop-blur-sm">
                <IconMedallion icon3d="halal-certified" size={24} className="-my-1" decorative />
                <span>100% Certified HMC Halal</span>
              </div>
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
                <span className="flex items-center gap-1.5 bg-black/20 px-2.5 py-1 rounded-lg">
                  <IconMedallion
                    icon3d="delivery-van"
                    size={16}
                    decorative
                    className="-my-0.5 shrink-0"
                  />
                  <span>Free delivery over {formatPrice(freeDeliveryThresholdPence)}</span>
                </span>
              )}
              {minimumOrderPence > 0 && (
                <span className="flex items-center gap-1.5 bg-black/20 px-2.5 py-1 rounded-lg">
                  <IconMedallion
                    icon3d="secure-checkout"
                    size={16}
                    decorative
                    className="-my-0.5 shrink-0"
                  />
                  {/* #1083 — "delivery": collection has its own minimum, often none. */}
                  <span>{formatPrice(minimumOrderPence)} minimum delivery order</span>
                </span>
              )}
            </div>

            {/* P8.5f: the postcode checker that used to sit here now lives in
                the header (components/layout/PostcodeChecker.tsx), where its
                answer is carried in a cookie and survives navigation instead of
                vanishing with the `?postcode=` query string. */}
          </div>

          {/* Promotion Hero (#1412): renders only genuine active promotions within
              their date window. When 0 promotions are live, no second column renders,
              omitting fallback department glyphs and regular-price spotlights. */}
          {livePromotions.length > 0 && (
            <div className="mt-8 lg:mt-0 lg:h-full">
              <PromotionHero promotions={livePromotions} cdnBaseUrl={CDN_BASE_URL ?? null} />
            </div>
          )}
        </div>
      </section>

      {/* Shop by department — category product photography showcase */}
      {categories.length > 0 && (
        <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-primary">Shop by department</h2>
            <Link
              href="/categories"
              prefetch={false}
              className="text-xs font-semibold text-action hover:underline"
            >
              View all ({categories.length}) &rarr;
            </Link>
          </div>
          <DepartmentScroller categories={categories} use3D />
        </section>
      )}

      {/* Trust Values Strip — P7.5c+f (#239) & 3D Icon upgrade (#1245). */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="group bg-white p-4 rounded-2xl border border-black/10 flex items-center gap-3.5 shadow-sm hover:shadow-md transition-shadow">
          <div className="shrink-0 group-hover:scale-105 motion-reduce:group-hover:scale-100 transition-transform">
            <IconMedallion icon3d="delivery-van" size={48} tint="action" decorative />
            <span className="hidden">
              <Icon name="trust-delivery" tone="primary" />
            </span>
          </div>
          <div>
            <h4 className="font-bold text-xs text-black/90 uppercase tracking-wide">
              {profile?.offerCollection ? "Delivery & Collection" : "Local Delivery"}
            </h4>
            <p className="text-[11px] text-black/60 leading-tight">
              {profile?.offerCollection
                ? `Delivered across ${localityName} or pick up in-store`
                : `Delivered across ${localityName}`}
            </p>
          </div>
        </div>

        <div className="group bg-white p-4 rounded-2xl border border-black/10 flex items-center gap-3.5 shadow-sm hover:shadow-md transition-shadow">
          <div className="shrink-0 group-hover:scale-105 motion-reduce:group-hover:scale-100 transition-transform">
            <IconMedallion icon3d="secure-checkout" size={48} tint="accent" decorative />
            <span className="hidden">
              <Icon name="trust-payment" tone="accent" />
            </span>
          </div>
          <div>
            <h4 className="font-bold text-xs text-black/90 uppercase tracking-wide">
              Secure Checkout
            </h4>
            <p className="text-[11px] text-black/60 leading-tight">Card payments by Stripe</p>
          </div>
        </div>

        <div className="group bg-white p-4 rounded-2xl border border-black/10 flex items-center gap-3.5 shadow-sm hover:shadow-md transition-shadow">
          <div className="shrink-0 group-hover:scale-105 motion-reduce:group-hover:scale-100 transition-transform">
            <IconMedallion icon3d="order-updates" size={48} tint="danger" decorative />
            <span className="hidden">
              <Icon name="trust-updates" tone="danger" />
            </span>
          </div>
          <div>
            <h4 className="font-bold text-xs text-black/90 uppercase tracking-wide">
              Order Updates
            </h4>
            <p className="text-[11px] text-black/60 leading-tight">Status changes by email</p>
          </div>
        </div>
      </section>

      {/* P9.2 (#818) — first-party customer feedback, below the fold.
          Both parts render independently: the cards disappear entirely when nothing is
          approved (#239's null-hides rule), while the outbound review links stay, because
          at launch there is no feedback yet and the links are the only social proof there
          is. Nothing here is fetched from Google, Trustpilot or any other platform. */}
      <CustomerFeedbackCards
        feedback={approvedFeedback}
        summary={feedbackSummary}
        reviewLinks={reviewLinks}
      />
      {/* No approved feedback: the cards section renders nothing at all (R36 — an empty
          frame reads as broken), but the outbound links are NOT part of that section and
          still render. Discovery of /feedback in this state is the account area's link,
          which is sufficient because only a signed-in customer can submit in the first
          place. */}
      {approvedFeedback.length === 0 && <ReviewLinkGroup reviewLinks={reviewLinks} />}
    </PageContainer>
  );
}
