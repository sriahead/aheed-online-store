# Stranded payment sweep — scheduled reconciliation of lost webhooks and abandoned checkouts (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

Every feature should have appropriate **Unit** and **Integration** testing, followed by relevant validation testing. Broader testing mainly happens before release. However, testing is risk-based: features involving auth, payments, UI changes, performance-sensitive APIs, databases, or external dependencies require additional relevant testing earlier.

1. **Unit Testing**
   - *When needed:* Every feature.
   - *Purpose:* Test isolated business logic, utilities, and components.
2. **Integration Testing**
   - *When needed:* Every feature. (Includes Contract testing).
   - *Purpose:* Verify the component works with its immediate dependencies (e.g., database, external services).
3. **System / End-to-End Testing**
   - *When needed:* For critical user journeys and validation testing.
   - *Purpose:* Validate that the feature works correctly in the real system.
4. **Regression & Acceptance Testing**
   - *When needed:* Mainly before release, or when changing core flows. (Includes Smoke and Sanity testing).
   - *Purpose:* Ensure existing functionality remains unbroken and acceptance criteria are met.
5. **Performance & Resilience Testing**
   - *When needed:* Mainly before release, or for performance-sensitive APIs. (Includes Load, Stress, and Spike testing).
   - *Purpose:* Ensure the system meets throughput/latency targets and degrades gracefully.
6. **Security & Accessibility Testing**
   - *When needed:* Mainly before release, or earlier for features involving auth, payments, or UI changes.
   - *Purpose:* Ensure the system is safe and accessible to all users.

---

## Before starting: environment preconditions

These are preconditions, not requirements — get them right first or several rows below produce
confidently wrong results.

**P1. Confirm which database you are pointed at.** `CLAUDE.md` records a slice reaching the
*production* database because `.env` and `.dev.vars` agreed with each other on the wrong target.
Run `npm run configure-env dev` if the project provides it, then confirm the host in `.env` and
`.dev.vars` differs from the host in both `secrets/staging.vars` and `secrets/production.vars`:

```bash
grep -E '^DATABASE_URL|^DIRECT_URL' .env .dev.vars secrets/staging.vars secrets/production.vars | sed -E 's#://[^@]*@#://***@#'
```

The dev host must appear in `.env`/`.dev.vars` and in neither `secrets` file. Do not proceed
otherwise.

**P2. Confirm the Stripe adapter, not the stub, is active.** `grep -c '^STRIPE_SECRET_KEY=' .dev.vars`
must return `1` and the value must be a `sk_test_` key. Several rows below depend on real Stripe
answers.

**P3. Do NOT run `stripe listen` for any row in this file.** The entire slice exists for the case
where the webhook never arrives; a running listener would confirm or release orders behind the
sweep's back and invalidate every live row.

