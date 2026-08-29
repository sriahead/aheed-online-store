# Bind Stripe webhook confirmation and failure to the expected stored payment (validation)

## Before starting

**1. Confirm which database you are about to touch.** Compare `DATABASE_URL` / `DIRECT_URL` in
`.env` and `.dev.vars` against `secrets/staging.vars` **and** `secrets/production.vars` — all four,
not just the first two. CLAUDE.md records both files drifting into agreement on the *wrong* target
while the surrounding config looked right (#119, and the P5a migration that reached production).
Print keys and hosts, not whole lines: an unanchored `BASE_URL` filter also matches `DATABASE_URL`
and prints the password (#175).

**2. This slice ships NO migration.** Every column it reads already exists. `npx prisma migrate
status` should report nothing pending on the target; if it reports a pending migration, that belongs
to some other branch and is a finding about your checkout, not about this slice.

**3. This slice adds files under `specs/` and edits an ADR, so the root suite is not the whole
pre-flight.** Run the KMS docs build (row R40) and read its **real** exit status — do not pipe it
through `tail` or `head`, which report the pipe's success rather than the build's.

**4. Live rows R30–R34 need a Stripe webhook listener, and the order of setup matters.** Three traps
from CLAUDE.md, each of which silently produces a wrong result rather than an error:

- `.dev.vars` carries a **real test-mode `STRIPE_SECRET_KEY`** in this repo, so checkout redirects to
  real hosted Stripe Checkout. The stub adapter is **not** active. That is what makes R30 possible.
- `stripe listen`'s signing secret is **per-invocation** and will differ from whatever is already in
  `.dev.vars`. A mismatch fails silently from the outside: the card payment succeeds, the order sits
  in `PENDING_PAYMENT` forever, and nothing says why.
- `.dev.vars` is read at **Worker boot**, so editing it while preview is running has no effect.

Set up in exactly this order:

```
stripe listen --forward-to http://localhost:8787/api/webhooks/stripe
```

Wait for the `Ready! ... webhook signing secret is whsec_...` line. Copy that secret into
`.dev.vars`'s `STRIPE_WEBHOOK_SECRET`. **Then** start the preview:

```
npm run preview
```

**Record the whsec value** — rows R31–R33 sign their own events with it.

`stripe listen` forwards only events that occur **while it is running**; a payment completed before
you started it is not replayed, and `stripe events resend` targets a registered dashboard endpoint,
not an ad-hoc CLI listener. Place orders only after the listener reports ready.

**5. Two live orders are needed, and R31–R33 depend on order B still awaiting payment.**

- **Order A** — place an order with marker recipient name `ZZBIND-A Recipient` and pay with Stripe
  test card `4242 4242 4242 4242`.
- **Order B** — place a second order with marker `ZZBIND-B Recipient` containing a single line of a
  known product, and **abandon it on the Stripe Checkout page**: do not pay, do not click back.

Record for each: the order number, the total in pence, and the session id. Take each session id from
the Stripe dashboard's Checkout Sessions list filtered by `client_reference_id`, which
`lib/payments.ts:105` sets to the order number for exactly this purpose. Also record order B's
product id and that product's current `Inventory.quantity` from `/staff/inventory`.

**6. When finished**, stop the preview and kill the orphaned process chain before any later
`npm run preview`. The task-runner kill only ends the top-level `npm`;
`wrangler.js` and `workerd.exe` survive, and the next build fails with `EBUSY` on
`.open-next\assets`. Enumerate them with the `Get-CimInstance` query in CLAUDE.md's Windows section,
matching on the repo path and on `wrangler dev` in the command line rather than on the image name
alone — unrelated `node.exe` processes are common — then `taskkill /F /PID` each id it reports.

**7. Redirect script output to a file and read it — never pipe it through `head`.** A live-writing
script killed by SIGPIPE can skip its own cleanup, which is how a previous `/validate` left rows
behind in the dev database.

| Req | How to verify |
|-----|---------------|
| R1  | `grep -n -A8 "interface StripeCheckoutEvent" lib/stripe-webhook.ts` shows the two new fields alongside the four pre-existing ones. |
| R2  | Covered mechanically by R25. Statically, read `parseCheckoutEvent`'s return object: `amountTotal` guards on a `typeof ... === "number"` check and `currency` on a `typeof ... === "string"` check, each falling back to `null` — the same shape as the existing `sessionId` guard beside them. |
| R3  | Covered by R25's second case. |
| R4  | `grep -n -A6 "interface PaymentBinding" lib/repositories/orders.ts` shows exactly the four fields with those types. `npm run typecheck` exits 0. |
| R5  | `grep -n -A6 "ConfirmPaymentResult" lib/repositories/orders.ts` and the same for `FailPaymentResult` show both unions with all four reason strings. `npm run typecheck` exits 0, which is what proves the route's branches are exhaustive rather than defaulted. |
| R6  | `grep -n -A6 "export async function confirmPayment" lib/repositories/orders.ts` shows the binding parameter and the result return type. Then `npx vitest run tests/repository-purity.test.ts` exits 0. |
| R7  | `npx vitest run tests/orders.test.ts` — R27's `unbindable` case passes. Then read the guard: it returns before the `findOrderForWebhook` call and before `prisma.$transaction`, so "no write and no read" is structural rather than incidental. |
| R8  | `npx vitest run tests/orders.test.ts` — the `not-found` case passes. |
| R9  | `npx vitest run tests/orders.test.ts` — R29's assertion on the recorded `where` argument passes. Read the `where` object too: the id, status, currency and `payment` relation filter are all keys of the same object literal, not split across a prior read. |
| R10 | Read the line that builds the currency value and confirm it upper-cases the binding's currency. Then `grep -n "insensitive" lib/repositories/orders.ts` — the only match is inside `findOrderForGuestLookup`, which this slice does not touch. Behaviourally covered by R27's case-difference case. |
| R11 | `npx vitest run tests/orders.test.ts` — the `already-processed` and `binding-mismatch` cases both pass and assert different `reason` values, rather than both asserting only that `ok` is false. |
| R12 | `npx vitest run tests/orders.test.ts` — for each refusal case the double's recorded write log is empty. Assert on that log, not on the return value alone. |
| R13 | `npx vitest run tests/orders.test.ts` — the pre-existing `confirmPayment` expectations still pass. Then `git diff origin/staging -- lib/repositories/orders.ts` and confirm the transaction body's write statements are unchanged apart from the added guard and the new return shape. |
| R14 | `grep -n -A6 "export async function failPayment" lib/repositories/orders.ts` shows the parameters in the order `prisma, orderNumber, binding, reason`. `npm run typecheck` exits 0. |
| R15 | `npx vitest run tests/orders.test.ts` — R28's third case passes: a binding with a null amount and null currency still cancels the order. This is the row that proves the asymmetry in `plan.md`'s table is implemented, not merely described. |
| R16 | Read `releaseOrder`'s `tx.order.updateMany` `where`: the binding's fields are spread in conditionally, and only the provider and provider reference appear — no amount, no currency. |
| R17 | `npx vitest run tests/orders.test.ts` — R18's existing "payment provider unavailable" cases pass. Then read the conditional spread: with no binding the `where` object has exactly the three pre-slice keys. |
| R18 | `npx vitest run tests/orders.test.ts` — the `describe("placeOrder — payment provider unavailable")` block passes. `git diff origin/staging -- tests/orders.test.ts` shows that block's assertions unmodified. |
| R19 | `npx vitest run tests/orders.test.ts` — R28's mismatch case asserts the double recorded no `inventory.updateMany` call. Live half in R33. |
| R20 | `grep -n "STRIPE_PAYMENT_PROVIDER" app/api/webhooks/stripe/route.ts` shows the import from `@/lib/payments` and its use in the binding literal. Read both call sites: `orders.confirm` and `orders.fail` each receive a binding. |
| R21 | Read the `checkout.session.completed` branch: `sendOrderConfirmationEmail` sits inside a branch keyed on the result's `ok` being true, not on a truthiness check of the result object — a result object is always truthy, so a truthiness check would email on every refusal. |
| R22 | Live, per R31–R33, each of which asserts the status line is `200`. Statically, read the switch: no branch after signature verification returns a non-200, and the function's final `return` is the 200. |
| R23 | Live, per R31 and R32: R31's preview console shows exactly one error line, R32's shows none. Statically, read the branch and confirm there is no `console.error` on the `already-processed` arm. |
| R24 | Read the `console.error` call's arguments. Confirm it names the reason, event type, order number and session id, and that it does not interpolate the order object, the buyer email, the address, or anything from the event's session object beyond the session id. Do **not** grep for the absence of a word like "email" — `plan.md`, this file and the route's own comments all use it legitimately, and a check that rewards deleting an explanation is the trap this repo has hit five times. |
| R25 | `npx vitest run tests/stripe-webhook.test.ts` exits 0 with both new cases passing: one asserting a numeric amount and string currency from a completed-session payload, one asserting null for both from a payload carrying neither. |
| R26 | Read the double's `order.updateMany` implementation: it evaluates every key of the supplied `where`, including descending into the nested `payment` filter, and returns a zero count when any condition fails. A double that returns a count of 1 unconditionally makes every case in R27 and R28 vacuous — check this before trusting any row above that cites them. |
| R27 | `npx vitest run tests/orders.test.ts` — count the seven `it(` titles in the `confirmPayment` describe block by reading them, not by trusting the suite's pass total. Each of the seven cases named in R27 is present. |
| R28 | `npx vitest run tests/orders.test.ts` — the three `failPayment` cases named in R28 are present and pass, counted the same way. |
| R29 | `npx vitest run tests/orders.test.ts` — the assertion inspects the recorded `where` argument for the nested payment filter. Confirm it asserts on structure (the key exists with the expected nested values), not merely that the call happened. |
| R30 | Confirm via `/orders/lookup` (order A's number plus the email used) that order A's status is `CONFIRMED`. The `stripe listen` output shows the forwarded `checkout.session.completed` and a `200`. This is the row proving the binding did not break the path it guards. |
| R31 | Run `npx tsx scripts/sign-stripe-event.ts` against the preview webhook URL with the recorded whsec, `--type checkout.session.completed`, order **B**'s number, `--session cs_test_DELIBERATELY_WRONG`, and order B's real amount and `gbp`, redirecting stdout to a file in your scratchpad. Read the file: the printed status is `200`. Order B is **still `PENDING_PAYMENT`** via `/orders/lookup`, and the `npm run preview` console shows exactly one `binding-mismatch` error line naming order B. Order B must be `PENDING_PAYMENT` when you run this — against an already-`CONFIRMED` order the status guard refuses first and the reason is `already-processed`, which is R11's case, not this one. |
| R32 | Re-run the same command with order **A**'s number, its **real** session id and its real amount, redirected to a second scratchpad file. The printed status is `200`; order A remains `CONFIRMED`; the preview console shows **no** `binding-mismatch` line for it; and no second confirmation email is attempted. Judge the email on the attempt appearing in the console, not on delivery — a real send to an `@example.com` address fails at Resend regardless of this slice. |
| R33 | Order B is still `PENDING_PAYMENT` after R31. (a) Run the signing script with `--type checkout.session.expired`, order B's number and `--session cs_test_DELIBERATELY_WRONG`: status `200`, order B still `PENDING_PAYMENT`, and its product's `Inventory.quantity` unchanged from the setup figure. (b) Re-run with order B's **real** session id: status `200`, order B now `CANCELLED`, and its product's `Inventory.quantity` incremented by that line's quantity. Read the inventory figure from `/staff/inventory` or the database, never from the storefront's stock badge, which is edge-cached. |
| R34 | `ls scripts/sign-stripe-event.ts` and `git log --oneline -1 -- scripts/sign-stripe-event.ts` show it committed on this branch. R30–R33 passing is what proves the signatures it emits are accepted — a script whose signatures were rejected would surface as `400 Invalid signature` in those rows rather than the expected `200`. Read the payload it builds for a completed session and confirm it sets the paid payment status; without it the route's pre-existing paid-only guard breaks before any binding code runs and R31 would pass for the wrong reason. |
| R35 | Read all three docstrings. Each describes the binding. Do **not** grep for the absence of a phrase like "order number" — every one of these functions legitimately still takes an order number and says so. |
| R36 | `npx vitest run tests/repository-vendor-scoping.test.ts tests/repository-purity.test.ts tests/repository-client-injection.test.ts tests/repository-transaction-safety.test.ts` exits 0. If the `orders.ts:confirmPayment` allowlist entry was edited, `git diff origin/staging -- tests/repository-vendor-scoping.test.ts` shows a prose amendment, not a deletion of the entry. |
| R37 | Read the new note in `specs/decisions/ADR-005-payments-money-flow.md`. Confirm it sits in the implementation-notes area alongside P5a's precedent note and that no numbered decision's text is edited — `git diff origin/staging -- specs/decisions/ADR-005-payments-money-flow.md` shows additions plus the front-matter bump, not edits inside a decision. |
| R38 | `grep -n "PR #453" specs/roadmap.md` returns a change-log row. Then `npm run sdd:audit` prints a `✓` line for `PR #453` and exits 0. Note the workflow's warning: a row for *this* slice's own directory cannot exist yet at `/validate` — Document (final) writes it — so its absence is not a failure, and R38 is pinned to PR #453 deliberately. |
| R39 | `npm run kms:validate` exits 0 with `invalid front-matter (failing): 0`. Then `npm run kms:build-index` and confirm `ARTIFACT_INDEX.md` differs only in its commit footer — CI strips that footer before comparing, and a bare `git diff --exit-code` always shows a one-commit footer difference by construction, which is not a failure. |
| R40 | `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` exits 0. Read the real exit status, unpiped. This is the check that catches a bare less-than-digit or an unbackticked brace expression in the new spec prose or the ADR note, neither of which any root gate sees. |
| R41 | `git diff origin/staging -- CHANGELOG.md` is non-empty and describes this slice. |
| R42 | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check` and `npm run build` each exit 0. CI's `gates` run on the PR is the authority — do not report the slice done on local output alone. |
