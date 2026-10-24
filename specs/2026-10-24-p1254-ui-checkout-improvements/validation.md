# Validation: UI and Checkout Improvements

Issue `#1254`.

| Requirement | Probing Method | Expected Outcome |
|---|---|---|
| R1 (Cart Tooltip) | Vitest test in `tests/ui-checkout-improvements.test.tsx` | `cartButton.getAttribute("title") === "My Cart"` |
| R2 (Contact & Follow Hub) | Vitest check of `ICON_3D_DEFINITIONS["contact-follow"].name` and `FloatingContact` trigger title | Equals `"Contact & Follow Hub"` without `"3D"` |
| R3 (Official Payment Logos) | Vitest check of SVG files in `public/payment-methods/` | All 5 SVGs parse, have 48x30 viewBox, Mastercard has red, yellow, and orange fills |
| R4 (Address Layout) | Vitest check on rendered `CheckoutForm` | `line2` input DOM node precedes `line1` input DOM node |
| R5 (Click & Collect Details) | Vitest check on `OrderAddressCard` with `COLLECTION` vs `DELIVERY` | `COLLECTION` renders "Click & Collect", recipient name, order number, phone; does not display "Delivering to" or store address |
| R6 (Animated Quick Shop) | Vitest check on `ShoppingListLink` | SVG contains embedded `@keyframes` animation |
