---
id: 2026-11-08-app-improvements-vat-quickview-onboarding-plan
title: "Application Improvements: Onboarding Visibility, Quick View, Product VAT, INFINITE Stock Mode & Checkout VAT Breakdown (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-11-08
visibility: internal
summary: Restrict onboarding statistics to Platform Admin, remove nocaped reference, standardize Quick View across icon gallery with 320px medallion and tint selectors, support configurable 0% and 20% VAT rates, support INFINITE stock mode, and compute/persist VAT breakdown at checkout.
tags: [onboarding, quickview, vat, infinite-stock, checkout]
related: [2026-11-06-slot-booking-cutoff-plan]
---

# Application Improvements: Onboarding Visibility, Quick View, Product VAT, INFINITE Stock Mode & Checkout VAT Breakdown (Plan)

**Issue:** #1470  
**Slice:** `specs/2026-11-08-app-improvements-vat-quickview-onboarding/`  
**Status:** Approved  

---

## 1. Architecture & Design

### Phase 1: Database Schema & Migration
1. In `prisma/schema.prisma`:
   - Extend `enum StockMode` with `INFINITE`:
     ```prisma
     enum StockMode {
       UNKNOWN
       TRACKED
       UNTRACKED
       INFINITE
     }
     ```
   - In `model Order`:
     Add fields:
     ```prisma
     vatTotalPence    Int @default(0)
     vatStandardPence Int @default(0)
     vatZeroPence     Int @default(0)
     ```
   - In `model OrderItem`:
     Add fields:
     ```prisma
     vatRate  Int @default(0)
     vatPence Int @default(0)
     ```
2. Create hand-authored migration `prisma/migrations/20261108060000_order_vat_and_infinite_stock/migration.sql`:
   ```sql
   -- ALTER TYPE StockMode ADD VALUE IF NOT EXISTS 'INFINITE'
   -- ALTER TABLE Order ADD COLUMN vatTotalPence, vatStandardPence, vatZeroPence
   -- ALTER TABLE OrderItem ADD COLUMN vatRate, vatPence
   ```
3. Run `npx prisma generate` (`npm run db:generate`).

### Phase 2: Onboarding Page Visibility
1. In `app/(admin)/staff/onboarding/page.tsx`:
   - Change `requireVendorRole("ADMIN")` to `requireVendorRole("STAFF", "ADMIN")` so all staff members can access the operational onboarding guide.
   - Determine `isPlatformAdmin = auth.via === "platform-admin"`.
   - Pass `isPlatformAdmin` prop to `OnboardingReadinessDashboard`.
2. In `components/staff/OnboardingReadinessDashboard.tsx`:
   - If `!isPlatformAdmin`:
     - Force `dashboardTab = "guide"`.
     - Hide the tab switcher or hide the "Launch Readiness Checklist" tab.
     - In the overview card, hide all numbers, percentage figures (`100%`), required item counts (`X of Y required items complete`), responsibility breakdown pills, and the progress bar.
   - Remove the benchmark reference `Benchmarked against canonical operational profile: https://aheedfoodcentre.nocaped.com/` completely.

### Phase 3: Quick View & Visual Asset Studio
1. In `components/staff/IconGalleryClient.tsx`:
   - Rename all "Inspector" references to "Quick View".
   - Add state `previewTint: MedallionTint = "action"`.
   - In the Quick View modal, add 3 theme tint selector chips: **Action** (emerald), **Accent** (amber/orange), and **Danger** (rose/red).
   - Render the 320px circular medallion with `tint={previewTint}`.
   - Display affected storefront surfaces (`getSurfacesForAsset(asset)`).
2. Rename "Modal Inspector" to "Quick View" in `components/staff/OnboardingReadinessDashboard.tsx` and all KMS docs.

### Phase 4: Stock Creation, Editing & INFINITE Stock Mode
1. In `lib/cart-rules.ts`:
   - Update `StockMode` union: `"UNKNOWN" | "TRACKED" | "UNTRACKED" | "INFINITE"`.
   - Update `STOCK_MODES`: `["TRACKED", "UNTRACKED", "INFINITE", "UNKNOWN"]`.
   - In `purchasableQuantity`, handle `INFINITE`:
     `if (mode === "UNTRACKED" || mode === "INFINITE") return MAX_ADD_QUANTITY;`
2. In `lib/product-restriction.ts`:
   - Update `STOCK_MODE_LABELS` with `INFINITE`.
3. In `lib/repositories/products.ts`:
   - Include `vatRate` in `ProductWriteInput`, `AdminProductDetail`, `createProductForVendor`, and `updateProductForVendor`.
4. In `lib/catalogue-form.ts`:
   - Parse `vatRate` field (default 0, allow 0 or 20).
   - Support `INFINITE` in `readProductForm`.
5. In `components/staff/ProductForm.tsx`:
   - Add VAT rate selector dropdown (0% zero-rated food vs 20% standard-rated confectionery/alcohol/non-food).
   - Add `INFINITE` to the Stock Tracking select dropdown with descriptive label.

### Phase 5: VAT During Checkout & Order Persistence
1. In `lib/order-totals.ts`:
   - Define `VatBreakdown` interface:
     ```ts
     export interface VatBreakdown {
       zeroGrossPence: number;
       standardGrossPence: number;
       vatPence: number;
     }
     ```
   - Export helper `computeVatBreakdown(lines: { lineTotalPence?: number; unitPricePence: number; quantity: number; available: boolean; vatRate?: number }[]): VatBreakdown`.
2. In `lib/repositories/cart.ts`:
   - Include `vatRate` in `CartLine` and select it when building cart summary.
3. In `components/checkout/CheckoutSummary.tsx`:
   - Display the VAT summary breakdown (zero-rated gross, standard-rated gross, and VAT included).
4. In `lib/repositories/orders.ts`:
   - In `placeOrder`:
     - Read each product's `vatRate`.
     - Calculate each line's `vatPence` and order's `vatTotalPence`, `vatStandardPence`, `vatZeroPence`.
     - Store on `Order` and `OrderItem`.

### Phase 6: Help Guides, Validation & Verification
1. Update `docs/client-help-centre/` and `components/help/RoleJourneyMaps.tsx`.
2. Re-index KMS (`npm run kms:build-index`).
3. Run tests, format checks, lint, and typecheck.
