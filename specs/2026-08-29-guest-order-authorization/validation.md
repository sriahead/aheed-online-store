# Guest order authorization — confirmation and cancellation (validation)

## Before starting

**1. Confirm which database you are about to touch.** Compare `DATABASE_URL` / `DIRECT_URL` in
`.env` and `.dev.vars` against `secrets/staging.vars` and `secrets/production.vars` — all four, not
just the first two. CLAUDE.md records both files drifting into agreement on the *wrong* target while
the surrounding config looked right. Print keys and hosts, not whole lines: an unanchored `BASE_URL`
filter also matches `DATABASE_URL` and prints the password (#175).

**2. Apply this slice's migration before any live row.** This slice ships one, and CI only runs
`prisma migrate deploy` at merge — so the target schema is one migration behind this branch until you
do. Skipping it does not degrade gracefully; it throws a Postgres constraint error that reads like a
code defect.

```
npx prisma migrate status
npm run db:migrate
```

**3. This slice edits `specs/*.md`, so the root suite is not the whole pre-flight.** Run the KMS docs
build (row R33) and read its real exit status — do not pipe it through `tail`, which reports the
pipe's success rather than the build's.

**4. Live rows R29–R31 need one running preview and one guest order.** Set them up once:

```
npm run preview
```

Then in a browser at `http://localhost:8787`: add any in-stock product to the cart, go to checkout,
choose the guest path, and use the marker recipient name **`ZZVALIDATE Recipient`** with a distinctive
postcode you will grep for. Submit. With no `STRIPE_SECRET_KEY` set the stub adapter is active, so
checkout redirects straight to `/checkout/<orderNumber>?t=<token>` (R6) — **record that full URL,
including the token, and the order number and guest email.** Every live row below reuses them.

When finished, stop the preview and kill the orphaned `node.exe`/`workerd.exe` chain before any later
`npm run preview` (CLAUDE.md's Windows section) — a surviving `workerd.exe` fails the next build with
`EBUSY` on `.open-next\assets`.

| Req | How to verify |
|-----|---------------|
| R1  | `grep -n "confirmationToken" prisma/schema.prisma` shows the field inside the `Order` model with type `String?` and `@unique`. |
| R2  | `ls prisma/migrations` shows a new directory dated today. In its `migration.sql`: `grep -nE '^\s*(ALTER TABLE "Order" ADD COLUMN\|CREATE UNIQUE INDEX)' <file>` matches the add-column and index statements, and `grep -nE '^\s*(UPDATE\|DROP\|.*SET NOT NULL)' <file>` returns nothing. Anchor to statement starts, not bare words — a blanket `UPDATE` grep matches `ON UPDATE CASCADE` in an unrelated foreign-key clause and reports a false failure. |
| R3  | Read `lib/repositories/orders.ts`'s `tx.order.create({ ... })` call (near line 286): `confirmationToken` and `orderNumber` are supplied in the same `data` object, and the value is `crypto.randomUUID()`. Confirm it is inside the `prisma.$transaction(async (tx) => {` callback, not after it. |
| R4  | `grep -n "confirmationToken" lib/payments.ts` shows the field on the payment input type. In `lib/repositories/orders.ts`, the post-commit `payments.createPayment({ ... })` call passes it. `npm run typecheck` exits 0, which is what proves the field is required rather than optional. |
| R5  | `grep -n -A8 "interface PlacedOrder" lib/repositories/orders.ts` shows `confirmationToken: string`, and `placeOrder`'s final `return` supplies it. |
| R6  | `grep -n "placed.redirectUrl" features/checkout/place-order.ts` — the fallback after `??` includes `?t=` and the token, not a bare `/checkout/${placed.orderNumber}`. |
| R7  | `grep -n "success_url\|cancel_url" lib/payments.ts` — `success_url` ends `?t=` plus the encoded token; `cancel_url`'s path segment is `/cancel` before its `?t=`. Covered mechanically by R28's test. |
| R8  | `grep -n -A8 "export async function findOrderForViewer" lib/repositories/orders.ts` shows a fifth parameter `confirmationToken: string \| null`. |
| R9  | `npx vitest run tests/orders.test.ts` — the member-owner and member-non-owner cases from R26 pass. The non-owner case must pass the *correct* token and still expect `null`; a case that passes no token proves nothing about R9. |
| R10 | `npx vitest run tests/orders.test.ts` — all four guest cases from R26 pass (matching, `null`, wrong, stored-`null`). |
| R11 | `npx vitest run tests/orders.test.ts` — the existing cross-vendor expectation still passes. This is a regression guard; the `where` clause already carried `vendorId` before this slice. |
| R12 | `npx vitest run tests/orders.test.ts` — R27's assertion passes. Then read the destructuring line (near 863): `confirmationToken` is pulled out alongside `userId`, not spread into the result. |
| R13 | `grep -n "getByOrderNumber" lib/repositories/orders.ts lib/orders-service.ts` — the interface declares three parameters and the service implementation forwards the third to `findOrderForViewer` unchanged. `npm run typecheck` exits 0. |
| R14 | Read `app/(storefront)/checkout/[orderNumber]/page.tsx`: the component destructures `searchParams`, awaits it, and passes its `t` value as the third argument to `getByOrderNumber`. |
| R15 | Covered live by R30. Statically: read the `if (!order)` branch — it redirects to `/orders/lookup` with the encoded order number and returns before any JSX renders. |
| R16 | `grep -n "notFound" "app/(storefront)/checkout/[orderNumber]/page.tsx"` returns nothing, and the `next/navigation` import no longer names it. |
| R17 | `ls app/api/checkout/cancel/route.ts` reports no such file, and `git log --diff-filter=D --name-only -1 -- app/api/checkout/cancel/route.ts` shows the deletion on this branch. Also check whether `app/api/checkout/` is now empty and should go with it. |
| R18 | `app/(storefront)/checkout/[orderNumber]/cancel/page.tsx` exists; read it — it calls `getByOrderNumber` with the `t` search param and applies the same redirect-on-null branch as R15. |
| R19 | Live, per R31's first half. |
| R20 | Read the page: a form element bound to the imported server action, a hidden input carrying the token, and a separate anchor to `/cart`. Confirm the anchor is a link, not a submit control — a second submit button inside the same form would cancel the order. |
| R21 | `head -1 features/checkout/cancel-order.ts` is the `"use server"` directive. Then read every `export` in the file: each is an `async function`. A single non-async export makes **every** action in the file 500 at runtime while `build`, `typecheck` and `test` all stay green (CLAUDE.md's Server Actions section) — so read the exports, do not infer this from a passing suite. |
| R22 | Read the action: it calls `getByOrderNumber` with the token read from the submitted `FormData` and returns early on `null`, before any call to `fail(...)` or `addItems(...)`. |
| R23 | Read the action: the `fail(...)` and `addItems(...)` calls are inside a `status === "PENDING_PAYMENT"` branch, followed by `redirect("/cart")`. Compare against `git show HEAD:app/api/checkout/cancel/route.ts` to confirm the two effects match what the deleted route did. Live half in R31. |
| R24 | Read all three docstrings and confirm each describes the token rule. Do **not** grep for the absence of "capability URL" — the phrase legitimately appears in this slice's own `plan.md` and in the issues, and a check that rewards deleting an explanation is the P4a trap this repo has hit four times. |
| R25 | `grep -n -A2 "Referrer-Policy" next.config.ts` shows `strict-origin-when-cross-origin` under the `/:path*` source block. |
| R26 | `npx vitest run tests/orders.test.ts` — six named cases exist and pass. Count them by reading the `it(` titles, not by trusting the pass total. |
| R27 | `npx vitest run tests/orders.test.ts` — the assertion is on own-property absence (e.g. `expect("confirmationToken" in result).toBe(false)`), not on the value being `undefined`, which a missing key satisfies vacuously. |
| R28 | `npx vitest run tests/payments.test.ts` exits 0 with the two URL assertions passing. |
| R29 | Open the recorded `/checkout/<orderNumber>?t=<token>` URL in the browser against the running preview. The page renders the order and the address card shows `ZZVALIDATE Recipient` and the postcode. |
| R30 | `curl -sS -i "http://localhost:8787/checkout/<orderNumber>"` with no `t` parameter, redirected to a file in your session's scratchpad directory. Read the file: the status line is a redirect (`307` or `308`), the `Location` header points at `/orders/lookup?orderNumber=...`, and grepping it for `ZZVALIDATE` and for the postcode returns nothing. Write to a file and read it — do not pipe through `head`, which can kill the writer before it finishes. If the response is `/coming-soon` instead, the vendor did not resolve from the host; that is a harness problem, not a finding. |
| R31 | With the order still `PENDING_PAYMENT`: (a) `curl -sS -o <scratchpad>/cancel-get.txt "http://localhost:8787/checkout/<orderNumber>/cancel?t=<token>"`, then confirm via `/orders/lookup` (order number + guest email) that the status is still `PENDING_PAYMENT` — this is R19, and it is the row that proves the destructive-GET class is actually gone. (b) Open the same cancel URL in the browser and submit its form. Confirm the browser lands on `/cart` with the line restored, and that `/orders/lookup` now reports `CANCELLED`. |
| R32 | `npm run sdd:audit` prints a `✓` line for `PR #449` rather than a `·` pending line, and exits 0. Note the workflow's warning: a row for *this* slice's own directory cannot exist yet at `/validate`, so do not read its absence as a failure — R32 is pinned to PR #449 deliberately. |
| R33 | `npm run kms:validate` exits 0. Then `npm run kms:build-index` and confirm `ARTIFACT_INDEX.md` differs only in its commit footer (CI strips that footer before comparing; a bare `git diff --exit-code` always shows a one-commit footer difference by construction and is not a failure). Then `npm run kms:assemble:internal && (cd kms/site-internal && npx next build --webpack)` exits 0 — read the real exit status, unpiped. |
| R34 | `git diff origin/staging -- CHANGELOG.md` is non-empty and describes this slice. |
| R35 | `npm run lint`, `npm run typecheck`, `npx vitest run`, `npm run format:check`, `npm run build` each exit 0. CI's `gates` run on the PR is the authority — do not report the slice done on local output alone. |
