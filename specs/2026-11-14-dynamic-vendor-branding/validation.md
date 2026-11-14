# Dynamic vendor branding and Merqify ecosystem identity on Stripe Checkout (validation)

## Validation Steps

| Req | Testing Area | How to verify |
|---|---|---|
| R1, R2, R3 | Unit | `tests/payments.test.ts` asserts `branding_settings[display_name]`, `line_items[0][price_data][product_data][name]`, `line_items[0][price_data][product_data][description]`, and `custom_text` messages match approved format when `vendorName` is passed. |
| R1, R2, R3 | Unit | `tests/payments.test.ts` verifies independent vendors (e.g. `Aheed Food Centre`, `SriMart Electronics`) reflect their respective branding without cross-vendor leakage. |
| R1, R2, R3 | Unit | `tests/payments.test.ts` asserts clean fallback when `vendorName` is omitted. |
| R4 | Unit | `tests/payments.test.ts` asserts request headers carry `Stripe-Version: 2025-09-30.clover` on session create and retrieve. |
| R5 | Unit | `tests/payments.test.ts` asserts `metadata[applicationContext]` and `metadata[vendorName]` are set appropriately across multiple Merqify application contexts. |
| R6 | Unit | `tests/orders.test.ts` asserts `placeOrder` queries the vendor business name and passes `vendorName` and `applicationContext` to `createPayment`. |
| R6 | Unit / Static | `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts` pass. |
| R7 | Unit / Acceptance | Existing payment sweep, webhook, and reconciliation tests pass without regression. |
