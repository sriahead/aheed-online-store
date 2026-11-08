# Application Improvements: Onboarding Visibility, Quick View, Product VAT, INFINITE Stock Mode & Checkout VAT Breakdown (Build Notes)

**Issue:** #1470  
**Slice:** `specs/2026-11-08-app-improvements-vat-quickview-onboarding/`  
**Base:** `staging`  

---

## Changes

1. **Onboarding Page Visibility (`/staff/onboarding` & `OnboardingReadinessDashboard.tsx`)**:
   - `requireVendorRole("STAFF", "ADMIN")` allows store staff and admins to view the operational onboarding guide.
   - `isPlatformAdmin` strictly guards operational counts, completion percentages, progress bars, and responsibility breakdown metrics.
   - Removed all references to `https://aheedfoodcentre.nocaped.com/`.

2. **Quick View Renaming & Gallery Integration (`IconGalleryClient.tsx`)**:
   - Renamed "Modal Inspector" to "Quick View" throughout the app and docs.
   - Added theme tint selector (Action, Accent, Danger) in the 320px circular medallion Quick View preview in `/staff/icons`.
   - Displays affected storefront surfaces for each asset.

3. **Product VAT Rate Configuration & INFINITE Stock Mode (`ProductForm.tsx`, `cart-rules.ts`, `catalogue-form.ts`)**:
   - Product-level VAT rate selector: 0% Zero-rated domestic food vs 20% Standard-rated confectionery/alcohol/non-food.
   - Stock Mode `INFINITE` added to Prisma schema, cart rules, and product form.
   - `INFINITE` stock products are always purchasable and bypass inventory decrementing.

4. **Checkout VAT Breakdown & Order Audit (`order-totals.ts`, `CheckoutSummary.tsx`, `orders.ts`)**:
   - `computeVatBreakdown` calculates zero-rated gross, standard-rated gross, and VAT amounts.
   - `CheckoutSummary.tsx` displays VAT breakdown.
   - `Order` persists `vatTotalPence`, `vatStandardPence`, and `vatZeroPence`.
   - `OrderItem` persists `vatRate` and `vatPence`.

5. **KMS Documentation**:
   - Updated `getting-started-onboarding.md`, `products-catalogue-guide.md`, `icon-and-visual-asset-standards.md`, and `RoleJourneyMaps.tsx`.
