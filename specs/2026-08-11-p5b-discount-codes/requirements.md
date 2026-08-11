# P5b — Discount codes: engine, checkout application & staff admin (requirements / acceptance criteria)

Issue **#145**, second and final slice of P5 (phase issue **#88**). Builds on P3b's checkout
transaction (`placeOrder`), P3c's `releaseOrder` compensating path, ADR-004 slice 3a's
`VendorMembership`, P4b's `/staff` segment, and P5a's `computeTotals` discount parameter and
`clampRedemption`. A vendor admin creates a per-vendor code; a shopper enters it at checkout; it
reduces `Order.discountPence` alongside any loyalty points, without a usage cap ever being exceeded.
One additive migration. **No change to `lib/payments.ts`, `/api/webhooks/stripe`, or any ADR-005
decision. No new column on `Order`.**

Throughout: **money is integer pence**, **percentages are basis points** (`1000` = 10%), and
`MIN_PAYABLE_PENCE` is `30`.

## Pure rules — `lib/discounts.ts`

R1. `lib/discounts.ts` contains no I/O: the strings `getPrisma`, `@prisma/client`, `fetch(`,
    `cookies(` and `headers(` do not appear as code in the file, and its unit tests pass with no
    database reachable.

R2. `lib/discounts.ts` exports a `DiscountKind` type whose only members are `"PERCENTAGE"` and
    `"FIXED_AMOUNT"`, and a `CodeRefusalReason` type whose only members are `"UNKNOWN"`,
    `"INACTIVE"`, `"NOT_STARTED"`, `"EXPIRED"`, `"BELOW_MINIMUM"`, `"USAGE_LIMIT_REACHED"`,
    `"CUSTOMER_LIMIT_REACHED"`, `"SIGN_IN_REQUIRED"` and `"NO_HEADROOM"`.

R3. `lib/discounts.ts` imports `MIN_PAYABLE_PENCE` from `@/lib/loyalty` and does not define its own
    copy: the file contains no assignment of the literal `30` to a constant.

R4. `normaliseCode(raw)` trims surrounding whitespace and uppercases, verified by these exact cases:
    `normaliseCode(" welcome10 ") === "WELCOME10"`, `normaliseCode("Welcome10") === "WELCOME10"`,
    `normaliseCode("   ") === ""`, `normaliseCode("") === ""`.

R5. `computeCodeDiscountPence({ kind: "PERCENTAGE", value, subtotalPence })` returns
    `Math.floor(subtotalPence * value / 10000)`, verified by these exact cases: `(1000, 1000) === 100`,
    `(1999, 1000) === 199`, `(1000, 2500) === 250`, `(999, 3333) === 332`. The last case is the one
    that proves flooring rather than rounding: `999 × 3333 / 10000` is `332.9667`.

R6. `computeCodeDiscountPence({ kind: "FIXED_AMOUNT", value, subtotalPence })` returns `value`
    unchanged before clamping, verified by `(value 500, subtotalPence 10000) === 500` and
    `(value 500, subtotalPence 200) === 500`.

R7. `evaluateCode` returns `{ ok: false, reason }` with the reason matching the condition, one case
    each: `isActive: false` → `"INACTIVE"`; `now` before `startsAt` → `"NOT_STARTED"`; `endsAt`
    non-null and `now` after `endsAt` → `"EXPIRED"`; `subtotalPence` below `minSubtotalPence` →
    `"BELOW_MINIMUM"`; `remainingRedemptions === 0` → `"USAGE_LIMIT_REACHED"`; `maxPerCustomer`
    non-null with `userId: null` → `"SIGN_IN_REQUIRED"`; `customerUseCount >= maxPerCustomer` →
    `"CUSTOMER_LIMIT_REACHED"`. `"UNKNOWN"` is deliberately **not** producible by `evaluateCode` —
    it belongs to the repository lookup, which is the only layer that can know a code does not
    exist.

R8. Boundary cases resolve inclusively: `now` exactly equal to `startsAt` is **not** `"NOT_STARTED"`,
    `now` exactly equal to `endsAt` is **not** `"EXPIRED"`, and `subtotalPence` exactly equal to
    `minSubtotalPence` is **not** `"BELOW_MINIMUM"`.

R9. `endsAt: null` never produces `"EXPIRED"`, `remainingRedemptions: null` never produces
    `"USAGE_LIMIT_REACHED"`, and `maxPerCustomer: null` never produces `"SIGN_IN_REQUIRED"` or
    `"CUSTOMER_LIMIT_REACHED"` — for any other input.

