# P9.1 Data Integrity Hardening (requirements / acceptance criteria)

This slice implements `#340` (scoping reviews to `vendorId`), `#433` (commercial CHECK constraints), and the first slice of `#432` (cross-tenant integrity for `Product` to `Category`).

R1. The `upsertReview` function in `lib/repositories/reviews.ts` takes `vendorId` as an argument and uses it to look up the `Product`. If the product belongs to a different vendor, it fails with "Product not found".
R2. The `deleteReview` function in `lib/repositories/reviews.ts` takes `vendorId` as an argument and includes it in its deletion criteria, refusing to delete reviews across tenants.
R3. The `ALLOWED` exception list in `tests/repository-vendor-scoping.test.ts` no longer contains `upsertReview` or `deleteReview`.
R4. A hand-authored migration (`p9_1_commercial_check_constraints`) exists that adds `CHECK` constraints to enforce `Inventory.quantity >= 0`, `Product.basePrice >= 0`, `Product.originalPrice >= 0`, `ProductPriceTier.groupQuantity >= 2`, `ProductPriceTier.groupPricePence >= 0`, `OrderItem.quantity > 0`, `OrderItem.unitPricePence >= 0`, and `Payment.amountPence >= 0`.
R5. A Prisma migration adds `@@unique([id, vendorId])` to the `Category` model and changes `Product.categoryId` to a composite foreign key referencing `Category([id, vendorId])`.
R6. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
R7. `CHANGELOG.md` updated (Gate 4).
