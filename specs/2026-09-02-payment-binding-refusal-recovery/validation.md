# Recovery path for an order stranded by a refused webhook binding (validation)

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

## Before you start

This slice touches a live database and the Stripe webhook path. Do these four things first; several
rows below are meaningless without them.

1. **Confirm which database you are pointed at.** Print the `DATABASE_URL` and `DIRECT_URL` **host
   only** from both `.env` and `.dev.vars` (anchor the grep — `DATABASE_URL` ends in `BASE_URL`, and
   an unanchored filter prints the password). Diff both against `secrets/staging.vars` and
   `secrets/production.vars` and confirm they match **neither**. Every live row below must run
   against the **dev** Neon branch. A "staging-sounding" filename is not evidence; only the host is.
2. **Use `npm run preview`, never `npm run dev`.** Plain `next dev` cannot load
   `@prisma/client/wasm` and every DB-touching route silently renders an error state.
3. **Know the suite's totals.** `npx vitest run` on this tree currently reports **74 files / 874
   tests**. A run reporting fewer files is a non-result to re-run, not a pass, even at exit 0 — run
   it alone, never alongside a build.
4. **Do not pipe a live-writing script's stdout through `head`.** Redirect to a file and read it.
   A closed pipe can kill the writer before its own cleanup runs, leaving fixture rows behind.

**Fixture used by several rows below.** Place a real order through `npm run preview` so a genuine
`PENDING_PAYMENT` order with a real `Payment.providerReference` exists on the dev branch, and note
its `orderNumber`. Per `CLAUDE.md`, `.dev.vars` carries a real test-mode `STRIPE_SECRET_KEY`, so
checkout redirects to real hosted Stripe Checkout and the stub adapter is **not** active — do not
write a validation step that assumes it is. Leave the order unpaid.

