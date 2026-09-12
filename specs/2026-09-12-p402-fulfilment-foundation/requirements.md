# #402 Fulfilment Foundation: Requirements

## 1. Schema & ADR-006 Reconciliation

We introduce explicit fulfilment methods while strictly conforming to the project's architectural constraints (ADR-006).

### 1.1 VendorLocation Model (ADR-006)
Following ADR-006, the physical store location is modelled as a child of `Vendor`, not as a configuration string inside `VendorConfig` or a second tenancy axis.
To meet the "one collection location per vendor" constraint, we enforce a strict `1:1` relationship for now.
```prisma
model VendorLocation {
  id           String   @id @default(uuid())
  vendorId     String   @unique // Enforces exactly one location per vendor
  vendor       Vendor   @relation(fields: [vendorId], references: [id], onDelete: Cascade)
  addressLine1 String
  addressLine2 String?
  city         String
  postcode     String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

### 1.2 VendorConfig
Collection availability is toggled in configuration.
```prisma
model VendorConfig {
  // ...
  offerCollection Boolean @default(false)
}
```
**Invariant**: The admin UI must reject saving `offerCollection = true` if the vendor has no `VendorLocation`.

### 1.3 Order Model & Address Snapshots
Instead of making `Order.addressId` nullable, we **reuse the existing `Address` model as an order-time snapshot** for Collection locations.
When a customer places a Collection order:
- The customer provides their Name and Phone (for contact).
- The transaction reads the `VendorLocation`'s address fields.
- The transaction creates an `Address` row blending the customer's contact info and the store's physical address.
- `Order.addressId` remains **mandatory and non-nullable**.

This elegantly solves two constraints:
1. Historical orders retain the exact collection address they were given at order time, even if `VendorLocation` changes later.
2. Every downstream consumer of `Order.address` (emails, staff list, data erasure, receipts) continues to work flawlessly. The UI simply relabels it "Collection Address" based on the fulfilment method.

```prisma
enum FulfilmentMethod {
  DELIVERY
  COLLECTION
}

model Order {
  // ...
  fulfilmentMethod FulfilmentMethod @default(DELIVERY)
  // addressId remains String (non-nullable)
}
```

## 2. OrderStatus & Legal Transitions

The `OrderStatus` enum is expanded to semantically represent collection, preventing the dangerous misuse of `OUT_FOR_DELIVERY` for store pick-ups.

```prisma
enum OrderStatus {
  PENDING_PAYMENT
  CONFIRMED
  OUT_FOR_DELIVERY
  DELIVERED
  CANCELLED
  READY_FOR_COLLECTION
  COLLECTED
}
```

**Legal Method-Aware Transitions:**
- **DELIVERY:** `PENDING_PAYMENT` → `CONFIRMED` → `OUT_FOR_DELIVERY` → `DELIVERED`
- **COLLECTION:** `PENDING_PAYMENT` → `CONFIRMED` → `READY_FOR_COLLECTION` → `COLLECTED`
- A DELIVERY order can **never** transition to `READY_FOR_COLLECTION` or `COLLECTED`.
- A COLLECTION order can **never** transition to `OUT_FOR_DELIVERY` or `DELIVERED`.
- `CANCELLED` is a terminal state reachable according to existing rules.
- **Changing an order's `fulfilmentMethod` after creation is strictly forbidden.**

## 3. Checkout Intent & Backward Compatibility

**Database Backward Compatibility:**
The migration adds `fulfilmentMethod @default(DELIVERY)`. All historical orders naturally become `DELIVERY` orders, which is historically accurate.

**Active Checkout Intent:**
The `placeOrderAction` must **never** rely on the database default to resolve missing form data.
- The checkout form must submit an explicit `fulfilmentMethod`.
- If the field is missing or invalid, the action throws a `MissingFieldError` / `CheckoutError`. It does not silently degrade to DELIVERY.

## 4. Money Provenance

For a `COLLECTION` order:
- `deliveryFeePence` is exactly `0`.
- The existing `minimumOrderPence` applies unconditionally.
- The payment amount, confirmation emails, and historical views read the persisted `0` delivery fee directly from the `Order` row, never recalculating it against current `VendorConfig`.

## 5. Address Semantics & Consumers

Because `Order.addressId` remains non-nullable, downstream consumers do not crash. However, presentation layers must be updated to respect the `fulfilmentMethod`:
- **Order Confirmation Page:** Renders "Collection Address" instead of "Delivery Address".
- **Confirmation Emails:** Mentions "Collection from" instead of "Delivery to".
- **Staff Order Detail:** Labels the address block as the Collection Point, and prominently badges the order as `[COLLECTION]`.
- **Order History:** Displays the snapshot `Address` as the collection location.
- **Address Book Isolation:** When creating the snapshot `Address` for a `COLLECTION` order, `userId` MUST be `null`. The vendor's location is not the user's personal address and must never appear in their saved address book.

## 6. Data-Rights Erasure (ADR-005 / Art. 17)

Erasure logic (`eraseVendorData` and `eraseGuestOrderData`) must become **method-aware** to prevent wiping the historical vendor location from a collection order.

- **DELIVERY orders and saved addresses (where `userId` is set):** Continue to receive full redaction (`line1`, `city`, `postcode`, `recipientName`, `phone`, `notes` all redacted).
- **COLLECTION orders:** The customer's `recipientName`, `phone`, and `notes` are redacted (these are personal data), but `line1`, `line2`, `city`, and `postcode` (the vendor's location) are **preserved**.

This guarantees that after an erasure, a `COLLECTION` order remains fully operationally and financially auditable, retaining the exact store location the customer was directed to at the time.

## 7. Exclusions
This slice explicitly **excludes**:
- #401 time slots, capacity, and scheduling.
- 60-minute Express Collection.
- Staff cancellation/refund capability of confirmed orders.
- #137 loyalty earn reversal.
- Multi-branch operational management.
- Collection handling fees.
- Separate collection minimum-order rules.
