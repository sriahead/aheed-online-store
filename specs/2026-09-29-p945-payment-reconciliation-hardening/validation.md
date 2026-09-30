# #945 — Payment reconciliation hardening (validation)

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

## Preconditions (read before any row)

**P1. Unit-test naming.** Every unit case added for this slice has a title starting with its
requirement number and a colon (for example `it("R25: …")`), matching #618's convention. A row
reading "`-t R25` passes" means `npx vitest run tests/payment-sweep.test.ts -t "R25:"` exits 0 **and
reports at least one test run**; a row that spells out its own command (naming another file, or no
file) means exactly that command, with the same at-least-one-test rule — zero tests matched is a failure, not a pass. Run vitest **alone**,
never beside or straight after a build (`CLAUDE.md`).

**P2. The live rows (R40–R46) use the local development database** that `.env` and `.dev.vars` point
at. First confirm it is neither staging's nor production's: the host in `.dev.vars`'s `DIRECT_URL`
must not appear in `secrets/staging.vars` or `secrets/production.vars`. Apply the migration there
with `npx prisma migrate deploy` (it reads `DIRECT_URL` from `.env`), then `npm run db:generate`,
then `npm run preview`. **Never** point any row at the staging or production database.

**P3. Do NOT run `stripe listen` for R40–R45.** Those rows are the lost-webhook case; a forwarded
webhook would resolve the order and the sweep would never be exercised. R46 is the only row that
starts it.

**P4. Invoking the job.** `TOKEN` is the `JOB_INVOCATION_TOKEN` value in `.dev.vars`:
`curl -s -X POST http://127.0.0.1:8787/api/jobs/reconcile-payments -H "x-job-token: $TOKEN"`.

**P5. Backdating and database edits** use a scratch script under `scripts/`, run with
`npx tsx scripts/<name>.ts` (never `npx tsx -e`), deleted afterwards; run `npx tsc --noEmit` once
before the next preview build, because a stray scratch file breaks the build. Reads may use the same
kind of script or the Neon SQL editor on the development branch.

**P6. Logs.** Query the local Worker log store rather than reading the terminal:
`curl -s -X POST 'http://127.0.0.1:8787/cdn-cgi/local/explorer/api/local/observability/query' -H 'content-type: application/json' -d '{"sql":"select ts_ms, level, message from logs where message like '"'"'%payment-reconciliation event=%'"'"' order by ts_ms desc limit 100"}'`. The leading `%` is required: the
local store records each message as a JSON array (`["payment-reconciliation event=…"]`), so a
prefix-anchored `like 'payment-reconciliation%'` matches nothing (found at `/validate`, 2026-09-29).
`console.log` lines are stored at level `info`.

**P7. Placing a test order.** Check out through `npm run preview` in a browser as a signed-in demo
customer. To pay, use Stripe's test card `4242 4242 4242 4242`; to leave a session open, close the
Stripe tab without paying. The session id is the order's `Payment.providerReference`. Record every
line's `Inventory.quantity` **before** checkout when a row needs it restored.

