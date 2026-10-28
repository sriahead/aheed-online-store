# Event-gated background jobs and on-demand payment checks (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice touches payments, so beyond unit tests it carries one real end-to-end payment run under
`npm run preview` (R25) and a local check that checkout and the sweep write the marker (rows R14 and
R15). **Never validate DB-touching rows with `npm run dev`**, which cannot load the WASM engine
(CLAUDE.md). Before any preview or Prisma step, check `DIRECT_URL` and `DATABASE_URL` **one at a
time** and print the host only (CLAUDE.md, "Config & secrets"). The database must be dev, never
production.

Deployed staging cannot be the evidence here. Deploys were blocked by the Cloudflare account move
(`#1323`) when this spec was written, and the env-level KV namespaces depend on the owner (R9). If
staging is deployable by Validate, the optional live rows at the bottom apply. Otherwise record
them as not run, with the reason.

**Local KV.** `npm run preview` simulates the top-level `JOB_SIGNALS` namespace under `.wrangler/state`.
Read it with `npx wrangler kv key get --binding JOB_SIGNALS "<key>" --local` from the repo root. If
the preview used a different persist path, pass the same `--persist-to`.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | Open `lib/job-signal-keys.ts`. Every `import` line, if any, is `import type`, and the six constants exist with exactly the stated values. Then `grep -rn '"payment-sweep:due-at"\|"error-events:last-at"' workers/scheduler/src` prints nothing, and `grep -n "job-signal-keys" workers/scheduler/src/*.ts` prints at least one import. |
| R2  | Unit | `workers/scheduler/src/select-jobs.ts` exists and exports `selectJobs` and the `SignalRead` type with the stated shapes. Reading the file shows no `fetch`, `env`, `console` or `await` in `selectJobs`. `workers/scheduler/src/index.ts` has exactly one `export default` and no other `export`. |
| R3  | Unit | `npx vitest run tests/scheduler.test.ts --maxWorkers=4` passes. The file has a case calling `selectJobs` with `cron: "0 3 * * *"` and both signals `{ ok: true, value: null }`, asserting the exact three-element array in order. |
| R4  | Unit | Same test file. It has one case per branch: `{ ok: false }` includes the sweep; `value: null` excludes it; an unparseable string includes it; a past ISO includes it; an ISO equal to `now` includes it; a future ISO excludes it. All pass. |
| R5  | Unit | Same test file. It has one case per branch: `{ ok: false }` includes the error path; `null` excludes it; an unparseable string includes it; `now - 19 min` includes it; exactly `now - 20 min` includes it; `now - 21 min` excludes it. All pass. |
| R6  | Unit | Same test file. A table case over every combination of the two signals with `cron: "*/15 * * * *"` asserts the reaper path never appears and the sweep path precedes the error path when both are present. |
| R7  | Unit | Same test file, driving the default export's `scheduled` handler with a stubbed `fetch`: (a) no `JOB_SIGNALS` in `env` means the sweep and error paths are both fetched; (b) a KV double whose first `get` throws still has its second `get` called; (c) exactly one `console.log` call matches `/^scheduler tick cron=\S+ ran=\S+ skipped=\S+$/`, including the literal `none` when a side is empty. |
| R8  | Unit | `grep -n "crons" workers/scheduler/wrangler.toml` prints three lines, each exactly `crons = ["*/15 * * * *", "0 3 * * *"]`. |
| R9  | Unit | Read both `wrangler.toml` files. Each has a top-level `[[kv_namespaces]]` with `binding = "JOB_SIGNALS"` and a comment saying it is local-simulation only. For `staging` and `production`, confirm case (a) or case (b) of R9 holds in **both** files and the files agree with each other. In case (a), the id must match one the owner stated in the PR or build notes. Record which case applied. Case (b) is a pass, and the open item in `plan.md` stands. |
| R10 | Unit | `grep -rln "JOB_SIGNALS" app lib features components` lists `lib/job-signals.ts` and `lib/job-signal-keys.ts` only, and `job-signal-keys.ts` only declares the constant. `npx vitest run tests/job-signals.test.ts --maxWorkers=4` passes, and it has cases where the binding is absent, where `getCloudflareContext` throws, and where `get`/`put`/`delete` throw. Each resolves, and the throwing-KV case logs a line containing `job-signal`. |
| R11 | Unit | `tests/job-signals.test.ts` has `markPaymentSweepDue` cases with stored absent, unparseable, later and earlier values. It writes in the first three and not in the last. Passes. |
| R12 | Unit | Same file. `setPaymentSweepDue(date)` overwrites an earlier stored value, and `setPaymentSweepDue(null)` calls `delete` on the key. Passes. |
| R13 | Unit | Same file. `markErrorEvent` with stored absent, unparseable, `now - 6 min` (writes), and `now - 4 min` (does not write). Passes. |
| R14 | Unit + Integration | Unit: a test of `createOrder` with `placeOrder` and the marker mocked asserts one `markPaymentSweepDue` call with an instant 40 min ahead (±5 s) on success, and none when `placeOrder` throws. `grep -rn "job-signals" lib/repositories` prints nothing. Integration: under `npm run preview`, place one order at checkout (dev DB), then the local KV read of `payment-sweep:due-at` prints an ISO instant about 40 min ahead. |
| R15 | Unit + Integration | Unit: tests of `findNextPaymentSweepDueAt` cover no pending orders (returns null), an order with no reconciliation row (`createdAt + cutoff`), one with a future `nextAttemptAt` (that value), an exhausted one (ignored), and the minimum across several. Integration: under `npm run preview`, with `JOB_INVOCATION_TOKEN` and a Stripe **test** key set in `.dev.vars` (the route refuses with 503 under the stub adapter), and using the preview's own port, `curl -s -X POST -H "x-job-token: $TOKEN" http://localhost:8787/api/jobs/reconcile-payments` returns JSON with a `nextDueAt` field. The local KV value equals it when non-null, and the key is absent (`Value not found`) when it is `null`. Use `MSYS_NO_PATHCONV=1` in Git Bash. |
| R16 | Unit | A test of `retryReconciliation` with `requireVendorRole` returning ok and `rearm` mocked asserts `markPaymentSweepDue` is called once, after `rearm`. Passes. |
| R17 | Unit | Tests assert `markErrorEvent` is called once per `onRequestError` invocation, both when the repository write resolves and when it rejects, and once per `recordHandledErrorEvent` call. Pass. |
| R18 | Unit | A test of the Stripe `createPayment` with a stubbed `fetch` asserts the form body's `expires_at` equals `Math.floor(expiresAt / 1000)`. Reading `lib/payments.ts` shows `CHECKOUT_SESSION_TTL_MS = 35 * 60 * 1000` and `expiresAt: Date` as a required field of `CreatePaymentInput`. Passes. |
| R19 | Unit | A `placeOrder` test (`tests/orders.test.ts` style, fake tx) captures the `createPayment` input and asserts `expiresAt` equals the created order's `createdAt + 35 min`. Passes. |
| R20 | Unit | Read the comment above `DEFAULT_LONG_CUTOFF_MS` in `lib/payment-sweep.ts`. It says the app sets a 35-minute `expires_at` and why 7 days remains, and the value is still `7 * 24 * 60 * 60 * 1000`. A reading check, not a grep. |
| R21 | Unit | `npx vitest run tests/payment-check.test.ts --maxWorkers=4` passes with one case per outcome. Each asserts which deps were called: no `retrieveSession` for `not-pending` and `no-session`; no `confirm` for `provider-error` and `not-paid`; `sendConfirmation` exactly once only for `confirmed`. One case asserts the binding passed to `confirm`. `lib/payment-check.ts` has only `import type` lines. |
| R22 | Unit | Read `lib/payment-check-service.ts` and confirm the wiring stated in R22. `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts --maxWorkers=4` passes, which covers the new repository function's `(prisma, vendorId, orderNumber)` signature. |
| R23 | Unit | Test of `checkMyPayment`: when `getByOrderNumber` returns null, it returns `{ confirmed: false }` and `getPaymentCheckService` is never called; a `confirmed` outcome gives `{ confirmed: true }`; every other outcome gives `{ confirmed: false }`; the returned object has only the `confirmed` key. The file starts with `"use server"` and exports only async functions. |
| R24 | Unit + E2E | Read the page. `PaymentStatusCheck` is rendered inside the `PENDING_PAYMENT` branch only, and the page body has no call to `checkMyPayment` or the check service. Read the component: one call inside a mount effect, and `router.refresh()` on `confirmed: true`. The E2E part is R25. |
| R25 | E2E | Precondition: `.dev.vars` has a Stripe **test** key (`sk_test_`), and no `stripe listen` is running, so no webhook reaches the app. `npm run preview`, add an item, check out, pay with card `4242 4242 4242 4242`. On the return page, the heading reads "Thanks — your order is confirmed" within 10 s without pressing refresh. Reload the page twice, then open the order's staff page as the store admin: the timeline shows exactly one transition into Confirmed. If no test key is available, record R25 as **not run, owner-gated**, not as a pass. |
| R26 | Unit | Test of `paymentControlsFor` over every `OrderStatus` value × roles `ADMIN`, `STAFF`. Asserts exactly the truth table in R26. Passes. |
| R27 | Unit | Read `features/orders/staff-payment-actions.ts`: `"use server"` first, only async exports, and `requireVendorRole("ADMIN")` is the first `await` in both. Tests with `requireVendorRole` returning not-ok assert neither the check service nor the order lookup is called. Passes. |
| R28 | Unit | Test of `checkPaymentNow` with the service mocked to each of the 7 outcomes asserts 7 distinct non-empty messages, and that the `not-paid` message contains both statuses. Passes. |
| R29 | Unit | Test of `resendConfirmationEmail`: for `PENDING_PAYMENT` and `CANCELLED`, `sendOrderConfirmationEmail` is not called; for each paid status it is called once, the log line matches, and the message does not contain "delivered". Passes. |
| R30 | E2E | Under `npm run preview`, signed in as the demo **store admin**, open a `PENDING_PAYMENT` order's staff page. "Check payment now" is present and "Resend confirmation email" is not. Press it and a message appears. Open a `CONFIRMED` order: only "Resend confirmation email" is present; press it and a message appears. Signed in as a demo **staff** (non-admin) account, both orders show neither control. curl with the session cookie is an acceptable substitute (CLAUDE.md: staff pages are drivable with curl). |
| R31 | Unit | Read `lib/guest-cart-reaper-service.ts`: `PER_VENDOR_LIMIT = 5000`, and the comment says the reaper runs daily. |
| R32 | Docs | Read the section. Each of the seven stated items is present. |
| R33 | Docs | Read the "Payment Issues" section, and for each sentence about the two controls, find the control in the order page source (R30). `npx vitest run tests/operator-doc-coverage.test.ts --maxWorkers=4` passes. |
| R34 | Docs | Read both persistent docs. Each states KV holds the job activity markers, the single access module, and fail-open. |
| R35 | Unit | `npx vitest run --maxWorkers=4` passes, and each listed requirement has its test as named in the rows above. |
| R36 | Gate 4 | `git diff origin/staging -- CHANGELOG.md` shows an entry naming `#1324`. |
| R37 | Gate 3 | Run each separately and read the real exit code, never through a pipe: `npm run lint`, `npm run typecheck`, `npx vitest run --maxWorkers=4` (alone, not beside a build), `npm run format:check`, `npm run build`, `npm run kms:validate`, `npm run kms:assemble:internal`, then `cd kms/site-internal && npx next build --webpack`. All exit 0. CI on the PR is the ground truth. |

## Optional live rows (only if staging is deployable and case (a) of R9 applied)

| Check | How to verify |
|---|---|
| Idle ticks skip | `npx wrangler tail aheed-scheduler-staging` across two ticks with no checkout: each logs `ran=none` unless a due marker or recent error exists. |
| Daily run | At 03:00 UTC, the tail shows `cron=0 3 * * *` with all three paths in `ran=`. |
| Neon idle | The staging project's Neon monitoring shows the compute suspended between ticks with no traffic. |
