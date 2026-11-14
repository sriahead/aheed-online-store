# Dynamic vendor branding and Merqify ecosystem identity on Stripe Checkout (requirements / acceptance criteria)

## Requirements

R1. **Dynamic Vendor Display Name**
    When creating a Stripe Checkout Session via `PaymentService.createPayment`, if `vendorName` is provided, the request payload sets `branding_settings[display_name] = input.vendorName`. When `vendorName` is omitted or empty, `branding_settings[display_name]` is not sent, falling back gracefully to the account default.

R2. **Merqify Ecosystem Messaging**
    - `line_items[0][price_data][product_data][description]` is set to `"Part of the Merqify Ecosystem"`.
    - If `vendorName` is provided:
      - `custom_text[submit][message]` is set to `"You are purchasing from ${input.vendorName}. Part of the Merqify Ecosystem."`.
      - `custom_text[after_submit][message]` is set to `"Thank you for your order with ${input.vendorName}. Part of the Merqify Ecosystem."`.
    - If `vendorName` is omitted, `custom_text[submit][message]` is set to `"Part of the Merqify Ecosystem."`.
    - At no point does copy claim or imply that Merqify is the payment processor.

R3. **Order & Vendor Line Item Identity**
    - `line_items[0][price_data][product_data][name]` is set to `Order ${input.orderNumber} · ${input.vendorName}` when `vendorName` is provided, and `Order ${input.orderNumber}` when omitted.

R4. **Stripe API Versioning**
    Both session creation (`POST /v1/checkout/sessions`) and session retrieval (`GET /v1/checkout/sessions/{id}`) pass the request header `Stripe-Version: 2025-09-30.clover`.

R5. **Multi-Application Context & Metadata**
    - `CreatePaymentInput` accepts `applicationContext?: string`.
    - When provided, `metadata[applicationContext]` is sent with the Checkout Session creation request.
    - When `vendorName` is provided, `metadata[vendorName]` is sent with the Checkout Session creation request.

R6. **Repository Layer Integration**
    - `PlaceOrderInput` in `lib/repositories/orders.ts` accepts `applicationContext?: string` (defaulting to `"ShopLocal"`).
    - Inside `placeOrder`, the active vendor's name is queried from `Vendor` and `VendorBranding` within the interactive transaction, and passed as `vendorName` to `payments.createPayment`.
    - The repository layer adheres strictly to purity and client-injection rules without importing request context.

R7. **Attribution & Settlement Preservation**
    - Stripe's native `"Powered by Stripe"` checkout footer is left intact.
    - Current payment routing, settlement, webhook processing, and statement descriptors remain unaffected.
    - No database migrations are introduced.
