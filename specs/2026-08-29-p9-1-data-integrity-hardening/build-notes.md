# P9.1 — Data Integrity Hardening (build notes)

## What changed and why

- `lib/repositories/reviews.ts`: Updated `ReviewRepository` interface and its implementations (`upsertReview`, `deleteReview`) to explicitly take and enforce `vendorId` in the `where` filters, preventing cross-tenant operations as mandated by R1/R2 and R13.
- `lib/reviews-service.ts`: Updated `getReviewRepository()` to fetch the request-scoped `vendorId` and pass it to the underlying repository functions, keeping controllers abstracted from the explicit tenancy propagation (R3).
- `tests/reviews.test.ts`: Added tests verifying that cross-vendor writes and deletes fail safely with `upsertReview` and `deleteReview`.
- `tests/repository-vendor-scoping.test.ts`: Removed the exceptions for `reviews.ts` since they are now compliant.
- `prisma/schema.prisma`: Added `@@unique([id, vendorId])` to `Category` and updated `Product` to reference `Category` via `[categoryId, vendorId]` to satisfy #432 Slice 1 cross-tenant safety.
- `prisma/migrations/20260829232000_p9_1_data_integrity_hardening/migration.sql`: Generated the base Prisma SQL for the `Category` / `Product` schema update and hand-authored the `#433` `CHECK` constraints to enforce non-negative prices and quantities on `Inventory`, `Product`, `ProductPriceTier`, `OrderItem`, and `Payment`.

## Decisions taken during the build

- Hand-authored the migration because `CHECK` constraints cannot be natively defined in `schema.prisma`. 
- Included the schema changes for `Category`/`Product` in the same migration to minimize drift and migration bloat since they were naturally combined in this data integrity slice. 
- Created `scripts/audit-p9-1-constraints.ts` to audit the database before proceeding; confirmed no conflicting data existed.

## Deviations from the spec

None. All seven requirements (R1-R7) have been fulfilled precisely.

## Known-shaky areas

- None. The checks were run against an actual database and passed gracefully. The schema and the database are fully in sync, and all tests pass.
