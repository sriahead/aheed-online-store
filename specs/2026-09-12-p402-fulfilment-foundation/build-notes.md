# Build Notes: #402 Fulfilment Foundation

## What changed and why

This slice establishes the architectural foundation for multi-method fulfilment, separating DELIVERY from COLLECTION without prematurely entangling the complexity of time slots or capacity limits (#401) or multi-branch architectures.

- **Fulfilment Method:** Introduced explicit FulfilmentMethod enum (DELIVERY | COLLECTION) so intent is strictly recorded at checkout rather than guessed from a zero delivery fee.
- **Collection Location Snapshotting:** Mapped the physical store location (VendorLocation) to an immutable Address row snapshot upon checkout for Collection orders. This elegantly allows downstream consumers (receipts, staff queue) to work out of the box while preserving the exact store location at the time of order placement.
- **Data Rights:** Split data erasure logic to be method-aware. COLLECTION addresses undergo partial redaction (customer info wiped, physical store location retained) to ensure financial audits remain robust, whereas DELIVERY gets full redaction.
- **Method-Aware Ladders:** Extended OrderStatus to include disjoint collection statuses (READY_FOR_COLLECTION, COLLECTED), preventing staff from accidentally marking a collection as 'out for delivery'.

## Decisions taken during the build

- **Address Redaction strategy**: Preserving the physical store location while wiping personal data ensures we do not over-redact historically essential business transaction data.
- **Revenue Semantics**: Added READY_FOR_COLLECTION and COLLECTED to the REVENUE_STATUSES. This strictly aligns with the existing logic because they are post-payment and cannot currently be refunded.
- **One Vendor Location**: Implemented via @unique(vendorId) inside the Prisma schema to strictly enforce the 'one location' restriction until multi-branch is built.

## Deviations from the spec

None. Everything was strictly built to specification. 

## Known-shaky areas

- Client-side Next.js Component state mapping (CheckoutSummary.tsx). Custom events coordinate state; if they race with React hydrating state transitions, there might be flashing.

## Excluded scope

- No #401 time slots or capacity checking.
- No Express Collection.
- No new branch management systems.
- No post-confirmation cancellations/refunds.
- No separate minimum-order amounts for collection.
