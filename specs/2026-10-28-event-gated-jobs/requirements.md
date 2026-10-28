# Event-gated background jobs and on-demand payment checks (requirements / acceptance criteria)

Closes the cost half of `#1324` and answers `#1289`'s item 3. Builds on the stranded-payment sweep
(`#618`, `p9-2-stranded-payment-sweep-plan`) and its reconciliation memory (`#945`). The scheduler
keeps its 15-minute clock but calls a job only when a Cloudflare KV activity marker says there is
work. A daily 03:00 UTC run calls everything ungated. Stripe sessions expire 35 minutes after the
order is created. The shopper's return page and two `ADMIN` controls can check one order's payment
on demand. Rationale, rejected alternatives and exclusions are in `plan.md`.

Terms used below:

- **paid statuses** means `CONFIRMED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `READY_FOR_COLLECTION`,
  `COLLECTED`.
- **the sweep path** is `/api/jobs/reconcile-payments`, **the reaper path** is
  `/api/jobs/reap-guest-carts`, and **the error path** is `/api/jobs/check-error-rate`.
- **the daily cron** is the string `0 3 * * *`, and **the tick cron** is `*/15 * * * *`.

## Shared keys

R1. `lib/job-signal-keys.ts` exists, contains no `import` statement other than `import type`, and
    exports exactly these constants with these values:
    `JOB_SIGNALS_BINDING = "JOB_SIGNALS"`, `PAYMENT_SWEEP_DUE_AT_KEY = "payment-sweep:due-at"`,
    `ERROR_EVENTS_LAST_AT_KEY = "error-events:last-at"`, `ERROR_SIGNAL_WINDOW_MS = 20 * 60 * 1000`,
    `ERROR_SIGNAL_THROTTLE_MS = 5 * 60 * 1000`, `CHECKOUT_SWEEP_DELAY_MS = 40 * 60 * 1000`.
    The scheduler's sources (`workers/scheduler/src/*.ts`) import the key names and window from
    this file and declare no string literal equal to either key.

## Scheduler decision (`workers/scheduler`)

R2. `workers/scheduler/src/select-jobs.ts` exports a pure function
    `selectJobs(input: { cron: string; now: Date; paymentDueAt: SignalRead; errorLastAt: SignalRead }): string[]`,
    where `SignalRead` is `{ ok: true; value: string | null } | { ok: false }`. It performs no I/O.
    It sits in its own module, not `index.ts`, so the Worker entry keeps its single default export.
R3. When `input.cron` is the daily cron, `selectJobs` returns exactly
    `[sweep path, reaper path, error path]` in that order, whatever the two signals hold.
R4. For any other `cron` value, the result contains the sweep path if and only if `paymentDueAt` is
    `{ ok: false }`, or its `value` is a non-null string that `Date.parse` cannot parse, or its
    `value` parses to an instant at or before `now`. A `{ ok: true, value: null }` read excludes it.
R5. For any other `cron` value, the result contains the error path if and only if `errorLastAt` is
    `{ ok: false }`, or its `value` is a non-null string `Date.parse` cannot parse, or its `value`
    parses to an instant at or after `now - ERROR_SIGNAL_WINDOW_MS`. A `{ ok: true, value: null }`
    read excludes it.
R6. For any `cron` value other than the daily cron, the result never contains the reaper path. When
    both of the other paths are present, the sweep path comes first.
R7. The exported `scheduled` handler reads both keys from `env.JOB_SIGNALS` when that binding is
    present. If the binding is absent, both reads are `{ ok: false }`. If a single `get` throws,
    that key's read is `{ ok: false }` and the other key is still read. The handler passes
    `controller.cron` and the current time to `selectJobs`, invokes the returned paths sequentially
    with the existing `x-job-token` POST and per-job error isolation, and logs exactly one line per
    invocation matching `scheduler tick cron=<cron> ran=<paths comma-joined, or none> skipped=<paths comma-joined, or none>`.
R8. `workers/scheduler/wrangler.toml` declares `crons = ["*/15 * * * *", "0 3 * * *"]` in its
    top-level `[triggers]`, `[env.staging.triggers]` and `[env.production.triggers]`.

## Bindings

R9. Both `wrangler.toml` (application Worker) and `workers/scheduler/wrangler.toml` carry a
    top-level `[[kv_namespaces]]` entry with `binding = "JOB_SIGNALS"` whose comment states it is a
    local-simulation id used only by `npm run preview` / `wrangler dev`. For `staging` and
    `production`, each file does exactly one of the following. (a) If the owner supplied that
    environment's namespace id before Build ended, it carries `[[env.<env>.kv_namespaces]]` with
    `binding = "JOB_SIGNALS"` and that id, and the same id in both files. (b) Otherwise it carries a
    comment block naming the binding, the `wrangler kv namespace create` command, and the rule that
    the same id goes into both files. It has no uncommented `[[env.<env>.kv_namespaces]]` entry.
    No id appears that the owner did not supply, except the top-level local-simulation one.

## Signal writers (application)