---

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Regression | Read the `enum PaymentReconciliationOutcome` block in `prisma/schema.prisma`: exactly the seven named values, no others. |
| R2  | Regression | Read the `model PaymentReconciliation` block: exactly the listed fields with the stated types, defaults, `@unique` on `orderId` and `onDelete: Cascade` on the `Order` relation. `grep -n "Json" prisma/schema.prisma` shows no hit inside that block. |
| R3  | Regression | `git diff --name-only origin/staging...HEAD -- prisma/migrations/` lists exactly one new `migration.sql`, in a directory ending `_p945_payment_reconciliation`. `grep -n -E 'DROP INDEX\|DROP TABLE\|ALTER TABLE "Order"\|ALTER TABLE "Payment"' <that file>` prints nothing. Read the file: it has a `CREATE TYPE` for the enum and a `CREATE TABLE "PaymentReconciliation"`. |
| R4  | Regression | `git diff origin/staging...HEAD -- prisma/schema.prisma`, read the hunks: inside `model Order` and `model Vendor` exactly one added line each (the back-relation), and no hunk inside `model Payment`. |
| R5  | Unit | A case in a test file under `tests/` stubs `fetch` to return a `404` response and asserts `createStripePaymentService("sk_test_x").retrieveSession("cs_x")` rejects with a `PaymentProviderError` whose `status` is `404`. `npx vitest run -t "R5:"` passes. Read `lib/payments.ts`: `status` is declared `number \| null`. |
| R6  | Regression | `git diff origin/staging...HEAD -- lib/payments.ts` shows no hunk inside `export interface PaymentService`. |
| R7  | Unit | Read `lib/repositories/payment-reconciliations.ts`: the five named exports exist, each with `(prisma, vendorId, …)` as its first two parameters, and every `where` literal in the file contains `vendorId`. R12's scoping test is the mechanical check. |
| R8  | Unit | `tests/payment-reconciliations.test.ts` with a recording fake client: (a) `createMany` reporting count 1 returns `true` and no `updateMany` is issued; (b) `createMany` count 0 then `updateMany` count 1 returns `true`, and the `updateMany` `where` has `vendorId`, `orderId`, `exhaustedAt: null` and `nextAttemptAt` bounded at or before `claimedAt`, and its `data` sets both timestamps and increments `attemptCount`; (c) count 0 then count 0 returns `false`. `npx vitest run tests/payment-reconciliations.test.ts -t "R8:"` passes. |
| R9  | Unit | Same file: the `updateMany` `where` includes `lastAttemptAt` equal to the passed `claimedAt`; count 1 returns `true`, count 0 returns `false`. `-t "R9:"` passes. |
| R10 | Unit | A case asserting the `findMany` arguments `listStalePendingOrders` issues: `status: "PENDING_PAYMENT"`, `createdAt` before `olderThan`, an `OR` of "no reconciliation row" and "row with `exhaustedAt` null and `nextAttemptAt` at or before `now`", `orderBy createdAt asc`, `take` = `limit`; and that a returned row without a reconciliation maps `consecutiveFailures` to 0. `npx vitest run -t "R10:"` passes. R42 is the live proof. |
| R11 | Unit | `tests/payment-reconciliations.test.ts`: the rearm `updateMany` `where` requires `vendorId`, `exhaustedAt` not null, `lastOutcome` in the two error outcomes and the order's `orderNumber` with `status: "PENDING_PAYMENT"`; its `data` sets `exhaustedAt: null`, `consecutiveFailures: 0`, `nextAttemptAt` = `now`. `-t "R11:"` passes. R43 is the live proof. |
| R12 | Regression | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts tests/repository-vendor-scoping.test.ts` exits 0, and `git diff origin/staging...HEAD -- tests/repository-vendor-scoping.test.ts` shows no change to the `ALLOWED` map. |
| R13 | Regression | `npx vitest run tests/repository-transaction-safety.test.ts` exits 0 (its pass 2 catches a literal `getPrisma()` handed to a function that issues `updateMany`/`createMany`). It cannot see a `getPrisma()` held in a variable, so also: `grep -rn -E "claimPaymentReconciliation\|recordPaymentReconciliationOutcome\|rearmPaymentReconciliation" lib app features --include=*.ts --include=*.tsx`, excluding the repository file's own definitions: at each call site, read which client is passed and confirm it came from `getPrismaWs()`. The live rows are the runtime proof — an HTTP client would crash every claim. |
| R14 | Regression | `grep -n "^import" lib/payment-sweep.ts`: every line is `import type`. `grep -n "vi\.mock(" tests/payment-sweep.test.ts` prints nothing (the file's header comment names `vi.mock` in prose to say it is absent, so a bare `vi.mock` match is expected and is not a call). |
| R15 | Unit | Read the exported defaults in `lib/payment-sweep.ts`: 10 min, 30 min, 15 min, 8, and #618's 30 min / 7 days / 50 unchanged. `-t "R15:"` asserts the values. |
| R16 | Unit | `-t "R16:"` passes: a fake claim returning `false` produces zero provider, confirm, fail, cancel calls for that order, `skipped` is 1, and the claim received a lease expiry of now + 10 min. |
| R17 | Unit | `-t "R17:"` passes: paid session, confirm `ok: true` gives one email call and a recorded `CONFIRMED`; the binding's values come from the session, not the order (use different values so the source is provable). |
| R18 | Unit | `-t "R18:"` passes for both confirm and fail returning `already-processed`: `ALREADY_HANDLED` recorded, zero email calls, zero `console.error`, `skipped` counted. |
| R19 | Unit | `-t "R19:"` passes: `binding-mismatch` records `REFUSED` with `exhaustedAt`, exactly one `console.error` containing `event=unrecoverable`; a second run against the same fake store makes no further confirm or fail call. R44 is the live proof. |
| R20 | Unit | `-t "R20:"` passes. R41 is the live proof. |
| R21 | Unit | `-t "R21:"` passes, including a candidate with `consecutiveFailures` 0 and a high attempt history still recorded `DEFERRED`, never exhausted, next attempt now + 30 min. |
| R22 | Unit | `-t "R22:"` passes for one order newer and one older than the long cutoff. |
| R23 | Unit | `-t "R23:"` passes: no provider call in either case; the young order's `nextAttemptAt` equals `createdAt` + 7 days; the old order with cancel `true` records `RELEASED` and with cancel `false` records `ALREADY_HANDLED`. |
| R24 | Unit | `-t "R24:"` passes for thrown values with `status` 400 and 404. R43 is the live proof. |
| R25 | Unit | `-t "R25:"` passes: for each k from 1 to 7, the recorded `nextAttemptAt` equals now + 15 min × 2^(k−1); k = 8 records `exhaustedAt`; thrown values with `status` 401, 403, 429, 503 and a plain `Error` with no status are all treated as retryable. |
| R26 | Unit | `-t "R26:"` passes: after a candidate with `consecutiveFailures` 3 receives a definitive answer, the recorded `consecutiveFailures` is 0. |
| R27 | Unit | `-t "R27:"` passes: the record operation receives the same instant the claim did; a record returning `false` does not throw and the next candidate is still processed. |
| R28 | Unit | `-t "R28:"` passes as described in the requirement. |
| R29 | Unit | `-t "R29:"` passes for both vendor distributions, counting processed orders per vendor. |
| R30 | Unit | `-t "R30:"` passes: 200 due candidates across vendors, `retrieveSession` called at most 50 times. |
| R31 | Unit | `-t "R31:"` passes. R41's second invocation is the live proof. |
| R32 | Integration | During R41: pipe the response through `node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); const k=Object.keys(d).sort(); console.log(k, d.scanned===d.confirmed+d.released+d.deferred+d.unresolved+d.exhausted+d.skipped)"`; the keys are exactly the seven named and the second value is `true`. |
| R33 | Unit | `-t "R33:"` passes: it spies on `console.log`/`console.error`, runs scenarios covering every event, and asserts every captured line starts with `payment-reconciliation event=` and each of the eight event names appears. |
| R34 | Unit + Integration | `-t "R34:"` passes. Live: after R41's release and after an invocation that finds no candidates, the P6 log query filtered to `level = 'error'` returns no new line. |
| R35 | Unit | `-t "R35:"` passes: the fixture order's buyer email and a marker string inside a thrown error's `message` appear in no captured line. |
| R36 | Regression | `git diff origin/staging...HEAD --stat -- app/api/webhooks/stripe/route.ts lib/stripe-webhook.ts lib/repositories/payment-binding-refusals.ts workers/scheduler/` prints nothing. `git diff origin/staging...HEAD -- lib/repositories/orders.ts`: read every hunk and confirm none falls inside `confirmPayment`, `failPayment`, `releaseOrder`, `classifyNoMatch` or `cancelUnpaidOrder`. |
| R37 | E2E | Under `npm run preview`, signed in as the vendor's ADMIN demo account: `/staff/payments` shows the heading, with `No orders are waiting on a retry.` before R43, and R43's order as a row after it, carrying the order-number link, outcome, `404`, attempt count and time. Then load the same page on the second seeded vendor's local host (`srimart.localhost:8787`, see `docs/developer-portal/local-dev-playbook.md`) signed in as that vendor's ADMIN: the order is absent. |
| R38 | Security + Regression | `head -1` of the action file is `"use server"`. `grep -n "^export" <file>`: every line begins `export async function` (no repo-wide guard test exists for this; the rule fails only at runtime, so this read is the check). Read the action: it calls `requireVendorRole("ADMIN")` before `rearmPaymentReconciliation`. R43 exercises the button live. |
| R39 | E2E | R40's order page shows the exact sentence. Any order confirmed through the webhook (R46's setup, or an existing `CONFIRMED` order with no reconciliation row) does not. |
| R40 | E2E | P3 and P7: place and pay an order with no webhook forwarded. Backdate its `createdAt` 40 minutes (P5). Invoke the job (P4): `confirmed` is 1. Read: `Order.status = 'CONFIRMED'`, `PaymentReconciliation.lastOutcome = 'CONFIRMED'`. Open `/staff/orders/<orderNumber>` and see R39's sentence. |
| R41 | E2E | P7: place an order, leave it unpaid, record inventory. Expire the session: `curl -X POST https://api.stripe.com/v1/checkout/sessions/<session_id>/expire -u "$STRIPE_SECRET_KEY:"`. Backdate 40 minutes, invoke: `released` 1; `Order.status = 'CANCELLED'`; inventory back to the recorded values. Count its `OrderStatusEvent` rows, invoke again, re-count: unchanged, inventory unchanged. |
| R42 | E2E | P7: place an order, leave the session open. Backdate 40 minutes, invoke: `deferred` is 1; the row has `lastOutcome = 'DEFERRED'`, `attemptCount = 1`, `nextAttemptAt` 29–31 minutes after `lastAttemptAt`. Invoke again at once: `attemptCount` still 1. |
| R43 | E2E | P7: place an order, then set its `Payment.providerReference` to `cs_test_doesnotexist945` and backdate 40 minutes (P5). Invoke: `exhausted` 1; the row has `PERMANENT_ERROR`, `lastErrorStatus = 404`, `exhaustedAt` set. R37's section lists it. Press **Retry**: `exhaustedAt` is null and `consecutiveFailures` 0. Invoke again: `attemptCount` rose by 1 and it is exhausted again. |
| R44 | E2E | P7: place and pay an order with no webhook. Set its `Payment.amountPence` to the real value + 1 and backdate 40 minutes (P5). Invoke twice. Read: `lastOutcome = 'REFUSED'`, `exhaustedAt` set, `Order.status` still `PENDING_PAYMENT`, and `select count(*) from "PaymentBindingRefusal" where "orderNumber" = '<n>'` returns 1. Restore the amount afterwards. |
| R45 | E2E | P7: set up an order as in R41 (expired session, backdated). Record its `OrderStatusEvent` count and inventory. Run both invocations at once in Git Bash: `curl … > a.json & curl … > b.json; wait`. Read: exactly one new `OrderStatusEvent`, inventory restored once, `released` in `a.json` plus `b.json` equals 1. |
| R46 | E2E | Start `stripe listen --forward-to localhost:8787/api/webhooks/stripe`. Find R40's event: `stripe events list --type checkout.session.completed --limit 10`, matching R40's session id. `stripe events resend <evt_id>`. The listen output shows `200`; R40's order's `OrderStatusEvent` count is unchanged. Stop `stripe listen` afterwards. |
| R47 | Regression | `grep -n "Implementation note (P10, 2026-09-29, #945)" specs/decisions/ADR-005-payments-money-flow.md` matches. Read it for the three stated points and no reopened decision. Front-matter `version` is above `1.8.0` and `updated` is `2026-09-29`. |
| R48 | Regression | Read the `## Payment Issues` section of `docs/store-admin-guide/admin-tabs-guide.md`: it describes the stopped-retrying list and Retry, and the described button label matches R37/R38's real control. |
| R49 | Regression | `npm run kms:validate` exits 0. Then `npm run kms:assemble:internal` and `npx next build --webpack` run in `kms/site-internal`; read the build's own exit status (not through a pipe). |
| R50 | Regression | `git diff origin/staging...HEAD -- CHANGELOG.md` shows an entry citing #945. |
| R51 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` exit 0; then, alone, `npx vitest run` exits 0 with every test file executed. CI on the PR is ground truth. |
