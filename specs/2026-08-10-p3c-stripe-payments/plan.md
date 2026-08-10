---
id: p3c-stripe-payments
title: "P3c — Stripe payments, webhooks & confirmation email (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-10
visibility: internal
summary: Replace P3b's stub PaymentService with real hosted Stripe Checkout via raw fetch, add a signature-verified idempotent webhook that confirms orders and releases stock on failure or expiry, and send the order confirmation email only once payment is actually confirmed.
tags: [p3, payments, stripe, webhooks, email]
related: [roadmap, architecture, tech-stack, adr-005-payments-money-flow, p3b-checkout-order-core]
---

# P3c — Stripe payments, webhooks & confirmation email (plan)

Third slice of **P3 — Cart & checkout** (issue #99, epic #86), following P3b (#96).
`requirements.md` holds the checkable criteria.

**Goal:** money actually moves. An order placed in P3b currently sits at `PENDING_PAYMENT` forever
with its stock held and no way to pay; this slice makes payment real and **closes the stock-release
gap P3b explicitly recorded**.

## 🛑 Blocked on credentials (build can proceed, validation cannot)

No Stripe credentials exist in staging secrets, production secrets, or local env. The owner must
provide, per environment, as **Cloudflare Worker secrets**:

- `STRIPE_SECRET_KEY` — server-side API calls
- `STRIPE_WEBHOOK_SECRET` — webhook signature verification

**`STRIPE_PUBLISHABLE_KEY` is deliberately NOT required.** It exists for client-side Elements; hosted
Checkout is a server-created session plus a redirect, so no publishable key ever reaches the browser.
Asking for a key we never use would be cargo-culting the Stripe quickstart.

Everything is written so an unconfigured environment **falls back to P3b's stub** rather than
crashing — mirroring `getEmailService()`'s degradation. Local dev and CI keep working untouched.

## The defect this slice must fix first

P3b calls `payments.createPayment()` **inside** `placeOrder`'s Prisma transaction
(`lib/repositories/orders.ts`, the call at line ~195 within the `$transaction` opened at line ~82).
With a stub that does no I/O this is harmless. With a real Stripe call it is a genuine defect: an
HTTP round-trip to Stripe would hold a Postgres transaction open on a serverless Neon connection,
against Prisma's default 5s interactive-transaction timeout — a slow Stripe response would roll back
a perfectly good order, and every checkout would pin a connection for the duration of an external
call.

**Fix:** the transaction creates the order with `Payment.providerReference = null`; the Stripe
session is created **after commit**; the reference is then written in a second, tiny update. If the
Stripe call fails, a **compensating transaction** cancels the order and releases its stock
immediately, so a shopper never ends up with an unpayable order silently holding inventory.

**Rejected:** creating the Stripe session *before* the transaction — the amount is computed from DB
state inside it, so the session would have to be created with a total we haven't validated yet.

## Key design decisions

- **Raw `fetch()` to Stripe's REST API, not the `stripe` npm SDK.** Precedent, not preference: this
  repo already chose `aws4fetch` over the AWS SDK and plain `fetch` over Resend's SDK, both for
  Worker bundle size. Stripe's SDK carries the same Node-runtime baggage.
- **Webhook signature verified with WebCrypto**, not a library: HMAC-SHA256 over
  `` `${timestamp}.${rawBody}` `` compared against the `v1=` value in `Stripe-Signature`, with a
  timestamp-tolerance check to reject replays. **The raw request body must be used** — re-serialising
  parsed JSON changes bytes and breaks the signature.
- **The webhook is deliberately vendor-agnostic.** It arrives on whatever host Stripe was configured
  with and has no meaningful tenant context, so it must **not** use `getCurrentVendorId()`. It looks
  the order up by `orderNumber` (carried in Stripe session metadata) and derives `vendorId` **from
  the order row**. This is the one justified un-scoped read in the codebase, and it is narrow: a
  single lookup by a unique, unguessable order number.
- **Idempotency reuses P3b's conditional-update guard**, not a new event-log table: the transition is
  `updateMany({ where: { id, status: "PENDING_PAYMENT" }, ... })` and `count === 0` means another
  delivery already processed it. Stripe retries webhooks aggressively and can deliver out of order,
  so this matters — and it is the same proven technique as the stock decrement.
- **`checkout.session.completed` is not sufficient on its own.** It can fire with
  `payment_status: "unpaid"` for asynchronous methods, so the handler confirms only when
  `payment_status === "paid"`.
- **The success page is the existing `/checkout/{orderNumber}`, made status-aware** — no new route.
  Stripe's own guidance is that the browser redirect is never the source of truth (a shopper can
  close the tab, and the redirect routinely races the webhook). The page renders whatever
  `order.status` actually is: `PENDING_PAYMENT` → "confirming your payment…", `CONFIRMED` → today's
  confirmation, `CANCELLED` → payment-failed messaging.
