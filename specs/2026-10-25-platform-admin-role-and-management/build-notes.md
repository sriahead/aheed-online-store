# Build Notes — Platform Admin Role & Platform-Wide Management Suite

## What changed and why

1. **Authentication & Authorization (`lib/auth-rbac.ts`):**
   - Added canonical `requirePlatformAdmin()` function that guarantees `session.user.role === "ADMIN"`.
   - Returns typed `PlatformAdminRbacResult` (`{ ok: true, user }` or `{ ok: false, status: 401 | 403, reason: "unauthenticated" | "forbidden" }`).
   - Store admins holding `VendorMembership(role: "ADMIN")` with `User.role === "CUSTOMER"` are strictly refused server-side with 403 Forbidden on all platform actions.

2. **Repository Purity & Data Layer (`lib/repositories/platform-admin.ts` & `lib/platform-admin-service.ts`):**
   - Implemented pure repository `lib/repositories/platform-admin.ts` with zero request context imports (`next/headers`, `next/navigation`, `cookies`), accepting an explicit injected `prisma` client.
   - Provided `listPlatformVendors`, `listPlatformDomains`, `getPlatformOverviewMetrics`, and `getPlatformHealthSummary`.
   - Created service facade `lib/platform-admin-service.ts` wrapping repository operations with `getPrisma()` to satisfy architectural UI separation.

3. **Navigation Architecture (`components/staff/platform-nav-items.ts`, `components/staff/PanelNav.tsx`, `app/(admin)/layout.tsx`):**
   - Structured platform navigation items in `components/staff/platform-nav-items.ts`.
   - Updated `PanelNav.tsx` to accept `isPlatformAdmin` and render a dedicated "Platform" trigger and dropdown alongside vendor-scoped operational groups.
   - Updated `app/(admin)/layout.tsx` to compute `isPlatformAdmin={auth.ok && auth.via === "platform-admin"}`.
   - Maintained all nav parity invariants in `tests/staff-nav-parity.test.ts`.

4. **Platform Hub & Dedicated Management Pages (`app/(admin)/staff/platform/...`):**
   - Updated `app/(admin)/staff/page.tsx` to render a prominent "Platform Administration" section linking to platform destinations when `auth.via === "platform-admin"`.
   - `/staff/platform/vendors`: Multi-vendor directory showing operational status, primary domain, catalogue counts, and team sizes.
   - `/staff/platform/domains`: Central hostname routing registry showing all mapped domains, canonical flags, and store associations.
   - `/staff/platform/onboarding`: Executive launch readiness roll-up across all platform tenants.
   - `/staff/platform/settings`: Platform technical architecture, runtime constraints, and external integration dependencies.
   - `/staff/platform/health`: Real-time database latency diagnostics and error logging summary.
   - Registered all pages with `width: "wide"` in `tests/page-container.test.ts`.

5. **Storefront Configuration Dashboard Alignment (`lib/vendor-readiness-service.ts` & `components/staff/OnboardingReadinessDashboard.tsx`):**
   - Tagged each configurable setting with its responsible role: `VENDOR_OPERATOR` vs `PLATFORM_ADMIN`.
   - Added responsibility breakdown counters (`vendorRequiredCount`, `vendorConfiguredCount`, `platformRequiredCount`, `platformConfiguredCount`).
   - Updated the dashboard UI to display role badges, responsibility progress cards, and role filter tabs.

6. **Operator Documentation & Verification:**
   - Authored all 7 required sections for each new platform page in `docs/platform-admin-guide/platform-admin-guide.md`, passing `tests/operator-doc-coverage.test.ts`.
   - Added comprehensive unit tests in `tests/platform-admin-rbac.test.ts` and `tests/platform-admin-repository.test.ts`.
   - Updated `tests/storefront-onboarding-readiness.test.ts` to assert owner segregation and breakdown counters.

## Decisions taken during the build

- **Zero Database Migration:** Confirmed that `prisma/schema.prisma` already provides `User.role === "ADMIN"` and `VendorMembership.role === "ADMIN"`. Using existing relational models preserved complete data integrity and zero schema churn.
- **Pure Repository Layering:** Followed ADR-004 and the repository purity pattern by placing all platform database queries in `lib/repositories/platform-admin.ts` with explicit client injection and zero Next.js request context imports, verified by automated purity tests.
- **Strict Server-Side Defense:** In addition to UI conditional rendering, every platform page enforces `requireVendorRole("ADMIN")` and rejects requests where `auth.via !== "platform-admin"` with `<PanelRefusal title="Platform admin only" />`.
- **Planned Items Edit Links:** Maintained `editHref: null` on planned roadmap items (`outgoing_email_service`, `live_stripe_keys`, `external_apex_dns`) to reflect that planned infrastructure features do not yet have interactive forms, avoiding false configuration deep links.

## Deviations from the spec

None. All requirements R1–R20 in `specs/2026-10-25-platform-admin-role-and-management/requirements.md` and verification criteria in `validation.md` were implemented and verified.

## Known-shaky areas

None. All 184 tests across unit, integration, parity, container, purity, and documentation coverage suites pass cleanly with zero lint and typecheck errors.
