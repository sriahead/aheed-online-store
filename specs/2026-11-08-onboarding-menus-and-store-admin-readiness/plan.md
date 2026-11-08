---
id: 2026-11-08-onboarding-menus-and-store-admin-readiness-plan
title: "Staff Onboarding Menu Expansion & Store Admin Readiness Checklist Access (Plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-11-08
visibility: internal
summary: Expand staff onboarding guide with Steps 7, 8, and 9 covering fulfilment, offers, and content moderation; restore launch readiness checklist and audit cards for Store Admin while maintaining clean guide view for store staff.
tags: [onboarding, store-admin, readiness-checklist, fulfilment, loyalty, content]
---

# Staff Onboarding Menu Expansion & Store Admin Readiness Checklist Access (Plan)

**Slice:** `specs/2026-11-08-onboarding-menus-and-store-admin-readiness/`  
**Status:** Approved  

---

## 1. Architecture & Design

### Phase 1: Access Control Gating
- Update `app/(admin)/staff/onboarding/page.tsx` to derive `canViewChecklist` from `auth.via === "platform-admin" || auth.via === "ADMIN"`.
- Pass `canViewChecklist` to `OnboardingReadinessDashboard.tsx`.
- Refactor conditional renders in `OnboardingReadinessDashboard.tsx` to use `hasAdminAccess = Boolean(isPlatformAdmin || canViewChecklist)` for checklist toggles, completion percentages, counters, progress bar, and category summary cards.

### Phase 2: Operations Guide Expansion
- Add Step 7 (Orders, Fulfilment & Delivery) covering `/staff/orders`, `/staff/fulfilment`, and `/staff/payments`.
- Add Step 8 (Offers, Loyalty & Promotions) covering `/staff/discounts`, `/staff/promotions`, `/staff/bundles`, and `/staff/loyalty`.
- Add Step 9 (Customers, Reviews & Content Moderation) covering `/staff/feedback`, `/staff/search-synonyms`, `/staff/faqs`, `/staff/customers`, and `/staff/assistant`.

### Phase 3: Documentation & Verification
- Synchronize `docs/client-help-centre/getting-started-onboarding.md`.
- Regenerate KMS indexes with `npm run kms:build-index`.
- Validate with Vitest unit tests in `tests/app-improvements-vat-quickview-onboarding.test.tsx`.
