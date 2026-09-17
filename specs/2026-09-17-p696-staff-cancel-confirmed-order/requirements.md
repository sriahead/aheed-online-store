# Staff cancellation of a CONFIRMED order (requirements / acceptance criteria)

Closes **#696**, **#137** and **#151**. Staff gain a path to cancel a paid order whose goods are
still in the store; that path restores stock, reverses the loyalty earn and the discount-code use,
and moves no money. #137 and #151 are unreachable code today because `releaseOrder` acts only on
`PENDING_PAYMENT` orders, strictly before `confirmPayment` writes the `EARN` — this slice is what
makes them reachable, which is why all three close together. Refunds stay with **#606**; revenue
reporting stays with **#795**. See `plan.md` for the reasoning behind each requirement below.

## Schema

R1. `LoyaltyEntryKind` in `prisma/schema.prisma` contains a fourth value, `EARN_REVERSAL`, and the
    three existing values (`EARN`, `REDEEM`, `REVERSAL`) are unchanged in name and order.

R2. `LoyaltyLedgerEntry` still declares `@@unique([orderId, kind])`, unmodified by this slice.

R3. `DiscountRedemption` in `prisma/schema.prisma` has a new nullable column `reversedAt
    DateTime?`, and its three existing constraints (`@@unique([orderId])`,
    `@@unique([codeId, userId, seq])`, `@@index([vendorId, codeId])`) are unchanged.

R4. The migration for R1–R3 was generated with `--create-only`, and its SQL contains no `DROP INDEX`
    statement against any `pg_trgm` index and no `DROP`/`ALTER` against any table other than
    `DiscountRedemption` and the `LoyaltyEntryKind` type.

## Pure status logic (`lib/order-status.ts`, no I/O, no Prisma import)

R5. `canCancel(status: string): boolean` is exported from `lib/order-status.ts` and returns `true`
    for exactly `CONFIRMED` and `READY_FOR_COLLECTION`, and `false` for `PENDING_PAYMENT`,
    `OUT_FOR_DELIVERY`, `DELIVERED`, `COLLECTED`, `CANCELLED`, and any unrecognised string.

R6. `LEGAL_TRANSITIONS` gains no new entry and no `CANCELLED` target: for every one of the seven
    statuses and both fulfilment methods, `nextStatus` and `canTransition` return exactly what they
    returned before this slice.

## Repository layer (`lib/repositories/*`)

R7. `cancelConfirmedOrder` is exported from `lib/repositories/orders.ts` and takes its Prisma client
    and `vendorId` as explicit parameters, reading no request context —
    `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts` both still
    pass with no allowlist entry added for it.

R8. `cancelConfirmedOrder` performs its status change as a guarded `updateMany` whose `where`
    includes `vendorId` and `status: { in: ["CONFIRMED", "READY_FOR_COLLECTION"] }`, and returns
    `false` without writing anything else when that update matches zero rows.

R9. Calling `cancelConfirmedOrder` twice for the same order produces exactly the same database state
    as calling it once: one `CANCELLED` order, one `EARN_REVERSAL` row, at most one `REVERSAL` row,
    one `reversedAt` stamp, and inventory incremented exactly once per `OrderItem`.

R10. After `cancelConfirmedOrder` succeeds, every `OrderItem`'s product has its `Inventory.quantity`
     incremented by that item's `quantity`.

R11. After `cancelConfirmedOrder` succeeds, the order's `Payment` row is byte-for-byte unchanged —
     in particular `status` is still `SUCCEEDED` and no code path in this slice writes
     `PaymentStatus.FAILED` or `PaymentStatus.REFUNDED`.

R11a. After `cancelConfirmedOrder` succeeds, the order's fulfilment slot reports one more unit of
     available capacity from `getAvailableSlotsForDate` than it did immediately before — with no
     change to `lib/repositories/fulfilment-slots.ts`, whose used-count already omits `CANCELLED`.

R12. After `cancelConfirmedOrder` succeeds, a new `OrderStatusEvent` exists for the order with
     `status: "CANCELLED"`, a `note` containing the reason supplied by the caller, and
     `createdByUserId` set to the acting staff user's id.

R13. `reverseEarn` is exported from `lib/repositories/loyalty.ts`, writes a ledger row with
     `kind: "EARN_REVERSAL"` whose `points` is the exact negation of the order's `EARN` row's
     `points`, and decrements the matching `LoyaltyAccount.balancePoints` by that same amount.

R14. `reverseEarn` returns `0` and writes nothing when the order has no `EARN` row, and returns `0`
     and writes no second row when an `EARN_REVERSAL` already exists for that order.

