# P5a — Loyalty points: earn, redeem, tiers, expiry & admin config (requirements / acceptance criteria)

Issue **#135**, first slice of P5 (phase issue **#88**). Builds on P3b's checkout transaction
(`placeOrder`), P3c's webhook confirm/fail paths (`confirmPayment` / `releaseOrder`), ADR-004 slice
3a's `VendorMembership` and P4b's `/staff` segment. A shopper earns per-vendor points on paid
orders, spends them at checkout through `computeTotals`, and loses them to inactivity — with tier
multipliers and an admin config surface. One additive migration. No new email is sent, no new
infrastructure, no change to `lib/payments.ts`.

Throughout: **points are integers**, **money is integer pence**, and **multipliers are basis
points** (`10000` = 1.0×). `MIN_PAYABLE_PENCE` is `30`.

## Pure rules — `lib/loyalty.ts`

R1. `lib/loyalty.ts` contains no I/O: the strings `getPrisma`, `@prisma/client`, `fetch(`,
    `cookies(` and `headers(` do not appear as code in the file, and its unit tests pass with no
    database reachable.

R2. `lib/loyalty.ts` exports `MIN_PAYABLE_PENCE` with the value `30` and `DEFAULT_MULTIPLIER_BPS`
    with the value `10000`.

R3. `eligibleSpendPence({ subtotalPence, discountPence })` returns `subtotalPence - discountPence`,
    and returns `0` rather than a negative number when `discountPence` exceeds `subtotalPence`.

R4. `computePointsEarned(eligibleSpendPence, pointsPerPoundEarned, multiplierBps)` returns
    `Math.floor(Math.floor(eligibleSpendPence / 100) * pointsPerPoundEarned * multiplierBps / 10000)`
    — verified by these exact cases: `(1000, 1, 10000) === 10`, `(1099, 1, 10000) === 10`,
    `(1000, 1, 15000) === 15`, `(1000, 2, 15000) === 30`, `(1050, 1, 15000) === 15`.

R5. `computePointsEarned` returns `0` when `eligibleSpendPence` is less than `100`, and returns `0`
    (never a negative number) when `eligibleSpendPence` is `0` or negative.

R6. `isLapsed(lastActivityAt, now, pointsExpiryMonths)` returns `false` for every input when
    `pointsExpiryMonths` is `null`, and returns `false` when `lastActivityAt` is `null`.

R7. With `pointsExpiryMonths = 12`, `isLapsed` returns `false` for a `lastActivityAt` exactly 12
    months before `now` and `true` for one 12 months and one day before `now`. "Months" means UTC
    calendar-month arithmetic (`setUTCMonth`), so the rule is defined without reference to a
    30-day approximation.

R8. `visibleBalance(balancePoints, lastActivityAt, now, pointsExpiryMonths)` returns `0` whenever
    `isLapsed(...)` is `true` for the same inputs, and returns `balancePoints` otherwise.

R9. `clampRedemption({ requestedPoints, balancePoints, pencePerPointRedeemed, minRedeemPoints,
    subtotalPence, deliveryFeePence })` returns `{ pointsSpent, discountPence }` in which
    `discountPence === pointsSpent * pencePerPointRedeemed` **exactly**, for every input — a shopper
    is never debited points that did not reduce their bill.

R10. `clampRedemption` returns `{ pointsSpent: 0, discountPence: 0 }` when `requestedPoints` is `0`,
     negative, or **not an integer** (a non-integer is rejected outright, not rounded), and when the
     resulting `pointsSpent` would be below `minRedeemPoints`.

R11. `clampRedemption`'s `pointsSpent` never exceeds `balancePoints`, and its `discountPence` never
     exceeds `subtotalPence`.

R12. `clampRedemption` never returns a `discountPence` that would leave
     `subtotalPence - discountPence + deliveryFeePence` below `MIN_PAYABLE_PENCE` — verified with a
     subtotal of `100`, a delivery fee of `0`, a balance of `10000`, `minRedeemPoints` of `0` and
     `pencePerPointRedeemed` of `1`, which yields `discountPence === 70` and `pointsSpent === 70`.

R13. `resolveTier(tiers, spendPence)` returns the tier with the greatest `thresholdPence` that is
     less than or equal to `spendPence`, and returns `null` when `tiers` is empty or no threshold
     qualifies.

## Money — `lib/order-totals.ts`

R14. `computeTotals` accepts a discount and returns `discountPence` in its result alongside
     `subtotalPence`, `deliveryFeePence` and `totalPence`.

R15. For every result `computeTotals` returns,
     `subtotalPence - discountPence + deliveryFeePence === totalPence`.

R16. `computeTotals` evaluates the free-delivery threshold against `subtotalPence` **before** the
     discount — verified with a threshold of `3000`, a subtotal of `3000` and a discount of `500`,
     which returns `deliveryFeePence === 0`.

