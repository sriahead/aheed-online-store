---
id: guest-order-authorization-plan
title: "Guest order authorization — confirmation and cancellation (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-29
visibility: internal
summary: "Replaces the order number as a guest's only credential with a per-order capability token, and turns the destructive checkout-cancellation GET into an authorized confirmation page backed by a POST server action. First slice of P9.1."
tags: [security, orders, checkout, authorization, guest, p9]
related: [roadmap, adr-004-multi-tenancy, adr-005-payments-money-flow]
---

# Guest order authorization — confirmation and cancellation (plan)

The first slice of **P9.1 — Security & transaction safety**, closing **#427** and **#428**. Both were
filed by #426's restructure after being confirmed against the code rather than inherited from a gap
register.

**Goal:** make knowing an order number insufficient, on its own, to read a guest's name, phone and
delivery address — or to cancel their order and release its inventory. Shipping this slice means the
two guest-reachable order paths share one authorization rule with one implementation, and the
destructive one stops being reachable by a bare `GET`.

## Why the two issues are one slice

They are the same defect on the same credential. `app/(storefront)/checkout/[orderNumber]/page.tsx`
resolves a guest order with a null viewer id and renders `OrderAddressCard`;
`app/api/checkout/cancel/route.ts` cancels an order and restores its lines to the cart from a `GET`,
reasoning in its own comment at :21-23 that an unguessable order number is "safe enough". #428's fix
*is* "apply whatever #427 decides, then remove the destructive GET" — the roadmap already records it
as depending on #427's authorization design. Splitting them would write the token plumbing twice and
leave the destructive path live in production in between.

The human's ruling at `/propose` (2026-08-28) was to pair them and to use a capability token.

## What is already true (verified at Orient and Propose, not assumed)

- **Cross-vendor access is already handled.** `lib/orders-service.ts:46` calls
  `findOrderForViewer(prisma, vendorId, ...)` and the query's `where` carries `vendorId`. #427's
  "prevent cross-vendor access" line is already satisfied; nothing in this slice needs to add it, and
  the requirements below assert it as a regression guard rather than as new work.
- **Nothing emails a link to the confirmation page.** `lib/email.ts` and
  `features/orders/send-status-email.ts` contain no URL pointing at `/checkout/`. The only legitimate
  entry is Stripe's `success_url` (`lib/payments.ts:87`). This is what makes a token in the redirect
  URL sufficient — there is no second, older delivery channel to keep working.
- **`Order.guestEmail` already exists**, and `/orders/lookup` already proves an order-number-plus-email
  pair behind a database-backed rate limiter (`lib/order-lookup-rate-limit-service.ts`). That is the
  fallback this slice sends unauthorized guests to; it is adopted, not modified.
- **A token precedent exists.** `lib/cart-identity.ts:48` already mints `crypto.randomUUID()` as a
  browser-held identifier, so this slice introduces no new dependency or generation strategy.
- **`Referrer-Policy: strict-origin-when-cross-origin` is already set globally**
  (`next.config.ts`, `source: "/:path*"`). A cross-origin navigation from the confirmation page
  therefore sends only the origin — never the path or query — so the token cannot leak through a
  referrer header to a third party. No new header is added; the existing one is asserted so a future
  change cannot silently weaken it.

## Scope (this slice)

**1. The credential.** `Order` gains `confirmationToken String? @unique` — additive, nullable, one
migration, no backfill. `placeOrder` mints it with `crypto.randomUUID()` inside its existing
`$transaction`, in the same `tx.order.create` call that writes `orderNumber`
(`lib/repositories/orders.ts:286`). After commit it travels to `payments.createPayment`, which is
already the boundary where the redirect URLs are built.

**2. The redirect URLs.** `createStripePaymentService` builds
`` `${returnOrigin}/checkout/${orderNumber}?t=${token}` `` as `success_url` and
`` `${returnOrigin}/checkout/${orderNumber}/cancel?t=${token}` `` as `cancel_url`.

**There is a second redirect, and missing it would have locked shoppers out of their own orders.**
`features/checkout/place-order.ts:142` reads
`destination = placed.redirectUrl ?? ` `` `/checkout/${placed.orderNumber}` ``, and that fallback is
taken on *every* checkout under the stub payment adapter — which is local preview, CI, and any
environment where `STRIPE_SECRET_KEY` is unset. A token added only to the Stripe URLs would leave that
path handing the shopper a URL that the new rule immediately refuses. So `PlacedOrder` carries the
token back out of `placeOrder` and the fallback appends it too. This is the one place the credential
legitimately crosses back into application code, and it is deliberately on `PlacedOrder` — the
internal result of placing an order — never on `OrderSummary`, which every order page renders from.
`PlacedOrder`'s only consumer is that one line in `place-order.ts`, which reads two fields and never
renders the object, so the field reaches nothing else. It also means the live rows in `validation.md`
can be run end to end with no Stripe account at all.

**3. One authorization rule.** `findOrderForViewer` takes the token as a fifth explicit parameter:

| Order | Viewer | Result |
|---|---|---|
| Member-owned | The owner | Returned; token irrelevant |
| Member-owned | Anyone else | `null`, even holding a valid token |
| Guest | Matching non-null token | Returned |
| Guest | No token, wrong token, or a null stored token | `null` |
| Any | Another vendor | `null` (unchanged) |

