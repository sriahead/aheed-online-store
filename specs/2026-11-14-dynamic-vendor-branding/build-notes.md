# Dynamic vendor branding and Merqify ecosystem identity on Stripe Checkout (build notes)

Branch `feature/1580-dynamic-vendor-branding`, built from `origin/staging` `c205dd08`. Issue #1580.

## What changed and why

- **`lib/payments.ts`:**
  - Extended `CreatePaymentInput` with `vendorName?: string` and `applicationContext?: string`.
  - Pinned `Stripe-Version: 2025-09-30.clover` on session create and session retrieve.
  - Implemented `branding_settings[display_name]` for dynamic vendor display name at the top of hosted Stripe Checkout.
  - Added `line_items[0][price_data][product_data][description] = "Merqify Ecosystem"` and formatted line item product name with the vendor name.
  - Removed duplicate `custom_text` occurrences to eliminate redundant checkout copy.
  - Preserved Stripe's native `"Powered by Stripe"` footer attribution.
- **`lib/repositories/orders.ts`:**
  - Added `applicationContext?: string` to `PlaceOrderInput` (defaults to `"ShopLocal"`).
  - Fetched active vendor name from `Vendor` and `VendorBranding` inside the transactional boundary.
  - Handed `vendorName` and `applicationContext` to `payments.createPayment(...)`.
- **`tests/payments.test.ts` & `tests/orders.test.ts`:**
  - Added test cases covering single vendor, multiple vendor switching, omission fallback, application contexts, and repository integration.
