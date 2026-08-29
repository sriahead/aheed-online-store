# Guest order authorization — confirmation and cancellation (requirements / acceptance criteria)

First slice of **P9.1 — Security & transaction safety**, closing **#427** and **#428**. A per-order
capability token replaces the order number as a guest's only credential on
`app/(storefront)/checkout/[orderNumber]/page.tsx`, and the destructive `GET` in
`app/api/checkout/cancel/route.ts` becomes an authorized confirmation page backed by a POST server
action. Narrative, rationale and the excluded list are in `plan.md`.

## Schema and token minting

R1. `prisma/schema.prisma`'s `Order` model declares a field `confirmationToken` of type `String?`
    carrying `@unique`.

R2. A new directory under `prisma/migrations/` contains a `migration.sql` that adds a nullable
    `confirmationToken` column to `"Order"` and creates its unique index, and that contains no
    `UPDATE`, `DROP`, or `SET NOT NULL` statement targeting `"Order"`.

R3. `placeOrder` in `lib/repositories/orders.ts` supplies `confirmationToken` a value obtained from
    `crypto.randomUUID()` within the same `tx.order.create({ ... })` call that supplies
    `orderNumber`, inside the existing `$transaction` callback.

## Carrying the token to the shopper

R4. The payment-service input type in `lib/payments.ts` declares a required `confirmationToken`
    field of type `string`, and `placeOrder` passes the token minted in R3 when it calls
    `createPayment` after the transaction commits.

R5. The `PlacedOrder` interface in `lib/repositories/orders.ts` declares `confirmationToken: string`,
    and `placeOrder` returns the minted token in that field.

R6. `features/checkout/place-order.ts`'s fallback destination — the branch taken when `redirectUrl`
    is `null`, which is every checkout under the stub payment adapter — is
    `` `/checkout/${placed.orderNumber}?t=${token}` `` with the token percent-encoded, not the bare
    `` `/checkout/${placed.orderNumber}` `` it is today.

R7. `createStripePaymentService`'s `success_url` is the string
    `` `${input.returnOrigin}/checkout/${input.orderNumber}?t=${token}` `` and its `cancel_url` is
    `` `${input.returnOrigin}/checkout/${input.orderNumber}/cancel?t=${token}` ``, where `token` is
    the percent-encoded `input.confirmationToken`.

## The authorization rule

R8. `findOrderForViewer` in `lib/repositories/orders.ts` accepts a fifth parameter
    `confirmationToken` of type `string | null`.

R9. For an order whose stored `userId` is non-null, `findOrderForViewer` returns the order when
    `viewerUserId` equals that `userId`, and returns `null` otherwise — for every value of
    `confirmationToken`, including a value equal to the stored token.

R10. For an order whose stored `userId` is null, `findOrderForViewer` returns the order only when
     `confirmationToken` is a non-empty string equal to the stored `confirmationToken`. It returns
     `null` when `confirmationToken` is `null`, when it is the empty string, when it differs from the
     stored value, and when the stored value is `null`.

R11. `findOrderForViewer` returns `null` for an order belonging to a different `vendorId`, for every
     combination of `viewerUserId` and `confirmationToken`.

R12. The object `findOrderForViewer` returns has no `confirmationToken` own property, removed in the
     same destructuring statement that already removes `userId`.

R13. `OrderRepository.getByOrderNumber`'s declared signature in `lib/repositories/orders.ts` and its
     implementation in `lib/orders-service.ts` both accept the token as a third argument and pass it
     through to `findOrderForViewer` unchanged.

## Confirmation page

R14. `app/(storefront)/checkout/[orderNumber]/page.tsx` accepts `searchParams`, reads the `t`
     parameter from it, and passes that value as the third argument to `getByOrderNumber`.

R15. When `getByOrderNumber` returns `null`, that page responds with an HTTP redirect to
     `/orders/lookup?orderNumber=<the percent-encoded order number>`, and its response body contains
     no recipient name, phone number, address line, postcode, or order item name.

R16. That page calls neither `notFound()` nor any other function that produces a `404` for the
     unauthorized case, so a non-existent order and a wrong token produce the same response apart
     from the order number echoed in the redirect target.

## Cancellation path

R17. `app/api/checkout/cancel/route.ts` does not exist.

R18. `app/(storefront)/checkout/[orderNumber]/cancel/page.tsx` exists, resolves the order through
     the same `getByOrderNumber` call with the `t` search parameter, and applies R15's redirect on a
     `null` result.

R19. Rendering that page performs no database write: an order that is `PENDING_PAYMENT` before a
     `GET` of the page is still `PENDING_PAYMENT` after it, and its `OrderStatusEvent` count is
     unchanged.

R20. That page renders a form bound to a server action, carrying the token in a hidden input, and a
     separate link to `/cart` that submits nothing.

R21. `features/checkout/cancel-order.ts` begins with the `"use server"` directive and exports only
     `async` functions — no constant, type-value, or object export.

R22. The cancel action re-resolves the order through `getByOrderNumber` using the token submitted
     with the form, and returns without cancelling when that call yields `null`.

R23. The cancel action cancels the order and restores its lines to the cart only when the resolved
     order's status is `PENDING_PAYMENT`, performing the same two effects the deleted route
     performed — the webhook order service's `fail(...)` and the cart repository's `addItems(...)` —
     and then redirects to `/cart`.

## Superseded documentation

R24. None of these three docstrings states, as current behaviour, that an order number alone is a
     guest order's credential: `findOrderForViewer`'s inline comment in `lib/repositories/orders.ts`,
     the `hasAccount` field docstring on `OrderSummary` in the same file, and the page docstring in
     `app/(storefront)/checkout/[orderNumber]/page.tsx`. Each instead describes the token rule R9 and
     R10 define.

## Headers

R25. `next.config.ts` sets a `Referrer-Policy` header with the value
     `strict-origin-when-cross-origin` for `source: "/:path*"`.

## Tests

R26. The test suite covers all six authorization outcomes as separate cases: guest order with a
     matching token returns the order; guest order with a `null` token returns `null`; guest order
     with a wrong token returns `null`; guest order whose stored token is `null` returns `null`;
     member order read by its owner returns the order; member order read by a non-owner holding the
     correct token returns `null`.

R27. A test asserts that the object returned for an authorized guest order has no
     `confirmationToken` own property.

R28. `tests/payments.test.ts` asserts that the Stripe adapter's `success_url` and `cancel_url` each
     contain the confirmation token, and that `cancel_url`'s path ends in `/cancel`.

## Live validation

R29. Against `npm run preview` with the migration applied, a guest order placed through checkout
     renders its full confirmation page — including the delivery address — at the URL checkout
     redirected to.

R30. Against the same running preview, opening that identical URL with the `t` parameter removed
     returns a redirect to `/orders/lookup` and a response body containing none of the address
     fields.

R31. Against the same running preview, a `GET` of that order's cancel page leaves its status
     `PENDING_PAYMENT`, and submitting the page's form moves the order to `CANCELLED` and returns
     the lines to the cart.

## Gates

R32. `specs/roadmap.md`'s change log contains a row citing `PR #449` for the promotion merged on
     2026-08-28, and `npm run sdd:audit` reports no missing promotion row for it.

R33. `npm run kms:validate` exits 0, and `ARTIFACT_INDEX.md` and `app/(admin)/staff/runbook/docs.ts`
     are rebuilt to include this slice's `plan.md`.

R34. `CHANGELOG.md` updated (Gate 4).

R35. `lint`, `typecheck`, `test`, `format:check` and `build` all remain green after this slice.
