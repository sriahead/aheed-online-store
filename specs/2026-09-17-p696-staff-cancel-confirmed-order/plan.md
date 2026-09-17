---
id: p696-staff-cancel-confirmed-order
title: "Staff cancellation of a CONFIRMED order (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-17
visibility: internal
summary: Gives staff a cancel path for a paid order whose goods are still in the store, restoring stock and reversing the loyalty earn and discount-code use — without moving money, which stays with #606.
tags: [orders, loyalty, discounts, staff, p9.2]
related: [architecture, adr-005-payments-money-flow, roadmap]
---

# Staff cancellation of a CONFIRMED order (plan)

**Closes #696, #137, #151.**

**Goal:** make a paid order cancellable by staff, and in doing so make #137 (reverse earned points)
and #151 (reverse a discount-code use) reachable at all. Both are unreachable code today — and say
so in their own bodies — because `releaseOrder` acts only on `PENDING_PAYMENT` orders, strictly
before `confirmPayment` writes the `EARN`. Nothing in this repository can currently cancel an order
that has earned points or spent a code, so shipping either reversal alone would ship dead code.

## Why the paid path cannot reuse `releaseOrder`

`releaseOrder` (`lib/repositories/orders.ts:570`) is private, hard-guarded on
`status: "PENDING_PAYMENT"`, and sets `payment.status = "FAILED"`. The guard could be widened; the
payment write cannot. For a CONFIRMED order the money arrived and — with refunds explicitly out of
scope — it stays. Writing `FAILED` there would be false at the moment it was written, and would
compound once #606 introduces a real `REFUNDED` writer. This slice therefore adds a sibling
transaction rather than parameterising the existing one, and leaves every existing caller of
`releaseOrder` (the webhook, `placeOrder`'s failure path, the shopper's own cancel) untouched.

## Why cancellation is not a rung on the status ladder

`lib/order-status.ts:118` already reasoned this out and this slice honours it rather than
overturning it:

> `DELIVERED`, `COLLECTED`, and `CANCELLED` are terminal. Staff cannot cancel — that is
> refund-adjacent (ADR-005) and a decision of its own, not a fifth button.

`LEGAL_TRANSITIONS` is a strictly-forward, one-rung-at-a-time ladder and `nextStatus` returns the
single legal successor that drives the queue's one button. Adding `CANCELLED` as a target would
make `nextStatus` ambiguous and turn a safe forward-only control into a destructive one. Cancel gets
its own predicate, `canCancel`, and its own action. The ladder is unchanged, and the quoted comment
is corrected to say that cancellation now exists as a separate authorized path.

## Scope (this slice)

- **Schema, one additive migration.** `LoyaltyEntryKind` gains `EARN_REVERSAL`.
  `DiscountRedemption` gains `reversedAt DateTime?`. No backfill, no data migration, and
  `@@unique([orderId, kind])` on `LoyaltyLedgerEntry` survives unchanged — it is the structural
  idempotency guard for every reversal path, and a new `kind` is precisely what lets a single order
  carry both a redeem reversal and an earn reversal without widening it.
- **`canCancel(status)`** in `lib/order-status.ts` — pure, no I/O, true for `CONFIRMED` and
  `READY_FOR_COLLECTION` only. Both mean the goods are physically still in the store, so restoring
  stock is truthful. `OUT_FOR_DELIVERY` is excluded: the goods are on a van and there is no
  return-to-stock step modelled anywhere.
- **`cancelConfirmedOrder`** in `lib/repositories/orders.ts` — one `$transaction` over
  `getPrismaWs()` (mandatory: it uses `updateMany`, which crashes unconditionally through
  `getPrisma()`). Guarded compare-and-set on the two cancellable statuses, `count === 0` meaning
  someone already handled it — the same idempotency technique `releaseOrder` and `confirmPayment`
  both use. Inside it: restore stock, write the `OrderStatusEvent` with the acting user and their
  reason, reverse the redeem (existing `reverseRedemption`), reverse the earn (new `reverseEarn`),
  and reverse the code use (new `reverseCodeRedemptionForPaidOrder`). The `Payment` row is
  deliberately not touched.
- **Discount reversal keeps the row.** `releaseCodeRedemption` *deletes* the redemption, and its
  rationale (`lib/repositories/discounts.ts:180`) is explicitly that "a discount on a never-paid
  order is not a financial event". For a paid cancellation that argument inverts: `Order.discountPence`
  is real money off a real payment, and the redemption row is the only thing that explains where
  that number came from — the identical reasoning that makes the loyalty ledger append-only. The
  paid path therefore stamps `reversedAt` and increments `remainingRedemptions`, keeping the row.
- **`seq` allocation is split from cap counting.** Today `seq` is `count(redemptions for this
  code+customer)` and is doing two jobs at once: it is the per-customer use count fed to
  `evaluateCode`, *and* it is the concurrency control, because `@@unique([codeId, userId, seq])`
  is what refuses the second of two simultaneous checkouts. A retained-but-reversed row breaks the
  first job (the customer should get their use back) and, under count-based allocation, would
  collide on the second — which is exactly the failure `discounts.ts:186` warns about. Splitting
  them fixes both: allocate `seq` as `(max(seq) ?? -1) + 1` over **all** rows, and count only
  `reversedAt: null` rows for the cap. Two concurrent checkouts still both compute the same `seq`
  and the unique index still refuses the loser, so the concurrency guarantee is preserved
  unchanged; a reversed row keeps its slot in the index without consuming one of the customer's uses.
- **`getOrderCancelService().cancelConfirmed`** — extends the existing facade rather than adding a
  second one. The repository half takes its client and `vendorId` explicitly; the request-scoped
  half resolves both, per `lib/repositories/*`'s enforced split.
