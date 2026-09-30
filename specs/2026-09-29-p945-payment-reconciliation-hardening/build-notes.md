# #945 — Payment reconciliation hardening (build notes)

Written at the end of Build, **before** the Clear. Spec commit `19b9753`, build commit `e341ebf`,
branch `feature/945-payment-reconciliation-hardening` (cut from `origin/staging` at `0720593`).

## What changed and why

**The sweep got a memory; its decisions did not change.** #618's provider-facing rules (paid →
confirm, expired → release, open → leave, complete+unpaid → backstop) are unchanged. What is new is
that every candidate is claimed before the provider is asked, and what the attempt concluded is
recorded, so the next run knows whether the order is due, backed off, or given up on.

- **`prisma/schema.prisma` + `prisma/migrations/20260929190000_p945_payment_reconciliation/`.** New
  enum `PaymentReconciliationOutcome` (7 values) and table `PaymentReconciliation` (one row per
  swept order, unique `orderId`, cascade from `Order`, `vendorId` FK, index on
  `vendorId, exhaustedAt`). The `Order` back-relation is named **`reconciliation`**, not
  `paymentReconciliation`, purely so it fits the `Order` block's existing column alignment — a
  longer name makes `prisma format` realign the whole block, and R4 limits the `Order` change to one
  added line. `prisma format` was run and produced no change.
- **`lib/repositories/payment-reconciliations.ts`** (new). Claim (`createMany … skipDuplicates`,
  then a conditional `updateMany`), record (fenced on `lastAttemptAt`), list-exhausted, re-arm, and
  get-outcome. All take `(prisma, vendorId, …)`.
- **`lib/repositories/orders.ts` → `listStalePendingOrders`** gained a `now` parameter, a due-only
  `OR` filter on the `reconciliation` relation, and returns `orderId` + `consecutiveFailures`. No
  payment-transition function was touched (R36).
- **`lib/payment-sweep.ts`** rewritten around claim → ask → record, with fair round-robin selection
  (#619), error classification, backoff/exhaustion and structured logging. Still zero runtime
  imports: the `ReconciliationOutcome` types come in as `import type`.
- **`lib/payment-sweep-service.ts`** wires `claim`/`record` to the repository with the **WebSocket**
  client (`prismaWs`), which `createMany`/`updateMany` require.
- **`lib/payments.ts`** — `PaymentProviderError.status: number | null`; `retrieveSession` passes the
  HTTP status. The `PaymentService` interface is untouched.
- **`lib/payment-reconciliation-service.ts`** (new) — request-scoped staff facade: `listExhausted`
  and `outcomeFor` on the HTTP client, `rearm` on the WebSocket client.
- **`features/payments/retry-reconciliation.ts`** (new, `"use server"`, one async export) — the
  Retry action; re-checks `requireVendorRole("ADMIN")`.
- **`app/(admin)/staff/payments/page.tsx`** — second section "Orders the payment sweep stopped
  retrying" with Retry. **`app/(admin)/staff/orders/[orderNumber]/page.tsx`** — the #620 sentence
  under the timeline when the outcome is `CONFIRMED`.
- **Tests.** `tests/payment-sweep.test.ts` rewritten (the #618 cases are superseded by R15–R35 and
  renumbered to this slice's requirements; still no `vi.mock`). New
  `tests/payment-reconciliations.test.ts` (R8, R9, R11). `tests/orders.test.ts` R10 cases,
  `tests/payments.test.ts` R5 cases. Full suite, run alone: **194 files, 2567 tests, all passed**;
  every R-tagged case confirmed present with `--reporter=verbose`.
- **Docs.** ADR-005 implementation note (R47), store-admin guide Payment Issues section (R48),
  CHANGELOG (R50), `docs/model-handoff.md`.

## Decisions taken during the build

- **The sweep's fake store in the tests enforces the real rules** (claim only when due and
  unexhausted, record only on a matching fence, list only due pending orders, transition only out of
  `PENDING_PAYMENT`). That is what lets R19/R28/R31 assert multi-run behaviour. It is a hand-built
  double: the live rows are the proof.
- **One claim instant per run.** Every candidate in a run is claimed at the run's own `now`; that
  same value is the fence its outcome is written against. Two overlapping runs have different
  instants, and the second cannot claim a row the first pushed forward.
- **`CONFIRMED` is recorded before the email is sent**, so the #620 attribution survives a failure
  in the email step. The email is still sent only after a confirm that returned `ok: true`.
- **Deferral of a no-session order sets `nextAttemptAt` to `createdAt + 7 days` directly** rather
  than rechecking every 30 minutes: nothing can change for it before then (the spec's R23 says so;
  noted here because it is the one deferral that is not "now + 30 minutes").
- **Log fields.** Every line is `payment-reconciliation event=<name> key=value …`; a null value
  prints as `none`. A thrown error's `message` is never logged (it carries Stripe's raw body); only
  its numeric `status` is, as `httpStatus`. `selected` carries `priorFailures` for diagnosis.
