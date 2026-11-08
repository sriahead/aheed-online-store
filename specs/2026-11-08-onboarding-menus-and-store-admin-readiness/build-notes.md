# Staff Onboarding Menu Expansion & Store Admin Readiness Checklist Access (build notes)

**Slice:** `specs/2026-11-08-onboarding-menus-and-store-admin-readiness/`  
**Base:** `staging`  

## What changed and why

1. **Store Admin Launch Readiness Checklist Access (`app/(admin)/staff/onboarding/page.tsx`, `components/staff/OnboardingReadinessDashboard.tsx`)**:
   - `canViewChecklist = auth.via === "platform-admin" || auth.via === "ADMIN"`.
   - `hasAdminAccess = Boolean(isPlatformAdmin || canViewChecklist)`.
   - Grants Store Administrators access to the Launch Readiness status badge, overall completion percentage, required item counters, progress bar, category summary cards, and audit checklist.
   - Preserves focused, sequential onboarding guide for standard store staff (`STAFF`) without internal completion metrics.

2. **Onboarding Operations Guide Expansion (`components/staff/OnboardingReadinessDashboard.tsx`)**:
   - Added Step 7: Orders, Delivery & Fulfilment Operations (`/staff/orders`, `/staff/fulfilment`, `/staff/payments`).
   - Added Step 8: Offers, Loyalty & Promotions Configuration (`/staff/discounts`, `/staff/promotions`, `/staff/bundles`, `/staff/loyalty`).
   - Added Step 9: Customers, Reviews & Content Moderation (`/staff/feedback`, `/staff/search-synonyms`, `/staff/faqs`, `/staff/customers`, `/staff/assistant`).

3. **Documentation & Tests (`docs/client-help-centre/getting-started-onboarding.md`, `tests/app-improvements-vat-quickview-onboarding.test.tsx`)**:
   - Updated client onboarding guide documenting Steps 7, 8, 9 and the 8 launch readiness categories.
   - Added automated tests verifying Store Admin and Platform Admin checklist visibility and non-admin staff restrictions.

## Decisions taken during the build

- Kept launch readiness metric cards visible to Store Admin (`ADMIN`) and Platform Admin (`platform-admin`), while non-admin staff (`STAFF`) retain access to the operational guide steps (Steps 1–9) without cluttering completion percentages.

## Deviations from the spec

None.

## Known-shaky areas

None.
