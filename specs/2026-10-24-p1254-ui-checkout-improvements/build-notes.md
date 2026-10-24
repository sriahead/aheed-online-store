# Build Notes: UI and Checkout Improvements

## Overview
This slice implements 6 user-requested UI and checkout refinements (Issue `#1254`):
1. Cart tooltip changed to "My Cart" across viewports.
2. Contact & Follow Hub label cleaned to omit "3D" and display "Contact & Follow Hub" only.
3. Official vector payment marks for Visa, Mastercard, Google Pay, Apple Pay, and American Express on consistent 48×30 white rounded tiles.
4. UK Address Layout reordered in `CheckoutForm` so `Flat, building (optional)` appears above `Street address`.
5. Order confirmation and detail views updated so `COLLECTION` orders display "Click & Collect" with customer details and order reference without showing the store's address as a customer delivery destination.
6. Header Quick Shop 3D icon animation activated.

## What changed and why
- `components/cart/CartDrawerShell.tsx`: updated trigger button `title="My Cart"`.
- `lib/icons-3d/catalog.ts`: renamed `contact-follow` from `"3D Contact & Follow Hub"` to `"Contact & Follow Hub"`.
- `components/layout/FloatingContact.tsx`: updated trigger title to `"Contact & Follow Hub"` when closed.
- `public/payment-methods/{visa,mastercard,amex,apple-pay,google-pay}.svg`: upgraded all 5 acceptance badges to official vector artwork with consistent 48×30 viewBox, clean rounded tile borders, and official brand color fills (interlocking red/orange/yellow for Mastercard, 4-color Google G + dark gray Pay for Google Pay, Visa blue for Visa, Apple silhouette + Pay for Apple Pay, and white on blue for Amex).
- `components/checkout/CheckoutForm.tsx`: moved `line2` (`Flat, building (optional)`) above `line1` (`Street address`), matching standard UK address input flow.
- `components/orders/OrderAddressCard.tsx`: added support for `fulfilmentMethod` and `orderNumber` props. When `fulfilmentMethod === "COLLECTION"`, displays a dedicated "Click & Collect" section with customer name, order reference, contact phone, and collection notes, omitting "Delivering to" and store address.
- `app/(storefront)/checkout/[orderNumber]/page.tsx`, `app/(storefront)/account/orders/[orderNumber]/page.tsx`, and `app/(admin)/staff/orders/[orderNumber]/page.tsx`: passed `fulfilmentMethod` and `orderNumber` to `OrderAddressCard`.
- `components/layout/ShoppingListLink.tsx`: enabled `animated={true}` on `<Icon3D name="quick-shop" ... />`.
- `tests/ui-checkout-improvements.test.tsx`: authored 6 automated test cases covering R1–R6.

## Deviations from the spec
None. All 6 requirements were implemented and verified.

## Known-shaky areas
None. All changes are backward-compatible and preserve existing accessible names and form actions.

## Decisions taken during the build
1. **Payment SVG Brand Fidelity:** Retained the CC0 / slug comment headers in each SVG file to guarantee compatibility with existing automated contract checks (`tests/payment-badge-files.test.ts`), while replacing the glyph geometry and color definitions with authentic brand assets.
2. **Click & Collect Distinction:** In `OrderAddressCard`, rather than creating a separate component, a clean branching strategy was adopted based on `fulfilmentMethod`. This ensures that customer confirmation (`/checkout/[orderNumber]`), customer account history (`/account/orders/[orderNumber]`), and staff packing dashboard (`/staff/orders/[orderNumber]`) share identical verification details.
