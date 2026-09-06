---
id: p9-2-stranded-payment-sweep-plan
title: "Stranded payment sweep — scheduled reconciliation of lost webhooks and abandoned checkouts (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-06
visibility: internal
summary: A scheduled sweep resolving PENDING_PAYMENT orders stranded by a lost Stripe webhook or an abandoned checkout, asking the provider before it acts. Adds a cron Worker and an authenticated job route; changes no existing payment transition logic.
tags: [payments, operations, reliability, p9-2]
# related: [p9-1-stripe-webhook-binding-plan, p9-2-payment-binding-refusal-recovery-plan]
---

# Stranded payment sweep — scheduled reconciliation of lost webhooks and abandoned checkouts (plan)

A slice of **P9.2 — Production infrastructure & reliability**, closing **#618** and absorbing
**#101** (reconciliation for webhooks that never arrive) and **#94** (abandoned checkout handling).

**Goal:** stop an order being stranded in `PENDING_PAYMENT` forever when its webhook never arrives.
Shipping this slice means a shopper who paid and lost their webhook gets confirmed and emailed
without a human noticing, and a shopper who walked away stops holding inventory, a discount-code
use and a loyalty redemption indefinitely.

## What is actually wrong today

`placeOrder` decrements stock **inside** the order transaction (`lib/repositories/orders.ts:236`)
and writes the order `PENDING_PAYMENT`. Leaving that state is the webhook's job, exclusively:

- **`lib/order-status.ts:123` sets `PENDING_PAYMENT: []`.** There is no staff transition off it.
  The comment beside it is explicit that only Stripe's webhook may move the order.
