# Requirements — Click & Collect order details: replace order reference with customer email (#1261)

## Functional Requirements

- **R1: Click & Collect Details Card:**
  - `OrderAddressCard` must accept `customerEmail?: string | null`.
  - When `fulfilmentMethod === "COLLECTION"`, `OrderAddressCard` must NOT display the "Order Reference" label or order number.
  - When `customerEmail` is provided, `OrderAddressCard` must display the customer's email under the label "Email" (styled consistently with "Customer Name" and "Contact Phone").

- **R2: Delivery Mode Integrity:**
  - When `fulfilmentMethod === "DELIVERY"`, `OrderAddressCard` continues to display the customer delivery address ("Delivering to") unchanged.

- **R3: Staff Order Detail View:**
  - In `app/(admin)/staff/orders/[orderNumber]/page.tsx`, `OrderAddressCard` receives the customer's email (`order.buyerEmail`).

- **R4: Storefront Order Views:**
  - In `app/(storefront)/account/orders/[orderNumber]/page.tsx` and `app/(storefront)/checkout/[orderNumber]/page.tsx`, `OrderAddressCard` receives the resolved customer email.

- **R5: Order Data Model:**
  - `OrderSummary` in `lib/repositories/orders.ts` includes `customerEmail: string | null`, populated accurately for both registered users and guest orders.
