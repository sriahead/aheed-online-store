---
id: p1385-storefront-polish-journeys-plan
title: "Storefront polish, theme deletion and role-based user journeys (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-11-01
visibility: internal
summary: "#1385: customer feedback demo seed and visibility, delete custom saved theme in /staff/storefront, and role-based user journey maps on /help."
tags: [storefront, themes, user-journeys, feedback, p10]
related: [client-user-journeys, store-admin-tabs-guide]
---

# Storefront polish, theme deletion and role-based user journeys (plan)

Closes `#1385`. Addresses four user requirements:

1. **Customer feedback:** seed showcase reviews for demonstration environments and approve pending feedback so the homepage 3D carousel renders with full pagination.
2. **Storefront themes:** add delete custom saved theme functionality in `/staff/storefront` across repository, service, server action, and UI.
3. **Help guide:** add role-based User Journey Maps on `/help` detecting Platform Admin, Store Admin, Staff, and Customer with an interactive role switcher.
4. **Documentation:** expand `docs/client-help-centre/user-journeys.md` with rich step-by-step guides, actions, and checklists; re-index KMS.

## Approach

### 1. Customer feedback demo visibility
- Add seed script / utility `scripts/seed-demo-feedback.ts` to insert 3 showcase approved reviews for Aheed Food Centre and SriMart if absent.
- Approve the pending Demo A. review in production/staging.

### 2. Storefront theme deletion
- `lib/repositories/vendor.ts`: `deleteVendorTheme(prisma, vendorId, themeId)` using `deleteMany({ where: { id: themeId, vendorId } })`.
- `lib/vendor-service.ts`: export `deleteVendorTheme(vendorId, themeId)`.
- `features/admin/storefront.ts`: `"use server"` action `deleteStorefrontTheme(themeId: string)`.
- `components/staff/StorefrontConfigForm.tsx`: add "Delete Theme" button next to "Apply Theme" when a custom vendor theme (`vendor:<id>`) is selected.

### 3. Role-based user journey maps on `/help`
- Extract role detection in `app/(storefront)/help/page.tsx`:
  - `auth.via === "platform-admin"` -> Platform Admin
  - `auth.role === "ADMIN"` -> Store Admin
  - `auth.role === "STAFF"` -> Staff
  - default -> Customer
- Create `components/help/RoleJourneyMaps.tsx` ("use client") rendering interactive tabs for all 4 roles, defaulting to the viewer's detected role.
- Each journey presents clear numbered steps, visual badges, route links, and action summaries.

### 5. Help Centre visual polish & icon medallion upgrade
- Role journey step outcomes styled with high-contrast `text-action bg-action-tint border-action/20` badges.
- Upgraded role switcher tabs in `RoleJourneyMaps.tsx` to `IconMedallion` with 3D slots (`view-shopper`, `view-staff`, `view-admin`, `secure-checkout`), integrated into the Icon & Visual Asset Gallery at `/staff/icons`.
- Retired redundant static facts panels on `/help` (`Delivery & Minimums`, `Click & Collect`, `Loyalty Points`, `Discount Codes`, `Privacy & Data Rights`, and `Detailed Shopping Guide`), retaining the `#delivery` anchor container for footer link continuity.
