---
id: storefront-configuration-dashboard-plan
title: "Storefront Configuration Dashboard and Vendor Onboarding Readiness (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-25
visibility: internal
summary: "Plan for issue #1267: in-app Storefront Configuration Dashboard at /staff/onboarding and categorized onboarding audit benchmarked against aheedfoodcentre.nocaped.com, featuring live completion tracking, validation rules, deep links, and readiness status."
tags: [onboarding, dashboard, storefront, admin-panel, readiness, p11]
related: [client-onboarding-prerequisites, adr-004-multi-tenancy, adr-007-storefront-scope-restrictions-stock-states]
---

# Storefront Configuration Dashboard and Vendor Onboarding Readiness (plan)

Issue [#1267](https://github.com/sriahead/aheed-online-store/issues/1267). Approved by the owner on 2026-10-25.

**Goal:** Deliver an in-app **Storefront Configuration Dashboard** under the staff admin panel (`/staff/onboarding`) benchmarked against `https://aheedfoodcentre.nocaped.com/`, providing store owners and operators with live completion tracking, validation rules, deep configuration links, and an overall readiness status for launching new vendors.

## Narrative & Scope

The platform is multi-tenant ([ADR-004](file:///E:/GitRepositories/aheed-online-store/docs/developer-portal/client-onboarding-prerequisites.md#L27-L40)). When onboarding a new vendor (e.g. Aheed Superstore), settings span identity, branding, dietary flags, fulfilment rules, delivery postcodes, trading hours, legal company information, and ADR-007 stock controls.

While individual management screens exist (`/staff/storefront`, `/staff/delivery-areas`, `/staff/fulfilment`, `/staff/assistant`, `/staff/products/import`), there is currently no unified view that:
1. Audits whether all required fields for a trading storefront are populated.
2. Benchmarks a new tenant against the canonical reference store (`https://aheedfoodcentre.nocaped.com/`).
3. Tracks progress toward launch readiness with completion percentages.
4. Clearly segregates implemented in-app settings from upstream/planned infrastructure tasks (such as Cloudflare Email Sending [#1217](https://github.com/sriahead/aheed-online-store/issues/1217) or live Stripe keys [#113](https://github.com/sriahead/aheed-online-store/issues/113)).

### Key Components

1. **Readiness Evaluation Service (`lib/vendor-readiness-service.ts`):**
   - Pure server-side read model that fetches the current vendor's live database configuration (`Vendor`, `VendorBranding`, `VendorConfig`, `VendorLocation`, `VendorDeliveryArea`, `VendorWeeklyHours`, `VendorPaymentBadge`, `VendorReviewLink`, `VendorDomain`, `Product` count, `Category` count).
   - Computes status for 8 audited categories:
     - *Store Identity & Chrome* (name, tagline, logo, mark, locality, search placeholder, banner)
     - *Visual Theme & Brand Primitives* (8 brand colors, AA contrast check)
     - *Storefront Copy & Badges* (hero subtitle, store description, dietary & cert toggles, density)
     - *Fulfilment & Delivery* (delivery fee, minimum orders, postcode areas, slots, express collection)
     - *Footer, Location & Legal* (address, phone, email, company number, VAT number, hours, payment badges)
     - *Customer Communication* (WhatsApp number & QR, marketing consent, AI assistant, review links)
     - *Catalogue & ADR-007 Inventory* (stock file upload, hidden default, UNKNOWN stock, restriction audit)
     - *Platform Infrastructure* (domain mapping, staff accounts, email provider, Stripe keys)
   - Assigns each setting a state: `CONFIGURED`, `MISSING`, `OPTIONAL`, or `PLANNED`.
   - Derives overall readiness: `LAUNCH_READY` (100% of required implemented settings present), `NEEDS_ATTENTION` (core identity present, but missing delivery/hours/legal), or `IN_PROGRESS` (initial setup).

2. **In-App Staff Page (`app/(admin)/staff/onboarding/page.tsx`):**
   - Protected with `requireVendorRole("ADMIN")` and `<PanelRefusal />`.
   - Uses `<PageContainer width="standard">`.
   - Renders `<OnboardingReadinessDashboard />` showing the scorecard, category breakdown, item checklist, and deep links to edit each setting.

3. **Navigation Integration (`components/staff/nav-items.ts`):**
   - Registered under the `store-setup` group with `tier: "admin"`, label `"Onboarding Readiness"`, and icon `"clipboard-list"`.

4. **Documentation Parity:**
   - Documented in `docs/store-admin-guide/admin-tabs-guide.md` with all 7 required operator sections.

## Deliberately Excluded

- **Inline Editing Form Duplication:** The dashboard audits and deep-links to the authoritative screens; it does not duplicate the form controls of `/staff/storefront`, `/staff/delivery-areas`, etc.
- **Modifications to Production Data:** Read-only audit; zero database writes during dashboard evaluation.
- **Automated Domain or DNS Provisioning:** Does not touch Cloudflare API or DNS records.

## Open Items Carried Forward

- Issue `#1217`: Provider-agnostic outgoing email (Cloudflare Email Sending).
- Issue `#113`: Live Stripe payments gateway activation.
