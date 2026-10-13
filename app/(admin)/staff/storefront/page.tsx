import { redirect } from "next/navigation";
import { requireVendorRole } from "@/lib/auth-rbac";
import {
  fetchVendorProfile,
  getVendorConfig,
  getVendorBranding,
  listThemes,
  listVendorThemes,
} from "@/lib/vendor-service";
import { StorefrontConfigForm } from "@/components/staff/StorefrontConfigForm";
import { PanelRefusal } from "@/components/staff/PanelRefusal";
import { ReviewLinksManager } from "@/components/staff/ReviewLinksManager";
import { FooterSettingsForms } from "@/components/staff/FooterSettingsForms";
import { getVendorReviewLinkRepository } from "@/lib/vendor-review-links-service";
import { getStorage } from "@/lib/storage";
import { markFileKeys } from "@/lib/vendor-mark";
import { calendarDayInZone } from "@/lib/local-datetime";

export const dynamic = "force-dynamic";

export default async function StorefrontAdminPage() {
  const auth = await requireVendorRole("ADMIN");
  if (!auth.ok) {
    // Never `return null` here: app/(admin)/layout.tsx renders the portal shell
    // around whatever this returns, so a bare null serves 200 with the header,
    // the nav and an empty page — indistinguishable from a loading state rather
    // than a refusal. Every other /staff/* page uses PanelRefusal (CLAUDE.md).
    if (auth.status === 401) redirect("/login");
    return (
      <PanelRefusal
        title="Store admins only"
        message="You're signed in, but your account doesn't have permission to manage this store's storefront."
      />
    );
  }

  const config = await getVendorConfig(auth.vendorId);
  const branding = await getVendorBranding(auth.vendorId);
  const { getVendorLocation } = await import("@/lib/vendor-service");
  const location = await getVendorLocation(auth.vendorId);
  const themes = await listThemes();
  const vendorThemes = await listVendorThemes(auth.vendorId);
  const reviewLinks = await getVendorReviewLinkRepository().listAll();
  // #1055 — the footer's hours and badges come back on the profile, already ordered.
  const profile = await fetchVendorProfile(auth.vendorId);
  const today = calendarDayInZone(new Date());

  if (!config || !branding) {
    return <div className="p-8">Vendor config or branding not found.</div>;
  }

  const logoUrl = branding.logoStorageKey ? getStorage().publicUrl(branding.logoStorageKey) : null;
  // #1069 — the mark's 192px PNG, for the uploader's preview.
  const markKeys = branding.markStorageKey ? markFileKeys(branding.markStorageKey) : null;
  const markUrl = markKeys ? getStorage().publicUrl(markKeys.icon192) : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-extrabold text-black">Storefront Branding</h1>
      <StorefrontConfigForm
        initialConfig={config}
        initialBranding={branding}
        initialLocation={location}
        themes={themes}
        vendorThemes={vendorThemes}
        logoUrl={logoUrl}
        markUrl={markUrl}
      />

      {/* #1055 — the storefront footer's contact, legal, hours and payment-badge settings. */}
      <div className="mt-10 border-t border-black/10 pt-8">
        <FooterSettingsForms
          initial={{
            contactPhone: config.contactPhone,
            contactEmail: config.contactEmail,
            companyNumber: config.companyNumber,
            vatNumber: config.vatNumber,
            registeredOffice: config.registeredOffice,
            openingHoursNote: config.openingHoursNote,
            showSecureCheckoutNote: config.showSecureCheckoutNote,
            weeklyHours: profile.weeklyHours,
            paymentBadges: profile.paymentBadges,
            // #1060 — the store's calendar day; earlier overrides are pruned on the next save.
            upcomingOverrides: profile.hoursOverrides.filter((o) => o.date >= today),
            today,
          }}
        />
      </div>

      {/* P9.2 (#818) — outbound review-site links. Here rather than on /staff/feedback
          because these are storefront settings, which keeps that page purely moderation. */}
      <div className="mt-10 border-t border-black/10 pt-8">
        <ReviewLinksManager links={reviewLinks} />
      </div>
    </main>
  );
}
