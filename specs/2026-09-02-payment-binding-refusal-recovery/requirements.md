# Recovery path for an order stranded by a refused webhook binding (requirements / acceptance criteria)

Closes #454. `#429` made the Stripe webhook fail closed, correctly; when a binding is refused the
order stays `PENDING_PAYMENT` and the only trace is a `console.error` line that never reaches
`ErrorEvent` (the route returns 200 and nothing throws) and whose log retention is still `#246`.
This slice persists every loud refusal, surfaces the stranded orders on a vendor-scoped staff page,
and resolves one by asking Stripe about the order's own stored session — never by re-driving the
refused event. `confirmPayment`, `failPayment` and `classifyNoMatch` are not modified; see
`plan.md`'s "Deliberately excluded".

R1. `prisma/schema.prisma` defines a new `PaymentBindingRefusal` model with: `id` (uuid, `@id
    @default(uuid())`); `vendorId` (nullable `String`) with a nullable `vendor` relation to
    `Vendor`; `orderId` (nullable `String`) with a nullable `order` relation to `Order`;
    `orderNumber` (`String`, not null); `reason` (`String`); `provider` (`String`);
    `claimedProviderReference` (nullable `String`); `claimedAmountPence` (nullable `Int`);
    `claimedCurrency` (nullable `String`); `storedProviderReference` (nullable `String`);
    `storedAmountPence` (nullable `Int`); `storedCurrency` (nullable `String`); `resolution`
    (nullable `String`); `resolutionDetail` (nullable `String`); `resolvedAt` (nullable
    `DateTime`); `createdAt` (`DateTime @default(now())`); and indexes `@@index([vendorId,
    createdAt])` and `@@index([createdAt])`. The `Order` and `Vendor` models each gain the
    corresponding back-relation field.

R2. A migration for R1 exists under `prisma/migrations/` and `npx prisma migrate status` against
    the dev branch reports no pending migrations after it is applied.

R3. `lib/repositories/payment-binding-refusals.ts` exports `recordPaymentBindingRefusal(prisma,
    input)` taking a Prisma client as its first parameter, where `input` is `{ orderNumber, reason,
    provider, claimedProviderReference, claimedAmountPence, claimedCurrency }`. It resolves the
    order by `orderNumber` (un-scoped, matching `findOrderForWebhook`'s documented webhook
    exemption), and creates exactly one `PaymentBindingRefusal` row per call via a singular
    `create`. When an order is found, the row's `orderId`, `vendorId`, `storedProviderReference`,
    `storedAmountPence` and `storedCurrency` are populated from that order and its `Payment` row;
    when no order is found, all five are `null` and `orderNumber` still carries the claimed value.

R4. The file contains no call expression to `getPrisma(` or `getPrismaWs(`, and no value import of
    `next/headers`, `@/lib/tenant`, `@/lib/auth` or `@/lib/auth-rbac`, so
    `tests/repository-purity.test.ts` and `tests/repository-client-injection.test.ts` both pass
    unmodified against it.

