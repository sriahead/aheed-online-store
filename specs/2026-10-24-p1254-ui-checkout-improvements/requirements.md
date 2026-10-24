# Requirements: UI and Checkout Improvements

Issue `#1254`.

### R1. Cart Tooltip
The floating trolley button in `components/cart/CartDrawerShell.tsx` must carry `title="My Cart"`.

### R2. Contact & Follow Hub Clean Name
The `contact-follow` icon in `lib/icons-3d/catalog.ts` must have `name: "Contact & Follow Hub"` without any "3D" prefix. The closed trigger button in `components/layout/FloatingContact.tsx` must carry `title="Contact & Follow Hub"`.

### R3. Official Payment Logos
The 5 SVGs in `public/payment-methods/` (`visa.svg`, `mastercard.svg`, `amex.svg`, `apple-pay.svg`, `google-pay.svg`) must render official brand marks:
- All share consistent dimensions (`viewBox="0 0 48 30" width="48" height="30"`, rounded corner tile `<rect x="0.5" y="0.5" width="47" height="29" rx="4" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>`).
- Mastercard renders the dual-color interlocking red (`#EB001B`) and yellow/orange (`#F79E1B`) circles with orange overlap (`#FF5F00`).
- Visa renders the official Visa wordmark.
- Google Pay renders the official Google 4-color "G" with "Pay".
- Apple Pay renders the official Apple glyph with "Pay".
- Amex renders the official American Express blue badge with bold white text.

### R4. UK Delivery Address Layout
In `components/checkout/CheckoutForm.tsx`, the `Flat, building (optional)` input field (`name="line2"`) must appear before the `Street address` input field (`name="line1"`).

### R5. Click & Collect Order Details
In `components/orders/OrderAddressCard.tsx`, the component must accept `fulfilmentMethod?: "DELIVERY" | "COLLECTION"` and `orderNumber?: string`.
- When `fulfilmentMethod === "COLLECTION"`:
  - Heading must be "Click & Collect" (with "Customer Collection" indicator).
  - Displays the customer's recipient name, order reference (if provided), contact phone, and any collection notes.
  - Must not display the store's address as a customer delivery address.
- When `fulfilmentMethod === "DELIVERY"` (or omitted):
  - Heading remains "Delivering to" and shows the full street address.

The calling pages (`app/(storefront)/checkout/[orderNumber]/page.tsx`, `app/(storefront)/account/orders/[orderNumber]/page.tsx`, and `app/(admin)/staff/orders/[orderNumber]/page.tsx`) must pass `fulfilmentMethod={order.fulfilmentMethod}` and `orderNumber={order.orderNumber}`.

### R6. Quick Shop Icon Animation
In `components/layout/ShoppingListLink.tsx`, `<Icon3D name="quick-shop" ... />` must render with `animated={true}` (or omitting `animated={false}`).
