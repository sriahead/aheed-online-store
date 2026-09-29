---
id: p945-payment-reconciliation-hardening-plan
title: "#945 — Payment reconciliation hardening: attempt tracking, bounded backoff, error classification (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-09-29
visibility: internal
summary: "Gives the #618 payment sweep a memory between runs: a per-order PaymentReconciliation row with claiming, bounded backoff, exhaustion and error classification, so stuck orders stop blocking the queue, refusals stop repeating, and staff can re-arm what the sweep gave up on."
tags: [payments, operations, reliability, p10]
related: [p9-2-stranded-payment-sweep-plan, adr-005-payments-money-flow]
---

# #945 — Payment reconciliation hardening: attempt tracking, bounded backoff, error classification (plan)

A P10 slice closing **#945** and absorbing **#619** (vendor starvation) and **#620** (a sweep
confirmation is indistinguishable from a webhook confirmation). Slice A of two; slice B (**#946**)
adds the durable confirmation email and the job-run heartbeat. Approved at Propose on 2026-09-29.

**Goal:** the #618 sweep already decides each order correctly. This slice makes it behave correctly
**over time**: an order that cannot be resolved is retried a bounded number of times with backoff,
then stops and is shown to staff, instead of being retried every 15 minutes forever at the head of
the queue.

## What is true today (verified 2026-09-29)

- The sweep is `lib/payment-sweep.ts` (pure decision table, zero runtime imports), wired by
  `lib/payment-sweep-service.ts`, invoked by `app/api/jobs/reconcile-payments/route.ts`, which is
  called every 15 minutes by the `workers/scheduler` Worker.
- It ran for the first time ever on staging at 2026-09-29 17:45 local (token set under **#947**):
  `{"scanned":15,"confirmed":0,"released":15,"deferred":0,"unresolved":0}`. Production's token was
  re-set the same evening; its first `ok` tick is tracked on #947, not here.
- **It holds no state between runs.** `listStalePendingOrders` (`lib/repositories/orders.ts`) returns
  `PENDING_PAYMENT` orders older than 30 minutes, oldest first, capped at 50. Every one is asked
  about again on every tick.

## The four defects this slice fixes

1. **Head-of-line blocking.** An order whose provider call fails permanently (a Stripe `404` — which
   every test-mode session will return once #113 switches production to live keys) or whose binding
   is refused is re-examined every tick forever. Because candidates are read oldest-first under a
   cap of 50, fifty such orders stop the sweep from ever reaching a newer order, for every vendor.
2. **Refusal flood.** `recordPaymentBindingRefusal` does not deduplicate. A refused order writes a
   new `PaymentBindingRefusal` row on every tick (about 96 a day), all onto `/staff/payments`.
3. **Unclassified errors.** `PaymentProviderError` carries the HTTP status only inside its message
   string (`lib/payments.ts`), so the sweep cannot tell "try later" from "will never work". The
   sweep also logs that message, which includes Stripe's raw response body.
4. **#619 / #620.** One vendor saturating the cap starves the others; and a sweep confirmation
   writes the same `OrderStatusEvent` note (`"Payment confirmed."`) as a webhook confirmation.

## Design

### A per-order reconciliation record

A new table, **`PaymentReconciliation`**, one row per order, created the first time the sweep
claims that order (so it exists only for orders that reached the sweep at all). Why each field
exists:

| Field | Why it is required |
|---|---|
| `orderId` (unique, FK to `Order`, cascade delete) | One row per order; the unique key is also what makes the first claim race-safe. |
| `vendorId` (FK to `Vendor`) | Tenant scoping, matching every other order-child table (`Payment`, `OrderStatusEvent`) and ADR-004; every repository query filters on it. |
| `attemptCount` | Total claims, for diagnosis. Never used to decide anything. |
| `consecutiveFailures` | Retryable provider failures since the last definitive provider answer. Drives backoff and exhaustion. Kept separate from `attemptCount` so an order deferred many times while its checkout is still open is not exhausted by its first transient error. |
| `lastAttemptAt` | When the current or latest claim was taken. Also the **fencing token**: an outcome is recorded only if this still equals the claim instant. |
| `nextAttemptAt` | Eligibility. An order is a candidate only when this is due. Doubles as the claim's lease expiry. |
| `lastOutcome` (enum, nullable) | What the latest completed attempt concluded. Null between a claim and its outcome, which is exactly the "interrupted" state. |
| `lastErrorStatus` | The provider's HTTP status on the latest failure (null for a network failure or a non-error outcome). Shown to staff. |
| `exhaustedAt` | Set when the sweep stops retrying. An exhausted row is never a candidate until staff re-arm it. |
| `createdAt`, `updatedAt` | House convention. |

The outcome enum, `PaymentReconciliationOutcome`, has seven values: `DEFERRED`, `RETRYABLE_ERROR`,
`PERMANENT_ERROR`, `REFUSED`, `CONFIRMED`, `RELEASED`, `ALREADY_HANDLED`.

No column is added to `Order` or `Payment` (the only `Order` change is the Prisma back-relation
field, which is not a database column), and there is no `Json`. The migration is generated with
`--create-only` and read before it applies, because Prisma has proposed dropping the hand-authored
`pg_trgm` indexes on every migration since `#508`.

### Claiming, leasing and fencing

Before asking the provider about an order, the sweep **claims** it:

1. `createMany` with `skipDuplicates` inserts a fresh row (`attemptCount` 1, `lastAttemptAt` = now,
   `nextAttemptAt` = now + lease). A count of 1 means this run owns the order.
2. Otherwise a conditional `updateMany` — `where` the row is not exhausted and `nextAttemptAt` is
   due — sets `lastAttemptAt` = now, `nextAttemptAt` = now + lease and increments `attemptCount`.
   A count of 1 means this run owns it; 0 means another run does, and the order is skipped.

`createMany … skipDuplicates` is chosen over a `create` that catches a unique violation because it
makes the race a row count, not an error code — which sidesteps the `P2002`-versus-`23505` adapter
divergence recorded in `CLAUDE.md` entirely. Both statements must run on `getPrismaWs()`: through
the HTTP client, `updateMany` and `createMany` crash unconditionally (#382).

Setting `nextAttemptAt` to now + lease **is** the lease. If the Worker dies after the claim — before
or after the provider call — the row carries no outcome and becomes due again when the lease runs
out (10 minutes, shorter than the 15-minute tick), and the next tick retries it. The interruption
does not count as a failure.

The outcome is written with an `updateMany` whose `where` includes `lastAttemptAt` equal to the
claim instant. If a slower run's lease expired and another run re-claimed the order, the slower
run's write matches nothing and is dropped, rather than overwriting the newer attempt.

None of this replaces the real concurrency guarantee, which already exists and is unchanged:
`confirmPayment`, `failPayment` and `releaseOrder` transition only from `PENDING_PAYMENT`. Two
writers racing on one order — the webhook and the sweep, or two sweeps — still produce exactly one
transition, one stock restoration, one loyalty reversal and one confirmation email. The claim adds
**efficiency and bookkeeping** (no duplicate provider calls, no duplicate refusal rows, accurate
attempt counts), not a second correctness mechanism. There is deliberately **no run-level lock**:
claiming rows one at a time already makes overlapping runs safe, and a lock would add a way to fail
without adding safety.

### The decision table, extended

The provider-facing rules are #618's, unchanged. What changes is what each outcome records:

| Situation | Action | Outcome recorded | Next attempt |
|---|---|---|---|
| Session `paid` | confirm; email only if `ok` | `CONFIRMED` | terminal |
| Session unpaid and `expired`, or `complete` and older than 7 days | fail (release) | `RELEASED` | terminal |
| Session unpaid and `open`, or `complete` and newer than 7 days | nothing | `DEFERRED` | now + 30 minutes; never exhausts |
| No stored session, newer than 7 days | nothing, no provider call | `DEFERRED` | order `createdAt` + 7 days |
| No stored session, older than 7 days | cancel unpaid | `RELEASED` (or `ALREADY_HANDLED` if it returned false) | terminal |
| confirm/fail refused `already-processed` | nothing | `ALREADY_HANDLED` | terminal |
| confirm/fail refused for any other reason | nothing | `REFUSED`, exhausted now | none until re-armed |
| Provider threw with HTTP `400` or `404` | nothing | `PERMANENT_ERROR`, exhausted now | none until re-armed |
| Provider threw anything else (`401`, `403`, `429`, `5xx`, network) | nothing | `RETRYABLE_ERROR` | backoff; exhausted on the 8th consecutive failure |

**Backoff:** on the k-th consecutive retryable failure, the next attempt is now + 15 minutes × 2 to
the power (k − 1): 15 minutes, 30 minutes, 1, 2, 4, 8 and 16 hours. The 8th consecutive failure
exhausts the order instead. That spans about 31 hours — enough to ride out a day-long provider
outage without anyone acting. Any definitive provider answer resets `consecutiveFailures` to 0.

**Why `401` and `403` are retryable, not permanent:** they mean *our* key is wrong, which is a
configuration fault affecting every order at once and healed by fixing the key. Classifying them as
permanent would exhaust every candidate in the store on one bad deploy. **Why `404` is permanent
but is not grounds to release:** "Stripe has no such session" is "we could not find out", not "it
was unpaid" — the principle `features/payments/reconcile-refusal.ts` and #618 already state — so
the order is surfaced to staff rather than written off.

A `REFUSED` order is exhausted immediately, so it is refused — and its `PaymentBindingRefusal` row
written — **once**. That is the whole refusal-flood fix: deduplication falls out of exhaustion, with
no change to `recordPaymentBindingRefusal` itself.

### Fair batching (#619)

Each active vendor's due candidates are fetched separately (up to the batch cap each, oldest first),
then taken round-robin — one from each vendor in turn — until the cap of 50 is reached. Two vendors
each with 60 due orders get 25 each; a vendor with 3 due orders beside one with 100 gets all 3. The
batch cap still bounds provider calls per run exactly as before.

### Staff surfaces

- **`/staff/payments`** gains a second section listing this vendor's orders the sweep stopped
  retrying because of a provider error (`RETRYABLE_ERROR` or `PERMANENT_ERROR`, still
  `PENDING_PAYMENT`), each with a **Retry** button that re-arms it: clears `exhaustedAt`, resets
  `consecutiveFailures`, makes it due now. `REFUSED` orders are not listed there, because they
  already appear in the page's existing refusal list with #454's recovery actions.
- **`/staff/orders/[orderNumber]`** shows a line stating the payment was confirmed by the scheduled
  sweep, not the webhook, when that order's reconciliation outcome is `CONFIRMED`. That closes #620
  **without widening `confirmPayment`'s signature**, which #618 rejected as a poor trade inside a
  security-critical function. The row records `CONFIRMED` only when the sweep's own confirm returned
  `ok`, so a webhook-confirmed order can never show it.

No new staff page is added, so the three-surface rule for new `/staff/*` pages does not apply; the
store-admin guide's Payment Issues section is updated so the Retry capability traces to a real
control.

### Observability

Every log line from the sweep starts with the fixed prefix `payment-reconciliation` followed by
`event=<name>` and `key=value` pairs, so it is greppable in `wrangler tail`, Workers Logs and the
local log explorer. Events: `run-started`, `selected`, `provider-state`, `transition`,
`retry-scheduled`, `retry-exhausted`, `skipped`, `unrecoverable`. Fields are identifiers and states
only — order number, vendor id, session id, Stripe `status`/`payment_status`, outcome, attempt
number, next attempt time, HTTP status. **Never** a buyer's name, email or address, and never the
provider's response body (which the current sweep logs today).

`console.error` is reserved for what someone should look at: a provider failure, an exhaustion, and
an unrecoverable refusal. Everything routine is `console.log`, preserving #618's rule that a quiet
run logs no error.

The job route's JSON summary keeps #618's five counts and adds two: `exhausted` (outcomes that set
`exhaustedAt` this run) and `skipped` (a lost claim, or `ALREADY_HANDLED`). `unresolved` now means
only a retryable failure that was rescheduled; refusals move from `unresolved` to `exhausted`.

## Deliberately excluded

- **Durable confirmation email and the job-run heartbeat** — slice B, #946. A crash between a
  committed confirm and its email still loses the email in this slice.
- **Alert delivery** — #437 owns it. This slice only makes the events loggable.
- **A staff action to cancel an exhausted order.** A `PERMANENT_ERROR` order (e.g. a test-mode
  session after the live-key switch) stays `PENDING_PAYMENT` holding its stock, visible on
  `/staff/payments`, until someone resolves it at Stripe or a later slice adds a cancel. Releasing
  it automatically would treat "could not find out" as "unpaid". Filed as a follow-up at Build.
- **Attribution of a crash-interrupted sweep confirmation.** If the Worker dies after the confirm
  commits but before `CONFIRMED` is recorded, the order is confirmed correctly but the #620 line
  will not appear on it. Accepted: the order is no longer a candidate, so there is no retry to
  record it.
- **Any change** to `confirmPayment`, `failPayment`, `releaseOrder`, `classifyNoMatch`,
  `cancelUnpaidOrder`, the Stripe webhook route, webhook signature verification, the `PaymentService`
  interface, or the scheduler Worker.
- **A generic job or retry framework.** The table and its rules are specific to payment
  reconciliation, as the originating brief required.
- **Circuit breaking during a provider outage.** An outage still costs up to 50 failed calls per
  tick; each order then backs off individually. Not worth the machinery at current volume.

## Ship-time check (not a requirement)

After the staging deploy at `/ship`, run `npx wrangler tail --config workers/scheduler/wrangler.toml
--env staging` across one tick and confirm `scheduled job /api/jobs/reconcile-payments ok:` shows
all seven summary keys. This proves the deployed scheduler reaches the new code; `/validate` cannot,
because it runs before the merge.

## Open items carried forward

- **#947** — production's first `ok` tick is still to be observed.
- **#946** — slice B.
- **#113** — when live keys arrive, expect a burst of `PERMANENT_ERROR` exhaustions for any
  remaining test-mode orders; this slice is what stops them blocking the queue.
