# #402 Fulfilment Foundation: Validation

The following test coverage must be implemented and passing to prove the Fulfilment Foundation (#402) meets its requirements safely.

## 1. Migration & Data Integrity
* **Historical Migration (Manual/CI):** The SQL migration must explicitly set `fulfilmentMethod = 'DELIVERY'` for all existing orders, and `prisma migrate diff` logic must verify the schema stays in sync without breaking the custom Trigam indexes.
* **Tenant Isolation:** A test must confirm that a shopper placing a `COLLECTION` order reads the `VendorConfig` and `VendorLocation` of the *active tenant* derived from the cart identity, preventing cross-tenant configuration leaks (another vendor's location cannot be submitted or resolved).
* **VendorLocation Scope:** Verify `VendorLocation` strictly enforces its `vendorId` relation and does not pollute global space.

## 2. Checkout Validation
* **Explicit Intent:** New checkouts require explicit fulfilment intent. Submitting a checkout without an explicit `fulfilmentMethod` throws a validation error and does not silently default to `DELIVERY`.
* **Existing Delivery:** Submitting a `DELIVERY` checkout with full address details succeeds and charges the standard `deliveryFeePence`.
* **Delivery Rejection:** Submitting a `DELIVERY` checkout without an address or delivery eligibility throws a validation error.
* **Collection Success:** Submitting a `COLLECTION` checkout with only Name, Phone, and Email succeeds when enabled, bypassing postcode delivery-area eligibility entirely.
* **Collection Configuration Lockout:** Submitting a `COLLECTION` checkout when `VendorConfig.offerCollection === false` throws a server-side refusal.

## 3. Money Provenance
* **Zero Delivery Fee:** A test must prove `computeTotals` returns exactly `0` for `deliveryFeePence` when `method === COLLECTION`.
* **Minimum Order:** A test must prove `minimumOrderPence` correctly applies to BOTH methods.
* **Persistence:** `placeOrder` must persist `0` into `Order.deliveryFeePence` for a Collection order, ensuring payment amounts use the collection-aware total.

## 4. Status Transition Graph
* **Method-Aware Legality:** Tests for `canTransition` must prove:
  * `DELIVERY` permits `CONFIRMED -> OUT_FOR_DELIVERY -> DELIVERED` and cannot enter collection statuses (`READY_FOR_COLLECTION`, `COLLECTED`).
  * `COLLECTION` permits `CONFIRMED -> READY_FOR_COLLECTION -> COLLECTED` and cannot enter delivery statuses (`OUT_FOR_DELIVERY`, `DELIVERED`).
* **Immutability:** The `fulfilmentMethod` cannot be changed after order creation.
* **Staff Queue:** The `STAFF_QUEUE_STATUSES` filter correctly includes `READY_FOR_COLLECTION`.
* **Revenue Logic:** The `REVENUE_STATUSES` filter correctly includes `COLLECTED`.

## 5. UI Presentation & Consumers
* **Confirmation & History:** Collection order confirmation/history/staff views use "Collection" terminology rather than delivery terminology.
* **Historical Accuracy:** A Collection order's snapshotted collection location survives later `VendorLocation` edits.

## 6. Data-Rights Erasure (Signed-In & Guest)
* **Delivery Order Redaction:** After erasure, personal recipient and address data (line1, city, postcode) is redacted according to the current policy.
* **Collection Order Redaction:** After erasure, customer name and phone are redacted, but the historical vendor collection location (line1, city, postcode) remains intact, ensuring the order remains operationally auditable.
* **Address Book Isolation:** Collection snapshot `Address` rows do not accidentally appear as customer saved addresses (`userId` must remain explicitly `null`).
* These rules must apply equally to `eraseVendorData` (account) and `eraseGuestOrderData` (guest).
