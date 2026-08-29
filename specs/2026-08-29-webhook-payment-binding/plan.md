---
id: webhook-payment-binding-plan
title: "Bind Stripe webhook confirmation and failure to the expected stored payment (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-29
visibility: internal
summary: "Makes a signed Stripe event unable to confirm or cancel an order unless it corresponds to the payment that order is actually waiting on, by folding the stored provider reference into the same compare-and-set that already guards the status transition."
tags: [security, payments, stripe, webhook, orders, p9]
related: [roadmap, adr-005-payments-money-flow]
---

# Bind Stripe webhook confirmation and failure to the expected stored payment (plan)

The second slice of **P9.1 — Security & transaction safety**, closing **#429**. It follows the guest
order authorization slice (#427/#428, PR #451, promoted by PR #453) and takes the same shape: a
credential that was being *inferred* becomes one that is *proved*, in a `where` clause rather than in
application code.

**Goal:** make it impossible for a correctly-signed Stripe event to move an order's payment state
unless that event corresponds to the Checkout Session this order was actually waiting on. Shipping
this slice means signature verification stops being the only thing standing between an arbitrary
event and a confirmed order.

## What is actually wrong today

`lib/stripe-webhook.ts` is sound. It verifies HMAC-SHA256 over the raw body with a constant-time
compare and a 300-second replay window. Nothing in this slice touches that.

The gap is entirely downstream. `app/api/webhooks/stripe/route.ts:56` reaches the write with nothing
but an order number that arrived inside the event's own payload:

```ts
if (event.paymentStatus !== "paid") break;
if (!event.orderNumber) break;
const confirmed = await orders.confirm(event.orderNumber);
```

`lib/payments.ts` stores the Checkout Session id on `Payment.providerReference` when the session is
created (`lib/repositories/orders.ts:425-428`). Nothing ever reads it back. So a signature proves an
event came from Stripe; it does not prove the event is about *this* payment. A session created in the
same Stripe account with crafted metadata, or a metadata mix-up during an integration change,
confirms an order nobody paid for. The bound is that an attacker needs access to the merchant's own
Stripe account — which is why #429 is a binding gap rather than an open door, and why it is a P9.1
launch gate rather than an incident.

## The destructive half, which #429's own "Required" list does not name

`checkout.session.expired` and `checkout.session.async_payment_failed` route to `failPayment` →
`releaseOrder`, which cancels the order, increments every line's inventory back, reverses any loyalty
redemption and frees a discount-code use — on the same unbound order number, with no binding
whatsoever. It destroys value rather than creating it, which is why it attracts less attention, but
it is the same defect on the same credential.

**Both paths are bound in this slice.** Approved at `/propose` and recorded in #429's body. Binding
only the confirm half would ship half a binding and leave the next reader reasonably assuming the
webhook was done.

## Where the check lives, and why that is the whole design

The comparison goes **inside the `where` clause of the compare-and-set that already guards the status
transition** — not into the route, and not into a fetch-then-compare in application code.

This repo has already paid for that lesson once. `findOrderForGuestLookup`'s docstring
(`lib/repositories/orders.ts:1493`) records the P7a defect verbatim: the previous implementation
"returned a full match with no email supplied at all" precisely because it fetched by order number
and then compared the credential in application code, where a missing credential skipped the
comparison instead of failing it.

Folding the session id into the existing `updateMany` makes binding and idempotency **one atomic
operation** rather than two decisions that can disagree:

```ts
where: {
  id: order.id,
  status: "PENDING_PAYMENT",
  currency: normalisedCurrency,
  payment: { is: { provider, providerReference, amountPence } },
}
```

**The null case then needs no code at all.** `Payment.providerReference` is nullable, and a stored
`null` simply cannot equal a non-null session id, so an order whose reference was never written is
refused by the same predicate that refuses a wrong one. This is the same property #427 relied on for
`confirmationToken`, arrived at the same way — by putting the credential where a missing value
cannot match rather than where it can be skipped.

### The one read that is not in the `where`, and what it is allowed to do

`count === 0` is now ambiguous: it means either "another delivery already processed this" (normal —
Stripe retries aggressively, and today's code is silent about it) or "this event does not correspond
to this payment" (the loud case #429 asks for). The route cannot act correctly on a bare `false`.

So on `count === 0` only, a classification read establishes which. **That read never grants
anything** — authorization was already decided, atomically, by the predicate above; the read exists
solely to choose a log line and a return reason. It is a deliberate, stated exception to "don't
compare in application code", and it is safe precisely because it sits on the failure path, after the
decision, and can only ever downgrade a refusal into a different kind of refusal.

Consequence: `confirmPayment`'s bare `boolean` return becomes a small result union. The route's
existing and correct "email only when THIS delivery performed the transition" property
(`route.ts:57-62`) is preserved by keying the email on `{ ok: true }` rather than on truthiness.

## What a mismatch does

**Refuses the transition and logs loudly. The response stays 200.**

The 200 is unchanged and deliberate — the route's own comment at `:47` has it right: a non-2xx makes
Stripe retry for days against a situation that will never resolve itself.

Fail-closed on the refusal is the call approved at `/propose`, consistent with #427's treatment of a
null stored token. The session is created with `unit_amount = totalPence`, `quantity: 1`, no tax and
no shipping (`lib/payments.ts:108-113`), so an amount mismatch against a matching session id can only
be a genuine integration defect and should never fire in normal operation.

**The accepted cost, stated rather than discovered later:** if it ever does fire, a real shopper has
been charged and their order stays `PENDING_PAYMENT` with no confirmation email and their stock still
held, needing manual reconciliation. That is #101's eventual territory (the reconciliation sweep for
webhooks that never arrive), not this slice's.

## Asymmetry between the two paths, deliberately

| | binds on | does not bind on |
|---|---|---|
| `confirmPayment` | provider, `providerReference`, `amountPence`, `currency` | — |
| `failPayment` | provider, `providerReference` | `amountPence`, `currency` |

Confirmation is where money is asserted, so the money is checked. Cancellation asserts no money — it
is the *identity* of the session that authorizes releasing the stock. Requiring `amount_total` on an
expired-session event would mean that a Stripe payload which omits it leaves an order holding
inventory indefinitely, which is a worse failure than the one being prevented and is reachable
without any attacker at all.

## Currency, and why it is normalised rather than compared case-insensitively

`Order.currency` is a real column (`prisma/schema.prisma:643`, `String @default("GBP")`), written
only by that default today. Stripe echoes currency back lower-cased (`"gbp"`), because
`lib/payments.ts:111` sends it lower-cased.

The binding therefore upper-cases the event's currency **once, before it reaches the `where`**, and
the predicate uses exact equality. The alternative — `mode: "insensitive"` inside an `updateMany`
`where` — would work in principle and has precedent one function away
(`findOrderForGuestLookup`), but it makes the guard depend on collation semantics inside a write
path, for a value that is canonical uppercase by schema default. Normalising an input is not the same
thing as comparing a credential in application code: the value still has to survive the `where`.

## Scope (this slice)

- `lib/stripe-webhook.ts` — `StripeCheckoutEvent` gains `amountTotal` and `currency`;
  `parseCheckoutEvent` populates them, staying tolerant of shapes that carry neither.
- `lib/repositories/orders.ts` — a `PaymentBinding` input type and result unions for both paths;
  `confirmPayment` and `failPayment` take the binding explicitly; `releaseOrder` gains an **optional**
  binding it folds into its own compare-and-set; a shared classification helper for the `count === 0`
  branch.
- `lib/orders-service.ts` — `getWebhookOrderService()`'s `confirm`/`fail` forward the binding.
- `app/api/webhooks/stripe/route.ts` — builds the binding, branches on the result union, logs
  refusals, still answers 200.
- `tests/stripe-webhook.test.ts` and `tests/orders.test.ts` — mismatch, duplicate, unbindable,
  null-reference and happy-path cases for both paths, against a double that honours the `where`.
- `scripts/sign-stripe-event.ts` — a committed harness that emits a validly-signed event body and
  `Stripe-Signature` header for a given payload and secret. See below.
- `specs/decisions/ADR-005-payments-money-flow.md` — an **additive implementation note** only. The
  ADR already describes the webhook as "signature-verified" and "idempotent", and both remain true;
  this slice adds a third property it does not yet mention. No numbered decision is reopened, which
  is exactly the shape of the note P5a added to the same ADR for loyalty.

## Why the signing harness is committed rather than a scratch file

CLAUDE.md's most expensive recurring lesson is that a unit test constructing an object by hand
reproduces whatever shape the test author assumed, not the shape the real system produces — that is
the whole story of the `23505` vs `P2002` adapter saga, and of the `updateMany` HTTP-mode crash that
four rounds of reasoning failed to find and one live script found immediately.

A binding check is exactly that class of code. The only way to know a crafted-but-signed event is
actually refused is to send one, and `stripe listen` cannot produce a mismatched pair on demand — it
forwards only what Stripe itself generated. We hold the signing secret locally, so we can produce a
genuinely-signed event with a deliberately wrong session id. Committing that harness makes the live
half of validation re-runnable by a future reader instead of a one-off that has to be reinvented.
Scope is one file, no runtime dependency, and it is named in `requirements.md` so it is not silent
growth.

## Deliberately excluded

- **No schema change and no migration.** Every column this slice reads already exists
  (`Payment.provider`, `Payment.providerReference`, `Payment.amountPence`, `Order.currency`).
- **No backfill of `providerReference` for historical orders.** Orders predating this slice are
  already `CONFIRMED` or `CANCELLED`, or are long-abandoned `PENDING_PAYMENT` rows; a stored `null`
  is refused by the predicate, which is the correct fail-closed outcome and not a regression to
  repair.
- **The reconciliation sweep stays #101.** This slice makes a mismatch loud; it does not build the
  mechanism that later resolves one.
- **`lib/stripe-webhook.ts`'s signature verification is untouched.** It is not what is broken.
- **No change to the 200-for-everything-past-the-signature posture.** Reaffirmed, not revisited.
- **No new alerting.** The loud log is `console.error`; wiring it to an alert is #437.
- **`Order.currency` is not made per-vendor configurable.** It is a column with a default and this
  slice only reads it.
- **The `not-found` case is not made into a 404.** It stays a logged 200, same reasoning as the rest.

## Open items carried forward

- **PR #453's promotion row** — the `staging → main` promotion of #427/#428 merged after
  `specs/roadmap.md` was last edited, so under the carry-forward rule its change-log row lands on this
  slice's branch. Included here as a requirement rather than left to the next `/orient` to notice.
- **#101** — reconciliation sweep for webhooks that never arrive; the eventual home for an order left
  `PENDING_PAYMENT` by a refused binding.
- **#437** — production alerting; the eventual consumer of the log lines this slice adds.
- **#450** — the stale capability-URL comment on `/staff/orders/[orderNumber]/page.tsx`, filed during
  the previous slice and still open. Not in scope here.
