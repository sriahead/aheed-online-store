# Build Notes — Click & Collect order details: replace order reference with customer email (#1261)

## What changed and why

1. **`components/orders/OrderAddressCard.tsx`:**
   - Replaced "Order Reference" in the Click & Collect card with "Email".
   - Supported `customerEmail?: string | null` prop.
   - Removed duplicate order reference display from the card because the order number is already rendered prominently at the top of all order detail pages.

2. **Integration across pages:**
   - In `app/(admin)/staff/orders/[orderNumber]/page.tsx`: passed `customerEmail={order.buyerEmail}`.
   - In `app/(storefront)/account/orders/[orderNumber]/page.tsx`: passed `customerEmail={order.customerEmail ?? session.user.email}`.
   - In `app/(storefront)/checkout/[orderNumber]/page.tsx`: passed `customerEmail={order.customerEmail ?? session?.user?.email}`.

3. **Repository layer (`lib/repositories/orders.ts`):**
   - Added `customerEmail: string | null` to `OrderSummary`.
   - Selected `guestEmail` and `user.email` in `findOrderForViewer` and `findOrderForUser` to populate `customerEmail`.
   - Included `customerEmail` in `findOrderForStaff`.

## Decisions taken during the build

- **Email in Click & Collect Card:** Rather than displaying redundant order references, showing the customer's email alongside their name and contact phone equips store staff with the necessary contact details to quickly verify collection identity.
- **Backwards Compatibility:** Retained `orderNumber?: string` as an optional prop in `OrderAddressCardProps` so existing callers or external stubs do not encounter TypeScript compile errors.

## Deviations from the spec

None. All requirements were implemented as planned.

## Known-shaky areas

None. All unit and component tests pass cleanly.