R17. Calling `computeTotals` with no discount (or a discount of `0`) returns exactly the
     `subtotalPence`, `deliveryFeePence` and `totalPence` it returned before this slice, proven by
     the pre-existing `tests/order-totals.test.ts` cases passing unmodified.

R18. `placeOrder` evaluates `minimumOrderPence` against `subtotalPence` **before** the discount, so
     redeeming points cannot push an otherwise-valid order below the vendor's minimum.

## Schema & migration

R19. `prisma/schema.prisma` declares three new models — `LoyaltyLedgerEntry`, `LoyaltyAccount` and
     `VendorLoyaltyTier` — and one new enum `LoyaltyEntryKind` with exactly the values `EARN`,
     `REDEEM`, `REVERSAL`.

R20. `LoyaltyLedgerEntry` carries `vendorId`, `userId`, `orderId`, `kind`, a signed integer `points`,
     and nullable `tierKey` / `multiplierBps` columns; it declares `@@unique([orderId, kind])`.

R21. `LoyaltyAccount` declares `@@unique([vendorId, userId])` and carries `balancePoints`,
     `lifetimePoints` and `lastActivityAt`; `VendorLoyaltyTier` declares `@@unique([vendorId, key])`
     and carries `thresholdPence` and `multiplierBps`.

R22. `Order` declares `discountPence Int @default(0)` and no other new field.

R23. `VendorConfig` declares `loyaltyEnabled Boolean @default(false)`, `pointsPerPoundEarned`,
     `pencePerPointRedeemed`, `minRedeemPoints`, `tierWindowDays` and a nullable
     `pointsExpiryMonths`, each numeric field carrying a Prisma-level default.

R24. Exactly one new migration directory exists under `prisma/migrations/`, and its `migration.sql`
     contains no `DROP` statement, no `SET NOT NULL`, and no `ALTER TYPE` against an enum that
     existed before this slice.

R25. `prisma migrate deploy` applies the migration to a database already holding P4-era data without
     error; afterwards every pre-existing `Order` row has `discountPence = 0` and the row counts of
     `Order`, `OrderItem` and `OrderStatusEvent` are unchanged.

R26. `prisma migrate status` reports no pending migrations and no drift after R25.

## Redemption — inside `placeOrder`

R27. The checkout form submits a **points count** only; no field carrying a discount, a price or a
     total is read from the form by `placeOrderAction` or `placeOrder`.

R28. `placeOrder` recomputes the discount inside its existing transaction from the persisted
     `LoyaltyAccount.balancePoints` and the vendor's config, never from the submitted value.

R29. The points spend is a conditional `updateMany` on `LoyaltyAccount` whose `where` includes
     `vendorId`, `userId`, `balancePoints: { gte: pointsSpent }` and a non-lapsed `lastActivityAt`;
     when it matches zero rows the order is placed with `discountPence = 0` and no ledger entry.

R30. A successful redemption writes exactly one `LoyaltyLedgerEntry` with `kind = "REDEEM"`, a
     `points` value equal to `-pointsSpent`, and the new order's `orderId`; and decrements
     `LoyaltyAccount.balancePoints` by exactly `pointsSpent`.

R31. Two concurrent `placeOrder` calls redeeming the same balance from the same account result in at
     most one `REDEEM` entry for that balance, and `LoyaltyAccount.balancePoints` never goes
     negative.

R32. A guest checkout (`userId === null`) applies no discount and writes no `LoyaltyLedgerEntry`,
     regardless of the points value submitted in the form.

R33. A redemption attempt against a vendor other than the one that holds the balance applies no
     discount and writes no ledger entry — the account is unmatchable, not merely rejected.

