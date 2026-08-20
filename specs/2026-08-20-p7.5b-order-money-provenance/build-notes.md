# P7.5b — Order money provenance (build notes)

Written at the end of Build, before the Clear. Slice: `specs/2026-08-20-p7.5b-order-money-provenance/`.
Issue **#262**, closing **#138** and **#150**. Branch `feature/262-order-money-provenance`; spec
commit `6f7aa18`, build commit `3fe888e`.

## What changed and why

**`lib/order-totals.ts` — `splitDiscount` (plus `OrderDiscountCode` / `DiscountShares`).**
The whole slice turns on one fact: `Order.discountPence` is a single generic column that can hold a
loyalty redemption, a discount code, or both added together. Only the code's share is separately
stored (`DiscountRedemption.amountPence`, a snapshot written at redemption), so the loyalty share is
`discountPence − codePence`. This file was chosen because it already had **zero imports**, and that
is now load-bearing rather than incidental: it is what structurally prevents the function reaching
`pencePerPointRedeemed`. R8 verifies the import count, not the absence of a word — a word-absence
grep would fail on the comment that explains the rejected alternative.

The obvious-looking alternative — recovering loyalty's share from the REDEEM ledger row via
`pointsToPence(points, pencePerPointRedeemed)` — is wrong and is called out in the function's own
comment and in ADR-005 so it does not get "fixed" back later. The ledger stores redemptions in
*points*; `pencePerPointRedeemed` is vendor config an admin can change afterwards. A recomputed
share would drift from the `discountPence` displayed beside it.

**`lib/repositories/orders.ts` — `ORDER_PROVENANCE_SELECT`, `toProvenance`, three new fields.**
Four reads needed the same two relations (`getByOrderNumber`, `getForUser`, `getForStaff`,
`findOrderForWebhook`), so the select is one shared constant rather than the same clauses copied
four times — "a field added to three of four places" is the defect class this phase exists to
remove. `toProvenance` is **exported** for the same reason `placeOrder` takes its client explicitly:
the three `OrderSummary` reads resolve Prisma and the vendor from request context, so the mapping
could not otherwise be proven from a plain test.

`pointsEarned` is `number | null`, and the `null` is deliberate: "not awarded yet" (unpaid, or a
guest) and "awarded zero" are different claims, and only the second may be rendered as a figure.
Collapsing them to `0` would print "You earned 0 points" on every unpaid order.

**`components/orders/OrderItemsCard.tsx`** renders up to two attributed rows in place of the single
`Discount` row. It is shared by three pages, including `/staff/orders/{n}`, so the staff view changes
with it — deliberately (see `plan.md`): a staff page showing a combined figure while the customer's
page shows the split would tell two stories about one order.

**`components/orders/OrderPointsNote.tsx`** is new and separate *because* of that sharing. Points
earned are a fact about a customer's loyalty account, not about the order's money; folding them into
the card would have put them on the staff page automatically. Uses `bg-action-tint` /
`bg-surface-muted`, both existing semantic tokens used the same way in `components/account/*`.

**`features/checkout/send-confirmation.ts`** calls the same `splitDiscount`, not a second
arithmetic, and adds a points line gated on `pointsEarned !== null && > 0`. Everything stays inside
the existing try/catch — a confirmed payment must not depend on rendering succeeding.

**`specs/decisions/ADR-005-payments-money-flow.md` → v1.5.0** records the subtraction rule, the two
upstream clamps that make it safe, and the "read, never predicted" rule for points.

## Decisions taken during the build

**Points display on a pending order: a static line with no digits.** Settled at `/propose` by the
owner (2026-08-19) and implemented as specified. The rejected alternative was a numeric "you'll earn
~34 points" estimate; the tier multiplier is resolved from a windowed spend query and snapshotted
onto the EARN row *because* it moves, so an estimate computed outside `confirmPayment`'s transaction
can legitimately disagree with the award.

**No defensive cap on `codePence`.** `splitDiscount` floors the loyalty share at 0 but does not cap
the code share at `discountPence`. Verified rather than assumed: `lib/discounts.ts:141` clamps a
code's face value before it is stored, and `clampRedemption` (`lib/loyalty.ts:164-167`) gives points
only the headroom the code left, so their sum cannot exceed the subtotal and the code share cannot
exceed `discountPence`. A cap would be untestable code that silently absorbed a real data defect.
The unit test asserts the floor anyway, so a future writer of `discountPence` cannot introduce a
negative row unnoticed.

