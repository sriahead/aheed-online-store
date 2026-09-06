# Stranded payment sweep — scheduled reconciliation of lost webhooks and abandoned checkouts (requirements / acceptance criteria)

Closes **#618**, absorbing **#101** and **#94**. Builds on **#429** (the payment binding this sweep
passes through unchanged) and **#454** (the staff recovery path whose provider-query pattern this
generalises into an unattended one). A scheduled Cloudflare Worker invokes an authenticated job
route on the existing OpenNext app; that route asks Stripe about each stale `PENDING_PAYMENT`
order's own stored session and confirms, releases, or leaves it alone. See `plan.md` for the
decision table and the reasoning behind the two cutoffs.

## The scheduler Worker

R1. `workers/scheduler/wrangler.toml` exists, sets `main` to the Worker's entry source, and
    declares a `[triggers] crons` array whose value schedules the sweep every 15 minutes.

R2. `workers/scheduler/wrangler.toml` declares a `[env.staging]` and a `[env.production]` section,
    each with its own Worker `name`.

R3. The scheduler's entry module exports a default object with a `scheduled` method.

R4. The scheduler's source tree (`workers/scheduler/`) contains no import of `@prisma/client`,
    `@prisma/client/wasm`, `@/lib/db`, or any path containing `lib/repositories`, and contains no
    occurrence of `DATABASE_URL`.

R5. The scheduler's job list is a literal array in its own source, not read from an environment
    variable, and every entry is a path string beginning with `/api/jobs/`.

R6. For each job path the scheduler issues an HTTP `POST` to that path against a base URL read from
    its environment, sending the shared secret in an `x-job-token` request header.

R7. A job invocation that returns a non-2xx status causes the scheduler to emit a `console.error`
    naming the job path and the status, and does not prevent the remaining jobs in the list from
    being invoked.

## The job route and its authentication

R8. `app/api/jobs/reconcile-payments/route.ts` exports a `POST` handler.

R9. That route returns `401` when the `x-job-token` header is absent, empty, or does not equal the
    configured token.

R10. That route returns `503` and performs no database read when the configured job token is unset
     in the app environment.

R11. The token comparison calls `timingSafeEqual` imported from `@/lib/stripe-webhook`; the slice
     adds no second constant-time comparison implementation.

R12. A `GET` request to that route returns `405`.

R13. `lib/config.ts` exports a zod-validated accessor for the job token that reads it through
     `readEnv`, and that fails validation when the token is absent and `NODE_ENV` is `production`.

## Repository layer

R14. `lib/repositories/orders.ts` exports `listStalePendingOrders`, which takes a Prisma client and
     a vendor id as explicit parameters, filters on `status: "PENDING_PAYMENT"` and on `createdAt`
     being older than a supplied instant, and returns at most a supplied maximum number of rows.

R15. `lib/repositories/vendor.ts` exports `listActiveVendorIds`, which takes a Prisma client as an
     explicit parameter and returns only vendors whose `status` is `ACTIVE`.

R16. Neither new repository function calls `getPrisma()` or `getPrismaWs()`, and neither imports
     `next/headers`, `@/lib/tenant`, `@/lib/auth` or `@/lib/auth-rbac` as a value.

R17. `tests/repository-vendor-scoping.test.ts` passes with **no new entry added to its `ALLOWED`
     map** — the map's contents are unchanged by this slice.

## The sweep decision table

R18. `lib/payment-sweep.ts` exports the sweep function, and that function receives its payment
     service, its order service, its current-time source, its two cutoffs and its batch cap as
     explicit parameters. The module contains no top-level call to `getPaymentService`, `getPrisma`
     or `getPrismaWs`. Its defaults are a **30-minute** candidate cutoff, a **7-day** long cutoff
     and a batch cap of **50** orders per run.

R19. When the retrieved session reports `paymentStatus === "paid"`, the sweep calls the order
     service's confirm operation with a binding whose `providerReference`, `amountPence` and
     `currency` are taken from the retrieved session and not from the order row.

