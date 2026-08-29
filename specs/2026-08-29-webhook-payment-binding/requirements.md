# Bind Stripe webhook confirmation and failure to the expected stored payment (requirements)

Closes **#429**, the second slice of P9.1, building on the guest order authorization slice
(#427/#428). Today `app/api/webhooks/stripe/route.ts` confirms an order — and, on the expiry and
async-failure events, cancels it and releases its stock — on `metadata.orderNumber` alone, never
comparing the Checkout Session id against the `Payment.providerReference` stored when that session
was created. This slice folds that reference into the same compare-and-set that already guards the
status transition, so a correctly-signed event that does not correspond to this order's payment
cannot move it. See `plan.md` for why the check lives in the `where` clause and why the two paths
bind on different fields.

**This slice ships no schema change and no migration.**

## Event parsing

R1. `StripeCheckoutEvent` in `lib/stripe-webhook.ts` declares two additional fields,
    `amountTotal: number | null` and `currency: string | null`, alongside its existing `type`,
    `orderNumber`, `paymentStatus` and `sessionId`.

R2. `parseCheckoutEvent` sets `amountTotal` to `data.object.amount_total` when that value is a
    number and to `null` otherwise, and sets `currency` to `data.object.currency` when that value is
    a string and to `null` otherwise.

R3. `parseCheckoutEvent` returns a non-null result, with both new fields `null`, for an event whose
    `data.object` carries neither field — its existing tolerance of unrelated event shapes is
    unchanged.

## The binding contract

R4. `lib/repositories/orders.ts` exports a `PaymentBinding` interface declaring exactly
    `provider: string`, `providerReference: string | null`, `amountPence: number | null` and
    `currency: string | null`.

R5. `lib/repositories/orders.ts` exports a result type for each path — `ConfirmPaymentResult` and
    `FailPaymentResult` — each a union of `{ ok: true }` and
    `{ ok: false; reason: "not-found" | "unbindable" | "binding-mismatch" | "already-processed" }`.

## `confirmPayment`

R6. `confirmPayment` takes a `PaymentBinding` as an explicit parameter following `orderNumber`, and
    returns `ConfirmPaymentResult`. It reads no request context, keeping
    `tests/repository-purity.test.ts` green.

R7. `confirmPayment` returns `{ ok: false, reason: "unbindable" }`, having issued no write and no
    read of any kind, when any one of the binding's `providerReference`, `amountPence` or `currency`
    is `null`.

R8. `confirmPayment` returns `{ ok: false, reason: "not-found" }` when no order matches the order
    number.

R9. The `tx.order.updateMany` call in `confirmPayment` carries in its `where`, simultaneously: the
    order's `id`; `status: "PENDING_PAYMENT"`; the order's `currency`; and a relation filter
    `payment: { is: { provider, providerReference, amountPence } }` built from the binding.

R10. The currency value reaching that `where` is the binding's `currency` upper-cased, and the
     comparison is exact equality — the `where` does not use `mode: "insensitive"`.

R11. When that guarded update matches zero rows, `confirmPayment` returns
     `{ ok: false, reason: "already-processed" }` if the order's persisted status is no longer
     `PENDING_PAYMENT`, and `{ ok: false, reason: "binding-mismatch" }` otherwise.

R12. On every `{ ok: false }` outcome, `confirmPayment` writes nothing: no `Order.status` change, no
     `Payment.status` change, no `OrderStatusEvent` row and no `LoyaltyLedgerEntry` row.

R13. On `{ ok: true }`, `confirmPayment` performs exactly the writes it performed before this slice —
     the status transition, the payment status update, the `CONFIRMED` status event and the loyalty
     `EARN` — with no change to their contents or ordering.

## `failPayment` and `releaseOrder`

R14. `failPayment`'s signature is exactly `failPayment(prisma, orderNumber, binding, reason)` and it
     returns `FailPaymentResult`.

R15. `failPayment` returns `{ ok: false, reason: "unbindable" }`, having issued no write, when the
     binding's `providerReference` is `null`. A `null` `amountPence` or `currency` does **not**
     produce `unbindable` on this path.

R16. `releaseOrder` accepts an optional binding argument. When one is supplied, its
     `tx.order.updateMany` `where` additionally carries
     `payment: { is: { provider, providerReference } }`, and carries no `amountPence` or `currency`
     condition.

R17. When no binding argument is supplied, `releaseOrder`'s `where` is exactly what it was before
     this slice — `{ id, vendorId, status: "PENDING_PAYMENT" }` — and its behaviour is unchanged.

R18. `placeOrder`'s payment-provider-failure path calls `releaseOrder` without a binding, and
     `tests/orders.test.ts`'s existing "payment provider unavailable" cases pass unmodified.

R19. `failPayment` distinguishes `already-processed` from `binding-mismatch` by the same rule as R11,
     and on either outcome no inventory is incremented, no loyalty redemption is reversed and no
     discount-code use is freed.

## The route

R20. `app/api/webhooks/stripe/route.ts` builds a `PaymentBinding` from the parsed event, using
     `STRIPE_PAYMENT_PROVIDER` from `lib/payments.ts` as `provider`, and passes it to both
     `orders.confirm` and `orders.fail`.

R21. The route sends the confirmation email only when `orders.confirm` returns `{ ok: true }`.

R22. The route returns HTTP 200 for every outcome reachable after signature verification succeeds,
     including `unbindable`, `binding-mismatch`, `not-found` and `already-processed`. The existing
     400 responses for a bad signature and a malformed payload, and the 500 for an unset
     `STRIPE_WEBHOOK_SECRET`, are unchanged.

R23. The route calls `console.error` once for each of `unbindable`, `binding-mismatch` and
     `not-found`, and does not call `console.error` for `already-processed` or for `{ ok: true }`.

R24. That log line includes the reason, the event type, the order number and the session id, and
     includes no customer name, email address, postal address or payment-method detail.

## Tests

R25. `tests/stripe-webhook.test.ts` covers R2 and R3: a completed-session payload yielding numeric
     `amountTotal` and string `currency`, and a payload carrying neither yielding `null` for both.

R26. `tests/orders.test.ts` exercises `confirmPayment` against a Prisma double that **honours the
     `where` clause**, including the nested `payment: { is: ... }` filter, rather than always
     returning its row — a double that ignores `where` would pass every case below while proving
     nothing.

R27. Named `confirmPayment` cases exist and pass for each of: a matching binding confirming the
     order; a wrong `providerReference` refused as `binding-mismatch`; a stored `providerReference`
     of `null` refused as `binding-mismatch` with a well-formed binding supplied; a wrong
     `amountPence` refused as `binding-mismatch`; a `currency` differing only in case accepted; a
     binding with a `null` field refused as `unbindable`; and an order already `CONFIRMED` reported
     as `already-processed` rather than `binding-mismatch`.

R28. Named `failPayment` cases exist and pass for each of: a matching binding cancelling the order; a
     wrong `providerReference` refused as `binding-mismatch` with no inventory increment; and a
     binding whose `amountPence` and `currency` are both `null` still succeeding, proving R15.

R29. A test asserts that the `where` object `confirmPayment` passes to `order.updateMany` contains
     the `payment` relation filter — asserted on the recorded call argument, so the guard cannot be
     silently moved out of the `where` and into application code while the behavioural cases keep
     passing.

## Live

R30. Against `npm run preview` with `stripe listen` forwarding, a real test-card checkout produces a
     genuine `checkout.session.completed` event that moves the order from `PENDING_PAYMENT` to
     `CONFIRMED` — the happy path survives the binding.

R31. A validly-signed `checkout.session.completed` event naming a **`PENDING_PAYMENT`** order but a
     session id other than that order's own leaves its status `PENDING_PAYMENT`, returns 200, and
     logs `binding-mismatch`. The order under test must still be awaiting payment: replaying a
     mismatched event against an already-`CONFIRMED` order is refused by the status guard first and
     correctly reports `already-processed`, which proves R11 rather than R31.

R32. Re-delivering the genuine event from R30 — same order number, same session id, same amount —
     returns 200, leaves the order `CONFIRMED`, attempts no second confirmation email, and reports
     `already-processed` rather than `binding-mismatch`.

R33. Against a `PENDING_PAYMENT` order, a validly-signed `checkout.session.expired` event carrying a
     session id other than that order's own leaves it `PENDING_PAYMENT` with its stock still held;
     the same event carrying that order's real session id cancels it and increments its lines' stock
     back.

R34. `scripts/sign-stripe-event.ts` exists, is committed, and emits a body plus a `Stripe-Signature`
     header that this repo's own `verifyStripeSignature` accepts — it sets `payment_status: "paid"`
     on a `checkout.session.completed` payload, so the route's pre-existing paid-only guard does not
     silently swallow the events R31–R33 depend on.

## Documentation and gates

R35. The docstrings on `confirmPayment`, `failPayment` and `releaseOrder` describe the binding rule
     and no longer describe the order number as sufficient on its own.

R36. `tests/repository-vendor-scoping.test.ts`, `tests/repository-purity.test.ts`,
     `tests/repository-client-injection.test.ts` and `tests/repository-transaction-safety.test.ts`
     all pass. If the `orders.ts:confirmPayment` allowlist entry's prose needs updating for the new
     signature, the entry is amended rather than removed.

R37. `specs/decisions/ADR-005-payments-money-flow.md` gains an **additive implementation note**
     recording the binding, and reopens no ADR-005 decision — matching the precedent P5a set when it
     added a note to the same ADR. Its front-matter `version` and `updated` are bumped.

R38. `specs/roadmap.md` gains a change-log row for **PR #453**, the `staging → main` promotion of
     #427/#428, citing the PR number in the form `PR #453` — the carry-forward row named in
     `plan.md`.

R39. `npm run kms:validate` exits 0, and `ARTIFACT_INDEX.md` has been rebuilt with
     `npm run kms:build-index` after every front-matter edit on this branch.

R40. The internal KMS docs site builds — this slice adds files under `specs/` and edits an ADR, which
     the root suite does not cover.

R41. `CHANGELOG.md` updated (Gate 4).

R42. `lint`, `typecheck`, `test`, `format:check` and `build` all remain green after this slice.
