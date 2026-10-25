# Storefront Configuration Dashboard and Vendor Onboarding Readiness (build notes)

Written at the end of Build, before the Clear.

## What changed and why

**`lib/repositories/vendor-readiness.ts` (new) — pure database extraction for readiness audit.**
Fetches all tenant-scoped profile, branding, operational hours, delivery rules, catalogue statistics, payment badges, and social link records in parallel without loading heavy product catalogs. Adheres to `tests/repository-purity.test.ts` (zero Next.js request context imports) and `tests/repository-client-injection.test.ts` (accepts injected `prisma: ReturnType<typeof getPrisma>` and `vendorId`).

**`lib/vendor-readiness-service.ts` (new) — pure evaluation engine and benchmark comparator.**
Evaluates 8 vendor configuration categories against the canonical baseline (`https://aheedfoodcentre.nocaped.com/`):
1. Profile & Identity (Name, Legal Name, Description, Phone, Email, Address, Registration, VAT)
2. Storefront Branding (Primary, Secondary, Accent, Dark colors, Hero Banner, Favicon, Logo)
3. Delivery & Fulfillment (Minimum order, Free delivery threshold, Delivery fee, Click & Collect, Delivery areas/postcodes)
4. Operating & Order Hours (Weekly trading hours across all 7 days)
5. Catalogue & Inventory (Active categories count, active products count, in-stock products count)
6. Payment Methods & Badges (Stripe enabled, accepted payment badges)
7. Customer Communication & Social (Support phone, email, WhatsApp, Instagram, Facebook, TikTok)
8. Infrastructure & Compliance (Custom domain, Terms of Service, Privacy Policy, Planned Cloudflare Email, Planned Stripe live keys, External Apex DNS)

Categorizes every item as either `CONFIGURED`, `ACTION_REQUIRED` (missing), or `PLANNED` (external system dependencies). Computes an overall completion score (%) and overall launch status:
- `LAUNCH_READY` (100% of implemented required settings configured)
- `NEEDS_ATTENTION` (Under 50% configured)
- `IN_PROGRESS` (50% to 99% configured)

**`components/staff/OnboardingReadinessDashboard.tsx` (new) — staff client dashboard component.**
Provides a visual interface showing the benchmark reference vendor, overall launch readiness badge, progress meter, category filter buttons (All, Action Required, Configured, Planned / External), summary metric cards with progress bars, and an itemized audit table with deep links to respective `/staff/*` configuration panels.

**`app/(admin)/staff/onboarding/page.tsx` (new) — staff dashboard route.**
Protected by `requireVendorRole("ADMIN")` with `<PanelRefusal />` for non-admin accounts. Wrapped in `<PageContainer width="standard">` adhering to layout constraints.

**`components/staff/nav-items.ts` — registered onboarding dashboard.**
Added `/staff/onboarding` entry under the `store-setup` navigation group with `tier: "admin"`, label `"Onboarding Readiness"`, icon `"clipboard-list"`, and `tone: "action"`.

**`docs/store-admin-guide/admin-tabs-guide.md` & `tests/operator-doc-coverage.test.ts` — documentation parity.**
Added the required 7-section operator documentation for `/staff/onboarding` ensuring operator doc coverage tests pass completely.

**`tests/page-container.test.ts` — container layout declaration.**
Registered `app/(admin)/staff/onboarding/page.tsx` with standard width and default vertical padding.

**`tests/storefront-onboarding-readiness.test.ts` (new) — unit tests.**
Added 6 comprehensive unit tests validating empty vendor profiles, fully-configured canonical profiles, category weights, threshold calculations, deep link generation, and separation of planned features from in-app completion metrics.

## Decisions taken during the build

- **Pure Evaluation Split:** Separated database row retrieval (`lib/repositories/vendor-readiness.ts`) from evaluation logic (`lib/vendor-readiness-service.ts`) to enable rapid and exhaustive unit testing of all readiness states without database roundtrips.
- **Planned vs Implemented Segregation:** Planned features (such as Cloudflare Email Sending #1217, Live Stripe Keys #113, and External Apex DNS) are distinctly flagged and excluded from the in-app completion percentage denominator so that vendors are not blocked from reaching `LAUNCH_READY` on settings they can control in-app.
- **Admin Tier Access:** Restricted the onboarding readiness tab strictly to `ADMIN` roles (`requireVendorRole("ADMIN")` and `tier: "admin"`) because sensitive compliance and legal details (VAT, company registration, Stripe status) are displayed.

## Deviations from the spec

None. The implementation follows `specs/2026-10-25-storefront-configuration-dashboard/plan.md` and `requirements.md` directly.

## Known-shaky areas

- **Payment Badges schema:** The database stores `PaymentBadgeMethod` enum values on `VendorPaymentBadge`. If new payment badges are introduced in the future, `evaluateVendorReadinessData` checks for at least one configured badge to mark the requirement satisfied.
- **External Stripe Account Connect:** Stripe live key status currently inspects `vendorConfig.stripeAccountId`. When Stripe Connect onboarding flows are added in Phase P11+, the readiness evaluator may expand to check account capabilities status via webhook or API.