- **`/staff/payments` (#454) structurally cannot show it.** That worklist reads
  `PaymentBindingRefusal` rows, which exist only when a webhook **arrived and was refused** (#429).
  A webhook that never arrives writes no row.
- **`retrieveSession` has exactly one call site** — `features/payments/reconcile-refusal.ts` lines
  64 and 104, reachable only from that same page. Nothing asks Stripe about an order that is not
  already on the refusal list.

So the order sits, holding real inventory, with no trace anywhere a human looks. `#429`'s own plan
anticipated this precisely and named its owner: *"That is #101's eventual territory (the
reconciliation sweep for webhooks that never arrive), not this slice's."* This is that slice.

## Why #101 and #94 are one slice, and why the order matters

They are one missing caller. `#94` alone would be **unsafe**: a timer that cancels stale
`PENDING_PAYMENT` orders cannot distinguish a shopper who walked away from one who paid while the
webhook was lost, and cancelling the second restocks and cancels an order a real customer was
charged for. **Asking the provider is what makes cancelling safe**, so the reconciliation query is a
precondition of the timeout, not an enhancement layered on top of it.

## The decision table, which is the actual design

For each candidate order the sweep asks the provider about **the order's own stored session** and
acts only on a definitive answer:

| Provider says | Sweep does | Why |
|---|---|---|
| `paymentStatus === "paid"` | Confirm, then email | The money is real; the webhook was simply lost |
| unpaid **and** session `status === "expired"` | Release (restock, reverse points, free the code) | Stripe has closed the session; it can never be paid |
| unpaid **and** session `status === "open"` | **Nothing** | The shopper can still pay. Not yet answerable |
| unpaid **and** session `status === "complete"` | Nothing until the **long** cutoff, then release | An async payment method. Ambiguous until it is old |
| `retrieveSession` throws | **Nothing**, counted as unresolved | A provider outage must not look like an answer |

### The `complete` and unpaid row is the one an obvious design would have got wrong

A first draft of this table released on `expired` and deferred everything else, which looks
complete and is not. Stripe's asynchronous payment methods finish the session **before** the money
settles: `checkout.session.completed` fires with `payment_status: "unpaid"`, and the outcome
arrives later as `async_payment_succeeded` or `async_payment_failed`. If **that** webhook is the one
lost, the session is left `complete` and `unpaid` forever — and a rule keyed on `expired` would
defer such an order on every run until the end of time, which is the exact failure this slice
exists to remove, reintroduced one branch over.

It cannot simply be released on sight either, because `complete` plus `unpaid` is genuinely
ambiguous: it is also what a *still-settling* async payment looks like. So it resolves on the
**long cutoff** — the same backstop the no-stored-session case uses below. That unifies both
"cannot be answered directly" cases under one rule instead of two.

The `open` and provider-outage rows carry the rest of the slice's safety. `reconcile-refusal.ts` already
states the principle this slice inherits: *"A provider outage must not look like an answer.
Recording the failure as a resolution of its own keeps 'we asked and could not find out' distinct
from 'we asked and it was unpaid' — the second authorizes writing the order off, the first does
not."*

**Release is gated on session expiry, not on elapsed time.** This is what lets the candidate cutoff
be short. A 30-minute cutoff cannot cancel anything prematurely, because a session that has not
expired yields "do nothing" regardless of how old the order is — while a paid-but-stranded shopper
is rescued within the hour instead of the next day.

### The stub adapter is a live hazard, and it is why the sweep refuses to run under it

`createStubPaymentService().retrieveSession` returns `paymentStatus: "unpaid"`, `status: "open"`
unconditionally (`lib/payments.ts:112`). The stub is deliberately never `"paid"` so the `#454`
recovery path cannot confirm an unpaid order — but **the sweep's safety runs the other way**, since
`"unpaid"` is the answer that authorizes cancellation. A sweep run against the stub would treat
every order in the store as an authoritative "not paid".

The `status === "open"` rule above already means the stub can never trigger a release. Relying on
that coincidence would be fragile, so the sweep **also refuses to run at all when the stub adapter
is active** and returns `503`. This costs nothing locally: this repo's `.dev.vars` and `.env` both
carry a real test-mode `STRIPE_SECRET_KEY`, so `npm run preview` runs the Stripe adapter, as
`CLAUDE.md`'s Stripe section records.

### The order with no stored session

`Payment.providerReference` is nullable, so an order can carry no session id — the session was
never created, or the post-commit write that stores the id did not land. There is nothing to ask
the provider about, and no `PaymentBinding` is constructible, so `failPayment` would refuse it as
`unbindable` by design.

These are released through the **no-binding** path (`cancelUnpaidOrder`) behind the same **long
cutoff** as the `complete`-and-unpaid case above. The argument is specific rather than a guess:
this app sets no `expires_at`, so Stripe's default 24-hour session expiry applies, and an order
older than the long cutoff cannot have a payable session behind it whether or not one was ever
created. A shorter cutoff here would not be safe, because the rare "session created but its id
never stored" window is exactly the case that cannot be checked.

### The three tunables, and their defaults

| Tunable | Default | Why this value |
|---|---|---|
| Candidate cutoff | 30 minutes | Past any live checkout interaction, so a stranded paid order is rescued within the hour. Safe to keep short because release is gated on the session's own state, never on age alone |
| Long cutoff | 7 days | Comfortably past Stripe's 24-hour session expiry, so nothing behind it can still be paid. Resolves the two cases that cannot be answered directly |
| Batch cap | 50 orders per run | Bounds provider calls and Worker CPU per invocation. A backlog drains over successive runs rather than in one long request |

The cron period is **every 15 minutes**. Recovery latency is the thing being bought: a charged
shopper with no confirmation email is the worst state in this slice, and an hourly period would
leave them there up to four times longer for no saving that matters at this volume.

## Scope (this slice)

**1. `workers/scheduler/`** — a minimal Worker with its own `wrangler.toml` carrying a
`[triggers] crons` entry. Its `scheduled` handler walks a hardcoded list of job paths and issues one
authenticated `POST` each against the main Worker. **No Prisma, no repository import, no database
access, no vendor knowledge** — it is a clock and an authenticated `fetch`.

This exists because `.open-next/worker.js` is **generated and gitignored** and exports only `fetch`
plus three Durable Object classes; there is no `scheduled` export to attach a Cron Trigger to, and
editing the generated entry is pointless because every build overwrites it. The job list is a
literal array in the Worker's source rather than a parsed environment variable, deliberately: a
typo in a config-driven path list silently schedules nothing, whereas a typo in an array is a diff.

**2. `app/api/jobs/reconcile-payments/route.ts`** — `POST` only. Authenticated by a shared secret
in an `x-job-token` header, compared with the **existing** `timingSafeEqual` from
`lib/stripe-webhook.ts`. Session-based `requireVendorRole` cannot apply here, as
`app/api/admin/jobs/backfill-images/route.ts` does, because a cron has no session. Returns `503`
when the token is unset in the app, so a misconfigured environment fails closed rather than
running the sweep unauthenticated.

**3. `lib/payment-sweep.ts`** — the orchestration, taking its payment service, order service,
clock and caps as **explicit parameters**. It calls no `getPaymentService()` at module level, which
is what makes the decision table above unit-testable against a fake provider without a live
request, a Stripe account or a database. The route is the only place real dependencies are wired.

**4. Two pure repository reads** — `listStalePendingOrders(prisma, vendorId, olderThan, limit)` in
`lib/repositories/orders.ts` and `listActiveVendorIds(prisma)` in `lib/repositories/vendor.ts`,
both taking their client explicitly per the repository injection contract.

**5. Deploy wiring** — `deploy-staging.yml` and `deploy-production.yml` each gain one additive
`wrangler deploy` step for the scheduler, after the existing app deploy.

## What this slice deliberately does not touch

**No existing function in the payment transition path is modified.** `confirmPayment`,
`failPayment`, `releaseOrder` and `classifyNoMatch` are `#429`'s security-critical compare-and-set
machinery, and this slice adds a **caller** rather than changing any of them. That is checkable
with `git diff`, and it is asserted as a requirement precisely so the claim cannot quietly stop
being true during Build.

A consequence accepted rather than fixed: `confirmPayment` writes a fixed
`note: "Payment confirmed."`, so a sweep-driven confirmation is **indistinguishable from a
webhook-driven one** in `OrderStatusEvent`. Adding an optional note parameter would be one line and
was considered, then rejected — widening the signature of a security-critical payment function to
improve an audit string is a poor trade inside a payments slice. The run-level summary and the
order's own timing carry that information instead. The **release** path needs no such change: its
note is already a parameter, so a swept release is distinguishable.

## Reuse that removes work rather than adding it

- **`getWebhookOrderService()`** already resolves the WebSocket client (`confirmPayment` runs an
  interactive transaction, and `releaseOrder` uses `updateMany`, which crashes on the HTTP adapter
  per `#382`), already forwards the `PaymentBinding` unchanged, and **already persists a
  `PaymentBindingRefusal` row on a loud refusal**. Using it means a binding mismatch found by the
  sweep lands on `/staff/payments` exactly like a webhook-driven one, with **no new model and no
  migration**.
- **`@@index([vendorId, status, createdAt])` already exists on `Order`** — precisely the index a
  per-vendor candidate query wants.
- **`timingSafeEqual`** is already written, tested and exported.

**No schema change and no migration**, therefore avoiding the GAP-011 `DROP INDEX` trap that has
fired on every generated migration since `#508`.

## Vendor scoping

The candidate query is **per-vendor**, looping over `listActiveVendorIds`, rather than one global
query. A global query would need a new entry in `tests/repository-vendor-scoping.test.ts`'s
`ALLOWED` map, and the justification would be weak: unlike a webhook — which genuinely arrives with
no host, the reason `findOrderForWebhook` and `confirmPayment` are exempt — a sweep is initiated by
us and can enumerate vendors perfectly well. Per-vendor also uses the existing index. **No new
`ALLOWED` entry is added by this slice**, and that is a requirement.

## Deliberately excluded

- **No new staff page and no new model for sweep outcomes.** Per-order history already lands in
  `OrderStatusEvent`; anomalies already land on `/staff/payments` through the reuse above. Run-level
  reporting is the route's JSON response plus a `console.error` for anomalies only — the same
  "duplicates stay silent, anomalies are loud" discipline the webhook route uses. A dedicated sweep
  dashboard is not built.
- **No alerting.** Turning the anomaly log lines into a page-someone signal is **#437**, whose own
  prerequisite (**#246**, confirming Workers Logs actually persist) is still open.
- **No retry or backoff for a provider outage.** An unreachable provider means the order is skipped
  and picked up by the next scheduled run. That is already a retry, on a 15-minute period, with no
  new state to hold.
- **No lock, lease or run table.** Overlapping runs are already safe: every transition is a
  compare-and-set guarded on `status: "PENDING_PAYMENT"`, so a second run finds nothing to move.
  Adding coordination would be inventing a problem.
- **No change to the webhook route.** It is not what is broken.
- **No refunds.** An order confirmed by the sweep that later needs reversing is **#606**'s
  territory; `PaymentStatus.REFUNDED` still has no writer anywhere.
- **No general job framework.** The scheduler invokes a list of paths. It has no queue, no retry
  policy, no job registry and no persistence.
- **Suspended vendors are not swept.** `listActiveVendorIds` returns only `status: "ACTIVE"`
  vendors, so a `SUSPENDED` store's stranded orders are left untouched. This is deliberate: a
  suspended store is one nobody has decided the disposition of, and quietly cancelling its
  customers' orders — or confirming them and sending confirmation emails on its behalf — is a
  worse default than leaving them for whoever resolves the suspension. Worth revisiting if a
  vendor is ever suspended with live orders outstanding; today none has been.

## Housekeeping riding this branch

`specs/roadmap.md`'s **P9.2 section is stale** and is corrected here: `#472`, `#505` and `#541` are
open in the `P09.2` milestone but absent from the phase's scope list, and `#612` shipped under P9.2
without ever being added to it. Found at this slice's `/orient`. Post-Ship documentation gaps ride
the next slice's branch, and this is that branch.

## Open items carried forward

- **#437 / #246** — alerting on the anomaly lines this slice emits, and the log retention that
  alerting depends on. Both open, both P9.2.
- **#113** — production still runs Stripe **test** keys, so this slice is validated end to end
  against test mode. The sweep's behaviour is identical either way; only the money is not real.
- **#267** — Project #2's Phase field cannot express P9.2, so the board item stays on Phase `P8`
  while the milestone carries the real phase.
- **#583** — unrelated to payments, but the nearest live example of the failure mode this slice
  guards against: a hand-built test double reproducing an assumed response shape rather than the
  real one. The fake provider used in this slice's unit tests is shaped from `RetrievedSession`'s
  real fields, and the live rows in `validation.md` exercise the genuine Stripe adapter.
