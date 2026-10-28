---
id: event-gated-jobs-plan
title: "Event-gated background jobs and on-demand payment checks (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-28
visibility: internal
summary: "Stops the 15-minute scheduler waking Neon when nothing is pending (#1324): jobs gated on activity markers in Cloudflare KV, a daily backstop run, 35-minute Stripe sessions, a return-page payment check and two staff controls."
tags: [spec, payments, scheduler, jobs, neon, cost, cloudflare-kv, staff-admin]
related: [p9-2-stranded-payment-sweep-plan, p945-payment-reconciliation-hardening-plan, error-event-log-plan, env-setup, store-admin-tabs-guide]
---

# Event-gated background jobs and on-demand payment checks (plan)

`requirements.md` holds the checkable acceptance criteria. This file holds the reasoning behind them,
for a reader who was not in the conversation that produced them (2026-10-28, issue `#1324`).

**Goal:** the main Neon database is woken by background work only when there is background work to
do. With no shoppers and no errors, the database is woken once a day instead of 96 times. A shopper
whose payment notification was lost gets confirmed while still on the return page, and staff can
check or re-send for a single order on demand.

## Why

`workers/scheduler` fires `*/15 * * * *` in staging and production and POSTs three jobs in the
application Worker. All three touch the main database:

| Job | Database work on an idle tick |
|---|---|
| `/api/jobs/reconcile-payments` | lists stale `PENDING_PAYMENT` orders per vendor |
| `/api/jobs/reap-guest-carts` | lists vendors, then deletes expired guest carts per vendor |
| `/api/jobs/check-error-rate` | counts `ErrorEvent` rows in the last 15 minutes |

Neon suspends a compute after 5 idle minutes, and the ticks are 15 minutes apart, so every tick
costs a full wake: **96 wakes, about 8 hours of compute a day per database, with zero traffic.** At
the projects' 0.25 CU minimum that is about 61 CU-hours a month per database: about $6.45 a month
per database on Neon Launch ($0.106 per CU-hour), or most of a Free plan's allowance. Production went
over its Neon quota around 2026-10-26 (`#1289`, HTTP 402, storefront down), and this schedule is a
likely large share of that usage. The platform has never traded (`#113`, `#104`), so those ticks
currently buy nothing.

## Approach (decided at Propose, 2026-10-28)

### 1. Gate the clock; do not remove it

The scheduler keeps its `*/15` Cron Trigger. A cron invocation of the scheduler Worker never touches
Neon; only its HTTP calls into the app do. Before each call the scheduler reads an **activity marker**
from a Cloudflare KV namespace bound to **both** Workers, and calls a job only when its marker says
there is work.

| Key | Written by | Scheduler calls the job when |
|---|---|---|
| `payment-sweep:due-at` | checkout, the sweep itself, staff Retry | the stored instant is at or before now |
| `error-events:last-at` | every `ErrorEvent` write path | the stored instant is within the last 20 minutes |

`reap-guest-carts` is never called by the `*/15` tick.

**Why `due-at` and not "last checkout at".** A "last activity" window was the first idea and is
wrong. The sweep deliberately revisits orders long after their checkout: a retryable provider
failure backs off for up to about 31 hours (`DEFAULT_RETRY_BASE_MS` doubling, 8 attempts), and a
`complete`-but-unpaid session waits for the 7-day long cutoff. A window keyed on the last checkout
would strand all of those until some unrelated checkout reopened it. So the sweep itself, which is
already awake at the end of a run, computes **when it next has work** and writes that instant. If
nothing is pending it deletes the key, and the scheduler stops calling it.

**Write rules for `payment-sweep:due-at`:**

- **Checkout** (after `createOrder` succeeds, in `lib/orders-service.ts`, never in the repository):
  write "now + 40 minutes" (the order was created moments earlier, so this is effectively its
  `createdAt` plus the 35-minute session lifetime below and a 5-minute margin),
  **unless** the stored value is already earlier and still in the future. That is a read-then-write,
  not atomic. A lost race delays an order by at most the difference, and the next sweep run rewrites
  the key from the database anyway.
- **The sweep run**, at the end of `getPaymentSweepService().run()`: for each active vendor, the
  earliest instant any `PENDING_PAYMENT` order not exhausted by `#945` becomes due. That is its
  `PaymentReconciliation.nextAttemptAt` if it has one, otherwise `createdAt + DEFAULT_CANDIDATE_CUTOFF_MS`.
  Write the minimum across vendors, or **delete** the key if there is none.
