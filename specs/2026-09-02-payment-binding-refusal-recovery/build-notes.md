# Recovery path for an order stranded by a refused webhook binding (build notes)

Closes #454. Built on `feature/payment-binding-refusal-recovery`; spec commit `5563415`,
implementation commit `9db2b5c`.

## What changed and why

**`prisma/schema.prisma` — new `PaymentBindingRefusal` model.** One row per LOUD refusal, carrying
both what the event *claimed* and what the order actually *stored*. Keeping both is the point: a
reader can see the mismatch after the fact without re-deriving it from a log line that no longer
exists. `vendorId` and `orderId` are nullable by necessity rather than looseness — `not-found` names
an order that does not exist, and `unbindable` refuses before the lookup ever happens, so neither
case can carry either. `orderNumber` is always present, because
`app/api/webhooks/stripe/route.ts` returns early on a falsy `event.orderNumber` before any
transition is attempted.

**`lib/repositories/orders.ts` is byte-identical.** This was the single most important constraint of
the build. `confirmPayment`, `failPayment` and `classifyNoMatch` are what #429 installed and they
carry the security property; a refusal is an event *about* them, not part of them. Persistence
therefore sits in `lib/orders-service.ts`'s `getWebhookOrderService()` facade, which already holds
the `getPrismaWs()` client the webhook path uses. `git diff origin/staging...HEAD -- lib/repositories/orders.ts`
is empty, which is R8.

**`lib/repositories/payment-binding-refusals.ts` + `lib/payment-binding-refusals-service.ts`.** The
repository/service split the repo-wide rule requires: every repository export takes its Prisma
client explicitly and reads no request context, so a plain `tsx` script can drive it against a real
database. The recording function is un-scoped (a webhook has no host, so no vendor) and needed a
justified entry in `tests/repository-vendor-scoping.test.ts`'s allowlist; the three staff-facing
functions are all vendor-scoped and needed no exemption.

**`lib/payments.ts` — `retrieveSession()`, the port's first read method.** Raw `fetch`, no `stripe`
SDK, matching the existing adapter's Worker-bundle-size reason. The stub implementation never
reports a session as `"paid"`, for the same reason `createPayment` has no `SUCCEEDED` path.

**`app/(admin)/staff/payments/page.tsx` + `features/payments/reconcile-refusal.ts` + a tile on the
staff dashboard.** Vendor-scoped (`STAFF`/`ADMIN`) with a real `<PanelRefusal>` branch, not
platform-admin-only like `/staff/errors` — these are the store's own orders and nothing here renders
a stack trace or any cross-tenant internal.

**The security argument, stated once because it is the whole feature:** recovery builds a
`PaymentBinding` from the *provider's own response* and hands it to the **unchanged**
`confirmPayment`. It must satisfy the same compare-and-set predicate #429 installed, evaluated by
Postgres in the statement that performs the transition. So there is no second path to `CONFIRMED`,
and a refusal that was correct cannot be confirmed away by a staff click.

**`specs/decisions/ADR-005-payments-money-flow.md` → 1.7.0.** Records the port's read method, why
recovery reuses the existing binding rather than adding a status-forcing action, and that refunds
and the capture method remain undecided.

## The migration nearly repeated #508 — read this before the next schema change

`prisma migrate dev` generated `DROP INDEX` for **all three** hand-authored `pg_trgm` indexes from
`20260820143949_p7_5de_order_search_trigram`, triggered by adding a model with **no relationship
whatsoever** to `Order` or `User`. This is exactly the #508 drift, and it reproduced on the first
attempt.

It never reached the database, because R2 mandated `--create-only` and a read of the generated SQL
before applying. The drops were removed by hand, a comment in `migration.sql` records why they will
keep reappearing, and after applying I confirmed against the dev branch with a live query that
`Order_guestEmail_trgm_idx`, `Order_orderNumber_trgm_idx` and `User_email_trgm_idx` are all still
present.

**The transferable point: `--create-only` plus reading the SQL is not a precaution for
index-adjacent changes, it is the default for every schema change in this repo.** The trigger here
was an unrelated new table.

## Decisions taken during the build

- **Refusal persistence lives in the service facade, not in the repository functions.** The
  alternative was extending `ConfirmPaymentResult`/`FailPaymentResult` to carry order context on the
  refusal branch. Rejected: it edits two security-critical functions to serve a forensic feature,
  and R8 is worth more than saving one query.