R5. `recordPaymentBindingRefusal` has a `SWEEP_PROBABILITY` chance (a module constant of that exact
    name, matching `lib/repositories/order-lookup-rate-limit.ts`'s pattern) of also deleting every
    `PaymentBindingRefusal` row whose `createdAt` is older than a `RETENTION_MS` module constant,
    via `deleteMany`, on the same call.

R5a. Neither `lib/repositories/payment-binding-refusals.ts` nor its sibling service calls
     `updateMany` or `createMany` on any model. Both operations crash unconditionally through
     `getPrisma()`'s HTTP adapter with `Transactions are not supported in HTTP mode`, and the
     staff-facing read and resolution paths run on that client. Singular `create`, singular
     `update` and `deleteMany` are all confirmed safe on it and are what this slice uses.
     `tests/repository-transaction-safety.test.ts` exits 0 unmodified.

R6. `tests/repository-vendor-scoping.test.ts`'s allowlist gains an entry for
    `payment-binding-refusals.ts:recordPaymentBindingRefusal` with a written justification naming
    the webhook path as the reason no vendor id is available, and the whole test file still exits 0
    including its "keeps every allowlist entry justified and live" case.

R7. `lib/orders-service.ts`'s `getWebhookOrderService()` persists a refusal via
    `recordPaymentBindingRefusal` for exactly the reasons `unbindable`, `not-found` and
    `binding-mismatch`, and never for `already-processed`. The order number passed through is
    always non-empty: `app/api/webhooks/stripe/route.ts` already returns early on a falsy
    `event.orderNumber` before either transition is called, so no refusal row can be written with
    an empty `orderNumber`.

R8. `git diff origin/staging...HEAD -- lib/repositories/orders.ts` shows no change to the bodies of
    `confirmPayment`, `failPayment` or `classifyNoMatch`.

R9. `app/api/webhooks/stripe/route.ts` still returns HTTP 200 for every refusal reason, and
    `reportRefusal`'s existing `console.error` line still fires exactly once for `unbindable`,
    `not-found` and `binding-mismatch` and not at all for `already-processed`.

R10. A failure inside refusal persistence does not change the webhook's response: with the
     persistence call made to reject, the route still returns 200 and still emits its
     `console.error` refusal line.

R11. `lib/payments.ts` adds `retrieveSession(sessionId: string)` to the `PaymentService` interface,
     returning `{ id, paymentStatus, status, amountTotal, currency }` with nullable numeric and
     string fields. `createStripePaymentService` implements it with a raw `fetch` GET against
     Stripe's checkout-session retrieve endpoint using a Bearer secret key, importing no `stripe`
     npm package. A non-OK response throws `PaymentProviderError`.

R12. `createStubPaymentService` implements `retrieveSession` returning a result whose
     `paymentStatus` is not `"paid"`, so no stub-driven path can ever satisfy R14's recovery
     condition.

R13. `app/(admin)/staff/payments/page.tsx` calls `requireVendorRole("STAFF", "ADMIN")`, redirects
     to `/login` on `auth.status === 401`, and renders `<PanelRefusal>` on the 403 branch — never
     `return null`. It lists only `PaymentBindingRefusal` rows whose `vendorId` equals the current
     vendor, newest first, showing the reason, the order number, the claimed and stored session ids
     and amounts, and the recorded resolution.

R14. The page exposes a per-row reconciliation action that calls `retrieveSession` with the
     **stored** `Payment.providerReference` for that refusal's order (not
     `claimedProviderReference`), and writes Stripe's answer to that row's `resolution`,
     `resolutionDetail` and `resolvedAt`.

R15. The page exposes a separate per-row recovery action that calls the existing, unmodified
     `confirmPayment` with a `PaymentBinding` whose `providerReference`, `amountPence` and
     `currency` come from the `retrieveSession` response, and surfaces the returned
     `ConfirmPaymentResult` to the user. No code path in this slice writes `Order.status` other
     than through `confirmPayment`.

R16. Both actions in R14 and R15 re-check `requireVendorRole("STAFF", "ADMIN")` server-side and
     resolve the target refusal row scoped to the current vendor, so a forged row id belonging to
     another vendor performs no read of that row's data and no write.

R17. `app/(admin)/staff/page.tsx` renders a `Link` to `/staff/payments` in its tile grid.

R18. `specs/decisions/ADR-005-payments-money-flow.md` gains an amendment note recording that the
     `PaymentService` port now carries a read method, why recovery reuses `confirmPayment`'s
     binding rather than introducing a second path to `CONFIRMED`, and that refunds and the capture
     method remain undecided.

R19. `npm run kms:validate` exits 0 reporting `invalid front-matter (failing): 0`, and
     `npm run kms:check-generated` exits 0 reporting all generated artefacts current.

R20. `npm run kms:assemble:internal` followed by a webpack `next build` in `kms/site-internal`
     completes with exit status 0, proving no doc added by this slice breaks the internal docs
     site.

R21. `specs/roadmap.md` gains the carried-forward change-log row for **PR #555** flagged by
     `npm run sdd:audit` at this slice's `/orient`, and `npm run sdd:audit` reports no undocumented
     promotion afterwards.

R22. `CHANGELOG.md` updated (Gate 4).

R23. `lint`, `typecheck`, `test`, `format:check` all remain green after this slice.
