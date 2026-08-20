---
id: p7-5b-order-money-provenance-plan
title: "P7.5b — Order money provenance: points earned and discount code on order pages (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-20
visibility: internal
summary: Makes an order's money summary explain itself — which discount code produced the reduction, how much of it was loyalty points, and how many points the order earned — on both order pages and in the confirmation email, with no schema change.
tags: [p7.5, orders, loyalty, discounts, checkout, email]
related: [roadmap, p5a-loyalty-points, p5b-discount-codes, p4a-order-history, p3c-stripe-payments]
---

# P7.5b — Order money provenance (plan)

Second of P7.5's six slices, closing **#138** and **#150**. Entirely additive and read-side: the
numbers on an order are already correct, they just don't say where they came from.

**Goal:** a shopper looking at an order can see *why* the total is what it is — which code was
applied and for how much, how much came off as loyalty points, and how many points the order
earned — without the page ever asserting something it cannot prove.

## What is actually missing

`components/orders/OrderItemsCard.tsx` renders one `Discount` row from `Order.discountPence`, and
`features/checkout/send-confirmation.ts` renders the same single row in the confirmation email.
Neither names a source. Nothing anywhere shows points **earned**; `/checkout/page.tsx` reads a
loyalty *balance* during checkout, which is a different fact about a different moment.

Verified in the tree rather than taken from the issues:
`app/(storefront)/account/orders/[orderNumber]/page.tsx:67` passes `discountPence` and nothing
identifying the code, and no points-earned figure appears on either order page.

## The attribution rule — the one thing that makes this non-trivial

`Order.discountPence` is deliberately **generic**. Since P5b it can hold a loyalty redemption, a
discount code, or **both combined**; `OrderItemsCard.tsx:29-32` and `send-confirmation.ts:47-50`
both carry comments warning that it must never be labelled as one source. So "Discount
(WELCOME10) −£7.00" against a combined figure would assert something false — the same defect class
P7.5a spent a slice removing.

The split is exactly recoverable without recomputing anything:

- **code share** = `DiscountRedemption.amountPence` — a snapshot written at redemption, reachable
  through `Order.discountUse` (`@@unique([orderId])`, so at most one per order).
- **loyalty share** = `discountPence − amountPence`.

Deriving loyalty's share **by subtraction** rather than from `pointsToPence(points,
config.pencePerPointRedeemed)` is the load-bearing choice here. `pencePerPointRedeemed` is vendor
config that can change after an order is placed, and `LoyaltyLedgerEntry` stores the REDEEM in
**points**, not pence — so recomputing would make a historical order's breakdown drift away from
the `discountPence` sitting next to it. Subtraction cannot drift: the two rows always sum to the
figure they decompose, by construction.

## Points earned: a settled fact, not an estimate

`earnPoints` writes the EARN ledger row **inside `confirmPayment`'s transaction**
(`lib/repositories/loyalty.ts:240-242`), under `@@unique([orderId, kind])`. So "points earned" is
true exactly when the order is `CONFIRMED`, and there is never a window where the page must guess.

That settles what each surface shows, because `/checkout/[orderNumber]/page.tsx` already branches
on all three statuses:

| State | What is shown |
|---|---|
| `CONFIRMED` (EARN row exists) | the real figure, read from the ledger |
| `PENDING_PAYMENT`, order has a `userId` | a **static, non-numeric** line: points are added once payment clears |
| `PENDING_PAYMENT`, guest order (`userId` null) | nothing — a guest earns nothing, and saying otherwise would promise what will not happen |
| `CANCELLED` | nothing |

The alternative — a numeric "you'll earn ~34 points" estimate while pending — was **rejected**
(owner decision, 2026-08-19). The tier multiplier is resolved from a windowed spend query and
snapshotted onto the EARN row precisely because it changes over time; an estimate computed outside
that write path can legitimately disagree with the award, which would re-introduce the exact
failure mode this phase exists to remove. A non-numeric line costs nothing and cannot be wrong.

## Scope (this slice)

- **`lib/repositories/orders.ts`** — `OrderSummary` gains `discountCode: { code, amountPence } |
  null` and `pointsEarned: number | null`, populated by `getByOrderNumber`, `getForUser` and
  `getForStaff` from the `discountUse` and `loyaltyEntries` relations. `WebhookOrder` gains the
  same two fields.
- **`components/orders/OrderItemsCard.tsx`** — the single `Discount` row becomes up to two
  attributed rows. Falls back to today's single row when no attribution is available.
- **`components/orders/OrderPointsNote.tsx`** (new) — the points element described above.
- **`app/(storefront)/checkout/[orderNumber]/page.tsx`** and
  **`app/(storefront)/account/orders/[orderNumber]/page.tsx`** — render the points note.
- **`features/checkout/send-confirmation.ts`** — attributed discount rows plus points earned.
- **`specs/decisions/ADR-005-payments-money-flow.md`** — an implementation note recording the
  subtraction rule, so a future reader does not "improve" it into a config-based recomputation.

### Staff order detail gets the split too — deliberately

`OrderItemsCard` is shared by three pages: both customer order pages **and**
`app/(admin)/staff/orders/[orderNumber]/page.tsx:91`. Changing the shared component changes the
staff view with it. That is the right outcome, not collateral: if the staff page kept a combined
`Discount` row while the customer's own page showed the split, the two would be telling different
stories about one order — which is what this phase exists to stop. Support staff answering "why
was I only charged £35?" need the same breakdown the shopper is looking at.

**Points earned stays off the staff page**, which is why it is a separate component rather than a
section inside `OrderItemsCard`. It is a fact about a customer's loyalty account, not about the
order's money, and `StaffOrderDetail` has no reason to render it.

## Deliberately excluded

- **No schema change.** Both relations already exist and are already indexed by `orderId`. If this
  slice appears to need a migration, something has been misunderstood — stop.
- **No change to how points or discounts are computed or written.** `earnPoints`, `redeemPoints`
  and the discount engine are untouched. This slice only *reads*.
- **Reversal/refund semantics** (#151) — structurally unreachable until refunds exist, and
  explicitly not scheduled in P7.5.
- **The `/account/orders` list page.** #150 says order *pages*; the list shows a total, not a
  breakdown, and adding a per-row breakdown there is a different design question.
- **`/checkout/page.tsx`'s loyalty balance display** — a different fact at a different moment.
- **Any "sign up to earn points" prompt on guest orders.** Plausible, unasked-for, and a marketing
  decision rather than a provenance one.

## Open items carried forward

- **The email's points figure is read after the transaction commits**, not threaded out of
  `confirmPayment`. `confirmPayment` returns `boolean` and the webhook route
  (`app/api/webhooks/stripe/route.ts:56-61`) branches on it for idempotency before re-reading the
  order for the email — widening that return type would ripple through the idempotency path for no
  gain, since `findOrder` is already called on exactly the path that emails. Recorded here because
  it is the kind of choice a later reader would otherwise re-litigate.
- **#269** (live-verifying P7.5a's cache header against the real Cloudflare edge) is unrelated to
  this slice and stays open.