The token is selected internally and destructured out of the result in the same statement that
already removes `userId`, so it never reaches a caller or a rendered page. This mirrors exactly how
`userId` is handled today at `lib/repositories/orders.ts:863`.

**A deliberate tightening.** Today a *signed-in* shopper holding a guest order's URL passes the check
— `OrderSummary.hasAccount`'s docstring at :598-607 describes precisely that scenario. Under the new
rule a guest order requires the token from everyone, session or not. That docstring, plus
`findOrderForViewer`'s inline comment at :859-861 and the confirmation page's own docstring at
:16-24, all currently assert the superseded rule as current behaviour, and all three are updated
here. CLAUDE.md's repository section records four separate occasions where a docstring asserting an
untrue property outlived the property; leaving these would be a fifth.

**4. Uniform refusal.** Every refusal — no such order, wrong token, non-owner — redirects to
`/orders/lookup?orderNumber=…`. One branch, so nothing distinguishes "this order does not exist" from
"your token is wrong", and the shopper always lands somewhere they can actually recover from with the
credential pair they do have. This replaces the page's current `notFound()`; a signed-in shopper
opening a genuinely non-existent order now reaches guest lookup rather than a 404, which is a small
UX cost accepted to avoid the existence oracle.

**5. The cancellation path.** `app/api/checkout/cancel/route.ts` is deleted and replaced by
`app/(storefront)/checkout/[orderNumber]/cancel/page.tsx` plus a server action in
`features/checkout/cancel-order.ts` (beside the existing `place-order.ts`).

**Stripe's `cancel_url` is a browser redirect and is therefore always a `GET`** — so "make it a POST"
cannot mean POST-only without breaking the cancel path outright. The split that actually works:

- The `GET` becomes a **non-mutating confirmation page**, authorized by the same rule, asking whether
  to cancel. It also offers a link back to `/cart` that cancels nothing.
- The cancellation itself moves behind a `<form action={cancelOrder}>` **POST server action**, the
  same progressive-enhancement shape used across `/staff/*` — no client JS required.
- The action **re-proves the token** rather than trusting the submitted fields, matching the posture
  `GuestEraseForm` and `/orders/lookup/export` already take with the order-number-plus-email pair
  (`app/(storefront)/orders/lookup/page.tsx:246-255`).

This matters beyond CSRF, and is the part a token alone would not have fixed: today any link
prefetcher, email scanner, chat-app unfurler or crawler that touches a `cancel_url` cancels a live
order and releases its stock. Only the GET/POST split removes that.

**6. Housekeeping riding this branch.** `specs/roadmap.md`'s carry-forward change-log row for
**PR #449**, which `npm run sdd:audit` currently reports as pending.

## On not claiming constant-time comparison

The guest branch compares the submitted token to the stored one with a plain string equality. A
timing-oracle objection is foreseeable, so the reasoning is recorded rather than left to be
re-derived: the token is 122 bits of randomness from `crypto.randomUUID()`, and the comparison sits
behind a Cloudflare edge hop and a Neon round trip whose jitter is orders of magnitude larger than any
signal. Writing a hand-rolled constant-time compare in JavaScript would let the code *claim* a
property that JIT behaviour and string interning make unprovable — which CLAUDE.md's repository
section documents as a worse failure than not claiming it. If this is ever revisited, the right fix
is moving the comparison into the `where` clause so Postgres does it, not a JS loop.

## Deliberately excluded

- **The rest of P9.1.** #429 (Stripe webhook binding), #430 (payments fail-closed), #431 (auth rate
  limiting), #432 (cross-tenant DB integrity), #433 (commercial CHECK constraints) and #340 (review
  vendor scoping) are each their own slice, per #426's plan.
- **No change to `/orders/lookup`, its export route, or its rate limiter.** This slice sends traffic
  to them; it does not touch them. In particular the cancel page is *not* given a rate limiter — it
  is authorized by a 122-bit token rather than by a guessable pair, so the threat the lookup limiter
  answers does not apply.
- **No backfill for existing guest orders.** They keep a null `confirmationToken` and their guests
  land on `/orders/lookup`, which can still show them status, items and total. A guest holding a
  pre-migration order can no longer self-cancel it; that is accepted, and abandoned orders are
  already **#94**'s subject. Backfilling would mean minting tokens nobody has ever been sent, which
  buys nothing.
- **No rotation, expiry or single-use semantics on the token.** The order is immutable history and
  the shopper may legitimately return to the page later. Expiry would need a UX for the expired
  case, which is scope this slice does not have.
- **No change to the staff order view.** `app/(admin)/staff/orders/[orderNumber]/page.tsx` uses
  `getForStaff`, a different function with a role check; only its comment at :25 refers to the rule
  changing here, and a comment is not a code path.
- **`OrderSummary` is not given a token field.** Exposing the credential on the type every order page
  renders from would defeat the slice.

## Open items carried forward

- **#94** — abandoned checkout handling remains the answer for orders nobody cancels, including
  pre-migration guest orders that can no longer be cancelled from the browser.
- **#267** — Project #2's Phase field still cannot express P9, so both issues stay tagged Phase `P8`
  on the board while the milestone carries the real phase.
- **#113** — production Stripe keys. This slice is validated against Stripe test mode under
  `npm run preview`; the live redirect URLs are exercised for real only once that lands.
