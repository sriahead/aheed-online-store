# P7.5b — Order money provenance (requirements / acceptance criteria)

Closes **#138** (points earned on order pages) and **#150** (which discount code was applied).
Second slice of **P7.5**, the pre-launch closeout of P3/P5/P6 deferred debt (epic #260). Read-side
only, no schema change: `Order.discountUse` and `Order.loyaltyEntries` already carry everything
needed. The governing rule is that an order's money summary may only state what it can prove —
the code's share comes from the stored `DiscountRedemption.amountPence` snapshot, the loyalty share
by subtraction from `discountPence`, and points earned from the EARN ledger row that
`confirmPayment` writes in its own transaction. See `plan.md` for why each of those is the only
honest source.

## Data layer

R1. `lib/repositories/orders.ts`'s `OrderSummary` interface declares `discountCode: { code: string;
    amountPence: number } | null` and `pointsEarned: number | null`.

R2. `getByOrderNumber`, `getForUser` and `getForStaff` each populate both fields, selecting
    `discountUse` (its `amountPence` and the related `DiscountCode.code`) and the `loyaltyEntries`
    row with `kind: "EARN"`.

R3. `pointsEarned` is `null` when the order has no EARN ledger row, and the row's `points` value
    when it has one. No code path substitutes `0` for "not yet earned".

R4. `discountCode` is `null` when the order has no `DiscountRedemption` row.

R5. `lib/repositories/orders.ts`'s `WebhookOrder` interface declares the same two fields, populated
    by `findOrderForWebhook` from the same two relations.

R6. `confirmPayment`'s return type is unchanged (`Promise<boolean>`), and
    `app/api/webhooks/stripe/route.ts` still branches on it before re-reading the order — the
    email's points figure comes from that post-commit read, not from a widened return value.

## Attribution

R7. A single exported pure function in `lib/order-totals.ts` takes `{ discountPence, discountCode }`
    and returns the two shares: the code share (`discountCode.amountPence`, else `0`) and the
    loyalty share (`discountPence − code share`, floored at `0`).

R8. That function contains no reference to `pointsToPence`, `pencePerPointRedeemed`, or any vendor
    config — the loyalty share is obtained by subtraction only.

R9. For every input, code share + loyalty share equals `discountPence` exactly whenever the code
    share does not exceed it — asserted by a unit test over the four cases (code only, loyalty only,
    both, neither).

## Order pages

R10. `components/orders/OrderItemsCard.tsx` accepts the order's `discountCode` as an optional prop
     and renders, in place of the single `Discount` row: a row labelled with the code's own string
     when the code share is greater than `0`, and a row labelled as loyalty points when the loyalty
     share is greater than `0`.

R11. When `discountPence` is `0`, `OrderItemsCard` renders no discount row of any kind — unchanged
     from today.

R12. When `discountPence` is greater than `0` and no `discountCode` is supplied, `OrderItemsCard`
     renders exactly one row labelled `Discount`, identical to today's output — the backward path
     for pre-P5b orders.

R13. A new component `components/orders/OrderPointsNote.tsx` renders: the earned figure when
     `pointsEarned` is non-null and greater than `0`; a static line containing no digits when the
     order status is `PENDING_PAYMENT` and the order has an owning user; and nothing at all
     otherwise.

R14. `OrderPointsNote` renders nothing for a guest order (no owning user) in every status,
     including `PENDING_PAYMENT`.

R15. `OrderPointsNote` renders nothing when the order status is `CANCELLED`.

R16. `app/(storefront)/checkout/[orderNumber]/page.tsx` and
     `app/(storefront)/account/orders/[orderNumber]/page.tsx` each render `OrderPointsNote`.

R17. `app/(admin)/staff/orders/[orderNumber]/page.tsx` does not import or render
     `OrderPointsNote`, and does pass `discountCode` to `OrderItemsCard` so the staff breakdown
     matches the customer's.

## Confirmation email

R18. `features/checkout/send-confirmation.ts` renders the same attributed discount rows as
     `OrderItemsCard`, using the same function from R7 rather than a second arithmetic.

R19. The email includes the points earned when `pointsEarned` is greater than `0`, and omits any
     points line entirely when it is `null` or `0`.

R20. `sendOrderConfirmationEmail` still never throws — its existing try/catch continues to cover
     every new read and render path.

## Boundaries

R21. `git diff --name-only origin/staging -- prisma/` is empty: this slice changes no schema and
     adds no migration.

R22. No file under `app/`, `features/` or `components/` gains a direct `@prisma/client` or
     `lib/db` import, and no raw SQL is added anywhere.

R23. `specs/decisions/ADR-005-payments-money-flow.md` gains an implementation note recording that
     the loyalty share of `discountPence` is derived by subtraction from the stored code snapshot,
     and why recomputing it from vendor config would drift.

## Gates

R24. `CHANGELOG.md` updated on the branch (Gate 4).

R25. `npm run lint`, `npm run typecheck`, `npm test` and `npm run format:check` all remain green
     after this slice.