- **Staff Retry** (`retryReconciliation`, `#945`): write now. The re-armed order is due immediately.

**Error marker:** `error-events:last-at` is written on every path that writes an `ErrorEvent` row
(`instrumentation.ts`'s `onRequestError`, and `recordHandledErrorEvent` in
`lib/error-events-service.ts`), **throttled**: written only if the stored value is missing or more
than 5 minutes old. KV's free tier allows 1,000 writes a day. An unthrottled error storm would use
that up in minutes, and the 5-minute throttle caps this key at 288 writes a day. The 20-minute
gating window is the check's own 15-minute window (`ERROR_RATE_WINDOW_MS`) plus slack for cron
jitter and KV's propagation delay (up to about 60 seconds).

**Fail open, always.** If the KV binding is absent, the read throws, or the value is not a valid ISO
instant, the scheduler calls the job, which is today's behaviour. On the write side, a missing
binding or a failed write is logged and swallowed. A marker write must never fail a checkout or an
error capture. So shipping this before the namespaces exist is not a regression: nothing changes
until the binding appears. That matters because the namespace has to be created by the owner (below).

**Behind a port.** `specs/architecture.md` already anticipates "optional edge KV … behind a port",
falling through when absent. The app reaches KV only through one module, `lib/job-signals.ts`. Key
names live in a zero-import module, `lib/job-signal-keys.ts`, which both Workers import, so the
two sides cannot disagree about a key name. The scheduler's decision is a pure exported function,
unit-testable without KV.

### 2. A daily backstop run at 03:00 UTC

A second Cron Trigger, `0 3 * * *`, calls **all three jobs ungated**. It is the guarantee behind every
race in rule 1: whatever a lost KV write or a stale read hides is found within a day at most. It is
also where `reap-guest-carts` now runs. Because the reaper now runs once a day instead of 96 times,
its per-vendor cap rises from 500 to 5,000; otherwise a busy day's backlog could take weeks to drain.
The 03:00 slot matches the `fill-product-images` GitHub workflow (`0 3 * * *`). GitHub's own schedule
can run late, so the two share a wake when they coincide; this is not guaranteed.

Cloudflare's Workers Free plan allows 5 Cron Triggers per account. After this slice the scheduler
uses 4: two per environment. The application Worker has none.

### 3. Stripe Checkout sessions expire 35 minutes after the order was created

Today the app sets no `expires_at`, so Stripe's 24-hour default applies, and an abandoned checkout
holds stock for a day. With a short session, the first sweep run due for an order (at
`createdAt + 40 minutes`) gets a definitive answer: `paid`, or `expired` and released. The marker
then needs to stay open for minutes, not a day.

**Why 35 minutes from `createdAt`, not "30 minutes from now".** Stripe requires `expires_at` to be at
least 30 minutes after the session is created. More importantly, the request carries
`Idempotency-Key: order-<orderNumber>`, and Stripe refuses an idempotent retry whose parameters differ.
A value computed from the request's own clock would differ on every retry. A value derived from the
order's stored `createdAt` is identical on every retry for the same order, and the extra 5 minutes
absorbs a slow order transaction before the first call. `placeOrder` passes it to `createPayment` as
a new `expiresAt` field on `CreatePaymentInput`.

The `DEFAULT_LONG_CUTOFF_MS` doc comment in `lib/payment-sweep.ts` says "this app sets no
`expires_at`". After this slice that is false, so it is corrected. The 7-day value stays: it is
the backstop for the `complete`-but-unpaid and no-session cases, which the session lifetime does not
change.

### 4. Check payment on the shopper's return

Stripe returns the shopper to `/checkout/<order>?t=<token>`. That page reads status from the
database, and a page `GET` must never change anything (`#428`). Today a pending order shows
"Confirming your payment…" and tells the shopper to refresh, which changes nothing until a webhook or
the sweep arrives.

New: when the order is `PENDING_PAYMENT`, the page renders a small client component that, once on
mount, calls a **server action** (a `POST`). The action:

1. authorizes exactly as the page does: `getOrderRepository().getByOrderNumber(orderNumber,
   viewerUserId, token)` returns the order, or the action does nothing;
2. asks the payment provider about the order's **own stored** `Payment.providerReference`, never
   anything from the URL. The redirect is not trusted (P3c R21);