- **A new `"use server"` module**, `features/orders/cancel-order-staff.ts`, exporting only async
  functions. It re-runs `requireVendorRole` — a server action is a public endpoint reachable by
  anyone holding the rendered action id, so the page's gate is a gate on the page and nothing more.
- **The control lives on `/staff/orders/[orderNumber]`**, the detail page, not the queue list — an
  irreversible action does not belong adjacent to the forward-only advance button. It renders only
  when `canCancel(order.status)`, and requires a **typed reason**, which is both the friction that
  stops a mis-click and the `OrderStatusEvent.note` the audit trail needs.
- **A `CANCELLED` entry in `sendOrderStatusEmail`'s copy table.** There is none today, so a
  cancelled order currently emails nothing at all. The copy must state that no charge has been
  returned, because none has.

## Three things the adversarial pass turned up

**The fulfilment slot frees itself, and that is worth verifying rather than assuming.**
`getAvailableSlotsForDate` counts a slot as used by orders in `CONFIRMED`, `READY_FOR_COLLECTION`,
`OUT_FOR_DELIVERY`, `DELIVERED`, `COLLECTED`, plus `PENDING_PAYMENT` holds inside the hold window —
`CANCELLED` is absent from both branches, and `placeOrder`'s own capacity guard uses the identical
list. So cancelling a paid order returns its slot capacity with no code change in this slice. That
is the correct behaviour and it costs nothing, but it is behaviour this slice newly *depends* on, so
R11a asserts it rather than leaving a future reader to rediscover the coupling.

**The discount repository layer has no test coverage at all today.** `tests/discounts.test.ts`
exercises only the pure `evaluateCode`; `claimCode`, `recordCodeRedemption` and
`releaseCodeRedemption` are untested, which means the `@@unique([codeId, userId, seq])` concurrency
guarantee that `discounts.ts:150` describes as load-bearing is currently asserted only by a comment.
Since R18 changes how `seq` is allocated, this slice adds `tests/discounts-repository.test.ts` —
mirroring the existing `loyalty.test.ts` / `loyalty-repository.test.ts` split — and pins that
guarantee on the way past. It is a prerequisite for changing `seq` safely, not scope creep.

**`ALTER TYPE ... ADD VALUE` is the one migration step that can fail on an otherwise clean plan.**
Prisma wraps a migration in a transaction, and Postgres forbids *using* a newly added enum value in
the same transaction that adds it. This migration only adds the value — the first row carrying
`EARN_REVERSAL` is written at runtime, long after — so it should apply cleanly on Neon's Postgres.
Read the generated SQL and apply it against a real database at Build rather than trusting that
paragraph; per `CLAUDE.md` the migration is generated `--create-only` and read before it runs.

## Deliberately excluded

- **Money movement of any kind.** No Stripe refund, no partial refund, no capture-method change, no
  order amendment or substitution. Those are **#606** and ADR-005's open territory, entangled with
  #399's variant and weight model. A cancelled-but-unrefunded order is a real operational state and
  this slice represents it honestly rather than implying money was returned.
- **Revenue reporting.** `REVENUE_STATUSES` excludes `CANCELLED`, so after this slice a cancelled
  paid order's retained money silently leaves `/staff/reports`. That is a real shortfall, it is the
  same defect shape as #238 pointing the other way, and it is tracked as **#795** (opened at
  `/propose`, Phase P10) rather than absorbed here: fixing it properly means deriving revenue from
  the payment rather than the order status, which rewrites a reporting path with its own test
  surface and would roughly double this slice.
- **Cancelling from `OUT_FOR_DELIVERY`, `DELIVERED` or `COLLECTED`.** No return-to-stock step
  exists to make the inventory increment truthful.
- **Restoring the shopper's cart.** `restoreCartFromOrder` exists but is deliberately not called
  from `releaseOrder`, for a reason that applies here with more force: a staff cancellation happens
  long after checkout, with the shopper gone and quite possibly a new basket built.
- **Reversing the tier snapshot.** `windowSpendPence` already filters on order status, so a
  cancelled order drops out of qualifying spend with no code change. The `tierKey`/`multiplierBps`
  snapshotted on the original `EARN` row stays as written — it is the audit trail of what was true
  when the points were granted, and rewriting it would destroy the thing it exists to preserve.

## Open items carried forward

- **#795** — revenue derived from order status rather than payment state. Opened at `/propose`.
- **#606** — refunds, partial refunds and order amendment; ADR-005's undecided territory. This
  slice narrows what #606 must still decide but does not decide any of it.
- **A pre-existing inconsistency found while grounding, not fixed here:** `windowSpendPence`
  (`lib/repositories/loyalty.ts`) counts `CONFIRMED`, `OUT_FOR_DELIVERY` and `DELIVERED` as
  tier-qualifying spend but omits `COLLECTED` and `READY_FOR_COLLECTION`, so a Click & Collect
  order appears not to count toward tier progression. It predates this slice, it is noted in
  **#795**'s body as worth reconciling in the same pass as the revenue rule, and it is out of scope
  here.

## Standing decision touched

**ADR-005** records, twice, that a paid order's discount-code use cannot be reversed (#151) and
neither can earned points (#137), and that "the decision belongs with" refunds. This slice decouples
the two: the reversals ship without refunds. ADR-005 gains an implementation note recording that,
in the same form as its P7.5a, P9.1 and P9.2 notes. **No numbered decision is reopened** — the
capture method is unchanged, no code path writes `PaymentStatus.REFUNDED`, and refunds remain this
ADR's open territory.
