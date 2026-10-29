# Event-gated background jobs and on-demand payment checks (build notes)

Written at the end of Build (2026-10-29), **before** the Clear. Spec commits `4dbaa8e` (spec) and
`06ad2f8` (R7 regex amendment); implementation `622688a`. Branch `feature/event-gated-jobs`, rebased
onto local `docs/carry-forward-1319` (`3dcc778`, the unpushed `#1319` handoff) so the PR carries it.

## What changed and why

**Scheduler (`workers/scheduler/`)**
- `src/select-jobs.ts` (new): the pure `selectJobs` table (R2–R6) and the three path constants plus
  `DAILY_CRON`. It is a separate module so `src/index.ts` keeps exactly one `export default`, because
  workerd treats extra named exports on a Worker entry as potential entrypoints.
- `src/index.ts`: reads both keys from `env.JOB_SIGNALS` (optional binding, each read in its own
  try), calls `selectJobs`, logs one `scheduler tick cron=… ran=… skipped=…` line, then invokes the
  selected paths with the unchanged `invoke` (same token header, same per-job error isolation).
- `wrangler.toml`: `crons = ["*/15 * * * *", "0 3 * * *"]` in all three trigger blocks; a top-level
  local-simulation KV block (`id = "local-job-signals"`); commented owner placeholders in both envs.

**Shared keys:** `lib/job-signal-keys.ts` has no imports at all, and the scheduler imports it by
relative path (`../../../lib/job-signal-keys`). A `wrangler deploy --dry-run --env staging` bundled
it: all three strings (`payment-sweep:due-at`, `error-events:last-at`, `0 3 * * *`) were present in
the output, 3.39 KiB.

**App-side KV:** `lib/job-signals.ts` resolves the binding through `getCloudflareContext()`. Absent
binding or no context: silent no-op. KV throws: one `console.error` containing `job-signal`. Every
export resolves, always.

**Writers**
- `lib/orders-service.ts` `createOrder`: after `placeOrder` resolves, marks now + 40 min.
- `lib/payment-sweep-service.ts` `run`: after `runPaymentSweep`, loops `listActiveVendorIds` →
  `findNextPaymentSweepDueAt`, writes the minimum (or deletes), and returns
  `{ ...summary, nextDueAt }`. The route returns that object unchanged, so `nextDueAt` is in the
  JSON (R15).
- `lib/repositories/orders.ts`: `findNextPaymentSweepDueAt` (two `findFirst … take 1` reads: the
  oldest never-swept pending order, and the earliest non-exhausted reconciliation on a pending
  order) and `findOrderPaymentState` (vendor-scoped status + stored `providerReference`).
- `features/payments/retry-reconciliation.ts`: marks now after `rearm`.
- `instrumentation.ts` `onRequestError`: `markErrorEvent` at the very end, after the write and
  fallback, unconditionally. `lib/error-events-service.ts` `recordHandledErrorEvent`: in `finally`,
  so a failed write is still marked and the failure still propagates (existing behaviour).

**Stripe TTL:** `CHECKOUT_SESSION_TTL_MS` and `CreatePaymentInput.expiresAt` live in
`lib/payments.ts`. `placeOrder`'s order-create `select` now includes `createdAt`, and so does the
local `order` type. `expiresAt = createdAt + 35 min`. The Stripe body sends `expires_at` in Unix
seconds; the stub ignores it.

**Single-order check:** `lib/payment-check.ts` is type-only imports, and its `deps` has no
release/fail/cancel member. `lib/payment-check-service.ts` has `check` (vendor-scoped load → pure
check, confirming via `getWebhookOrderService().confirm` so a binding refusal is persisted and shows
on `/staff/payments`) and `resendConfirmation` (paid statuses only; logs
`confirmation email resent by staff order=<n>`).

**Shopper:** `features/checkout/check-my-payment.ts` (`"use server"`) and
`components/checkout/PaymentStatusCheck.tsx` (one call in a mount effect, `router.refresh()` on
confirmed, renders nothing). The page renders it only inside the `PENDING_PAYMENT` branch.

**Staff:** `lib/order-status.ts` gains `PAID_STATUSES`, `isPaidStatus` and `paymentControlsFor`.
`features/orders/staff-payment-actions.ts` (`"use server"`) takes its state type from the new plain
module `lib/staff-payment-form.ts`. `components/staff/OrderPaymentControls.tsx` holds the two forms
using `useActionState`. `app/(admin)/staff/orders/[orderNumber]/page.tsx` renders them above the
timeline.

**Reaper:** `PER_VENDOR_LIMIT` 500 → 5000, with the comment updated.

**Docs:** `docs/developer-portal/env-setup.md` has a new "Gated ticks and the `JOB_SIGNALS` KV
namespace" subsection. `docs/store-admin-guide/admin-tabs-guide.md` has a new "Checking one order
from its own page" paragraph under Payment Issues. `specs/architecture.md` §3.4 and
`specs/tech-stack.md` each have a KV bullet. The `lib/payment-sweep.ts` comments on
`DEFAULT_LONG_CUTOFF_MS` and `DEFAULT_LEASE_MS` are corrected.