R10. `lib/job-signals.ts` is the only file under `app/`, `lib/`, `features/` and `components/` that
     reads the `JOB_SIGNALS` binding. It exports `markPaymentSweepDue(at: Date)`,
     `setPaymentSweepDue(at: Date | null)` and `markErrorEvent(now: Date)`, each returning
     `Promise<void>`. None of the three ever rejects: a missing binding, a missing request context, or
     a throwing KV call each resolves normally. A throwing KV call logs one `console.error` line that
     contains `job-signal`.
R11. `markPaymentSweepDue(at)` writes `at.toISOString()` to `PAYMENT_SWEEP_DUE_AT_KEY` if and only if
     the stored value is absent, unparseable, or a later instant than `at`. Otherwise it writes nothing.
R12. `setPaymentSweepDue(at)` writes `at.toISOString()` when `at` is a `Date`, and deletes
     `PAYMENT_SWEEP_DUE_AT_KEY` when `at` is `null`, regardless of the stored value.
R13. `markErrorEvent(now)` writes `now.toISOString()` to `ERROR_EVENTS_LAST_AT_KEY` if and only if
     the stored value is absent, unparseable, or earlier than `now - ERROR_SIGNAL_THROTTLE_MS`.
     Otherwise it writes nothing.
R14. `createOrder` in `lib/orders-service.ts` calls
     `markPaymentSweepDue(new Date(Date.now() + CHECKOUT_SWEEP_DELAY_MS))` after `placeOrder` returns
     successfully, and does not call it when `placeOrder` throws. No file under `lib/repositories/`
     imports `lib/job-signals.ts`.
R15. `getPaymentSweepService().run()` computes, after `runPaymentSweep` returns, the next due instant
     with a new vendor-scoped repository function `findNextPaymentSweepDueAt(prisma, vendorId, candidateCutoffMs)`,
     called once per active vendor. For one vendor, that function returns the minimum, over that
     vendor's `PENDING_PAYMENT` orders whose `PaymentReconciliation` is absent or not exhausted, of
     `nextAttemptAt` where a reconciliation row with a non-null `nextAttemptAt` exists, otherwise
     `createdAt + candidateCutoffMs`. It returns `null` when there is no such order. The service calls
     `setPaymentSweepDue` with the minimum across vendors, or `null`. `/api/jobs/reconcile-payments`
     returns the existing summary fields plus `nextDueAt` (ISO string or `null`).
R16. `retryReconciliation` (`features/payments/retry-reconciliation.ts`) calls
     `markPaymentSweepDue(new Date())` after `rearm` completes.
R17. `onRequestError` in `instrumentation.ts` and `recordHandledErrorEvent` in
     `lib/error-events-service.ts` each call `markErrorEvent(new Date())` once per invocation, after
     attempting the `ErrorEvent` write, whether or not that write succeeded.

## Stripe session lifetime

R18. `lib/payments.ts` exports `CHECKOUT_SESSION_TTL_MS = 35 * 60 * 1000`. `CreatePaymentInput` has a
     required `expiresAt: Date`. The Stripe implementation of `createPayment` sends
     `expires_at = Math.floor(input.expiresAt.getTime() / 1000)` in the session-creation body. The
     stub implementation ignores it.
R19. `placeOrder` passes
     `expiresAt = new Date(<the created order's createdAt>.getTime() + CHECKOUT_SESSION_TTL_MS)`, so
     two calls for the same order produce identical `expires_at` values.
R20. The doc comment above `DEFAULT_LONG_CUTOFF_MS` in `lib/payment-sweep.ts` states that the app sets
     a 35-minute `expires_at`, and explains that the 7-day value remains the backstop for the
     `complete`-but-unpaid and no-session cases. The constant's value is unchanged.

## Single-order payment check

R21. `lib/payment-check.ts` contains no `import` statement other than `import type`, and exports
     `checkOrderPayment(deps, order)`. Here `order` is `{ orderNumber; status; providerReference: string | null }`,
     and `deps` is exactly `{ retrieveSession; confirm; sendConfirmation; provider }`, with no
     release, fail or cancel member. It returns exactly one of these outcomes:
     - `{ kind: "not-pending" }` when `status` is not `PENDING_PAYMENT`. No provider call.
     - `{ kind: "no-session" }` when `providerReference` is `null`. No provider call.
     - `{ kind: "provider-error" }` when `retrieveSession` throws. No confirm.
     - `{ kind: "not-paid", sessionStatus, paymentStatus }` when the provider does not report
       `paid`. No confirm.
     - `{ kind: "confirmed" }` when `confirm` returns `ok`. `sendConfirmation` is called exactly once.
     - `{ kind: "refused", reason }` when `confirm` returns not-`ok`. No email.
     The binding passed to `confirm` is built from the provider's response (`session.id`,
     `amountTotal`, `currency`, `deps.provider`), as `lib/payment-sweep.ts` builds it.
