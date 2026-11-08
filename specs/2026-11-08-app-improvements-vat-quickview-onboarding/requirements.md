# Application Improvements: Onboarding Visibility, Quick View, Product VAT, INFINITE Stock Mode & Checkout VAT Breakdown (Requirements)

**Issue:** #1470  
**Slice:** `specs/2026-11-08-app-improvements-vat-quickview-onboarding/`  
**Base branch:** `staging`  
**Status:** Approved  

---

## 1. Context & Objective

This feature addresses five key platform improvements and operational requirements:
1. **Onboarding Page Visibility (`/staff/onboarding`)**: Restrict operational counts, statistics, percentage scores, and progress metrics exclusively to Platform Admin (`auth.via === "platform-admin"`). Other staff roles (Store Staff and Store Admin) must only see the clean, sequential Step-by-Step Staff Onboarding Guide without audit scorecards or completion counts. Completely remove reference to `https://aheedfoodcentre.nocaped.com/`.
2. **Quick View Unification**: Rename "Modal Inspector" to "Quick View" across the application, component attributes, and documentation. Add full Quick View functionality to the Visual Asset & Icon Gallery (`/staff/icons`) with a 320px circular medallion preview, interactive theme tint selectors (Action, Accent, Danger), and storefront surface mapping.
3. **Stock Creation, Editing & Attributes**:
   - Product-level VAT compliance: allow setting 0% (zero-rated domestic food) and 20% (standard-rated confectionery, alcohol, non-food).
   - Stock Mode `INFINITE`: support `INFINITE` stock mode for products with guaranteed unlimited availability, bypassing stock quantity decrementing and out-of-stock restrictions.
4. **Checkout VAT Calculation & Persistence**:
   - Automatically retrieve product-level VAT rates during checkout.
   - Calculate VAT breakdown (zero-rated gross/net, standard-rated gross/net, VAT amount).
   - Display clear VAT breakdown in the checkout summary and order confirmation.
   - Persist VAT summary fields (`vatTotalPence`, `vatStandardPence`, `vatZeroPence`) on `Order` and `vatRate`, `vatPence` on `OrderItem` for accounting and audit compliance.
5. **Help Guides & Documentation Synchronization**:
   - Synchronize all relevant client help guides, runbook articles, and role journey maps with the new capabilities.

---

## 2. Requirements & Acceptance Criteria

### R1. Onboarding Page Visibility (`/staff/onboarding`)
- Operational counts, statistics, percentage completion bars, responsibility breakdown counters, and audit scorecards are visible **only** to Platform Admin (`auth.via === "platform-admin"`).
- Store Staff and Store Admins viewing `/staff/onboarding` see only the Step-by-Step Staff Onboarding Guide.
- The external reference text `Benchmarked against canonical operational profile: https://aheedfoodcentre.nocaped.com/` is removed completely from the application.

### R2. Quick View Unification
- Rename "Modal Inspector" / "Inspector" to "Quick View" across all UI labels, buttons, titles, and documentation.
- In `/staff/icons`, clicking any asset or its Quick View button displays a modal with:
  - High-resolution preview in a 320px circular medallion (`IconMedallion` with `size={320}`).
  - Theme tint selectors: **Action** (`action`), **Accent** (`accent`), and **Danger** (`danger`), updating the medallion's tint dynamically in real-time.
  - Storefront surfaces affected by the selected asset (`getSurfacesForAsset(asset)`).
  - Action buttons: Activate Asset, Deactivate Asset, Delete Asset (with admin permissions check).

### R3. Stock Creation, Editing & Product Attributes
- In `ProductForm.tsx` (both create `/staff/products/new` and edit `/staff/products/[id]`):
  - Provide a dedicated VAT rate selector:
    - `0% VAT: Zero-rated domestic human food` (value `0`)
    - `20% VAT: Standard-rated products (confectionery, alcohol, non-food)` (value `20`)
  - Provide Stock Mode `INFINITE` alongside `TRACKED` and `UNTRACKED`:
    - Label: `Infinite (guaranteed unlimited availability)`
    - Form parser validates and passes `INFINITE`.
    - Products in `INFINITE` mode bypass inventory quantity decrements during order checkout.

### R4. VAT Calculation & Order Persistence
- `computeTotals` and `computeVatBreakdown` in `lib/order-totals.ts`:
  - Automatically evaluate product-level VAT rates on active basket lines.
  - Compute VAT on standard-rated items (`lineTotalPence * 20 / 120`).
  - Correctly calculate zero-rated and standard-rated subtotals.
- `CheckoutSummary.tsx` and checkout review surfaces:
  - Display a clear VAT breakdown: Zero-rated subtotal, Standard-rated subtotal, and VAT included.
- `placeOrder`:
  - Store `vatTotalPence`, `vatStandardPence`, and `vatZeroPence` on `Order`.
  - Store `vatRate` and `vatPence` on each `OrderItem`.

### R5. Help Guides & Documentation
- Update `components/help/RoleJourneyMaps.tsx`, `docs/client-help-centre/getting-started-onboarding.md`, `docs/client-help-centre/products-catalogue-guide.md`, and `docs/client-help-centre/icon-and-visual-asset-standards.md`.
- Rebuild KMS indexes (`npm run kms:build-index`).
