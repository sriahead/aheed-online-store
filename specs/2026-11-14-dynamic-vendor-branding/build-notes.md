# Dynamic vendor branding and Merqify ecosystem identity on Stripe Checkout (build notes)

Branch `docs/1482-1491-session-handoff`.

## What changed and why

- **`lib/payments.ts`:**
  - Extended `CreatePaymentInput` with `vendorName?: string` and `applicationContext?: string`.
  - Pinned `Stripe-Version: 2025-09-30.clover` on session create and session retrieve.
  - Implemented `branding_settings[display_name]` for dynamic vendor display name at the top of hosted Stripe Checkout.
  - Added `line_items[0][price_data][product_data][description] = "Part of the Merqify Ecosystem"` and formatted line item product name with the vendor name.
  - Added `custom_text[submit][message]` and `custom_text[after_submit][message]` reinforcing purchasing context without claiming Merqify is the payment processor.
  - Preserved Stripe's native `"Powered by Stripe"` footer attribution.
- **`lib/repositories/orders.ts`:**
  - Added `applicationContext?: string` to `PlaceOrderInput` (defaults to `"ShopLocal"`).
  - Fetched active vendor name from `Vendor` and `VendorBranding` inside the transactional boundary.
  - Handed `vendorName` and `applicationContext` to `payments.createPayment(...)`.
- **`tests/payments.test.ts` & `tests/orders.test.ts`:**
  - Added test cases covering single vendor, multiple vendor switching, omission fallback, application contexts, and repository integration.