R15. `reverseEarn` writes its ledger row even when the `EARN` row's `userId` is `null` (the shopper
     exercised erasure under #216), and in that case updates no `LoyaltyAccount`.

R16. `reverseCodeRedemptionForPaidOrder` is exported from `lib/repositories/discounts.ts`, sets
     `reversedAt` on the order's `DiscountRedemption` row, increments that code's
     `remainingRedemptions`, and **does not delete the row**. It returns `0` and writes nothing when
     the row is absent or already has a non-null `reversedAt`.

R17. `releaseCodeRedemption` — the unpaid path — still deletes the redemption row, and `releaseOrder`
     still calls it. The behaviour of `releaseOrder` is unchanged by this slice in every respect:
     same guard, same `payment.status = "FAILED"` write, same three compensations.

R18. `seq` allocation in `lib/repositories/discounts.ts` is `(max(seq) ?? -1) + 1` over all
     redemptions for that `(vendorId, codeId, userId)`, while the value passed to `evaluateCode` as
     `customerUseCount` counts only rows with `reversedAt: null`.

R19. Given a customer with one reversed redemption of a code capped at one use per customer, a
     second checkout with that code succeeds, and writes a redemption row whose `seq` differs from
     the reversed row's `seq`.

R20. A new `tests/discounts-repository.test.ts` exists and covers `claimCode`,
     `recordCodeRedemption`, `releaseCodeRedemption` and `reverseCodeRedemptionForPaidOrder` —
     none of which has any test today, `tests/discounts.test.ts` covering only the pure
     `evaluateCode`. It includes a case proving that two claims of the same code by the same
     customer resolving to the same `seq` produce exactly one `DiscountRedemption` row, the loser
     raising `CUSTOMER_LIMIT_REACHED` from the `@@unique([codeId, userId, seq])` violation — the
     guarantee R18 must not weaken, and which is currently asserted only by a code comment.

R21. Every write path added by this slice resolves its client through `getPrismaWs()`, not
     `getPrisma()`.

## Service and action layer

R22. `getOrderCancelService()` in `lib/orders-service.ts` exposes a `cancelConfirmed` member
     alongside the existing `cancelUnpaid`, resolving the client and `vendorId` itself.

R23. `features/orders/cancel-order-staff.ts` carries the `"use server"` directive and exports only
     `async function` declarations — no constants, no types, no re-exports.

R24. The cancel action calls `requireVendorRole("ADMIN")` and returns without writing when the check
     fails, independently of any gate on the page that rendered the form.

R25. The cancel action re-reads the order and refuses when `canCancel(persistedStatus)` is false,
     so a forged or stale form payload naming a non-cancellable order writes nothing.

## Staff surface

R26. `app/(admin)/staff/orders/[orderNumber]/page.tsx` renders a cancel form only when
     `canCancel(order.status)` is true, and the form contains a `required` reason field.

R27. The staff order queue (`app/(admin)/staff/orders/page.tsx`) gains no cancel control — the
     advance button there is unchanged.

R28. The page's existing `requireVendorRole` refusal branch still renders `PanelRefusal`, and the
     three staff-panel tests (`PanelNav`, hub, operator guide) still pass with no new page added.

## Customer-visible

R29. `sendOrderStatusEmail`'s `COPY` table has a `CANCELLED` entry whose body text states that no
     payment has been returned, and contains none of the words "refund", "refunded" or "repaid".

R30. A cancelled order renders `Cancelled` on the customer's order history and detail pages via the
     existing `orderStatusLabel`/`buildTimeline` path, with no change to either function.

## Documentation

R31. The three comments this slice makes false are corrected in the same commit as the code:
     `lib/order-status.ts` ("Staff cannot cancel"), `lib/repositories/loyalty.ts` ("An EARN cannot
     be [reversed]"), and `components/orders/OrderPointsNote.tsx` ("releaseOrder only ever acts on
     PENDING_PAYMENT").

R32. `specs/decisions/ADR-005-payments-money-flow.md` gains an implementation note dated 2026-09-17
     citing #696, recording that earn and code-use reversal now ship without refunds, and stating
     that no numbered decision is reopened and refunds remain the ADR's open territory. Its two
     existing passages asserting that these cannot be reversed are amended to point at that note.

R33. `specs/2026-09-17-p696-staff-cancel-confirmed-order/plan.md` has valid front-matter
     (`npm run kms:validate` exits 0) and has an entry in `ARTIFACT_INDEX.md`.

R34. `CHANGELOG.md` updated (Gate 4).

R35. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
