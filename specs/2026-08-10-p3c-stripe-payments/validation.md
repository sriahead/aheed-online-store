# P3c — Stripe payments, webhooks & confirmation email (validation)

Pure logic (signature verification, adapter payload) is proven by unit tests with **no Stripe
credentials**. Anything touching Prisma runs on `npm run preview` or staging — **never `npm run
dev`** (`@prisma/client/wasm`, see `CLAUDE.md`). Live payment rows need Stripe **test-mode** keys and
a registered webhook endpoint; local webhook delivery needs the **Stripe CLI**
(`stripe listen --forward-to`), because Stripe cannot reach `localhost`.

⚠️ **Use test mode only.** Every live check below uses Stripe's test card `4242 4242 4242 4242`. No
real card, real money, or live-mode key is used at any point in validating this slice.

| Req | How to verify |
|-----|---------------|
| R1  | `grep -n "STRIPE_SECRET_KEY\|STRIPE_WEBHOOK_SECRET" lib/config.ts` shows both as optional schema fields **and** their `readEnv` lines; `grep -n "STRIPE_PUBLISHABLE_KEY" lib/config.ts` returns nothing; `npx tsc --noEmit` exits 0. |
| R2  | Unit test (R23). Empirically: with no Stripe vars set, `npm run test` and `npm run build` both exit 0, and a checkout on `npm run preview` still produces a `PENDING_PAYMENT` order via the stub. |
| R3  | `grep -i "stripe" package.json` returns nothing; `grep -n "fetch(" lib/payments.ts` shows the REST call to `https://api.stripe.com/v1/checkout/sessions`; unit test (R23) asserts `mode=payment`, the single line item, and that `providerReference`/`redirectUrl` come from the session's `id`/`url`. Currency: the test passes a non-default currency in `CreatePaymentInput` and asserts it reaches the request body, proving it is not hardcoded. |
| R4  | Unit test (R23) asserts the request body contains `metadata[orderNumber]` and `client_reference_id` set to the order number. Live: the Stripe test dashboard's session row shows the order number in both fields. |
| R5  | `grep -n "returnOrigin" lib/payments.ts lib/repositories/orders.ts features/checkout/*.ts` shows it threaded from the checkout action; `grep -nE "headers\(|cookies\(" ` inside `placeOrder`'s body returns nothing (R9a preserved); the existing P3b concurrency script still runs from a plain `tsx` script. |
| R6  | `sed -n '/\$transaction/,/^  });/p' lib/repositories/orders.ts \| grep -n "createPayment"` returns **nothing**; the `Payment` row is created with `providerReference: null` inside the transaction and updated after it. |
| R7  | On preview with a deliberately broken `STRIPE_SECRET_KEY` (e.g. `sk_test_invalid`): placing an order surfaces an error, and the DB shows the order `CANCELLED`, a matching `OrderStatusEvent`, and `Inventory.quantity` back at its pre-order value. |
| R8  | `npx vitest run tests/stripe-webhook.test.ts` green; `grep -nE "fetch\(|getPrisma" lib/stripe-webhook.ts` returns nothing (pure). |
| R9  | Code inspection of `lib/stripe-webhook.ts`: the comparison loops over the full digest accumulating a difference (or uses an equivalent constant-time primitive) rather than returning early on first mismatch or using `===`. |
| R10 | `grep -n "req.text()" app/api/webhooks/stripe/route.ts` shows the raw body read, and no `req.json()` before verification. `curl -X POST <preview>/api/webhooks/stripe -d '{}'` (no signature) → **400**; a correctly signed but unhandled event type → **200**. |
| R11 | `grep -n "getCurrentVendorId" app/api/webhooks/stripe/route.ts` returns nothing; the order lookup is by `orderNumber` and `vendorId` is read off the resulting row. |
| R11a | `grep -rn "getPrisma\|@prisma/client" app/api/webhooks/stripe/` returns nothing; `npm run lint` exits 0 (the no-direct-Prisma guard covers `app/`). The un-scoped lookup exists in exactly one place — `grep -c "findUnique({ where: { orderNumber" lib/repositories/orders.ts` → 1 — and carries a comment explaining why it is un-scoped. |
| R12 | Unit/integration: a `checkout.session.completed` payload with `payment_status: "unpaid"` leaves the order `PENDING_PAYMENT`; the same payload with `"paid"` confirms it. |
| R13 | Deliver the same signed `checkout.session.completed` **twice** (Stripe CLI `stripe trigger`, or replaying the captured payload): the order is `CONFIRMED`, and there is exactly **one** `OrderStatusEvent` for the transition and exactly **one** email attempt in the logs. |
| R14 | Deliver `checkout.session.expired` for a `PENDING_PAYMENT` order: status → `CANCELLED`, `Payment.status` → `FAILED`, an `OrderStatusEvent` written, and each line's `Inventory.quantity` incremented back. Deliver it a **second** time: nothing changes and stock is **not** released twice. |
| R15 | `checkout.session.expired` and `checkout.session.async_payment_failed` both cancel-and-release; an unrecognised event type (e.g. `customer.created`) returns 200 and changes no order. |
| R15a | Deliver a correctly signed event whose `metadata.orderNumber` is `AHE-20260101-NOTREAL`: the response is **200** and the failure is logged. Confirm in the Stripe CLI/dashboard that the event is marked delivered and is **not** retried. |
| R16 | Against a real DB: note `Inventory.quantity = N`; place an order for `q` (stock becomes `N - q`); expire it; confirm quantity is **exactly `N`** again — not `N + q`, not `N - q`. |
| R17 | `grep -rn "email.send\|getEmailService" lib/repositories/orders.ts features/checkout/` shows the send only on the confirm path — not in `placeOrder` and not in `failPayment`. Duplicate-delivery test (R13) produces one email. |
| R18 | The received test email is addressed to the order's `guestEmail`/member email, its subject/sender uses the vendor's `senderName` from `VendorConfig` (verify by changing that value in the DB and re-sending), and its body lists the order number, snapshotted line prices and the three money lines. |
| R19 | With `RESEND_API_KEY` unset (or pointed at an invalid key), deliver a valid `checkout.session.completed`: the order still reaches `CONFIRMED`, the webhook returns 200, and the send failure is logged rather than thrown. |
| R20 | On preview/staging, load `/checkout/{orderNumber}` for an order in each state: `PENDING_PAYMENT` renders the confirming state, `CONFIRMED` today's confirmation, `CANCELLED` the payment-failed state with a link back to the cart. |
| R21 | Complete a test payment but **block the webhook** (stop the Stripe CLI listener), then land on `success_url`: the page shows the **pending** state, not a confirmation. Then deliver the webhook and reload: it flips to confirmed. |
| R22 | `npx vitest run tests/stripe-webhook.test.ts` exits 0 with all five listed cases present, and runs with no Stripe environment variables set. |
| R23 | `npx vitest run tests/payments.test.ts` exits 0; `fetch` is mocked and asserted-on, and no test performs a real network call. |
| R24 | `grep -rniE "aheed|srimart|milton|reading" lib/payments.ts lib/stripe-webhook.ts app/api/webhooks/stripe/` returns nothing; `grep -rn "\"gbp\"\|\"GBP\"" ` shows currency taken from the order/`CreatePaymentInput`, not hardcoded in the webhook layer. |
| R25 | `git diff docs/env-setup.md specs/tech-stack.md specs/decisions/ADR-005-payments-money-flow.md` shows the two secrets, the **one-endpoint-per-environment** note (with the reasoning that one Worker serves every host and the config holds a single signing secret), the Stripe-CLI caveat, the "adapter is real" note and the ADR breadcrumb, with front-matter bumped; `npm run kms:build-index` leaves `ARTIFACT_INDEX.md` matching the committed copy and containing `p3c-stripe-payments`. |
| R26 | `git diff CHANGELOG.md` shows an `[Unreleased]` entry naming P3c and `#99`, the closed stock-release gap, and the stub fallback. |
| R27 | `gh issue list` shows the two filed follow-ups (resume-payment path; webhook reconciliation sweep), and their numbers appear in `plan.md`'s open items. |
| R28 | `npm run lint && npm run typecheck && npm run test && npm run format:check && npm run kms:validate` all exit 0; `npm run build` succeeds, lists `/api/webhooks/stripe`, and shows `/checkout/[orderNumber]` as `ƒ`. |