**Fixed the test fake rather than making `toProvenance` defensive.** Three `advanceOrderStatus`
tests failed because their fake `order.findUnique` predated the new select and returned a row with
no `loyaltyEntries`. Real Prisma always returns a selected to-many relation as an array, so the fake
was wrong, not the mapper. A `?? []` would have hidden exactly the "someone forgot the select"
failure this slice is guarding against.

**Rewrote the new component test's assertions instead of adding `@testing-library/jest-dom`.**
`toBeEmptyDOMElement` / `toHaveTextContent` are not registered in this repo; the existing
`tests/a11y/*.tsx` use plain DOM assertions. Matched that rather than adding a dependency for
cosmetics.

**Kept `confirmPayment`'s `boolean` return.** The email's points figure comes from the webhook
route's existing post-commit `findOrder` call. Widening the return type would ripple through the
idempotency branch (`app/api/webhooks/stripe/route.ts:56-61`) for no gain.

## Deviations from the spec

**1. `OrderSummary` gains a third field, `hasAccount: boolean`** — not in `requirements.md`.
`OrderPointsNote` must know whether the *order* will ever earn points, and the viewer's session
cannot answer that: `getByOrderNumber` deliberately strips `userId` (a guest order's random number
is its only credential), and it refuses an *owned* order to a non-owner — but a signed-in shopper
holding a **guest** order's capability URL passes that check. Using the session as a proxy would
have promised points to someone whose order can never earn them. The field is derived and exposes no
id.

**2. R12 was rewritten because it contradicted R10** (correction recorded in `requirements.md`
itself). For an order with no code, the loyalty share *is* the whole discount — so R10 demanded a
"Loyalty points" row while R12 demanded a generic "Discount" one for the same order. The
generic-fallback case R12 was protecting turned out to be unreachable: `placeOrder`
(`lib/repositories/orders.ts:248/267`) is `discountPence`'s only writer and composes it from exactly
two sources, so a non-zero discount always has at least one identifiable source. A no-code discount
is therefore named as loyalty.

**3. R17 and R22's verification steps were re-targeted** (corrections recorded in `validation.md`).
Both were bare-word greps, and both failed on **comments that exist to explain the very rules they
check** — the staff page's note saying points deliberately stay off it, and
`lib/repositories/orders.ts:697`'s note on why there is no `$queryRaw` trigram index. Passing them
as written would have meant deleting the rationale. This is the P4a trap named in
`sdd-workflow.md` § Spec, now hit a third time, and this slice's own spec warned about it two rows
earlier. R17 now targets the import and the JSX element; R22 checks what the branch *adds* rather
than what the tree contains.

**4. One pre-existing test's expected label changed.** `tests/order-confirmation-email.test.ts`'s
P5a R61 case asserted a `Discount` row for an order with `discountPence: 500` and no code; that row
is now `Loyalty points`. The amount and the reconciliation assertion are unchanged. This is the
intended user-visible consequence of #150, not a regression.

## Known-shaky areas

**Nothing has been exercised against real data.** Every check so far is a unit test or a literal
grep. The provenance fields have never been read from Postgres — `ORDER_PROVENANCE_SELECT`'s
`where: { kind: "EARN" as const }` in particular is typed against Prisma's generated enum but has
never actually run. **Validate under `npm run preview`, not `npm run dev`** (the WASM query engine
will not load in real Node, and a DB-touching route fails silently there).

**No order in the dev branch is known to carry both a code and a redemption.** That combined case —
the one the whole split exists for — is currently proven only by unit test. `validation.md` R10
pre-authorises creating one by placing a real order through `preview` with a seeded code; do **not**
hand-insert an `Order` or `DiscountRedemption` row, which would bypass the write path that produces
the `amountPence` snapshot being read.

**The guest path has two distinct silences that look identical when wrong.** A guest order must show
no points line in `PENDING_PAYMENT` *and* none in `CONFIRMED`, and it must still show its discount
rows. Unit-covered, but never rendered from a real guest order.

**The staff page's breakdown is a deliberate side effect of a shared component.** If the split is
wrong anywhere it is wrong in three places at once; conversely, `/staff/orders/{n}` is the surface
nobody asked to change, so it is the one most likely to look surprising in review. R17 checks it
matches the customer's rows.

**The email's points figure depends on read ordering, not on a lock.** It is correct only because
the webhook route re-reads the order *after* `confirm` returned true. `confirmPayment`'s own
internal `findOrderForWebhook` call happens before its transaction and always sees `null` there —
which is fine, since that copy is never emailed, but it means a future refactor that reuses
`confirmPayment`'s order object for the email would silently drop the points line.