**Tests (new):** `tests/job-signals.test.ts`, `tests/job-signal-writers.test.ts`,
`tests/payment-check.test.ts`, `tests/payment-check-actions.test.ts`,
`tests/payment-check-service.test.ts`. **Extended:** `tests/scheduler.test.ts` (selectJobs table +
handler gating), `tests/orders.test.ts` (R19 expiresAt + `findNextPaymentSweepDueAt`),
`tests/payments.test.ts` (R18), `tests/instrumentation.test.ts` (R17), `tests/order-status.test.ts`
(R26).

**Local results at `622688a`:** lint 0, typecheck 0, format:check 0, `npx vitest run
--maxWorkers=4` 364 files / 5244 tests passed, `npm run build` 0. These are the building context's
own runs. CI is the ground truth.

## Decisions taken during the build

- **Original #618 scheduler tests now drive the DAILY cron.** They assert *how* a job is invoked
  (URL, method, token, error isolation), and only the daily run calls all three jobs. Driving them
  with `{}` (no cron) would have silently tested a fail-open tick that skips the reaper.
- **Platform admin counts as `ADMIN` for `paymentControlsFor`.** `requireVendorRole("ADMIN")` lets a
  platform admin through (`via: "platform-admin"`), so showing them the controls matches what the
  actions would allow. R26's table is about the string `"ADMIN"`; the page maps the role before
  calling it.
- **The page guards `order.status` with `isOrderStatus`** before `paymentControlsFor`, because
  `getForStaff` types status as `string`. An unknown status shows neither control.
- **`resendConfirmation` lives in the service, not the action.** The action layer may not reach
  `lib/db`, and the paid-status check needs a vendor-scoped read. R29's "calls
  `sendOrderConfirmationEmail` once and logs" is therefore tested on the service
  (`tests/payment-check-service.test.ts`), and the action test covers the messages.
- **Staff "confirmed" copy says "a confirmation email was sent to the customer"**, not "emailed",
  because `sendOrderConfirmationEmail` swallows failures.
- **`markErrorEvent` in `onRequestError` is awaited at the end, outside the try blocks.** It never
  rejects, so it cannot compound the original error, and placing it last guarantees it runs whichever
  write branch was taken.
- **The `orders.test.ts` mock of `@/lib/payments` now restates `CHECKOUT_SESSION_TTL_MS`**, because
  the mock replaces the whole module, and captures the last `createPayment` input. The fake
  `order.create` returns a fixed `createdAt`. Without it every `placeOrder` test failed with
  `PAYMENT_PROVIDER_FAILED`: `createdAt.getTime()` threw inside the post-commit try and was caught as
  a provider failure. Worth knowing: **a throw while building the payment input is reported as a
  payment-provider outage.**

## Deviations from the spec

- **R7's validation regex was amended at Build** (`06ad2f8`, committed separately before the
  implementation): `cron=\S+` → `cron=.+`, because `*/15 * * * *` contains spaces and the spec's own
  required line could never match `\S+`. The requirement text is unchanged.
- **R9 took case (b).** No namespace ids were supplied, so both env blocks in both files are
  commented placeholders. Tracked as owner-gated **#1325**.
- Otherwise none.

## Known-shaky areas

1. **The error marker in `onRequestError` (fail-closed risk).** If the deployed Worker gives
   `instrumentation.ts` no usable `getCloudflareContext()`, `markErrorEvent` silently no-ops, and the
   tick skips the error-rate check until 03:00. Unit tests cannot see this, and neither can preview
   without provoking a real server error. Live check: #1325 step 3.
2. **R25 needs a Stripe test key in `.dev.vars`** and no `stripe listen`. If it's unavailable,
   record R25 as not run (owner-gated), not passed. With the key, also watch that the return page
   doesn't loop: `PaymentStatusCheck` refreshes only on `confirmed: true`, and after refresh the
   order is no longer pending, so it unmounts.
3. **`wrangler.toml` top-level KV block.** `wrangler deploy --dry-run --env staging` prints a
   warning ("kv_namespaces exists at the top level, but not on env.staging"). That's expected
   (fail-open until #1325), not an error. Confirm the deploy workflows don't treat warnings as
   failures. The dry run exited normally.
4. **`npm run preview` local KV.** R14/R15's integration rows read the simulated namespace with
   `wrangler kv key get --binding JOB_SIGNALS … --local`. OpenNext's preview may persist state
   somewhere other than wrangler's default `.wrangler/state`. If the key reads `Value not found`
   right after a checkout, check the persist path before concluding the write failed.
5. **`findNextPaymentSweepDueAt` is unit-tested against a fake only.** The `where` shapes are
   asserted, but the relation filter `order: { status: "PENDING_PAYMENT" }` on
   `paymentReconciliation` has not been run against Postgres. R15's preview row (curl the sweep
   route, compare `nextDueAt` with KV) is the real check.
6. **Read-then-write races** in `markPaymentSweepDue` and the sweep's delete are accepted by design
   (plan.md). They are bounded by the next sweep run and the daily backstop. Not a validation
   failure.

## Follow-ups filed

- **#1325**: owner creates the KV namespaces, then verifies gating live (including the error marker).
  The constraint on #946's heartbeat is recorded there.
- **#1326**: attribution for return-page and staff confirmations (no `PaymentReconciliation`
  outcome).
- **#946** needs the heartbeat constraint noted on the issue itself. Posting a comment there was not
  done from this session; the constraint is written in #1325 and in `plan.md`.