- **Which events are `console.error`:** `retry-scheduled` when it is a `RETRYABLE_ERROR` (a
  provider failure), `retry-exhausted`, and `unrecoverable`. `retry-scheduled` for a `DEFERRED`
  order is `console.log`. So the same event name appears at two levels, distinguished by `outcome=`.
- **`PERMANENT_ERROR` label on `/staff/payments`** is "Payment provider rejected the lookup" (it
  covers 400 as well as 404, so "could not find the session" would have been wrong for a 400).
- **Migration SQL was generated offline** with `prisma migrate diff --from-schema-datamodel
  <origin/staging schema> --to-schema-datamodel prisma/schema.prisma --script`, because
  `prisma migrate dev --create-only` against the dev branch demanded a reset (checksum drift on
  `20260820200500_p8_image_needs_review` — the known `#895` state, procedure already in
  `specs/architecture.md` §3.1 step 3). The reset was **not** accepted. The SQL was read: one
  `CREATE TYPE`, one `CREATE TABLE`, two indexes, two FKs; no `DROP`, no `ALTER TABLE "Order"`.
  **It has not been applied to any database yet** — validation's P2 applies it to the dev branch.

## Deviations from the spec

None. Every requirement R1–R39 is implemented as written; R40–R46 are live checks for `/validate`;
R47–R50 are written in this stage.

## Known-shaky areas

- **Nothing has run against a real database.** The relation filter in `listStalePendingOrders`
  (`reconciliation: { is: null }` / `{ is: { exhaustedAt: null, nextAttemptAt: { lte: now } } }`),
  the `updateMany` with a relation filter in `rearmPaymentReconciliation`
  (`order: { orderNumber, status }`), and `createMany … skipDuplicates` are all shape-tested only.
  Prisma's generated types accept them (typecheck passes), but whether the WASM client engine over
  the Neon WebSocket adapter executes an `updateMany` with a relation filter as expected is exactly
  what R43 (Retry) proves live. Look there first if Retry silently does nothing.
- **`skipDuplicates` on Postgres is `ON CONFLICT DO NOTHING`.** R42/R45 are the first real
  exercise of the "second claim returns 0" path. If `createMany` throws a unique violation instead
  of returning count 0 on this adapter, every re-claim crashes the run — R42's immediate second
  invocation would show it.
- **The fence compares `lastAttemptAt` for equality.** Postgres stores `timestamp(3)` (millisecond
  precision) and JavaScript `Date` is millisecond precision, so equality should hold. If a record
  ever returns `false` in a live run with no overlap, the log line `event=skipped reason=superseded`
  appears and the row keeps `lastOutcome` null — check R40's row for a non-null `lastOutcome`.
- **R29/R30 fairness runs `listCandidates` once per vendor with `limit = batchCap`**, so reads scale
  with vendor count × 50. Fine at two vendors; noted in case it matters later.
- **A throw from anything other than `retrieveSession` still aborts the whole run** (confirm, fail,
  cancel, claim, record, email lookup). Pre-existing, out of scope, filed as **#949**. With the
  lease, a persistently-throwing order would come back first every tick.
- **An order exhausted with `PERMANENT_ERROR` keeps its stock reserved**; Retry only re-asks. A
  staff release is filed as **#948** (the plan's deliberate exclusion).
- **The job route file is unchanged**, so its docstring still describes the summary as "counts";
  it returns whatever `runPaymentSweep` returns, which now has seven keys (R32 checks this live).
- **Deployed scheduler proof is a Ship-time check**, not a requirement (see `plan.md`): after the
  staging deploy, `wrangler tail` should show `reconcile-payments ok:` with all seven keys. The
  staging and production `JOB_INVOCATION_TOKEN`s were set under **#947** on 2026-09-29; staging's
  first-ever tick (17:45 local) released 15 orders; production's first `ok` tick had not yet been
  observed when this was written.

