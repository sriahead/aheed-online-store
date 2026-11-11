---
id: 2026-11-08-platform-documentation-update-plan
title: "Platform documentation review and comprehensive update (plan)"
audience: [dev]
type: spec
status: approved
version: "1.0.0"
updated: 2026-11-08
visibility: internal
summary: Platform documentation review and comprehensive update across storefront help, staff onboarding, runbooks, and KMS documentation.
tags: [documentation, onboarding, help, kms]
---

# Platform Documentation Review and Comprehensive Update (Plan)

**Issue:** #1468  
**Slice:** `specs/2026-11-08-platform-documentation-update/`  
**Base branch:** `staging`  
**Status:** Approved  

---

## 1. Architectural Strategy

This slice brings platform documentation across all user-facing surfaces (Storefront Help Centre `/help`, Staff Onboarding `/staff/onboarding`, Staff Runbook `/staff/runbook`, and KMS persistent documentation) into total alignment with platform capabilities delivered in P10.

```
+-----------------------------------------------------------------------------------------------+
| User Surfaces                                                                                 |
| 1. Storefront Help Centre (/help)       -> components/help/RoleJourneyMaps.tsx                |
| 2. Staff Onboarding (/staff/onboarding) -> components/staff/OnboardingReadinessDashboard.tsx  |
| 3. Staff Runbook (/staff/runbook)       -> app/(admin)/staff/runbook/docs.ts (KMS Bundle)     |
+-----------------------------------------------------------------------------------------------+
                                               ^
                                               |
+-----------------------------------------------------------------------------------------------+
| Canonical KMS Documentation (docs/client-help-centre/*.md)                                    |
| - getting-started-onboarding.md (End-to-end staff operational walkthrough)                    |
| - products-catalogue-guide.md   (Brands, stock modes, safeguards, publication criteria)       |
| - icon-and-visual-asset-standards.md (Visual asset studio, brand logos, slot activation)      |
| - category-image-standards.md   (Category photos vs 3D icons, candidate management)           |
| - user-journeys.md              (Role journeys: Customer, Staff, Store Admin, Platform Admin)  |
+-----------------------------------------------------------------------------------------------+
                                               |
                                               v
                                   npm run kms:build-index
                                               |
                                               v
                         app/(admin)/staff/runbook/docs.ts & ARTIFACT_INDEX.md
```

---

## 2. Implementation Steps

### Step 1: Update Storefront Help Centre & Journey Maps
- Update `components/help/RoleJourneyMaps.tsx`:
  - Enhance `store-admin` journey with Brand Management (`/staff/brands`), Visual Asset Gallery (`/staff/icons`), and publication rules.
  - Enhance `staff` journey with stock verification, inventory modes (`TRACKED`/`UNTRACKED`/`INFINITE`), and out-of-stock handling.
  - Document required fields, dependencies, and reasons an item might not appear on the storefront.

### Step 2: Enhance Staff Onboarding UI
- Update `components/staff/OnboardingReadinessDashboard.tsx`:
  - Add an interactive "Operational Workflow & Guide" view or tab directly on `/staff/onboarding`.
  - Provide sequential instructions from login to publication:
    1. System Access & Staff Navigation
    2. Category & Department Organization (`/staff/categories`)
    3. Category Visual Assets & Icon Gallery (`/staff/icons`)
    4. Brand Creation & Management (`/staff/brands`)
    5. Stock Creation, Editing & Attributes (`/staff/products`)
    6. Publishing Stock & Controlling Storefront Visibility

### Step 3: Update KMS Client Help Centre Documents
- Update `docs/client-help-centre/getting-started-onboarding.md`:
  - Detailed sequential onboarding workflow with concrete steps for new staff.
- Update `docs/client-help-centre/products-catalogue-guide.md`:
  - Brand assignment, mandatory fields, VAT compliance, stock tracking modes, and activation safeguards.
- Update `docs/client-help-centre/icon-and-visual-asset-standards.md`:
  - Visual Asset Gallery (`/staff/icons`), slot activation/deactivation, brand logos, and category icons.
- Update `docs/client-help-centre/user-journeys.md`:
  - Keep 100% parity with `RoleJourneyMaps.tsx`.

### Step 4: Rebuild KMS Index & Validate
- Run `npm run kms:build-index` to regenerate `ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts`.
- Run `npm run kms:validate` and `npm run kms:coverage`.
- Run `npx vitest run tests/help-vendor-facts.test.tsx` and related documentation tests.

### Step 5: Ship to Staging, Verify, and Promote to Prod
- Commit, open PR to `staging`, merge with `--squash`.
- Verify on staging (`https://aheed-staging.merqify.com`).
- Promote `staging -> main` with `--merge`, verify on production (`https://aheed.merqify.com`).
