# Platform Documentation Review and Comprehensive Update (Build Notes)

**Issue:** #1468  
**Slice:** `specs/2026-11-08-platform-documentation-update/`  
**Base branch:** `staging`  
**Status:** Approved  

---

## 1. Summary of Changes

This slice delivers comprehensive documentation and onboarding parity across all storefront, staff panel, and internal KMS surfaces for Aheed Merqify:

1. **Storefront Help Centre (`components/help/RoleJourneyMaps.tsx`):**
   - Expanded the **Store Admin** user journey from 5 to 8 detailed, actionable operational steps.
   - Thoroughly documented **Brand Management (`/staff/brands`)**, authentic logo uploads (`/api/admin/brands/upload-logo`), URL ingestion, and the interactive product quick-view drawer.
   - Documented the **Visual Asset Gallery (`/staff/icons`)**, candidate generation (Realistic Photo vs 3D Tactile Icon), slot activation (`CategoryAsset.isSelected`), deactivation, and medallion inspector.
   - Detailed product creation (`/staff/products/new`, `/staff/products/[id]`), mandatory fields (Name, Category, Base Price in pence), brand selection, net content, VAT compliance, and stock tracking modes (`TRACKED`, `UNTRACKED`, `INFINITE`).
   - Detailed the **Storefront Publication Criteria** and the strict **Stock Safeguard (#1449)** preventing activation when stock status is `UNKNOWN`.
   - Updated the **Store Staff** journey with live inventory shelf controls (+1/-1/stock out) on `/staff/inventory` and order fulfillment queues (`/staff/orders`).

2. **Interactive Staff Onboarding Workflow UI (`components/staff/OnboardingReadinessDashboard.tsx`):**
   - Added an interactive mode switcher to `/staff/onboarding`:
     - **Tab 1: Step-by-Step Staff Onboarding Guide** (Sequential operational walkthrough with deep links to each module).
     - **Tab 2: Launch Readiness Checklist** (The 6-dimension readiness scorecard and filters).
   - Enables new staff members to operate the platform independently from day one.

3. **Canonical KMS Documentation Updates (`docs/client-help-centre/`):**
   - `getting-started-onboarding.md`: Full end-to-end operational walkthrough from sign-in to storefront publication.
   - `products-catalogue-guide.md`: Complete catalogue management guide covering brands, mandatory fields, integer pence pricing, VAT compliance, stock tracking modes, publication criteria, and stock safeguards.
   - `icon-and-visual-asset-standards.md`: Upgraded with the centralized Visual Asset Studio (`/staff/icons`), brand logo targets, candidate activation, and `<IconMedallion>` component usage.
   - `user-journeys.md`: Synchronized 100% with `RoleJourneyMaps.tsx`.

4. **KMS Indexing & Coverage:**
   - Ran `npm run kms:build-index` (regenerating `ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts` with 319 registered artifacts).
   - Re-baselined ratchet coverage with `kms:coverage`.

---

## 2. Verification & Validation

- `npm run typecheck` passed (0 errors).
- `npm run kms:validate` passed (0 errors).
- `npm run kms:coverage` passed (baseline matches).
- `npm run lint` passed.
- Unit and boundary tests (`tests/help-vendor-facts.test.tsx`, `tests/storefront-onboarding-readiness.test.ts`) passed.