R10. When more than one refusal condition holds simultaneously, `evaluateCode` returns the first
     applicable reason in this exact order: `INACTIVE`, `NOT_STARTED`, `EXPIRED`,
     `USAGE_LIMIT_REACHED`, `SIGN_IN_REQUIRED`, `CUSTOMER_LIMIT_REACHED`, `BELOW_MINIMUM`,
     `NO_HEADROOM` — verified by an input satisfying all of them at once.

R11. On success `evaluateCode` returns `{ ok: true, discountPence }` where `discountPence` is at
     least `1`, never exceeds `subtotalPence`, and never leaves
     `subtotalPence + deliveryFeePence - discountPence` below `MIN_PAYABLE_PENCE` — asserted over at
     least 200 randomised inputs, not only hand-picked cases.

R12. A code whose clamped discount would be `0` is refused with `{ ok: false, reason: "NO_HEADROOM" }`
     rather than returned as a success carrying a zero discount — verified with a `FIXED_AMOUNT`
     code of `500` against `subtotalPence: 0, deliveryFeePence: 0`.

## Stacking — `clampRedemption` in `lib/loyalty.ts`

R13. `ClampRedemptionInput` gains an optional `existingDiscountPence` whose default is `0`. Every
     existing case in `tests/loyalty.test.ts` passes with that file's existing cases unmodified.

R14. With `existingDiscountPence = E`, the returned `discountPence` never exceeds
     `subtotalPence - E`, and never leaves `subtotalPence + deliveryFeePence - E - discountPence`
     below `MIN_PAYABLE_PENCE` — asserted over at least 200 randomised inputs including `E = 0`.

R15. The P5a invariant `discountPence === pointsSpent * pencePerPointRedeemed` still holds for every
     input with `E > 0` — points are still derived back from the capped pence, never the reverse.

R16. `clampRedemption` returns `{ pointsSpent: 0, discountPence: 0 }` when `existingDiscountPence`
     is greater than or equal to `subtotalPence`.

## Schema & migration

R17. `prisma/schema.prisma` declares `model DiscountCode` with exactly these non-relation fields:
     `id`, `vendorId`, `code`, `description`, `kind` (`DiscountKind` enum), `value`,
     `minSubtotalPence`, `startsAt`, `endsAt`, `remainingRedemptions`, `maxPerCustomer`, `isActive`,
     `createdAt`, `updatedAt`. `endsAt`, `remainingRedemptions`, `maxPerCustomer` and `description`
     are nullable; no other field is.

R18. `DiscountCode` carries `@@unique([vendorId, code])` and an index leading with `vendorId`.

R19. `DiscountCode` has **no** `usedCount` or equivalent upward-counting column — asserted against
     a *field declaration*, not the bare word: `prisma/schema.prisma` contains no line matching
     `^\s*usedCount\s+Int`. The word itself appears twice in the model's doc comment, explaining why
     the column is absent and why the counter runs downward; a check that failed on those would be
     satisfiable only by deleting the rationale (the `sdd-workflow.md` trap P4a hit twice).

R20. `prisma/schema.prisma` declares `model DiscountRedemption` with non-relation fields `id`,
     `vendorId`, `codeId`, `orderId`, `userId` (nullable), `seq`, `amountPence`, `createdAt`, and
     carries both `@@unique([orderId])` and `@@unique([codeId, userId, seq])`.

R21. The migration this slice adds is additive: its SQL contains no `DROP` statement and no
     `ALTER TABLE "Order"` statement.

R22. `git diff origin/staging -- prisma/schema.prisma` shows no change inside `model Order { … }`
     other than the addition of a back-relation field for `DiscountRedemption`. No money column is
     added to `Order`.

R23. No `Json` column is introduced, and every money field added by this slice is an `Int` of pence
     (`value` for a `FIXED_AMOUNT` code, `minSubtotalPence`, `amountPence`); a `PERCENTAGE` code's
     `value` is basis points, stated in a schema comment.

R24. `npx prisma migrate status` against the staging database reports no failed and no pending
     migrations after the migration is applied, and `npm run typecheck` exits 0 against the
     regenerated client.

## Repository — `lib/repositories/discounts.ts`

R25. Every exported **transactional** function — `claimCode`, `recordCodeRedemption`,
     `releaseCodeRedemption` — takes the Prisma client (or transaction client) as its first argument
     and `vendorId` as its second, and reads no request context; verified by reading the file, and
     demonstrated by the fixture script driving them directly under `tsx`. The **admin** write
     wrappers called from `features/admin/` take `vendorId` only and resolve Prisma internally,
     matching P5a's `saveLoyaltySettings(vendorId, …)`: ADR-004 slice 2's ESLint guard forbids
     `@/lib/db` in the feature layer, so an action cannot supply a client. The testability this
     requirement exists for is the concurrency guarantees, which live entirely in the transactional
     functions; the admin writes have no race to prove and are exercised through the action (R54–R58).

