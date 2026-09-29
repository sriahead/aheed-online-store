# #945 — Payment reconciliation hardening (requirements / acceptance criteria)

Closes **#945**, absorbing **#619** and **#620**. Builds on **#618** (the stranded payment sweep:
`lib/payment-sweep.ts`, `lib/payment-sweep-service.ts`, `app/api/jobs/reconcile-payments/route.ts`)
and **#429**/**#454** (the payment binding and staff recovery path, both unchanged). Adds a
`PaymentReconciliation` row per swept order so the sweep claims, backs off, exhausts and records
outcomes instead of re-asking about every stuck order on every tick. `plan.md` holds the decision
table and the reason for every field. "The sweep" below means `runPaymentSweep` in
`lib/payment-sweep.ts`; "a unit test" means a case in `tests/payment-sweep.test.ts` unless another
file is named.

## Schema and migration

R1. `prisma/schema.prisma` declares an enum `PaymentReconciliationOutcome` with exactly these seven
    values: `DEFERRED`, `RETRYABLE_ERROR`, `PERMANENT_ERROR`, `REFUSED`, `CONFIRMED`, `RELEASED`,
    `ALREADY_HANDLED`.

R2. `prisma/schema.prisma` declares a model `PaymentReconciliation` with these fields and no others:
    `id` (String, uuid default), `orderId` (String, `@unique`, relation to `Order` with
    `onDelete: Cascade`), `vendorId` (String, relation to `Vendor`), `attemptCount` (Int, default 0),
    `consecutiveFailures` (Int, default 0), `lastAttemptAt` (DateTime, optional), `nextAttemptAt`
    (DateTime, required), `lastOutcome` (`PaymentReconciliationOutcome`, optional), `lastErrorStatus`
    (Int, optional), `exhaustedAt` (DateTime, optional), `createdAt` (default now), `updatedAt`
    (`@updatedAt`). No field has type `Json`.

R3. Exactly one new directory exists under `prisma/migrations/` on this branch, its name ends in
    `_p945_payment_reconciliation`, and its `migration.sql` creates the enum and the table and
    contains no `DROP INDEX`, no `DROP TABLE`, and no `ALTER TABLE "Order"` or `ALTER TABLE "Payment"`
    statement.

R4. The only change inside the `Order` and `Vendor` model blocks of `prisma/schema.prisma` is one
    added back-relation field each for `PaymentReconciliation`; the `Payment` model block is
    unchanged.

## Provider error classification

R5. `PaymentProviderError` in `lib/payments.ts` has a public `status` property of type
    `number | null`, and `retrieveSession` in `createStripePaymentService` throws a
    `PaymentProviderError` whose `status` equals the HTTP status of a non-2xx response.

R6. The `PaymentService` interface declaration in `lib/payments.ts` is unchanged by this slice.

## Repository layer

R7. A new file `lib/repositories/payment-reconciliations.ts` exports
    `claimPaymentReconciliation`, `recordPaymentReconciliationOutcome`,
    `listExhaustedPaymentReconciliations`, `rearmPaymentReconciliation` and
    `getPaymentReconciliationOutcome`. Each takes a Prisma client as its first parameter and a
    `vendorId` string as its second, and every `where` clause each one issues includes `vendorId`.

R8. `claimPaymentReconciliation(prisma, vendorId, orderId, claimedAt, leaseUntil)` first calls
    `createMany` with `skipDuplicates: true` for a row with `attemptCount` 1, `lastAttemptAt` =
    `claimedAt` and `nextAttemptAt` = `leaseUntil`, and returns `true` if that inserted one row.
    Otherwise it calls `updateMany` whose `where` requires `exhaustedAt` null and `nextAttemptAt` at
    or before `claimedAt`, setting `lastAttemptAt` = `claimedAt`, `nextAttemptAt` = `leaseUntil` and
    incrementing `attemptCount` by 1, and returns `true` exactly when that updated one row.

R9. `recordPaymentReconciliationOutcome(prisma, vendorId, orderId, claimedAt, outcome)` writes the
    outcome with an `updateMany` whose `where` includes `lastAttemptAt` equal to `claimedAt`, and
    returns `true` exactly when one row was updated.

R10. `listStalePendingOrders` in `lib/repositories/orders.ts` takes
     `(prisma, vendorId, olderThan, now, limit)`, returns only `PENDING_PAYMENT` orders created
     before `olderThan` that either have no `PaymentReconciliation` row or have one with
     `exhaustedAt` null and `nextAttemptAt` at or before `now`, ordered by `createdAt` ascending,
     at most `limit` rows, and each returned row carries the order's `id` and its
     `consecutiveFailures` (0 when no row exists).

R11. `rearmPaymentReconciliation(prisma, vendorId, orderNumber, now)` updates only a row whose
     `exhaustedAt` is not null, whose `lastOutcome` is `RETRYABLE_ERROR` or `PERMANENT_ERROR`, and
     whose order has status `PENDING_PAYMENT`; it sets `exhaustedAt` to null,
     `consecutiveFailures` to 0 and `nextAttemptAt` to `now`, and returns `true` exactly when one
     row was updated.

