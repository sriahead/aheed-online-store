# P8.5d — Multi-buy Tier Pricing (requirements / acceptance criteria)

Adds group multi-buy pricing ("3 for £10.00") as a per-product **price** rather than a discount,
leaving the `DiscountCode` engine and its `DiscountRedemption` audit trail untouched — see
`plan.md` for why the codeless-`DiscountCode` route was rejected. Builds on P8.5c
(`p8-5c-curated-bundles-plan`), whose bundle cards ship with no savings claim pending this
mechanism, and on P5b's discount engine, which this slice deliberately does not modify.

### Model & migration

R1. `prisma/schema.prisma` declares a `ProductPriceTier` model with fields `id`, `vendorId`,
    `productId`, `groupQuantity` (`Int`), `groupPricePence` (`Int`), `isActive` (`Boolean`),
    `createdAt`, `updatedAt`, and relations to `Vendor` and `Product`.

R2. `ProductPriceTier` declares `@@unique([vendorId, productId])` and `@@index([vendorId, isActive])`.

R3. A single new migration directory under `prisma/migrations/` creates the `ProductPriceTier` table,
    and its SQL contains no `ALTER TABLE` against any table that existed before this slice other than
    the foreign-key constraints Prisma generates for the new table's own relations.

R4. `prisma/schema.prisma` still declares exactly two `DiscountKind` members (`PERCENTAGE`,
    `FIXED_AMOUNT`), and the `DiscountCode`, `DiscountRedemption` and `OrderItem` models are
    byte-identical to their state on `origin/staging` at `c2564e9`.

### Pure pricing arithmetic

R5. `lib/tier-pricing.ts` exists and contains no import of `@/lib/db`, `@prisma/client`,
    `@prisma/client/wasm`, `next/headers`, `@/lib/tenant`, `@/lib/auth` or `@/lib/auth-rbac`.

R6. `lib/tier-pricing.ts` exports a function that, given a base unit price in pence, a quantity, and
    either an active tier or `null`, returns the line total in pence computed as
    `floor(quantity / groupQuantity) × groupPricePence + (quantity % groupQuantity) × basePrice`,
    and returns `basePrice × quantity` when the tier is `null`, inactive, or when
    `quantity < groupQuantity`.

R7. That function never returns a value greater than `basePrice × quantity` — a tier whose
    `groupPricePence` exceeds `groupQuantity × basePrice` yields the base line total, not a higher
    one.

R8. `lib/tier-pricing.ts` exports a saving function returning `basePrice × quantity` minus the line
    total from R6, which is `0` whenever no tier applies and never negative.

R9. `tests/tier-pricing.test.ts` asserts R6, R7 and R8, and includes a case where
    `groupPricePence` is not divisible by `groupQuantity` (e.g. 3 for £10.00) proving the returned
    total is exact integer pence at quantities below, equal to, and above `groupQuantity`, and at a
    quantity that is a whole multiple of it.

### Money paths — cart, checkout, and their agreement

R10. `lib/order-totals.ts`'s `TotalsLine` accepts an optional explicit line total, and
     `computeTotals` uses `unitPricePence × quantity` when it is absent — so a caller that does not
     supply the new field compiles and behaves exactly as before, and `tests/order-totals.test.ts`
     passes with no modification to any pre-existing case.

R11. `lib/repositories/cart.ts` computes each `CartLine.lineTotalPence` through
     `lib/tier-pricing.ts`'s R6 function, and `CartSummary.subtotalPence` is the sum of those
     tier-aware line totals for available lines.

R12. `lib/repositories/orders.ts`'s `placeOrder` computes each line's total through the same
     `lib/tier-pricing.ts` function and writes it to `OrderItem.lineTotalPence`, while
     `OrderItem.unitPricePence` continues to store the product's base unit price.

R12a. Every read that resolves a tier passes `vendorId` explicitly and filters on it, so a
     `ProductPriceTier` belonging to another vendor can never price a line — asserted by a test that
     seeds a tier under one vendor and confirms the other vendor's identical product prices at base.

R13. For a basket qualifying for a tier, the `subtotalPence` shown by the cart and the
     `Order.subtotalPence` written by `placeOrder` are equal — verified live against a real basket,
     not by code inspection.

R14. `placeOrder` judges `input.rules.minimumOrderPence` and the free-delivery threshold against the
     tier-reduced subtotal, and `lib/repositories/orders.ts` carries a comment stating that a tier is
     a price rather than a deduction and is therefore inside the figure those thresholds are judged
     on.

R15. A percentage discount code applied to a tiered basket computes its value from the tier-reduced
     subtotal: for a basket whose tiered subtotal is `S`, a `PERCENTAGE` code of `v` basis points
     produces `Order.discountPence` equal to `floor(S × v / 10000)`, verified live through a real
     checkout.

### Storefront & staff surfaces

R16. `components/product/ProductCard.tsx` renders a badge naming the tier's group quantity and group
     price when an active tier exists for that product, and renders no such badge when none does.

R17. `ProductCard`'s existing `originalPrice` markdown badge (`originalPrice > basePrice`) continues
     to render on its own terms, and a product carrying both an `originalPrice` markdown and an
     active tier renders the two as distinct claims with no figure counted in both.

R18. The cart line for a product with an applied tier displays the saving returned by R8's function.

R19. A vendor `ADMIN` can create, edit and deactivate a product's tier through the existing
     `/staff/products` product form, and `features/admin/catalogue.ts` exports only `async` functions
     after this slice's changes.

R20. `prisma/seed.ts` creates at least one active `ProductPriceTier` for **each** of the two seeded
     vendors, and completes without error on a database already holding this slice's migration.

### Documentation & tracked-issue discipline

R21. `specs/roadmap.md`'s P8.5 paragraph no longer states that P8.5d discharges #147, and instead
     records that #147, #146, #148 and #149 all remain open after this slice.

R22. No commit message on this branch, and no line of this slice's PR body, places any of the words
     `close`, `closes`, `closed`, `fix`, `fixes`, `fixed`, `resolve`, `resolves` or `resolved`
     immediately before `#147`, `#146`, `#148`, `#149` or `#151`; `gh pr view <N> --json
     closingIssuesReferences` lists only #348.

R23. `specs/2026-08-25-p8.5d-multi-buy-tier-pricing/` contains `plan.md`, `requirements.md`,
     `validation.md` and `build-notes.md`, and `npm run kms:validate` reports zero invalid
     front-matter.

### Gates

R24. `CHANGELOG.md` updated (Gate 4).

R25. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.

<!--
  Numbering note: R1..R25 sequential, plus R12a. R12a is lettered rather than renumbering R13..R25
  because it was added during the spec's own adversarial pass — it is a multi-tenancy property
  (#340 is an open instance of getting exactly this class wrong on a different model) that belongs
  beside the two read paths it constrains, R11 and R12, rather than appended at the end.

  R13 and R15 are the two rows that cannot be satisfied by static inspection — both require
  `npm run preview` against a migrated, seeded database, and R13 is the one guarding this slice's
  most likely real defect (cart and checkout diverging).
-->
