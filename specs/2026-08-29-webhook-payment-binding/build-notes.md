# Bind Stripe webhook confirmation and failure to the stored payment (build notes)

Written at the end of Build, before the Clear. Two commits on
`feature/429-webhook-payment-binding`: `2da8289` (spec only) and `21eeda1` (implementation).

**Built in the main checkout at `E:/GitRepositories/aheed-online-store`, not in a sub-agent
worktree.** `git worktree list` shows one entry. Nothing is hiding one directory down.

**Nothing in this slice has touched a database.** No migration exists to apply, `scripts/sign-stripe-event.ts`
has never been executed against anything, and no webhook has been delivered to a running Worker. Every
check that has actually run is a unit test, a type check or a static one. R30–R34 are the first time
any of this meets real Postgres.

## What changed and why

**The binding is one predicate, in the `where` clause of a write that already existed.**
`confirmPayment`'s `tx.order.updateMany` previously guarded on `{ id, status: "PENDING_PAYMENT" }`.
It now also carries the order's `currency` and a `payment: { is: { provider, providerReference,
amountPence } }` relation filter. That placement is the whole design, and it is not stylistic:
`lib/repositories/orders.ts`'s own `findOrderForGuestLookup` docstring records the P7a defect where a
credential compared in application code was *skipped* when absent rather than failing. In a `where`,
absent matches nothing.

**The nullable-reference case needed no code.** `Payment.providerReference` is null between order
creation and the post-commit session write, and for any order whose provider call never completed. A
stored null cannot equal a non-null session id, so those orders are refused by the same predicate
that refuses a wrong one. This is the property #427 established for `confirmationToken`, reused
rather than re-derived — and it is why there is no `if (providerReference === null)` branch anywhere
near the guard. Do not add one.

**`failPayment` binds too, which #429's own "Required" list does not ask for.** Approved at
`/propose` and written into the issue body before Build started. `failPayment` → `releaseOrder`
cancels the order, increments every line's stock back, reverses a loyalty redemption and frees a
discount-code use — on an unbound order number. It destroys value rather than creating it, which is
why it attracts less attention, but it is the same defect on the same credential.

**`releaseOrder` gained an *optional* binding**, spread into its `where` only when supplied.
`placeOrder`'s failure path passes nothing and is untouched: it already holds the order id from the
transaction it just committed, so there is no external claim to verify. That is why R17 exists and
why the existing "payment provider unavailable" tests pass unmodified.

**The return types had to change.** A bare `false` cannot distinguish "another delivery already
processed this" — normal, expected, must stay silent, because Stripe retries aggressively — from
"this event is not about this payment", which must be loud. Both functions now return a union, and
`classifyNoMatch` picks between the two reasons on the zero-row path. That classification read is the
one read in this slice that is *not* part of a `where`, and its docstring says explicitly what it may
do: authorization was already decided atomically by the predicate that matched nothing; this only
chooses a log line, and can only turn one refusal into a different refusal.

**The route builds the claim and reports the outcome; it evaluates nothing.** `bindingFor(event)` and
`reportRefusal(...)` are both small and deliberately dumb. Every post-signature outcome still answers
200 — unchanged, and the route's original comment explaining why is still the reason.

## Decisions taken during the build

- **Currency is normalised, not compared case-insensitively.** `Order.currency` is `"GBP"` (the
  column default); Stripe echoes `"gbp"` because `lib/payments.ts` sends it lower-cased. The binding
  upper-cases its input once and the `where` uses exact equality. `mode: "insensitive"` would have
  worked and has precedent one function away, but it puts the guard's correctness on collation
  semantics inside a write path. Normalising an *input* is not comparing a *credential* — the value
  still has to survive the `where`.
- **The binding fields are destructured to `const` before the null guard.** Not cosmetic: TypeScript
  discards narrowing of a mutable property access across a closure boundary, so
  `binding.providerReference` was still `string | null` inside the transaction callback — exactly
  where it must not be. `typecheck` caught it. The comment in the code says so, because the obvious
  "simplification" back to `binding.x` reintroduces the error.
- **`classifyNoMatch` takes `OrdersDb | OrdersTx`.** `confirmPayment` calls it with the transaction
  client (it has one in hand); `failPayment` calls it with the plain client, because `releaseOrder`
  owns its transaction and has already returned. Added `OrdersDb`/`OrdersTx` type aliases matching
  the convention every other repository module in this directory already uses.
- **`reportRefusal` logs identifiers only** — reason, event type, order number, session id. No buyer
  email, name, address or payment-method detail. A webhook log is not a place customer data should
  accumulate, and R24 asks for the property rather than for a specific string.
- **The signing harness takes flags and posts, rather than printing a header for `curl` to use.**
  One command per validation row, and the payload it builds is inspectable in one place. It sets
  `payment_status: "paid"` on completed sessions deliberately — without it the route's pre-existing
  paid-only guard breaks first and a mismatch probe would "pass" for entirely the wrong reason.
- **Test doubles evaluate the `where`.** `matches()` walks every key including the nested
  `payment.is`, and treats a null payment relation as unmatchable. A double returning a count of 1
  unconditionally would have made every mismatch case pass while proving the opposite of the claim.

## Deviations from the spec

**One, and it is the most important thing in this file.**

**`failPayment` had a second caller that the spec did not account for.**
`features/checkout/cancel-order.ts` — the shopper-facing cancel action built by the *previous* slice
(#428) — called `getWebhookOrderService().fail(orderNumber, reason)`. Adding the required binding
parameter broke it, and `typecheck` is what found it, not review.

That shopper is authorized by the capability token, proved on the line above the call. There is no
Stripe session and no session id to bind against. Handing it a placeholder binding to satisfy the
type would have defeated the entire slice, so the path moved instead:

- new `cancelUnpaidOrder(prisma, vendorId, orderNumber, reason)` in `lib/repositories/orders.ts`,
  calling `releaseOrder` with no binding;
- new `getOrderCancelService()` in `lib/orders-service.ts`, mirroring the existing
  `getGuestOrderLookupService()` shape exactly;
- `cancel-order.ts` switched to it.

**This changes observable behaviour in a second way that was not asked for, and it is an improvement
rather than a neutral move — which is precisely why it needs to be on the record rather than
absorbed.** The old path ran through `findOrderForWebhook`, whose un-scoped read is an ADR-004
recorded exemption *for payment providers that arrive with no host*. A request-bound shopper action
is not that caller. `cancelUnpaidOrder` is vendor-scoped. The old arrangement was safe only because
the token check immediately above it is itself vendor-scoped; the new one does not depend on that.

Everything else in R1–R42 was built as written. Nothing was narrowed, substituted or skipped.

R30–R34 are live rows and were **not** attempted at Build. That is the stage boundary, not a gap.

## Known-shaky areas

- **The relation filter has never been executed by Prisma.** This is the single biggest risk in the
  slice and where to look first. `payment: { is: { ... } }` inside an `updateMany` compiles to a
  subquery, and the unit double honours it by *hand-written* logic — which proves the code passes the
  filter, not that Prisma and the WebSocket adapter evaluate it as intended. **If the filter were
  silently ignored, every mismatch case would confirm the order and the unit suite would stay green.**
  R31 is the row that actually decides this; treat a passing unit suite as no evidence at all here.
- **A relation-filtered `updateMany` is new to this repo.** CLAUDE.md records `updateMany` crashing
  outright on the HTTP adapter (#382). This runs through `getPrismaWs()`, which is correct and is
  what `getWebhookOrderService()` already used — but no existing `updateMany` here carries a relation
  filter, so "the WS adapter handles `updateMany`" is established and "the WS adapter handles *this*
  `updateMany`" is not.
- **`cancelUnpaidOrder` has no test of any kind, and no validation row reaches it.** It is exercised
  only through `features/checkout/cancel-order.ts`, which has no unit test either, and R33 walks the
  *webhook* expiry path rather than the shopper's cancel button. The previous slice validated that
  button live (its own R31b) against code this slice has now replaced. **If validation has spare
  capacity beyond its own rows, spend it here**: place an order, abandon it, and use the cancel page's
  form. The failure would be a silent no-op — the order stays `PENDING_PAYMENT` and the cart does not
  refill — rather than an error.
- **`classifyNoMatch` runs outside the transaction on the `failPayment` path** and inside it on the
  `confirmPayment` path. A concurrent status change in that gap could mislabel a `binding-mismatch`
  as `already-processed`. It affects the log line only, never whether the transition happened, and
  the asymmetry exists because `releaseOrder` owns its own transaction. Worth knowing before trusting
  a reason string from a busy environment.
- **Every currency assertion is synthetic.** `Order.currency` has only ever held `"GBP"` — no row in
  any database has anything else, because `placeOrder` never sets the column and relies on the
  default. The case-difference test proves the normalisation, not that a second currency works.
- **`amount_total` on `checkout.session.expired` has never been observed.** The decision that
  `failPayment` binds on session identity alone assumes Stripe may omit it. If R33(b) refuses when it
  should cancel, check what the real expired payload actually contained before changing the binding.
- **The signing harness has never run.** Its HMAC construction mirrors `lib/stripe-webhook.ts` by
  reading, not by test. A `400 Invalid signature` in R31–R33 means the harness is wrong, not that the
  binding rejected the event — those two failures look nothing alike in the response body, so read it.
- **Nothing exercises the `not-found` branch live.** It is reachable only by an event naming an order
  number that does not exist, which no validation row produces. Covered by a unit case only.