3. if the provider reports `paid`, confirms through the existing `getWebhookOrderService().confirm`
   (`confirmPayment`, #429's compare-and-set, unchanged), and sends the confirmation email only when
   that call performed the transition, so a racing webhook cannot cause a duplicate;
4. otherwise changes nothing. It **never releases or cancels**. Release stays the sweep's job, so a
   shopper-triggered request cannot cancel an order.

On `confirmed` the component refreshes the route, and the page re-reads the order from the database.

The decision lives in a new zero-runtime-import module, `lib/payment-check.ts`, in the same style as
`lib/payment-sweep.ts`, so its table is unit-tested without mocks. A facade, `lib/payment-check-service.ts`,
joins it to live clients.

### 5. Two staff controls on `/staff/orders/[orderNumber]`

Shown only to `ADMIN`, matching Retry and Recover on `/staff/payments`. Each server action re-checks
`requireVendorRole("ADMIN")` itself, because a server action is a public endpoint:

- **Check payment now**, for a `PENDING_PAYMENT` order. It runs the same `lib/payment-check.ts`
  decision as section 4 and shows staff the outcome in plain words, including what the provider
  reported when it is not paid.
- **Resend confirmation email**, for an order in `CONFIRMED`, `OUT_FOR_DELIVERY`, `DELIVERED`,
  `READY_FOR_COLLECTION` or `COLLECTED`, the statuses of a paid order. It calls the existing
  `sendOrderConfirmationEmail` and reports that the send was attempted. That function never throws
  and swallows provider failures (`#946` exists for that), so it cannot report delivery.

## Deliberately excluded

- **Cloudflare Queues or Durable Object alarms per checkout.** Rejected at Propose. They need new
  consumer plumbing and duplicate the sweep's semantics per order. Queues availability on the new
  Cloudflare account (`#1323`) is unverified. They would also remove the clock that `#946`'s
  heartbeat relies on.
- **Changing `confirmPayment`, `failPayment`, webhook verification, or the sweep's decision table.**
  This slice is a caller of all of them.
- **Releasing an order from the return page or from Check payment now.** Release stays the sweep's
  job (section 4).
- **An audit row for a staff resend or check.** Each writes a log line. A durable notification
  record is `#946`'s `OrderNotification`.
- **Recording a `PaymentReconciliation` outcome for a return-page or staff confirmation.** So the
  "confirmed by the scheduled payment sweep" note (`#620`) does not appear for those. Attribution
  for these paths is a follow-up if anyone needs it.
- **`#946`'s heartbeat.** When it is built, it must treat a gated-off tick as normal: "no sweep in the
  last hour" no longer means "broken". That is a constraint on `#946`'s spec, recorded there, not
  built here.
- **Alert delivery** (`#437`), **the reference-database sync**, **`fill-product-images`'
  schedule**, and **restoring production** (`#1289`'s owner steps).
- **Async payment methods** (`complete` and unpaid sessions). They are still revisited on the sweep's
  30-minute defer interval until the long cutoff, which keeps the marker due during that time. The app
  configures card payments only, so this does not arise today. If it does, it costs wakes, not
  correctness.

## Open items carried forward

- **The owner must create the KV namespaces** on the Cloudflare account the Workers deploy to (`#1323`
  is moving accounts). Create one per environment, for example
  `wrangler kv namespace create aheed-jobs-staging`, and supply their ids. Each id goes into **both**
  `wrangler.toml` (application Worker, `[[env.<env>.kv_namespaces]]`) and
  `workers/scheduler/wrangler.toml`, with binding name `JOB_SIGNALS`. This slice must not invent ids
  (CLAUDE.md hard stop). Until they exist, both Workers deploy without the binding, and everything
  fails open to today's behaviour. The only id this slice writes is a **local-simulation** one on the
  top-level (non-`--env`) block of each `wrangler.toml`. `npm run preview` and `wrangler dev` simulate
  it locally, and no deploy reads it, because both deploy workflows pass `--env`.
- **The error marker is the one signal that can fail closed.** If `instrumentation.ts`'s
  `onRequestError` turns out to run without a usable request context on the deployed Worker, the
  marker is never written, and the scheduler skips the error check on every tick. Only the daily
  03:00 run would then evaluate it, which delays `#437`'s alert by up to a day. Unit tests prove that
  the call is made; only a deployed Worker proves that the write lands. The first staging deploy with
  a real namespace must confirm the key appears after an error (`wrangler kv key get --binding
  JOB_SIGNALS "error-events:last-at" --env staging --remote`).
- **`#1289`**: production is over its Neon quota. This slice reduces the usage; it does not restore
  service.
- **`#946`**'s heartbeat constraint (above).