- **`recordPaymentBindingRefusal` resolves the order itself.** It takes only what the event claimed
  and does its own un-scoped `order.findUnique` to snapshot `orderId`/`vendorId`/stored payment.
  This is why it needed the vendor-scoping allowlist entry — the honest cost of keeping
  `confirmPayment` untouched.
- **Persistence never rethrows.** A refusal is already the failure path. Letting a forensic write
  fail the webhook would turn a recorded anomaly into an unrecorded one *and* make Stripe retry an
  event that can never succeed. The write failure is logged instead, and there is a test for it.
- **`storedCurrency` comes off the `Order`, not the `Payment`.** `Payment` has no currency column,
  and `confirmPayment`'s binding compares `Order.currency`. Snapshotting anything else would record
  a value the binding never actually used.
- **Vendor scoping is in the `update`'s own `where`, not a check-then-act.**
  `update({ where: { id, vendorId } })` — Prisma permits the extra non-unique filter alongside the
  unique `id`, so a cross-tenant write matches zero rows and throws `P2025` rather than succeeding.
  No window between proving ownership and writing.
- **Resolution outcomes are written to the row rather than returned through `useActionState`.**
  Keeps both actions plain progressive-enhancement forms with no client component, and the audit
  trail is the same artifact as the UI feedback. `provider-unreachable` is deliberately a distinct
  resolution from `provider-unpaid`: "we asked and could not find out" must not read as "we asked
  and it was unpaid", because only the second would justify writing an order off.
- **Recovery emails the shopper on success**, mirroring the webhook route's ordering exactly — after
  the transition commits, so a second click refuses with `already-processed` and cannot email twice.
- **`getOrderRecoveryService()` is separate from `getWebhookOrderService()`** and deliberately does
  **not** persist a refusal on failure. A staff recovery attempt that fails because the session
  really was unpaid is the control working, not a new anomaly; recording one per click would bury
  the real rows.
- **90-day retention** for the sweep, versus 1 hour for the rate limiter it copies. These rows exist
  to be investigated, the expected rate is zero, and volume is not a concern.

## Deviations from the spec

**R21 and R22 are intentionally not in the implementation commit** — they are this stage's work and
land in the build-notes commit: R21 is the roadmap carry-forward row for PR #555, R22 is the Gate 4
CHANGELOG entry. Everything else in `requirements.md` (R1–R20, R23) was built as written.

No requirement was reinterpreted, narrowed or widened. Nothing outside `requirements.md` was added.

## Known-shaky areas

Point validation here first.

1. **Nothing in this slice has been exercised against a real Stripe session.** Every
   `retrieveSession` test stubs `global.fetch`. The real response shape, and in particular whether
   `payment_status` is exactly the string `"paid"` for a completed test-mode Checkout session, is
   assumed from Stripe's documented contract and **not** confirmed live. If one row fails, expect it
   to be this. `.dev.vars` carries a real test-mode `STRIPE_SECRET_KEY`, so the stub adapter is
   **not** active under `npm run preview` — a validation step that assumes it is will be testing a
   path this environment never takes.
2. **`R15 (positive)` is the only row that proves recovery actually recovers, and it is the hardest
   to set up.** It needs a genuinely paid session whose webhook never arrived — complete a test-card
   payment with `stripe listen` **not** running, then forge a `binding-mismatch` against that order.
   Nothing else in the suite covers the success path end to end.
3. **No refusal has ever been written by a real webhook request.** The unit tests mock the
   repository, so the actual `create` against Postgres — with the real nullable-column combinations
   — is unproven. The `not-found` path in particular writes a row with five nulls and has only been
   exercised against a fake.
4. **`update({ where: { id, vendorId } })` is asserted by a unit test reading the arguments, not by
   a real cross-tenant attempt.** R16's forged-id check against a genuine SriMart row is what would
   actually prove it, and it needs two vendors' rows in the dev database.
5. **The webhook route itself was not modified, so R9's "still returns 200" should hold
   structurally** — but the facade now `await`s a database write on the refusal path that was
   previously pure computation, which is a new failure mode on a route whose contract is that it
   always answers 200. The R10 test covers the rejection case; a slow write is untested.
6. **`resolutionDetail` is free text built from provider fields and is rendered into the page.** It
   contains no user-supplied input today (every component comes from Stripe's API or our own row),
   but it is the one string on the page not drawn from a fixed vocabulary.
7. **The full test suite reported `68 files / 814 tests` at exit 0 on its first run**, with 8
   worker-startup errors — the documented Windows-under-load artefact. The real result is
   **76 files / 897 tests**. If validation sees a smaller count, re-run before concluding anything;
   CI on Linux is the authority.