R12. `tests/repository-purity.test.ts`, `tests/repository-client-injection.test.ts` and
     `tests/repository-vendor-scoping.test.ts` pass, and the `ALLOWED` map in
     `tests/repository-vendor-scoping.test.ts` is unchanged by this slice.

R13. Every call to `claimPaymentReconciliation`, `recordPaymentReconciliationOutcome` and
     `rearmPaymentReconciliation` outside `tests/` receives a client obtained from `getPrismaWs()`,
     never from `getPrisma()`.

## The sweep

R14. `lib/payment-sweep.ts` still has no runtime import (every `import` in it is `import type`), and
     `tests/payment-sweep.test.ts` contains no `vi.mock` call.

R15. `lib/payment-sweep.ts` exports the defaults: lease 10 minutes, defer interval 30 minutes, retry
     base 15 minutes, maximum consecutive retryable failures 8 — alongside #618's unchanged
     30-minute candidate cutoff, 7-day long cutoff and batch cap of 50.

R16. For each candidate the sweep calls the claim operation before any provider call, passing a
     lease expiry of now plus the lease. When the claim returns `false`, the sweep makes no
     `retrieveSession`, confirm, fail or cancel call for that order and counts it as `skipped`.

R17. A paid session is confirmed with a binding taken from the retrieved session; when confirm
     returns `ok: true` the sweep sends the confirmation email exactly once and records `CONFIRMED`.

R18. When confirm or fail returns `ok: false` with reason `already-processed`, the sweep records
     `ALREADY_HANDLED`, sends no email, emits no `console.error`, and counts the order as `skipped`.

R19. When confirm or fail returns `ok: false` with any reason other than `already-processed`, the
     sweep records `REFUSED` with `exhaustedAt` set, emits one `console.error` containing
     `event=unrecoverable`, and counts the order as `exhausted`. A unit test running the sweep twice
     over the same order, with a fake store that honours exhaustion, sees exactly one confirm or
     fail call across both runs.

R20. An unpaid session with status `expired` is failed and, on `ok: true`, recorded `RELEASED`.

R21. An unpaid session with status `open` is recorded `DEFERRED` with `nextAttemptAt` equal to now
     plus the defer interval, and is never exhausted, whatever its `attemptCount`.

R22. An unpaid session with status `complete` is recorded `DEFERRED` (next attempt now plus the
     defer interval) while the order is newer than the long cutoff, and is failed once it is older.

R23. An order with no stored session makes no provider call. While newer than the long cutoff it is
     recorded `DEFERRED` with `nextAttemptAt` equal to its `createdAt` plus the long cutoff; once
     older it is cancelled through the no-binding path and recorded `RELEASED` when that returns
     `true`, or `ALREADY_HANDLED` when it returns `false`.

R24. When `retrieveSession` throws a value whose `status` property is the number `400` or `404`,
     the sweep records `PERMANENT_ERROR` with `lastErrorStatus` set to that status and
     `exhaustedAt` set, and counts the order as `exhausted`.

R25. When `retrieveSession` throws any other value (including one with `status` `401`, `403`, `429`
     or `503`, and one with no numeric `status`), the sweep treats it as the k-th consecutive
     failure, where k is the candidate's `consecutiveFailures` plus 1. For k from 1 to 7 it records
     `RETRYABLE_ERROR` with `consecutiveFailures` = k and `nextAttemptAt` = now + 15 minutes × 2 to
     the power (k − 1), counting the order `unresolved`; at k = 8 it records `RETRYABLE_ERROR` with
     `exhaustedAt` set, counting it `exhausted`.

R26. Every outcome other than `RETRYABLE_ERROR` records `consecutiveFailures` = 0.

R27. The sweep passes the claim instant to the record operation, and a record operation returning
     `false` causes no throw and no retry; the sweep continues with the next candidate.

R28. A unit test with a fake store models an interrupted attempt — a row claimed with no outcome
     recorded and `nextAttemptAt` in the future — and shows the order is not processed by a run
     before that time, is processed by a run after it, and that the interruption did not change
     `consecutiveFailures`.

R29. With two vendors each having 60 due candidates and a batch cap of 50, one run processes
     exactly 25 orders from each; with one vendor having 3 and another having 100, it processes all
     3 and 47 of the other.

R30. The total number of `retrieveSession` calls in one run never exceeds the batch cap.

R31. Running the sweep twice in succession over a store where the first run confirmed or released
     an order, with a fake store whose candidate list excludes non-`PENDING_PAYMENT` orders,
     performs no confirm, fail, cancel or email call for that order in the second run.

R32. The job route's success body is JSON with exactly the numeric keys `scanned`, `confirmed`,
     `released`, `deferred`, `unresolved`, `exhausted` and `skipped`, and `scanned` equals the sum
     of the other six.

## Observability