R20. When the retrieved session reports a `paymentStatus` other than `"paid"` **and** a `status` of
     `"expired"`, the sweep calls the order service's fail operation.

R21. When the retrieved session reports a `paymentStatus` other than `"paid"` **and** a `status` of
     `"open"`, the sweep calls neither confirm nor fail for that order, and counts it as deferred,
     however old the order is.

R21a. When the retrieved session reports a `paymentStatus` other than `"paid"` **and** a `status` of
     `"complete"` — an asynchronous payment method whose outcome webhook never arrived — the sweep
     defers the order while it is newer than the long cutoff, and calls the order service's fail
     operation once it is older. It is never deferred indefinitely.

R22. When `retrieveSession` throws, the sweep calls neither confirm nor fail for that order, counts
     it as unresolved, and continues processing the remaining candidate orders.

R23. The job route returns `503` and performs no order transition when the active payment service is
     the stub adapter.

R24. An order whose stored `providerReference` is null is never passed to `retrieveSession`, and is
     released only when it is older than the long cutoff, via the no-binding cancellation path.

R25. The number of candidate orders processed in a single run is bounded by a batch cap, and the
     sweep stops issuing provider calls once that cap is reached.

R26. After a confirm operation that reports `ok: true`, the sweep sends the order confirmation
     email exactly once; after a confirm operation that does not report `ok: true`, it sends none.

R27. Running the sweep twice in succession over the same stranded order performs the state
     transition on the first run only; the second run reports the order as refused with reason
     `already-processed` and writes no second `OrderStatusEvent`.

## Not modifying the payment transition path

R28. `git diff` against the merge base shows **no change** to the bodies of `confirmPayment`,
     `failPayment`, `releaseOrder` or `classifyNoMatch` in `lib/repositories/orders.ts`.

R29. This slice adds no migration directory under `prisma/migrations/` and no change to
     `prisma/schema.prisma`.

## Observability

R30. A release performed by the sweep writes an `OrderStatusEvent` whose `note` identifies the
     sweep as the actor, distinguishing it from a webhook-driven release.

R31. A binding refusal encountered by the sweep persists a `PaymentBindingRefusal` row, so it
     appears on `/staff/payments`.

R32. The job route's success response body is JSON carrying counts for orders scanned, confirmed,
     released, deferred and unresolved.

R33. A `console.error` is emitted for a provider-unreachable order and for a binding-refused order,
     and no `console.error` is emitted for a routine release, a deferred order, or a run that finds
     no candidates.

## Deployment

R34. `.github/workflows/deploy-staging.yml` and `.github/workflows/deploy-production.yml` each
     deploy the scheduler Worker using its own wrangler config, in a step that runs after the
     existing application deploy step.

R35. `docs/` records the two new secrets the scheduler and the app each require, and which store
     each lives in.

## Documentation and gates

R36. `specs/decisions/ADR-005-payments-money-flow.md` gains an **additive implementation note** for
     this slice, recording that an order's payment state can now also be moved by an unattended
     scheduled sweep rather than only by the webhook, and that the sweep acts solely on the
     provider's own answer. It reopens no numbered decision, matching the shape of the existing
     `#429` and `#454` notes — the `#429` note's own text names `#101` as the owner of the
     never-arrives case, and this closes that reference.

R37. `specs/roadmap.md`'s P9.2 section lists `#472`, `#505`, `#541` and `#612`, correcting the drift
     found at this slice's `/orient`.

R38. `CHANGELOG.md` updated (Gate 4).

R39. `lint`, `typecheck`, `test` and `format:check` all remain green after this slice, and
     `CLAUDE.md`'s recorded vitest file and test totals are updated to this slice's own measured
     figures — this slice adds test files, so leaving the previous numbers in place would disable
     the shortfall detection that line exists to provide.
