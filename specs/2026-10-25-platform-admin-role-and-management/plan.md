---
id: platform-admin-role-and-management-plan
title: "Platform Admin role and platform-wide management suite (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-10-25
visibility: internal
summary: Implement a dedicated Platform Admin role, canonical requirePlatformAdmin() server-side gate, dedicated platform administration navigation and dashboard suite, cross-vendor security enforcement, and storefront configuration dashboard role alignment.
tags: [spec, platform-admin, rbac, multi-tenancy, navigation, onboarding]
---

# Platform Admin role and platform-wide management suite (plan)

Addresses issue #1269.

## Context

The platform is designed as a multi-tenant grocery e-commerce engine (ADR-004), hosting independent stores (`aheedfoodcentre`, `srimart`, and `aheedsuperstore`) over a shared database and runtime. 

While `User.role` has supported `Role.ADMIN` since ADR-004 slice 3a, previous phases focused on per-vendor store administration (`VendorRole.STAFF` and `VendorRole.ADMIN`). Store administrators are granted access to manage an individual shop's catalog, hours, discounts, and delivery rules. However, platform-wide capabilities (such as multi-vendor onboarding, cross-tenant domain routing, system health, and global infrastructure visibility) lack a dedicated first-class role interface and navigation experience.

Furthermore, the Storefront Configuration Dashboard (`/staff/onboarding`) introduced in #1267 tracks all settings required to onboard a new vendor, but does not clearly delineate which settings belong to the **Store Admin / Vendor Operator** versus the **Platform Admin / Technical Operator**.

## Scope

1. **Server-Side Authorization (`lib/auth-rbac.ts`):**
   - Provide a type-safe `requirePlatformAdmin()` function that guarantees `session.user.role === "ADMIN"`.
   - Ensure store admins (`VendorMembership(role: "ADMIN")` with `User.role === "CUSTOMER"`) are refused on all platform functions with HTTP 403 Forbidden (`<PanelRefusal title="Platform admin only" />`).
2. **Dedicated Platform Admin Navigation & Hub:**
   - Dedicated "Platform" menu section in `PanelNav.tsx` visible exclusively to platform admins.
   - Dedicated Platform Administration section on `/staff` hub page for quick access to platform functions.
3. **Platform-Wide Management Suite (`app/(admin)/staff/platform/...`):**
   - `/staff/platform/vendors`: Multi-vendor directory showing all tenants (`aheedfoodcentre`, `srimart`, `aheedsuperstore`), status (`ACTIVE`, `SUSPENDED`), active products/categories, and direct inspection links.
   - `/staff/platform/onboarding`: Cross-tenant launch readiness overview roll-up.
   - `/staff/platform/domains`: Multi-tenant domain and route registry (`VendorDomain` mapping, SSL, and canonical indicators).
   - `/staff/platform/settings`: Platform infrastructure overview (Cloudflare Workers routing, database pooling/direct status, Better Auth domain federation, Stripe Connect platform keys, Email routing).
   - `/staff/platform/health`: System health status and direct bridge to `/staff/errors`.
4. **Storefront Configuration Dashboard Role Delineation:**
   - Update `lib/vendor-readiness-service.ts` and `components/staff/OnboardingReadinessDashboard.tsx` to explicitly tag every item with its responsible operator role: `VENDOR_OPERATOR` vs `PLATFORM_ADMIN`.
   - Provide filtering by ownership role (All, Vendor Operator, Platform Admin).
5. **Security, Safeguards & Host Preservations:**
   - Zero database migrations required (existing `User.role` and relational models suffice).
   - Preserve `aheedsuperstore.localhost:8787` for local test vendor development.
   - Preserve all ADR-007 category restriction and stock mode invariants.

## Technical Approach

### Repository Purity & Data Access
Platform administration views query cross-vendor data via a pure repository module `lib/repositories/platform-admin.ts` that takes an explicit `prisma` client (`ReturnType<typeof getPrisma>`) with zero request context imports, adhering strictly to `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts`.

### Navigation Integration
- Navigation model `components/staff/platform-nav-items.ts` provides structured metadata for platform admin routes.
- `PanelNav.tsx` receives `isPlatformAdmin` and renders a dedicated "Platform" trigger and dropdown alongside vendor-scoped operational groups.
- `app/(admin)/staff/page.tsx` renders the platform administrative section when `auth.via === "platform-admin"`.

### Operator Documentation
Full 7-section operator documentation is authored in `docs/platform-admin-guide/platform-admin-guide.md` covering all newly added platform routes, satisfying `tests/operator-doc-coverage.test.ts`.