**Forging a refusal.** `STRIPE_WEBHOOK_SECRET` is in `.dev.vars`, so a valid signature can be
computed locally. Write a scratch script **inside the repo** (module resolution and `tsx` error
reporting both fail with `npx tsx -e` on this Windows setup) that builds a
`checkout.session.completed` payload with `metadata.orderNumber` set to the fixture order,
`payment_status: "paid"`, the correct `amount_total` and `currency`, and a **bogus** session id;
signs it with that secret in Stripe's `t=...,v1=...` format; and POSTs it to
`http://127.0.0.1:8787/api/webhooks/stripe`. Delete the script before commit.

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Integration | `grep -n "model PaymentBindingRefusal" -A 24 prisma/schema.prisma` shows every field and both indexes named in the requirement, with `vendorId`, `orderId` and both relations nullable. `grep -n "paymentBindingRefusals" prisma/schema.prisma` shows the back-relation on both `Order` and `Vendor`. |
| R2  | Integration | `ls prisma/migrations/` shows a new folder for this slice. With `.env`/`.dev.vars` confirmed pointed at dev per "Before you start", `npx prisma migrate status` reports no pending migrations. Read the generated `migration.sql` in full before it is applied — a `migrate dev` run has previously emitted `DROP INDEX` for the hand-authored `pg_trgm` indexes in `20260820143949_p7_5de_order_search_trigram`; if any `DROP INDEX` appears for an object this slice did not create, the migration is wrong. |
| R3  | Unit | `npx vitest run tests/payment-binding-refusals.test.ts` exits 0, including: a case with a mock Prisma client whose `order.findUnique` resolves an order with a `payment` and asserting the single `paymentBindingRefusal.create` call's `data` carries that order's `orderId`, `vendorId`, `storedProviderReference`, `storedAmountPence` and `storedCurrency`; and a case whose `order.findUnique` resolves `null`, asserting those five fields are `null` while `data.orderNumber` equals the value passed in. Assert `create` was called exactly once in both. |
| R4  | Unit | `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` exits 0 with neither file modified — confirm with `git diff origin/staging...HEAD -- tests/repository-purity.test.ts tests/repository-client-injection.test.ts` printing nothing. |
| R5  | Unit | Same file as R3: with `Math.random` stubbed below `SWEEP_PROBABILITY`, `recordPaymentBindingRefusal` also calls the mock's `paymentBindingRefusal.deleteMany` with a `where.createdAt.lt` cutoff `RETENTION_MS` before now (compare within a tolerance); with `Math.random` stubbed above it, `deleteMany` is not called. `grep -n "SWEEP_PROBABILITY\|RETENTION_MS" lib/repositories/payment-binding-refusals.ts` shows both as module constants. |
| R5a | Unit | `npx vitest run tests/repository-transaction-safety.test.ts` exits 0 (run it **alone** — it genuinely times out under full-suite load on Windows, which is `#538`, not a failure of this slice). `grep -n "updateMany\|createMany" lib/repositories/payment-binding-refusals.ts lib/payment-binding-refusals-service.ts` prints nothing. |
| R6  | Unit | `npx vitest run tests/repository-vendor-scoping.test.ts` exits 0. `grep -n "payment-binding-refusals" tests/repository-vendor-scoping.test.ts` shows the allowlist entry and a justification string naming the webhook path. |
| R7  | Unit | `npx vitest run tests/orders-service-refusal.test.ts` (or the existing service test file) exits 0, with `recordPaymentBindingRefusal` mocked via `vi.mock`: four cases driving `confirm`/`fail` to return each of `unbindable`, `not-found`, `binding-mismatch` and `already-processed`, asserting the mock was called exactly once for the first three and `not.toHaveBeenCalled()` for `already-processed`. |
| R8  | Regression | `git diff origin/staging...HEAD -- lib/repositories/orders.ts` prints nothing, or prints only comment/doc lines — no change inside the bodies of `confirmPayment`, `failPayment` or `classifyNoMatch`. |
| R9  | E2E | Run the forged-refusal script from "Before you start" against `npm run preview`. Confirm the HTTP response status is **200**. Then query the local Worker's own log store — `POST http://127.0.0.1:8787/cdn-cgi/local/explorer/api/local/observability/query` with body `{"sql": "select ts_ms, level, message from logs where level = 'error' order by ts_ms desc limit 20"}` — and confirm exactly one `stripe webhook refused: reason=binding-mismatch` line naming the fixture order. Re-POST the identical forged payload a second time and confirm a second `binding-mismatch` line (the order is still `PENDING_PAYMENT`, so it is not `already-processed`). |
| R10 | Unit | Same test file as R7: a case where the mocked `recordPaymentBindingRefusal` rejects — the webhook service call still resolves (does not reject) and still returns its refusal result. Then in `npx vitest run tests/stripe-webhook.test.ts` or the route's own test, assert the route's returned `Response.status` is 200 on that path. |
| R11 | Unit | `npx vitest run tests/payments.test.ts` exits 0 with a new case: `createStripePaymentService("sk_test_x").retrieveSession("cs_test_1")` against a stubbed `global.fetch` asserts the request URL ends with `/v1/checkout/sessions/cs_test_1`, the method is `GET`, and the `Authorization` header is `Bearer sk_test_x`; a second case with a non-OK stubbed response asserts a `PaymentProviderError` is thrown. `grep -rn "from \"stripe\"\|require(\"stripe\")" lib/` prints nothing. |
| R12 | Unit | Same file: `createStubPaymentService().retrieveSession("anything")` resolves with `paymentStatus !== "paid"`. |
| R13 | E2E | Under `npm run preview`, signed out entirely, request `/staff/payments` and confirm a redirect to `/login`. Sign in as a **customer** demo account and load it again: confirm `<PanelRefusal>`'s markup renders (a "Staff only" heading, no row list). Sign in as `demo-store-admin@example.com` (`DEMO_ACCOUNT_PASSWORD` from `.dev.vars`) and confirm the row forged in R9 is listed with its reason, order number, claimed and stored session ids and amounts. `grep -n "return null" "app/(admin)/staff/payments/page.tsx"` prints nothing. |
| R13 (tenant) | Security | Repeat the signed-in load with `Host: srimart-staging.nocaped.com` (port-less — `getCurrentVendorIdOrNull()` strips ports, and a seeded host carrying one can never match) and confirm the Aheed-vendor refusal row from R9 is **absent**. |
| R14 | E2E | On `/staff/payments` as the store admin, trigger the reconciliation action for the R9 row. Confirm via a direct dev-database read (`npx tsx scripts/<scratch>.ts`, run as a real file, output redirected to a file and read) that the row's `resolution`, `resolutionDetail` and `resolvedAt` are now populated. Confirm the Stripe call targeted the **stored** session: the `storedProviderReference` value, not the bogus `claimedProviderReference` the forged event carried. Read `resolutionDetail` to confirm it reflects the real unpaid session Stripe returned. |
| R15 | E2E | With the fixture order still genuinely unpaid, trigger the recovery action and confirm the order is **not** confirmed — the page surfaces the refusal and the order remains `PENDING_PAYMENT` in the database. This is the security-critical direction: recovery must fail when Stripe says the session was not paid. Then `grep -rn "status: \"CONFIRMED\"\|status: 'CONFIRMED'" app features lib --include=*.ts --include=*.tsx` and confirm the only write is inside `lib/repositories/orders.ts`'s `confirmPayment`. |
| R15 (positive) | E2E | Place a second fixture order and **complete** the Stripe test-card payment, but with `stripe listen` **not** running, so no webhook ever arrives and the order stays `PENDING_PAYMENT` with a genuinely paid session. Forge a `binding-mismatch` against it as in R9 to create a refusal row, then run reconciliation and recovery: confirm the order moves to `CONFIRMED`, exactly one `OrderStatusEvent` is written, and the confirmation email path fires once. This is the only row that proves recovery actually recovers. |
| R16 | Security | Signed in as `demo-store-admin@example.com` (Aheed), submit both actions with a refusal row id belonging to SriMart (obtain one by forging a refusal against a SriMart order). Confirm neither action performs a write and the response is a refusal, not that row's data. Confirm by reading the SriMart row from the database that `resolution`/`resolvedAt` are unchanged. |
| R17 | Integration | `grep -n "/staff/payments" "app/(admin)/staff/page.tsx"` prints a `Link` `href`. Load `/staff/payments` by clicking that tile under `npm run preview`. |
| R18 | Integration | `git diff origin/staging...HEAD -- specs/decisions/ADR-005-payments-money-flow.md` prints a non-empty diff containing the port's read method, the reuse of `confirmPayment`'s binding, and an explicit statement that refunds and the capture method remain undecided. |
| R19 | Integration | `npm run kms:validate` exits 0 printing `invalid front-matter (failing): 0`. `npm run kms:check-generated` exits 0 printing all generated artefacts current — run `npm run kms:build-index` first if it does not, since it writes **two** files (`ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts`) that go stale under different conditions. |
| R20 | Integration | `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` — read the **real exit status**, not a piped one. Guards the MDX traps: a bare `<` before a digit, and a bare `{...}` outside backticks in any new spec or doc prose. |
| R21 | Regression | `git diff origin/staging...HEAD -- specs/roadmap.md` shows a new change-log row citing **PR #555** and its merge SHA `0cf2175`. `npm run sdd:audit` then reports no undocumented promotion. |
| R22 | Regression | `git diff origin/staging...HEAD -- CHANGELOG.md` prints a non-empty diff naming #454. |
| R23 | Regression | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` each exit 0, with `vitest` reporting at least the 74 files / 874 tests baseline plus this slice's additions. **CI on the PR is the authority** — a green local run on Windows is necessary, not sufficient. |

## Cleanup

Delete every scratch script written for the rows above, and remove the fixture orders and forged
`PaymentBindingRefusal` rows from the dev database. `git status` must be clean of them before
commit, and `git diff --numstat` on any scripted file rewrite must show a line count consistent
with the edit — a far larger count means an encoding or line-ending rewrite happened.
