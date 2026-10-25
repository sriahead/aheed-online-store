# Platform Admin role and platform-wide management suite (requirements)

Specifications for issue #1269.

## Requirements

### Authorization & RBAC
- **R1:** `lib/auth-rbac.ts` exports `requirePlatformAdmin()` returning `{ ok: true, user: { id, email, name, role: "ADMIN" } }` when `session.user.role === "ADMIN"`.
- **R2:** `requirePlatformAdmin()` returns `{ ok: false, status: 401, reason: "unauthenticated" }` for unauthenticated sessions, and `{ ok: false, status: 403, reason: "forbidden" }` for any session whose `User.role !== "ADMIN"`.
- **R3:** Store admins (`VendorMembership(role: "ADMIN")` with `User.role === "CUSTOMER"`) are refused with 403 Forbidden on all platform management routes and server actions.
- **R4:** Platform admins retain full transversal authority across vendor stores via `requireVendorRole` with `via: "platform-admin"`.

### Dedicated Navigation & Menu
- **R5:** `components/staff/platform-nav-items.ts` defines the platform-wide navigation model for all platform administration destinations.
- **R6:** `components/staff/PanelNav.tsx` receives `isPlatformAdmin` and renders a dedicated "Platform" trigger and dropdown menu when `isPlatformAdmin` is true.
- **R7:** `components/staff/PanelNav.tsx` hides the "Platform" trigger completely from users who are not platform admins.
- **R8:** `app/(admin)/staff/page.tsx` renders a dedicated "Platform Administration" section with cards linking to platform functions when `auth.via === "platform-admin"`.

### Platform Management Functions
- **R9:** `/staff/platform/vendors` displays all registered vendors in the system (`aheedfoodcentre`, `srimart`, `aheedsuperstore`), showing their status (`ACTIVE`, `SUSPENDED`), domains, category and active product counts, and links to inspect each vendor.
- **R10:** `/staff/platform/onboarding` displays a multi-vendor roll-up table tracking onboarding completion percentages and readiness statuses across all tenants.
- **R11:** `/staff/platform/domains` displays all registered `VendorDomain` rows with their host names, target vendor, canonical domain indicator, and route status.
- **R12:** `/staff/platform/settings` displays global platform configuration and infrastructure readiness (Cloudflare Workers routing, database pooling/direct status, Better Auth domain federation, Stripe Connect platform keys, Email routing).
- **R13:** `/staff/platform/health` displays system health checks, database ping, uk-location-reference status, and a direct link to `/staff/errors`.

### Storefront Configuration Dashboard Alignment
- **R14:** `lib/vendor-readiness-service.ts` adds an `owner` attribute (`VENDOR_OPERATOR` vs `PLATFORM_ADMIN`) to each audited readiness requirement.
- **R15:** `components/staff/OnboardingReadinessDashboard.tsx` displays the operator ownership badge on each checklist item and allows filtering by operator role (`All`, `Vendor Operator`, `Platform Admin`).

### Architecture, Safety & Compatibility
- **R16:** Zero database migrations are executed; existing schema models and enums are preserved without change.
- **R17:** Local development host `aheedsuperstore.localhost:8787` remains fully functional for the test vendor alongside `aheedfoodcentre.localhost:8787` and `localhost:8787`.
- **R18:** ADR-007 product restrictions and hidden-by-default stock safeguards remain strictly enforced.
- **R19:** All platform repository functions take explicit `prisma` clients and zero request context imports, passing `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts`.
- **R20:** All newly created `/staff/platform/*` routes are fully documented in `docs/platform-admin-guide/platform-admin-guide.md` with all 7 required sections, passing `tests/operator-doc-coverage.test.ts`.