R22. `lib/payment-check-service.ts` exports `getPaymentCheckService()`, whose `check(orderNumber)`
     resolves the current vendor and loads the order's `status` and stored `Payment.providerReference`
     through a repository function that takes `(prisma, vendorId, orderNumber)`. It returns
     `{ kind: "not-found" }` when that function returns nothing; otherwise it runs `checkOrderPayment`
     with `getPaymentService().retrieveSession`, `getWebhookOrderService().confirm`, a
     `sendConfirmation` that loads the order with `findOrder` and calls `sendOrderConfirmationEmail`,
     and `STRIPE_PAYMENT_PROVIDER`.

## Shopper return page

R23. `features/checkout/check-my-payment.ts` starts with `"use server"`, exports only async functions,
     and exports `checkMyPayment(orderNumber: string, token: string | null): Promise<{ confirmed: boolean }>`.
     It first calls `getOrderRepository().getByOrderNumber(orderNumber, viewerUserId, token)`,
     resolving `viewerUserId` as the return page does. When that returns nothing, it returns
     `{ confirmed: false }` without calling `getPaymentCheckService`. Otherwise it returns
     `{ confirmed: true }` exactly when the check's outcome is `confirmed`. It returns no provider
     detail to the browser.
R24. `app/(storefront)/checkout/[orderNumber]/page.tsx` renders a client component from
     `components/checkout/PaymentStatusCheck.tsx` only when `order.status` is `PENDING_PAYMENT`. That
     component calls `checkMyPayment` once per mount and calls `router.refresh()` when the result is
     `{ confirmed: true }`. The page's server render does not call `checkMyPayment`,
     `getPaymentCheckService` or the payment provider.
R25. Under `npm run preview`, with a Stripe **test** secret key and no webhook forwarding running, an
     order paid with a Stripe test card shows "Thanks — your order is confirmed" on its return page
     within 10 seconds of the redirect, without a manual refresh. The order's status timeline holds
     exactly one transition into `CONFIRMED`.

## Staff controls

R26. `lib/order-status.ts` exports a pure
     `paymentControlsFor(role: string, status: OrderStatus): { checkPayment: boolean; resendEmail: boolean }`.
     `checkPayment` is true exactly when `role === "ADMIN"` and `status === "PENDING_PAYMENT"`.
     `resendEmail` is true exactly when `role === "ADMIN"` and `status` is one of the paid statuses.
R27. `features/orders/staff-payment-actions.ts` starts with `"use server"`, exports only async
     functions, and exports `checkPaymentNow` and `resendConfirmationEmail`. Each one's first awaited
     call is `requireVendorRole("ADMIN")`, and each returns a refusal state without any other lookup
     when that call is not `ok`.
R28. `checkPaymentNow` reads `orderNumber` from its form data, runs `getPaymentCheckService().check`,
     and returns a distinct, non-empty message for each of the seven outcomes (`not-found` plus the
     six of R21). The `not-paid` message includes both `sessionStatus` and `paymentStatus`.
R29. `resendConfirmationEmail` loads the order vendor-scoped. When its status is not a paid status,
     it returns a message and sends nothing. Otherwise it calls `sendOrderConfirmationEmail` exactly
     once, logs one line containing `confirmation email resent by staff` and the order number, and
     returns a message saying the email was sent for delivery. The message does not claim the email
     was delivered.
R30. `/staff/orders/[orderNumber]` renders the "Check payment now" control exactly when
     `paymentControlsFor(...).checkPayment` is true, and the "Resend confirmation email" control
     exactly when `paymentControlsFor(...).resendEmail` is true. Each control shows its action's
     returned message after it runs. A `STAFF` session sees neither control.

## Reaper

R31. `PER_VENDOR_LIMIT` in `lib/guest-cart-reaper-service.ts` equals `5000`, and its doc comment says
     the reaper runs once a day.

## Documentation

R32. `docs/developer-portal/env-setup.md`'s "Scheduled jobs" section states: the two crons; which job
     each calls; the gating rule for each key; that every failure mode fails open; the
     `wrangler kv namespace create` command; that the same namespace id goes into both
     `wrangler.toml` files; and that the scheduler uses 4 of the Workers Free plan's 5 Cron Triggers.
R33. `docs/store-admin-guide/admin-tabs-guide.md`'s "Payment Issues" section describes "Check payment
     now" and "Resend confirmation email" on the order page, and that both are store-admin only.
     Each sentence describing them names a control that R30 renders.
R34. `specs/architecture.md` and `specs/tech-stack.md` each state that Cloudflare KV holds the job
     activity markers, reached only through `lib/job-signals.ts`, and that an absent or failing KV
     fails open to running the job.

## Gates

R35. Unit tests exist and pass for: R3–R6 (`selectJobs`, including every fail-open branch), R7 (absent
     binding, one throwing `get`, the log line), R11–R13 (with an in-memory KV double and a throwing
     one), R14, R16, R17 (that the call sites invoke the marker), R18–R19, R21 (all six outcomes, and
     that `sendConfirmation` is called only for `confirmed`), R23, R26, R27.
R36. `CHANGELOG.md` updated (Gate 4).
R37. `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4`, `npm run format:check`,
     `npm run build` and `npm run kms:validate` all exit 0. `npm run kms:assemble:internal` followed by
     a webpack Next build in `kms/site-internal` exits 0.