## Fix stage (after the first `/validate`, 2026-09-29)

Two `validation.md` rows were wrong; the artifact was not. No code changed, so no CHANGELOG change.

- **P6 log query** matched nothing: the local log store records messages as a JSON array
  (`["payment-reconciliation event=…"]`), so a prefix `like` cannot match. Now `%payment-reconciliation
  event=%`, with a note that `console.log` lines are level `info`. This was the row being wrong.
- **R14's `grep "vi.mock"`** matched the test file's own header comment, which says `vi.mock` is
  absent. The requirement is about calls; the row now greps `vi\.mock(`. Also the row being wrong.

Live evidence gathered at that `/validate` (dev branch, migration applied, Stripe test key): the claim,
record and fence path works over the WebSocket client (every swept row had a non-null `lastOutcome`, so
the `lastAttemptAt` equality holds at ms precision); `createMany … skipDuplicates` returned count 0
rather than throwing; the response had exactly the seven keys; an invocation with no candidates
scanned 0 and logged no `error`. **Still unverified:** R37 live, R39–R46 — they need placed and paid
test orders, and the browser extension was not connected. The first live invocation also released or
deferred ~130 old `PENDING_PAYMENT` orders already on the dev branch.

### Live rows R40–R46 (second `/validate` pass, 2026-09-30, dev branch, Stripe test mode)

Migration applied to the dev branch (`ep-dry-morning…`, distinct from staging and production). All
of R40–R46 passed:

- **R40** paid, no webhook: the sweep logged `status=complete paymentStatus=paid`, confirmed it;
  order `CONFIRMED`, payment `SUCCEEDED`, row `CONFIRMED`, `/staff/orders/<n>` shows the R39 line.
- **R41** expired session: `CANCELLED`, stock +1, events 1→2; a second invocation scanned 0.
- **R42** open session: `DEFERRED`, `nextAttemptAt` exactly +30:00, `attemptCount` 1 after an
  immediate second invocation.
- **R43** unknown session: `PERMANENT_ERROR`, `lastErrorStatus` 404, `exhaustedAt` set, order stayed
  `PENDING_PAYMENT`; listed on `/staff/payments`; staff Retry cleared `exhaustedAt`; next run took
  `attemptCount` 1→2 and exhausted it again.
- **R44** amount mismatch: `REFUSED`, `exhaustedAt` set, still `PENDING_PAYMENT`, one
  `PaymentBindingRefusal` after two invocations, one `error` line `event=unrecoverable`.
- **R45** two concurrent invocations: one released (`released` 1 + 0), the other `skipped` 1; one new
  event, stock restored once, `attemptCount` 1.
- **R46** replay after sweep confirmation: 200, event count unchanged.
- **R32/R34** live: exactly the seven keys and `scanned` = sum; sweep log lines were `info`
  for release/defer/empty runs and `error` only for `retry-exhausted`/`unrecoverable`.
- **R39** both ways: sweep-confirmed order shows the sentence, a webhook-confirmed one does not.
- **R37** (this vendor): heading, order link, outcome, HTTP 404, attempts, stopped time, Retry.

**Deviations from `validation.md`.** (1) R46 replayed a *locally signed* `checkout.session.completed`
with `scripts/sign-stripe-event.ts` through the real route, not Stripe's `events resend` (no
`stripe` CLI reachable from the sandbox). (2) To keep R45's order from being swept during R44, its
`createdAt` was temporarily moved forward and restored. (3) Rows were made due by editing
`nextAttemptAt` directly where a prior invocation had parked them.

**Not verified.** R37's empty-state text (a row was present) and its second-vendor isolation
(`srimart.localhost:8787` needs that vendor's ADMIN login). Both are code paths that were read.

**Side effects on the dev branch.** The first invocation swept ~130 old `PENDING_PAYMENT` orders
already there (released or deferred). Six test orders were placed; `QSKNPV` (exhausted, still
listed on `/staff/payments`), `TKXYGN` (refused) and `PRQS86` (deferred) remain by design.

**Findings for later.** The checkout and category pages hydrate very slowly under `npm run preview`
(a background tab does not hydrate until it is painted), so browser-driven checkout is fragile.
The Chrome extension has no permission on `checkout.stripe.com`, so paying test sessions needs a
human.