R26. Every Prisma `where` in `lib/repositories/discounts.ts` names `vendorId` — verified by reading
     each query in the file.

R27. `claimCode` performs its usage-cap check as a conditional `updateMany` whose `where` includes
     `vendorId`, `isActive: true` and a `remainingRedemptions` guard, with `{ decrement: 1 }` in its
     `data`; a `count` of `0` yields a refusal rather than a claim.

R28. Claiming a code whose `remainingRedemptions` is `null` leaves it `null` afterwards — an
     unlimited code stays unlimited, verified live against Postgres.

R29. Two concurrent `placeOrder` calls (`Promise.all`) for a code whose `remainingRedemptions` is
     `1` produce exactly one order carrying the discount and one refusal; afterwards
     `remainingRedemptions` is `0` and exactly one `DiscountRedemption` row exists for that code.

R30. `DiscountRedemption.seq` is the shopper's zero-based use index for that code: the first
     redemption by a user has `seq = 0`, the second `seq = 1`.

R31. Two concurrent `placeOrder` calls by the **same signed-in shopper** for a code with
     `maxPerCustomer: 1` produce exactly one success and one refusal, and exactly one
     `DiscountRedemption` row exists for that `(codeId, userId)` pair.

R32. `releaseCodeRedemption` deletes the order's `DiscountRedemption` row and increments the code's
     `remainingRedemptions` by exactly one; called a second time for the same order it performs no
     write and `remainingRedemptions` does not rise again.

R33. `releaseCodeRedemption` is the **only** code path that deletes a `DiscountRedemption` row: no
     other function in `lib/` or `features/` calls `delete` or `deleteMany` on that model. The table
     is otherwise append-only, and the single deliberate deletion carries a comment stating why it
     is a deletion rather than the reversal row the loyalty ledger writes.

R34. Releasing a redemption of a code whose `remainingRedemptions` is `null` leaves it `null`.

## Checkout application

R35. The `/checkout` page renders a text input named `discountCode`, and when a checkout is refused
     because of the code, the page renders the refusal message returned by the action.

R36. `PlaceOrderInput` gains an optional `discountCode` string. Its doc comment states it is an
     intent, not an amount — the discount in pence is recomputed inside the transaction from the
     persisted code row.

R37. `features/checkout/place-order.ts` reads `discountCode` from the form and passes it through; no
     money value is read from the form by this slice —
     `grep -n "discountPence" features/checkout/place-order.ts` returns nothing.

R38. An unusable code fails the checkout: `placeOrder` throws a `CheckoutError` whose message names
     the reason, **no `Order` row is created**, no `Inventory.quantity` is decremented, and no
     loyalty points are debited. Verified for `UNKNOWN`, `EXPIRED` and `USAGE_LIMIT_REACHED`.

R39. A valid code with no points redeemed produces an `Order` whose `discountPence` equals the code
     discount, and one `DiscountRedemption` row whose `amountPence` equals the same number.

R40. A valid code **plus** a points redemption on the same order produces an `Order` whose
     `discountPence` equals the sum of the two, with the `DiscountRedemption.amountPence` and the
     `LoyaltyLedgerEntry` `REDEEM` row each recording only their own contribution.

R41. A `PERCENTAGE` code's discount is computed on the **pre-discount** subtotal even when points are
     also spent: for a £20.00 subtotal, a 10% code and 300 points at 1p, `discountPence` is
     `200 + 300 = 500`, not `200` computed after the points came off.

R42. The combined discount never drives the payable total below `MIN_PAYABLE_PENCE`: with a subtotal
     and delivery fee whose sum is `£1.00`, a fixed `£5.00` code plus a points request produces a
     `totalPence` of at least `30`, and
     `subtotalPence - discountPence + deliveryFeePence === totalPence` holds.

R43. `minimumOrderPence` and the free-delivery threshold are still judged on the pre-discount
     subtotal when a code is applied: an order that clears both before the code still clears both
     after it, verified with a code large enough to drop the post-discount subtotal below each.

R44. A code's `minSubtotalPence` is judged on the pre-discount subtotal: an order that qualifies
     before points are spent still qualifies when points are also spent on the same checkout.

R45. Submitting the checkout form twice for the same cart creates no second `DiscountRedemption` row
     — the second submit fails on the already-cleared cart, as P3b's double-submit protection
     already provides.

R46. A **guest** checkout using a code with `maxPerCustomer: null` succeeds and writes a
     `DiscountRedemption` whose `userId` is null.

