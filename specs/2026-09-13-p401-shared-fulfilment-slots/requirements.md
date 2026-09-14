---
id: p401-shared-fulfilment-slots-requirements
title: P401 Shared Fulfilment Slots Requirements
audience: [dev]
type: spec
status: approved
version: "1.1.0"
updated: 2026-09-13
visibility: internal
summary: Requirements for shared fulfilment slots.
---
# Requirements

R1. The Prisma schema must include a `VendorFulfilmentSlot` model with a `method` field (`DELIVERY | COLLECTION`), schedule fields (e.g., `dayOfWeek`, `startTime`, `endTime`), and a `capacity` integer.
R2. The `VendorConfig` model must include a `bookingWindowDays` integer, a `slotHoldDurationMinutes` integer, and an `offerDeliverySlots` boolean.
R3. The application must calculate available capacity for a given date by subtracting the count of non-cancelled/non-expired orders assigned to that slot from the slot's base capacity.
R4. Orders in `CONFIRMED`, `READY_FOR_COLLECTION`, `OUT_FOR_DELIVERY`, `DELIVERED`, and `COLLECTED` states must permanently consume slot capacity.
R5. Orders in `PENDING_PAYMENT` state must temporarily consume slot capacity for the duration defined by `VendorConfig.slotHoldDurationMinutes`.
R6. An expiry mechanism must dynamically ignore or release `PENDING_PAYMENT` orders that exceed `slotHoldDurationMinutes` when calculating available capacity.
R7. The checkout UI must render a date picker (constrained by `bookingWindowDays`) and a list of available slots for the selected method.
R8. Order creation (`placeOrderAction`) must guarantee that concurrent attempts for the final available slot cannot reserve beyond the configured capacity using a Prisma-native concurrency mechanism (e.g., Serializable isolation level or unique constraints), without using raw SQL.