- **The confirmation email fires only from the webhook**, once status flips to `CONFIRMED` (owner
  decision). Never at order creation: a payment that then fails would leave the shopper holding a
  "confirmed" email for a cancelled order. Consistent with every other "never assume money" decision
  in this codebase.

## Scope (this slice)

- `lib/config.ts`: optional `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- `lib/payments.ts`: real Stripe Checkout adapter (raw `fetch`), stub retained as the
  unconfigured-environment fallback; `CreatePaymentInput` gains `returnOrigin` so
  `placeOrder` stays free of request context (P3b's R9a).
- `lib/stripe-webhook.ts`: pure signature verification + event parsing (unit-testable without keys).
- `lib/repositories/orders.ts`: move the payment call out of the transaction + compensating cancel;
  `confirmPayment(orderNumber)` / `failPayment(orderNumber)` transitions, both idempotent, the latter
  releasing stock.
- `app/api/webhooks/stripe/route.ts`: Node-runtime handler for `checkout.session.completed`,
  `checkout.session.expired`, `checkout.session.async_payment_failed`.
- `app/(storefront)/checkout/[orderNumber]/page.tsx`: status-aware rendering.
- Confirmation email (subject/body per vendor via `VendorConfig.senderName`, reusing `EmailService`).
- Docs: `tech-stack.md` (adapter now real), `docs/env-setup.md` (the two secrets + webhook endpoint
  registration), ADR-005 breadcrumb, `CHANGELOG.md`.

## Deliberately excluded

- **Cash on Delivery** — out of scope entirely (P3b decision, unchanged).
- **Stripe Connect / per-vendor payout routing** — ADR-005's deferred upgrade; `vendorId` continues
  to flow through the port so it stays additive.
- **Refunds and the `REFUNDED` payment status** — the enum value exists but nothing writes it; refunds
  are an admin action, P6.
- **Delivery slots** — P4. **"Shop your list"** — P3d.
- **A retry/"pay now" path for an order stuck in `PENDING_PAYMENT`** — the shopper re-checks out
  instead. A resume-payment flow is a genuine follow-up, tracked rather than half-built here.
- **Reconciliation for a webhook that never arrives** (Stripe outage, endpoint misconfigured): such an
  order stays `PENDING_PAYMENT` until its session expires. A scheduled sweep is P7 hardening.

## Open items carried forward

- **Stripe test keys + webhook endpoint registration** are owner actions. **Exactly one endpoint per
  environment** — not one per vendor host: the same Worker serves every host and the handler is
  vendor-agnostic, so one endpoint yields the one signing secret `STRIPE_WEBHOOK_SECRET` holds.
  (Registering per-host endpoints would produce several secrets the config cannot represent — worth
  stating, because "multi-vendor" makes per-host feel like the natural default.) Until the keys
  exist, only the stub path is exercisable.
- **Local webhook testing needs the Stripe CLI** (`stripe listen --forward-to`), since Stripe cannot
  reach `localhost`. Noted so validation doesn't assume a curl can stand in for a signed delivery.