**P4. Run the unit suite alone.** `CLAUDE.md` records vitest silently skipping whole files under
concurrent load while still reporting a pass. Check the file/test totals against the number
recorded in `CLAUDE.md`, not just the exit code.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | `test -f workers/scheduler/wrangler.toml && grep -q 'crons' workers/scheduler/wrangler.toml && echo OK`. Then read the file and confirm `main` points at a file that exists and the `crons` value is a list of cron expressions, not a placeholder. |
| R2  | Unit | `grep -E '^\[env\.(staging\|production)\]' workers/scheduler/wrangler.toml` prints both sections; confirm by reading that each has its own `name = ` line and the two names differ. |
| R3  | Unit | `npx tsc --noEmit` exits 0, and reading the scheduler entry file shows `export default` with a `scheduled(` method. Type-checking is the real check here: a `scheduled` handler with a wrong signature fails compilation against `@cloudflare/workers-types`. |
| R4  | Security | `grep -rnE "@prisma/client\|@/lib/db\|lib/repositories\|DATABASE_URL" workers/scheduler/` prints **nothing**. An empty result is the pass; any hit fails, including one inside a comment, since the rule is that this directory has no database vocabulary at all. |
| R5  | Unit | Read the scheduler entry file. The job list must be an array literal of string paths each starting with `/api/jobs/`. Confirm no `env.` property read supplies it: `grep -n 'JOBS\|/api/jobs/' workers/scheduler/src/index.ts`. |
| R6  | Integration | Unit test in `tests/scheduler.test.ts`: call the exported `scheduled` handler with a fake `fetch` and a fake env, assert one call per job path, each with method `POST` and an `x-job-token` header equal to the env token, against the env base URL. |
| R7  | Integration | Same test file: make the fake `fetch` return `500` for the first of two job paths; assert `console.error` was called once mentioning that path and its status, and that the second path was still fetched. |
| R8  | Integration | With `npm run preview` running: `curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8787/api/jobs/reconcile-payments -H "x-job-token: $TOKEN"` returns a 2xx (with `$TOKEN` matching `.dev.vars`). |
| R9  | Security | Three calls against the same URL: no header, `-H 'x-job-token: '`, and `-H 'x-job-token: wrong'`. All three return `401`. Confirm from the preview log query (see R33) that no order was read on any of them. |
| R10 | Security | Comment out `JOB_INVOCATION_TOKEN` in `.dev.vars`, **restart `npm run preview`** (it is read at Worker boot), then `curl -X POST` with any header value returns `503`. Restore `.dev.vars` and restart afterwards. |
| R11 | Unit | `grep -n 'timingSafeEqual' app/api/jobs/reconcile-payments/route.ts` shows it imported from `@/lib/stripe-webhook`, and `grep -rn 'function timingSafeEqual' lib/ app/` returns exactly the one pre-existing definition in `lib/stripe-webhook.ts`. |
| R12 | Security | `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8787/api/jobs/reconcile-payments` returns `405`. |
| R13 | Unit | `npx vitest run tests/config-jobs.test.ts` exits 0 with 4 passing cases, including one asserting `getJobsEnv()` throws under `NODE_ENV=production` with the token absent and one asserting it does not throw otherwise. Confirm the accessor uses `readEnv`, not `process.env` directly: `grep -n 'readEnv("JOB_INVOCATION_TOKEN")' lib/config.ts`. |
| R14 | Unit | `npx vitest run tests/orders.test.ts` includes a case for `listStalePendingOrders` asserting the `where` carries `vendorId`, `status: "PENDING_PAYMENT"` and a `createdAt` upper bound, and that `take` equals the supplied maximum. |
| R15 | Unit | Same style in the vendor repository's test file: `listActiveVendorIds` issues a query whose `where` is `status: "ACTIVE"` and selects only ids. |
| R16 | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` — both exit 0. These are AST-based and unscoped (they walk every file in `lib/repositories/`), so the new functions are covered automatically. |
| R17 | Unit | `npx vitest run tests/repository-vendor-scoping.test.ts` exits 0, **and** `git diff origin/staging -- tests/repository-vendor-scoping.test.ts` shows no addition inside the `ALLOWED` map. Both halves are needed: the test passing does not prove the map was left alone. |
| R18 | Unit | Read `lib/payment-sweep.ts` and confirm the exported function's parameter list carries the payment service, order service, clock, both cutoffs and the batch cap, and that the documented defaults are 30 minutes, 7 days and 50. **The stronger evidence is that the R19–R25 unit tests run at all**: they execute with no database, no Stripe key and no Worker request context, which is impossible if the module resolves its own dependencies. Treat a passing `npx vitest run tests/payment-sweep.test.ts` as the real check and the read as confirmation. |
| R19 | Unit | `tests/payment-sweep.test.ts`: fake provider returns `paymentStatus: "paid"` with a distinctive `id`, `amountTotal` and `currency` **different from the order row's values**; assert confirm was called once with a binding carrying the *session's* values. Using different values is the point — identical ones would pass whichever source the code read. |
| R20 | Unit | Same file: fake provider returns `paymentStatus: "unpaid"`, `status: "expired"`; assert fail was called once and confirm never. |
| R21 | Unit | Same file: fake provider returns `paymentStatus: "unpaid"`, `status: "open"`; assert **neither** confirm nor fail was called, and the returned summary counts the order as deferred. Run the same case with the order backdated well beyond the long cutoff and assert it is *still* deferred — an open session is never released on age. |
| R21a | Unit | Same file, two cases with `paymentStatus: "unpaid"`, `status: "complete"`: an order newer than the long cutoff is deferred with no transition; the same order older than the long cutoff calls fail exactly once. The second case is the regression guard against deferring an async-payment failure forever. |
| R22 | Unit | Same file: fake provider's `retrieveSession` rejects for the first of three candidate orders; assert no transition for it, that it is counted unresolved, and that the other two orders were still processed. |
| R23 | Security | With `npm run preview` running, comment out `STRIPE_SECRET_KEY` in `.dev.vars`, restart preview, `curl -X POST` with a valid token returns `503`. Confirm via the log query that no order transition occurred. Restore and restart. |
| R24 | Unit | `tests/payment-sweep.test.ts`: an order with `providerReference: null` that is newer than the long cutoff produces no `retrieveSession` call and no transition; the same order older than the long cutoff produces a cancellation through the no-binding path and still no `retrieveSession` call. |
| R25 | Unit | Same file: supply more candidate orders than the batch cap; assert the number of `retrieveSession` calls equals the cap exactly. |
| R26 | Unit | Same file: confirm returning `ok: true` results in exactly one confirmation-email call; confirm returning `ok: false` results in zero. |
| R27 | E2E | Live, after R30's run: invoke the job route a **second** time with the same stranded order already resolved. The response summary must show it neither confirmed nor released again, and `SELECT count(*) FROM "OrderStatusEvent" WHERE "orderId" = '<id>'` must be unchanged from after the first run. |
| R28 | Regression | `git diff origin/staging -- lib/repositories/orders.ts` — inspect every hunk. The only additions may be `listStalePendingOrders` and any type it needs. If a hunk touches `confirmPayment`, `failPayment`, `releaseOrder` or `classifyNoMatch`, this row fails. |
| R29 | Regression | `git diff --stat origin/staging -- prisma/` prints nothing. |
| R30 | E2E | **The lost-webhook release case.** With `stripe listen` NOT running, place a real order through `npm run preview` and abandon it at Stripe. Expire its session for real: `curl -X POST https://api.stripe.com/v1/checkout/sessions/<session_id>/expire -u "$STRIPE_SECRET_KEY:"`. Backdate the order past the short cutoff with a scratch script under `scripts/` (run via `npx tsx scripts/<name>.ts`, never `npx tsx -e`, then delete it — and run `npx tsc --noEmit` once before the next preview build, since a repo-root scratch file breaks the whole build). Invoke the job route. Then confirm in the database: order `status = 'CANCELLED'`, every line's `Inventory.quantity` restored to its pre-order value, and the newest `OrderStatusEvent.note` for that order names the sweep. |
| R31 | E2E | Force a binding refusal: backdate a stranded order whose stored `Payment.amountPence` you have deliberately altered so the provider's answer cannot match, then invoke the route. Confirm a new `PaymentBindingRefusal` row exists for that order number and that it renders on `/staff/payments` when signed in as that vendor's admin. |
| R32 | Integration | The R30 invocation's response body parses as JSON and carries numeric `scanned`, `confirmed`, `released`, `deferred` and `unresolved` fields. `curl -s -X POST ... -H "x-job-token: $TOKEN" \| node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(Object.keys(d))"`. |
| R33 | Integration | Query the local Worker log store rather than reading the preview terminal: `curl -s -X POST 'http://127.0.0.1:8787/cdn-cgi/local/explorer/api/local/observability/query' -H 'content-type: application/json' -d '{"sql":"select ts_ms, level, message from logs where level = '"'"'error'"'"' order by ts_ms desc limit 50"}'`. After R31's run an error line naming the refusal must be present; after a run that only released an expired order (R30) and after a run finding no candidates, no error line may appear. |
| R34 | Integration | `grep -n 'workers/scheduler' .github/workflows/deploy-staging.yml .github/workflows/deploy-production.yml` shows a `wrangler deploy` step in each. Read both to confirm the step is ordered **after** the existing application deploy step, and that each passes the matching `--env`. |
| R35 | Unit | The two secrets are named in a committed doc under `docs/`, each stating its store (Cloudflare Worker runtime secret via `wrangler secret put`, on which of the two Workers). Verify by reading the file the slice adds or edits; a `grep` for the secret names must hit a real documentation sentence, not only a code sample. |
| R36 | Regression | `grep -n 'Implementation note (P9.2, 2026-09-06' specs/decisions/ADR-005-payments-money-flow.md` matches. Read the note and confirm it states that a scheduled sweep can now move payment state, that it acts only on the provider's answer, and that it reopens no numbered Decision. `npm run kms:validate` exits 0 afterwards. |
| R37 | Regression | `grep -n '#472\|#505\|#541\|#612' specs/roadmap.md` shows all four inside the `### P9.2` section (check the line numbers fall between that heading and `### P9.3`). |
| R38 | Regression | `git diff origin/staging -- CHANGELOG.md` is non-empty and describes this slice under `## [Unreleased]`. |
| R39 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` each exit 0, and `npx vitest run` — **run alone**, per precondition P4 — exits 0. Compare the reported file/test totals against `CLAUDE.md`'s recorded figures: they must be *higher* (this slice adds test files), and `CLAUDE.md` must have been updated to the new measured numbers. A total at or below the old figure means files silently failed to run. |

## Additional pre-merge check

`docs/` and `specs/` changes are assembled into MDX by a pipeline the `gates` workflow does not
run, and a bare `<` before a digit or a bare `{...}` outside backticks breaks it after merge. Run:

```bash
npm run kms:validate
npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)
```

Read the real exit status of the second command — do not pipe it through `tail` or `head`, which
reports the pipe's success rather than the build's.
