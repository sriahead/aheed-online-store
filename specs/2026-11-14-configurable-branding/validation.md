# Configurable platform branding terminology in Client Setup (validation)

## Validation Matrix

| Req | Testing Area | How to verify |
|---|---|---|
| R1, R2 | Unit | `tests/platform-branding-terminology.test.ts` asserts `DEFAULT_PLATFORM_BRANDING_TERMINOLOGY` exists and defaults to `"Levelled Up by Merqify"`. |
| R3 | Unit / Action | `tests/client-setup-branding.test.ts` asserts saving terminology updates `VendorConfig.platformBrandingTerminology` and bulk apply updates all stores. |
| R4 | Unit | `tests/payments.test.ts` asserts `line_items[0][price_data][product_data][description]` defaults to `"Levelled Up by Merqify"` or matches custom passed `brandingTerminology`. |
| R4 | Unit | `tests/orders.test.ts` asserts `placeOrder` retrieves vendor's `platformBrandingTerminology` and passes to `createPayment`. |
| R5 | Unit | `tests/storefront-footer.test.tsx` asserts footer renders `"Levelled Up by Merqify"` and respects custom overrides. |
| R6 | Unit | `tests/email-layout.test.ts` asserts email footer renders `"Levelled Up by Merqify"`. |
| R7 | Unit | `tests/icon-credits-and-tooltips.test.tsx` asserts icon credits page renders `"Levelled Up by Merqify"`. |