R47. A **guest** checkout using a code with `maxPerCustomer` set is refused with the
     `SIGN_IN_REQUIRED` reason surfaced in the message, and no order is created.

R48. A code belonging to SriMart, submitted on the Aheed host, is refused as `UNKNOWN`; afterwards
     SriMart's `DiscountCode` row is unchanged, including its `remainingRedemptions`.

## Release & earning

R49. Calling `failPayment` on a `PENDING_PAYMENT` order that used a code deletes its
     `DiscountRedemption` row and increments the code's `remainingRedemptions`, in the same
     transaction that reverses the loyalty `REDEEM` — both effects are observable after one call.

R50. Calling `failPayment` a second time on the same order returns `false` and leaves
     `remainingRedemptions` and the `DiscountRedemption` row count unchanged from after R49.

R51. Points earned on a code-discounted order exclude the code discount: after `confirmPayment` on
     an order with subtotal S and code discount D, the `EARN` row's `points` equals
     `computePointsEarned(S - D, pointsPerPoundEarned, multiplierBps)`.

R52. The order pages and the confirmation email render the combined discount as one line, and the
     identity `subtotalPence - discountPence + deliveryFeePence === totalPence` holds in the
     rendered output — verified on an order carrying both a code and points.

## `/staff/discounts`

R53. `GET /staff/discounts` returns `200` for a vendor `ADMIN` and for a platform `ADMIN`, returns
     the staff-only refusal for a user holding only vendor `STAFF`, and for an unauthenticated
     request returns the same status and `location` that `GET /staff/loyalty` returns under the same
     conditions.

R54. The create and deactivate actions call `requireVendorRole("ADMIN")` inside the action file
     itself. POSTing each action's payload with no `Cookie` header, and again with a plain
     customer's session, writes nothing: the `DiscountCode` row count and every existing row are
     unchanged after all four attempts, and each response is a refusal rendered as data, not a 500.

R55. The create action rejects invalid input with a message and writes nothing, verified for: an
     empty code, a `PERCENTAGE` value above `10000`, a negative `minSubtotalPence`, a non-integer
     `value`, and an `endsAt` earlier than `startsAt`.

R56. A created code takes its `vendorId` from the request host, never from the form. Replaying the
     create payload with an added `vendorId` field naming SriMart writes the code to **Aheed**;
     SriMart's `DiscountCode` rows are unchanged. The same replay is then performed **from the
     SriMart host as a SriMart admin against Aheed's id**, and Aheed's rows are unchanged — both
     directions, closing the gap #141 records for P5a.

R57. Creating a code whose normalised value already exists for this vendor is refused with a message
     and creates no second row; creating the same code string for a **different** vendor succeeds.

R58. The deactivate action sets `isActive` to `false` for a code belonging to the caller's vendor,
     and a checkout using that code is then refused with the `INACTIVE` reason.

R59. No edit path ships: reading `features/admin/discount-codes.ts` establishes that no exported
     action updates `value`, `kind`, `minSubtotalPence`, `startsAt`, `endsAt`, `remainingRedemptions`
     or `maxPerCustomer` on an existing row, and the rendered `/staff/discounts` body contains no
     form control bound to those fields for an existing code. Establish this by reading the file — a
     grep for "edit" would match the comment recording the exclusion.

R60. The rendered `/staff/discounts` list shows each code's redemption count, and that number is
     derived from `DiscountRedemption` rows rather than read from a stored column — confirmed by
     inserting a redemption row directly and seeing the rendered count rise.

## Seed, layering & docs

R61. `npm run db:seed` exits 0 and creates one `DiscountCode` for Aheed and none for SriMart. Run a
     second time it exits 0 and the `DiscountCode` row count is unchanged.

R62. Every file this slice adds under `app/`, `features/` or `components/` contains neither
     `@/lib/db` nor `@prisma/client`, and `npm run lint` exits 0 — which is where ADR-004 slice 2's
     no-direct-Prisma rule is enforced.

R63. `git diff origin/staging -- specs/architecture.md` is non-empty: the money-identity bullet
     records that the discount column now has **two** contributors with code-before-points
     precedence, and the multi-table-transaction bullet names the code claim. `npm run kms:validate`
     exits 0.

R64. `specs/decisions/ADR-005-payments-money-flow.md` gains a P5b implementation note recording that
     a code is applied inside the same `computeTotals` call and is equally invisible to the payment
     path. `git diff origin/staging` on that file shows **no** change inside its `## Decision`
     section — the note is additive. `npm run kms:validate` exits 0.

R65. `CHANGELOG.md` updated under `## [Unreleased]` (Gate 4).

R66. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
