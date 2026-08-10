# P3c — Stripe payments, webhooks & confirmation email (requirements)

Make payment real (issue #99, epic #86; follows P3b #96). Hosted Stripe Checkout behind the existing
`PaymentService` port, a signature-verified idempotent webhook, stock release on failure/expiry, and
a confirmation email that only ever describes a payment that actually happened.

R1. `lib/config.ts` adds `STRIPE_SECRET_KEY: z.string().optional()` and
    `STRIPE_WEBHOOK_SECRET: z.string().optional()` to the schema, read via `readEnv` in `getEnv()`.
    Both unset is valid. **`STRIPE_PUBLISHABLE_KEY` is not added** — hosted Checkout is a
    server-created session plus a redirect, so no publishable key is ever used.

R2. `getPaymentService()` returns the **Stripe adapter when `STRIPE_SECRET_KEY` is set**, and
    P3b's **stub otherwise**, so an unconfigured environment (local dev, CI) keeps working rather
    than crashing — the same degradation `getEmailService()` uses. `npm run test` and `npm run build`
    pass with no Stripe variables present.

R3. The Stripe adapter calls Stripe's REST API with **raw `fetch`**; no `stripe` package appears in
    `package.json` and nothing imports one. It creates a Checkout Session in `mode: "payment"` with a
    single line item for the order total, taking the **currency from `CreatePaymentInput`** (which
    carries the order's own `currency`) rather than hardcoding one, and returns the session's `id` as
    `providerReference` and its `url` as `redirectUrl`.

R4. The Checkout Session carries `metadata.orderNumber` (the webhook's only lookup key) and
    `client_reference_id` set to the same value, so a Stripe dashboard row can be traced back to an
    order without a database query.

R5. `CreatePaymentInput` gains `returnOrigin: string`; the adapter builds
    `success_url = {returnOrigin}/checkout/{orderNumber}` and
    `cancel_url = {returnOrigin}/checkout`. `placeOrder` reads no request context to obtain it — the
    checkout action supplies it — preserving P3b's R9a (the transactional core stays testable from a
    script).

R6. **The Stripe call happens outside the database transaction.** `placeOrder`'s `$transaction`
    creates the `Payment` row with `providerReference: null` and performs no external I/O; the
    session is created after the transaction commits, and `providerReference` is then written by a
    separate update. `grep` shows no `createPayment` call inside the `$transaction` callback.

R7. If session creation fails after the order is committed, a **compensating transaction** sets the
    order to `CANCELLED`, writes an `OrderStatusEvent`, and **releases the stock** for every line, so
    a failed Stripe call never leaves an unpayable order holding inventory. The shopper receives an
    error, not a silent success.

R8. `lib/stripe-webhook.ts` exports a **pure** `verifyStripeSignature(rawBody, signatureHeader,
    secret, nowSeconds)` performing no I/O and no network access, which returns true only when the
    HMAC-SHA256 of `` `${timestamp}.${rawBody}` `` matches a `v1=` value in the header **and** the
    timestamp is within a 5-minute tolerance (replay rejection).

R9. Signature comparison is **timing-safe** (constant-time comparison, not `===` on the hex strings).

R10. `app/api/webhooks/stripe/route.ts` reads the **raw request body** (`await req.text()`) and
     verifies against it — never a re-serialised parsed object, which would change bytes and fail
     verification. It returns **400** on an invalid or missing signature and **200** on a verified
     event, including events it chooses to ignore (so Stripe stops retrying them).

R11. The webhook route does **not** call `getCurrentVendorId()` or otherwise resolve a tenant from
     the request host: it looks the order up by `metadata.orderNumber` and derives `vendorId` from
     the order row. `grep -n "getCurrentVendorId" app/api/webhooks/stripe/route.ts` returns nothing.

R11a. The webhook imports **no Prisma client**: the un-scoped order lookup and both transitions are
     exported from `lib/repositories/orders.ts` and called from the route, keeping the existing
     no-direct-Prisma ESLint guard green (`app/` may not import `@/lib/db`). The un-scoped lookup is
     confined to that one repository function and is documented there as the single justified
     exception, since a webhook has no tenant context to scope by.

R12. `checkout.session.completed` confirms the order **only when `payment_status === "paid"`**; a
     completed-but-unpaid session (asynchronous payment methods) leaves the order at
     `PENDING_PAYMENT`.

R13. `confirmPayment(orderNumber)` transitions the order `PENDING_PAYMENT → CONFIRMED`, sets
     `Payment.status = SUCCEEDED`, and writes an `OrderStatusEvent`, all in one transaction. It is
     **idempotent** via a conditional update (`where: { status: "PENDING_PAYMENT" }`): a second
     delivery of the same event changes nothing and creates no duplicate status event or email.

R14. `failPayment(orderNumber, reason)` transitions `PENDING_PAYMENT → CANCELLED`, sets
     `Payment.status = FAILED`, writes an `OrderStatusEvent`, and **increments each `OrderItem`'s
     quantity back onto `Inventory`** — closing the stock-release gap P3b recorded. Also idempotent
     via the same conditional-update guard, so stock can never be released twice.

R15. `checkout.session.expired` and `checkout.session.async_payment_failed` both route to
     `failPayment`. An event type the handler does not recognise is ignored with a 200.

R15a. A verified event whose `metadata.orderNumber` matches no order returns **200** (logged), not an
     error status — a 4xx/5xx would make Stripe retry that event for days against an order that will
     never exist.

R16. Stock arithmetic round-trips exactly: for a product at quantity `N`, placing an order for `q`
     then failing/expiring it returns `Inventory.quantity` to exactly `N` — verified against a real
     database, not a mock.

R17. The confirmation email is sent **only from the confirm path**, after a successful
     `PENDING_PAYMENT → CONFIRMED` transition — never at order creation, and never on the failure
     path. Because the transition is idempotent (R13), a duplicate webhook delivery sends no second
     email.

R18. The email is addressed to the order's buyer (`guestEmail`, or the member's account email), is
     sent through the existing `EmailService` port, and uses the **vendor's** `senderName` from
     `VendorConfig` — no hardcoded store name. It contains the order number, the line items with
     snapshotted prices, and the three money lines.

R19. A failure to send the email does **not** roll back or fail the confirmation: the order stays
     `CONFIRMED` and the error is logged, matching `lib/email.ts`'s existing non-fatal behaviour.
     Money being confirmed must not depend on an email provider being reachable.

R20. `app/(storefront)/checkout/[orderNumber]/page.tsx` renders by status: `PENDING_PAYMENT` shows a
     "confirming your payment" state, `CONFIRMED` shows today's confirmation, `CANCELLED` shows
     payment-failed messaging with a route back to the cart. No new route is added.

R21. The confirmation page never asserts that payment succeeded based on the redirect alone — it
     reads `order.status` from the database on every request, so arriving at `success_url` before the
     webhook lands shows the pending state rather than a false confirmation.

R22. `tests/stripe-webhook.test.ts` passes, covering as pure functions: a valid signature accepted; a
     tampered body rejected; a wrong secret rejected; a timestamp outside tolerance rejected; a
     malformed/missing header rejected. No Stripe credentials are needed to run it.

R23. `tests/payments.test.ts` passes, covering: `getPaymentService()` returns the stub when
     `STRIPE_SECRET_KEY` is unset and the Stripe adapter when set; the adapter builds the expected
     session payload (mode, currency, amount, metadata, success/cancel URLs) against a mocked
     `fetch`, with **no** real network call.

R24. **No vendor-specific values** in the payment or webhook layer: `grep` finds no hardcoded store
     name, currency other than the order's own, delivery figure or colour literal; the email's sender
     name and the order's currency both come from data.

R25. `docs/env-setup.md` documents `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (Cloudflare Worker
     secrets, per environment), and records that **exactly one** webhook endpoint is registered per
     environment — not one per vendor host. The same Worker serves every host, the handler is
     vendor-agnostic (R11), and one endpoint yields one signing secret, which is what the single
     `STRIPE_WEBHOOK_SECRET` variable holds; registering per-host endpoints would produce multiple
     secrets the config cannot represent. It also notes that local testing needs the Stripe CLI
     because Stripe cannot reach `localhost`. `specs/tech-stack.md` records that the adapter is now real, and
     ADR-005 gains a breadcrumb that its decisions are implemented. Front-matter bumped on both docs;
     `ARTIFACT_INDEX.md` regenerated and matching the committed copy.

R26. `CHANGELOG.md` `[Unreleased]` has an entry naming P3c and `#99` (Gate 4), recording that P3b's
     stock-release gap is now closed and that an unconfigured environment falls back to the stub.

R27. The deferred items are filed as tracked GitHub issues, not left in prose: a resume-payment path
     for orders stuck in `PENDING_PAYMENT`, and a reconciliation sweep for webhooks that never arrive.

R28. `npm run lint`, `npm run typecheck`, `npm run test`, `npm run format:check` and
     `npm run kms:validate` all exit 0, and `npm run build` succeeds with the webhook route present
     and `/checkout/[orderNumber]` still server-rendered (`ƒ`).
