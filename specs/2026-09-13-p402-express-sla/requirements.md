# Requirements

R1. The `VendorConfig` model must include an `expressCollectionEnabled` boolean.
R2. The schema must include a `VendorExpressSchedule` relational model linked to `Vendor`, containing fields to define availability (e.g., `dayOfWeek`, `openTime`, `closeTime`). JSON columns must not be used.
R3. The `Order` model must include a `targetFulfilmentTime` DateTime field.
R4. During checkout, if `method === COLLECTION` and the current time is within a valid `VendorExpressSchedule` window, the UI must offer an "Express (ASAP)" toggle alongside standard collection slots.
R5. When an Express order transitions from `PENDING_PAYMENT` to `CONFIRMED`, the system must set the order's `targetFulfilmentTime` to the transition timestamp plus 60 minutes.
R6. The Staff Order Queue UI must render a countdown timer for Express orders based on `targetFulfilmentTime`.
R7. The Staff Order Queue UI must visually highlight (e.g., in red) Express orders where the current time exceeds `targetFulfilmentTime`.