R34. A redemption attempt on a lapsed account (per R7's rule) applies no discount and writes no
     ledger entry.

R35. When the vendor's `loyaltyEnabled` is `false`, the checkout page renders no points input and
     `placeOrder` applies no discount even if a points count is submitted.

R36. When the vendor's `loyaltyEnabled` is `true` and the signed-in shopper's visible balance is at
     least `minRedeemPoints`, the checkout page renders a points input named `redeemPoints` and
     displays that visible balance.

## Earning — inside `confirmPayment`

R37. `confirmPayment` writes exactly one `LoyaltyLedgerEntry` with `kind = "EARN"` and a positive
     `points` value, inside the same transaction that sets the order to `CONFIRMED`.

R38. The earned points equal `computePointsEarned(subtotalPence - discountPence,
     pointsPerPoundEarned, multiplierBps)` for the order — so no points are earned on the delivery
     fee and none are earned on the value paid for with redeemed points.

R39. A repeated `confirmPayment` call for the same order (a duplicate Stripe delivery) writes no
     second `EARN` entry and does not increase `LoyaltyAccount.balancePoints` a second time.

R40. The `EARN` entry records the `tierKey` and `multiplierBps` that were applied; when no tier
     qualifies, `tierKey` is null and `multiplierBps` is `10000`.

R41. Earning against a **lapsed** account sets `LoyaltyAccount.balancePoints` to exactly the newly
     earned amount rather than incrementing the stale balance, and updates `lastActivityAt`.

R42. Earning against a non-lapsed account increments `balancePoints` and `lifetimePoints` by the
     earned amount and updates `lastActivityAt`.

R43. An order placed by a guest earns no points and writes no ledger entry when confirmed.

## Reversal — inside `releaseOrder`

R44. When `releaseOrder` cancels an order that has a `REDEEM` entry, it writes exactly one
     `LoyaltyLedgerEntry` with `kind = "REVERSAL"` whose `points` is the exact negation of the
     `REDEEM` row's `points`, and restores `LoyaltyAccount.balancePoints` by that amount.

R45. `releaseOrder` on an order with no `REDEEM` entry writes no `REVERSAL` and leaves every
     `LoyaltyAccount` row unchanged.

R46. A repeated `releaseOrder` call for the same order writes no second `REVERSAL` and does not
     credit the balance twice.

## Customer surface — `/account/loyalty`

R47. `GET /account/loyalty` returns a redirect or a 401/403 for an unauthenticated visitor, matching
     the existing behaviour of `/account/orders`.

R48. For a signed-in shopper at a loyalty-enabled vendor, `/account/loyalty` renders the visible
     balance (per R8), its cash value in pounds, the lifetime points total, and the current tier
     name or an explicit "no tier" state.

R49. `/account/loyalty` renders the shopper's ledger entries for **this vendor only**, newest first,
     each showing its kind, signed points and date.

R50. When the vendor's `loyaltyEnabled` is `false`, `/account/loyalty` returns a 404.

R51. `/account/orders/{orderNumber}` and `/checkout/{orderNumber}` render a discount line showing
     `discountPence` when it is non-zero, and render no discount line when it is `0`.

## Admin surface — `/staff/loyalty`

R52. `GET /staff/loyalty` renders the config form for a user holding vendor `ADMIN` (or platform
     `ADMIN`) for the current vendor, and refuses a user holding only vendor `STAFF`.

R53. The server action behind the form re-runs `requireVendorRole("ADMIN")` itself rather than
     relying on the page's check, and returns its refusal as data rather than throwing.

R54. Submitting the form persists `loyaltyEnabled`, `pointsPerPoundEarned`, `pencePerPointRedeemed`,
     `minRedeemPoints`, `pointsExpiryMonths` and `tierWindowDays` to the current vendor's
     `VendorConfig` row.

R55. Submitting the form persists edited `thresholdPence` and `multiplierBps` values to existing
     `VendorLoyaltyTier` rows, and P5a ships no control that creates or deletes a tier row.

R56. The action writes only to the **current** vendor's `VendorConfig` and `VendorLoyaltyTier` rows;
     no submitted field can redirect the write to another vendor's rows.

R57. Rejected input (a negative number, a non-integer, or a `pencePerPointRedeemed` below `1`)
     leaves every persisted value unchanged and returns an error message.

## Tenancy, seed & layering

R58. `prisma/seed.ts` seeds Aheed with `loyaltyEnabled = true` and at least two `VendorLoyaltyTier`
     rows, and seeds SriMart with `loyaltyEnabled = false`; the seed remains idempotent across two
     consecutive runs.

R59. No file added or modified by this slice under `app/`, `features/` or `components/` imports
     `@/lib/db` or `@prisma/client` — all loyalty DB access goes through
     `lib/repositories/loyalty.ts`.

R60. Every loyalty query filters on `vendorId`, and `lib/repositories/loyalty.ts` exposes its
     transactional functions taking `prisma` and `vendorId` as explicit arguments, so they are
     callable from a plain `tsx` script with no Workers request context.

## Existing surfaces this slice must keep honest

R61. The order confirmation email (`features/checkout/send-confirmation.ts`) renders a discount line
     when the order's `discountPence` is non-zero, so its money block reconciles —
     `subtotal - discount + delivery = total`. It renders no discount line when `discountPence` is
     `0`, and no additional email is sent by this slice.

R62. `specs/architecture.md` states the order money identity including the discount, and its
     multi-table-transaction guidance names the points movement alongside the stock decrement.

R63. `specs/decisions/ADR-005-payments-money-flow.md` carries a P5a implementation note recording
     that a redemption reduces the amount **before** the Stripe session is created — leaving the
     `PaymentService` port and the webhook unchanged — and why `MIN_PAYABLE_PENCE` exists. No
     ADR-005 decision is reopened or altered.

## Gates

R64. `CHANGELOG.md` updated (Gate 4).

R65. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
