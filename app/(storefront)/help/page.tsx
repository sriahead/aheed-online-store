import { Metadata } from "next";
import Link from "next/link";
import { requireVendorRole } from "@/lib/auth-rbac";
import { getCurrentVendorProfile } from "@/lib/vendor-service";
import { getVendorFaqRepository } from "@/lib/vendor-faqs-service";
import { getCategoryRepository } from "@/lib/categories-service";
import { PageContainer } from "@/components/layout/PageContainer";
import { DepartmentScroller } from "@/components/layout/DepartmentScroller";
import { HelpContactCard } from "@/components/assistant/HelpContactCard";
import { Icon } from "@/components/icons/Icon";
import { RoleJourneyMaps, type UserJourneyRole } from "@/components/help/RoleJourneyMaps";
import type { VendorProfile } from "@/lib/repositories/vendor";

function directionsHref(name: string, location: NonNullable<VendorProfile["location"]>): string {
  const parts = [
    name,
    location.addressLine1,
    location.addressLine2,
    location.city,
    location.postcode,
  ].filter((p): p is string => Boolean(p && p.trim()));
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(", "))}`;
}

export const metadata: Metadata = {
  title: "Help Centre",
};

/**
 * The shopper & multi-role Help Centre (#1013, #1012, #1385).
 *
 * Consistent storefront page layout:
 * - Top DepartmentScroller matching /categories, /search, /bundles
 * - PageContainer width="wide" padY="tight"
 * - Breadcrumb navigation
 * - Reassuring hero with quick navigation chips
 * - Two-column responsive layout (Trust/Direct Contact sidebar + Guides/FAQs)
 * - Interactive role journey maps with delivery anchor (#1385)
 * - Vendor FAQs from /staff/faqs (#1012)
 * - Contact support card (#1052)
 */
export default async function HelpPage() {
  const [auth, profile, faqs, departments] = await Promise.all([
    requireVendorRole("STAFF", "ADMIN"),
    getCurrentVendorProfile(),
    getVendorFaqRepository().listActive(),
    getCategoryRepository().listTopLevel(),
  ]);
  const isStaff = auth.ok;

  let detectedRole: UserJourneyRole = "customer";
  if (auth.ok) {
    if (auth.via === "platform-admin") {
      detectedRole = "platform-admin";
    } else if (auth.via === "ADMIN") {
      detectedRole = "store-admin";
    } else if (auth.via === "STAFF") {
      detectedRole = "staff";
    }
  }

  const vendorName = profile?.name ?? "Store";
  const locality = profile?.localityName ?? null;
  const phone = profile?.contactPhone ?? null;
  const directions =
    profile?.location && profile.name ? directionsHref(profile.name, profile.location) : null;
  const storeLocation = profile?.location
    ? [
        profile.location.addressLine1,
        profile.location.addressLine2,
        profile.location.city,
        profile.location.postcode,
      ]
        .filter(Boolean)
        .join(", ")
    : null;

  return (
    <PageContainer width="wide" padY="tight">
      {/* Departments strip at top: visual layout consistency with browsing pages */}
      <DepartmentScroller categories={departments} activeSlug={null} use3D />

      {/* Breadcrumb Navigation */}
      <nav
        aria-label="Breadcrumb"
        className="mt-4 mb-6 flex items-center gap-1.5 text-xs text-primary-muted"
      >
        <Link href="/" className="hover:text-primary transition-colors flex items-center gap-1">
          <Icon name="house" className="w-3.5 h-3.5" />
          <span>Home</span>
        </Link>
        <Icon name="chevron-right" className="w-3 h-3 text-primary-muted" />
        <span className="font-semibold text-primary" aria-current="page">
          Help Centre
        </span>
      </nav>

      {/* Reassuring Hero Banner */}
      <header className="rounded-2xl bg-white border border-black/10 p-6 sm:p-8 shadow-xs">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-action-tint text-action font-semibold text-xs mb-3">
            <Icon name="shield-check" className="w-4 h-4" />
            <span>Customer Support &amp; Store Guide</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl lg:text-4xl">
            How can we help you today?
          </h1>
          <p className="mt-2 text-sm sm:text-base text-primary-muted leading-relaxed">
            Everything you need to know about shopping, local delivery
            {locality ? ` across ${locality}` : ""}, click &amp; collect, order tracking, and
            platform features.
          </p>
        </div>

        {/* Quick jump navigation chips */}
        <div className="mt-6 flex flex-wrap items-center gap-2 pt-4 border-t border-black/10 text-xs font-medium">
          <span className="text-primary-muted font-semibold uppercase tracking-wider text-[11px] mr-1">
            Jump to:
          </span>
          <a
            href="#delivery"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-black/15 bg-surface-muted hover:bg-white hover:border-black/30 transition-colors text-primary"
          >
            <Icon name="truck" className="w-3.5 h-3.5 text-action" />
            <span>Delivery &amp; Collection</span>
          </a>
          {faqs.length > 0 && (
            <a
              href="#faqs"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-black/15 bg-surface-muted hover:bg-white hover:border-black/30 transition-colors text-primary"
            >
              <Icon name="circle-question-mark" className="w-3.5 h-3.5 text-action" />
              <span>Questions &amp; Answers</span>
            </a>
          )}
          <a
            href="#journeys"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-black/15 bg-surface-muted hover:bg-white hover:border-black/30 transition-colors text-primary"
          >
            <Icon name="store" className="w-3.5 h-3.5 text-action" />
            <span>Platform User Journeys</span>
          </a>
          {profile && (
            <a
              href="#contact"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-black/15 bg-surface-muted hover:bg-white hover:border-black/30 transition-colors text-primary"
            >
              <Icon name="phone" className="w-3.5 h-3.5 text-action" />
              <span>Contact Support</span>
            </a>
          )}
        </div>
      </header>

      {/* Two-Column Responsive Layout matching Catalogue & Search */}
      <div className="mt-8 flex flex-col gap-8 lg:flex-row">
        {/* Left Sidebar: Store Trust & Direct Contact Column */}
        <aside className="lg:w-80 lg:shrink-0 space-y-6">
          {/* Store Location & Direct Contact Card */}
          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-xs space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-action-tint text-action">
                <Icon name="store" className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-primary">{vendorName}</h3>
                {locality && <p className="text-xs text-primary-muted">{locality} Storefront</p>}
              </div>
            </div>

            <div className="space-y-3 text-xs text-primary-muted border-t border-black/10 pt-4">
              {storeLocation && (
                <div className="flex items-start gap-2.5">
                  <Icon name="map-pin" className="h-4 w-4 shrink-0 text-action mt-0.5" />
                  <div>
                    <span className="font-semibold text-primary block">Store Location</span>
                    <p className="mt-0.5 leading-relaxed">{storeLocation}</p>
                    {directions && (
                      <a
                        href={directions}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-action font-semibold mt-1 hover:underline"
                      >
                        <span>Get directions</span>
                        <Icon name="chevron-right" className="w-3 h-3 text-action" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {phone && (
                <div className="flex items-start gap-2.5 pt-2 border-t border-black/5">
                  <Icon name="phone" className="h-4 w-4 shrink-0 text-action mt-0.5" />
                  <div>
                    <span className="font-semibold text-primary block">Customer Service</span>
                    <a
                      href={`tel:${phone.replace(/\s+/g, "")}`}
                      className="mt-0.5 block font-medium hover:text-primary transition-colors"
                    >
                      {phone}
                    </a>
                  </div>
                </div>
              )}

              {profile?.openingHoursNote ? (
                <div className="flex items-start gap-2.5 pt-2 border-t border-black/5">
                  <Icon name="clock" className="h-4 w-4 shrink-0 text-action mt-0.5" />
                  <div>
                    <span className="font-semibold text-primary block">Opening Hours</span>
                    <p className="mt-0.5">{profile.openingHoursNote}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 pt-2 border-t border-black/5">
                  <Icon name="clock" className="h-4 w-4 shrink-0 text-action mt-0.5" />
                  <div>
                    <span className="font-semibold text-primary block">Store Support</span>
                    <p className="mt-0.5">Customer service available during business hours</p>
                  </div>
                </div>
              )}
            </div>

            {/* Quality & Service Trust Pillars */}
            <div className="rounded-xl bg-surface-muted p-4 space-y-2.5 border border-black/5 text-xs">
              <div className="flex items-center gap-2 font-semibold text-primary">
                <Icon name="shield-check" className="w-4 h-4 text-action" />
                <span>Quality &amp; Service Guarantee</span>
              </div>
              <ul className="space-y-1.5 text-primary-muted text-[11px] list-disc list-inside">
                {profile?.showHalalLabel && <li>Authentic Halal certified sourcing</li>}
                <li>Temperature-controlled local delivery</li>
                <li>Safe, reliable doorstep drop-off</li>
              </ul>
            </div>
          </div>

          {/* Quick Shortcuts Card */}
          <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-xs space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-primary-muted">
              Quick Shortcuts
            </h4>
            <div className="flex flex-col gap-1 text-xs">
              <Link
                href="/categories"
                className="flex items-center justify-between rounded-lg px-3 py-2 text-primary font-medium hover:bg-surface-muted transition-colors"
              >
                <span>Browse Departments</span>
                <Icon name="chevron-right" className="w-3.5 h-3.5 text-primary-muted" />
              </Link>
              <Link
                href="/bundles"
                className="flex items-center justify-between rounded-lg px-3 py-2 text-primary font-medium hover:bg-surface-muted transition-colors"
              >
                <span>Value Bundles</span>
                <Icon name="chevron-right" className="w-3.5 h-3.5 text-primary-muted" />
              </Link>
              <Link
                href="/orders/lookup"
                className="flex items-center justify-between rounded-lg px-3 py-2 text-primary font-medium hover:bg-surface-muted transition-colors"
              >
                <span>Track Your Order</span>
                <Icon name="chevron-right" className="w-3.5 h-3.5 text-primary-muted" />
              </Link>
              <Link
                href="/contact"
                className="flex items-center justify-between rounded-lg px-3 py-2 text-primary font-medium hover:bg-surface-muted transition-colors"
              >
                <span>Send a Message or Complaint</span>
                <Icon name="chevron-right" className="w-3.5 h-3.5 text-primary-muted" />
              </Link>
            </div>
          </div>
        </aside>

        {/* Right Main Area */}
        <div className="flex-1 min-w-0 space-y-10">
          {/* #1385 — Interactive role-based user journey maps with delivery anchor */}
          <div id="delivery" className="scroll-mt-24">
            <div id="journeys">
              <RoleJourneyMaps detectedRole={detectedRole} />
            </div>
          </div>

          {/* #1012 — FAQs: the vendor's own answers */}
          {faqs.length > 0 && (
            <section id="faqs" className="scroll-mt-24 space-y-4">
              <div className="flex items-center gap-3">
                <Icon name="circle-question-mark" className="w-5 h-5 text-action" />
                <h2 className="text-xl sm:text-2xl font-bold text-primary">
                  Frequently Asked Questions
                </h2>
              </div>
              <dl className="grid grid-cols-1 gap-4">
                {faqs.map((faq) => (
                  <div
                    key={faq.id}
                    className="rounded-2xl border border-black/10 bg-white p-6 shadow-xs"
                  >
                    <dt className="text-base font-bold text-primary">{faq.question}</dt>
                    <dd className="mt-2.5 whitespace-pre-line text-sm text-primary-muted leading-relaxed">
                      {faq.answer}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* Staff Resources (if authenticated staff) */}
          {isStaff && (
            <section className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Icon name="shield-alert" className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-primary">Internal Staff Resources</h2>
                  <p className="mt-1 text-sm text-black/70">
                    You are authenticated as store staff. The operational runbook and administrative
                    tools are available in the Staff Panel.
                  </p>
                  <div className="mt-4 rounded-xl border border-primary/10 bg-white p-4">
                    <h3 className="mb-2 text-sm font-bold">How to access the Staff Panel:</h3>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-black/70">
                      <li>
                        Click the <strong>View Switcher</strong> in the top right of the header
                        (currently says &quot;Shopper View&quot;).
                      </li>
                      <li>
                        Select <strong>Staff View</strong> (or Admin View if available).
                      </li>
                      <li>
                        Use the navigation tabs to access Orders, Live Inventory, and the{" "}
                        <Link
                          href="/staff/runbook"
                          className="font-bold text-primary hover:underline"
                        >
                          Operational Runbook
                        </Link>
                        .
                      </li>
                    </ol>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* #1052 — Direct Help Contact Card */}
          {profile && (
            <div id="contact" className="scroll-mt-24">
              <HelpContactCard
                vendorName={profile.name}
                whatsappNumber={profile.whatsappNumber}
                assistantAvailable={profile.assistantEnabled && profile.whatsappNumber !== null}
              />
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