R33. Every `console.log` and `console.error` line the sweep emits starts with
     `payment-reconciliation event=`, and across the unit tests the events `run-started`,
     `selected`, `provider-state`, `transition`, `retry-scheduled`, `retry-exhausted`, `skipped` and
     `unrecoverable` each appear at least once.

R34. The sweep emits `console.error` only for a provider failure, an exhaustion and an unrecoverable
     refusal; a run whose candidates are all confirmed, released, deferred or already handled, and a
     run with no candidates, emit no `console.error`.

R35. No line the sweep logs contains the buyer email of a unit-test fixture order, or a marker
     string placed in a thrown provider error's `message`.

## Unchanged payment path

R36. `git diff` against the merge base with `origin/staging` shows no change to the bodies of
     `confirmPayment`, `failPayment`, `releaseOrder`, `classifyNoMatch` and `cancelUnpaidOrder` in
     `lib/repositories/orders.ts`, and no change to `app/api/webhooks/stripe/route.ts`,
     `lib/stripe-webhook.ts`, `lib/repositories/payment-binding-refusals.ts` or anything under
     `workers/scheduler/`.

## Staff surfaces

R37. `/staff/payments` renders a section headed `Orders the payment sweep stopped retrying` listing
     this vendor's `PaymentReconciliation` rows with `exhaustedAt` set, `lastOutcome`
     `RETRYABLE_ERROR` or `PERMANENT_ERROR`, and an order still `PENDING_PAYMENT`; each row shows
     the order number linked to `/staff/orders/<orderNumber>`, the outcome, the last HTTP status,
     the attempt count and the exhaustion time. With no such rows the section shows
     `No orders are waiting on a retry.`

R38. Each row in that section has a `Retry` button that submits a server action which re-checks
     `requireVendorRole("ADMIN")` itself and calls `rearmPaymentReconciliation`; the file holding
     that action begins with `"use server"` and exports only async functions.

R39. `/staff/orders/<orderNumber>` renders the text
     `Payment confirmed by the scheduled payment sweep, not by the payment webhook.` when that
     order's `PaymentReconciliation.lastOutcome` is `CONFIRMED`, and does not render it otherwise.

## Live system checks (under `npm run preview` against the local development database, Stripe test mode)

These run against the Neon branch that `.env` and `.dev.vars` point at, which is neither staging's
nor production's database (checked 2026-09-29 against `secrets/*.vars`), so the deployed staging
scheduler cannot touch the orders these checks create. The new migration is applied to that branch
before these checks run.

R40. **Lost webhook, paid.** An order paid at Stripe with no webhook forwarded, backdated past the
     candidate cutoff, becomes `CONFIRMED` on one job-route invocation; its `PaymentReconciliation`
     row has `lastOutcome` `CONFIRMED`; and `/staff/orders/<orderNumber>` shows R39's line.

R41. **Expired session.** An unpaid order whose session was expired at Stripe becomes `CANCELLED` on
     one invocation, every line's `Inventory.quantity` returns to its pre-order value, and a second
     invocation leaves the order's `OrderStatusEvent` count and every `Inventory.quantity`
     unchanged.

R42. **Still pending.** An order with an open session is recorded `DEFERRED` with `nextAttemptAt`
     about 30 minutes ahead, and an immediate second invocation does not select it (its
     `attemptCount` stays 1).

R43. **Permanent provider error.** An order whose stored `providerReference` is a session id Stripe
     does not know is recorded `PERMANENT_ERROR` with `lastErrorStatus` 404 and `exhaustedAt` set,
     appears in R37's section, and after its Retry button is pressed has `exhaustedAt` null and is
     selected by the next invocation.

R44. **Binding mismatch.** A paid order whose stored `Payment.amountPence` was altered to differ
     from the session's amount is recorded `REFUSED` with `exhaustedAt` set, and after two
     invocations exactly one `PaymentBindingRefusal` row exists for that order.

R45. **Overlap.** Two job-route invocations started concurrently over one due, expired-session order
     produce exactly one new `OrderStatusEvent` for it and restore its inventory exactly once, and
     the two response bodies' `released` counts sum to 1.

R46. **Webhook after sweep.** After R40's sweep confirmation, replaying that session's
     `checkout.session.completed` event to the local webhook returns 200 and adds no
     `OrderStatusEvent` for the order.

## Documentation and gates

R47. `specs/decisions/ADR-005-payments-money-flow.md` gains an additive section headed
     `Implementation note (P10, 2026-09-29, #945)` recording the reconciliation record, claiming
     and backoff, and that the sweep still acts only on the provider's own answer; it reopens no
     numbered decision, and its front-matter `version` and `updated` are bumped.

R48. The `Payment Issues` section of `docs/store-admin-guide/admin-tabs-guide.md` describes the
     stopped-retrying list and its Retry button.

R49. `npm run kms:validate` exits 0, and `npm run kms:assemble:internal` followed by
     `npx next build --webpack` in `kms/site-internal` exits 0.

R50. `CHANGELOG.md` updated (Gate 4).

R51. `npm run lint`, `npm run typecheck`, `npx vitest run` (run alone) and `npm run format:check`
     all exit 0 after this slice.
