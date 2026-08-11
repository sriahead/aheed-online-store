# P5b — Discount codes: engine, checkout application & staff admin (validation)

**Pre-flight, before any row below.** Four environment facts, each of which has already produced a
confidently wrong result in this repo:

1. **Confirm which database you are on — against `secrets/*.vars`, not only against each other.**
   Compare the `DATABASE_URL`/`DIRECT_URL` **hosts** in `.env` and `.dev.vars` against *both*
   `secrets/staging.vars` and `secrets/production.vars`. Both files agreeing with each other proves
   nothing: at P5a's validation they agreed perfectly and both pointed at **production**
   (`ep-young-glitter-…`) while their own `S3_BUCKET`/`CDN_BASE_URL` said staging, and that slice's
   migration reached the production database ahead of its promotion PR. Staging is
   `ep-empty-scene-zafjzeye`. **This slice writes to `DiscountCode` and decrements counters — do not
   start until the host is confirmed to be staging.**
2. **Use `npm run preview`, never `npm run dev`,** for every row that touches the database — plain
   `next dev` cannot load `@prisma/client/wasm` and renders a silent error state with no crash.
3. **On Windows, stop a previous `npm run preview` properly.** Orphaned `node`/`workerd` processes
   hold file locks and the next build fails confusingly; `Stop-Process` them before retrying.
4. **`.dev.vars` wins under `preview`.** The Cloudflare request context takes precedence over
   `process.env`, so the app reads `.dev.vars` while every `tsx` fixture script reads `.env`.

**Fixtures.** Build them with a plain `tsx` script. `placeOrder(prisma, vendorId, input)`,
`confirmPayment(prisma, orderNumber)` and `failPayment(prisma, orderNumber, reason)` all take their
client explicitly (P3b R9a / P3c), and R25 requires this slice's functions to do the same — that is
what lets every write below be driven outside a request.

Codes, all on **Aheed** unless stated:

- **C1** — `PERCENTAGE`, `value: 1000` (10%), `minSubtotalPence: 0`, `startsAt` in the past,
  `endsAt: null`, `remainingRedemptions: null`, `maxPerCustomer: null`. The general-purpose code.
- **C2** — `FIXED_AMOUNT`, `value: 500`, `remainingRedemptions: 1`. The global-cap race subject.
- **C3** — `PERCENTAGE`, `value: 1000`, `maxPerCustomer: 1`. The per-customer race and guest-refusal
  subject.
- **C4** — `endsAt` in the past. The `EXPIRED` subject.
- **C5** — `minSubtotalPence: 5000`. The minimum-spend subject.
- **C6** — on **SriMart**, code string identical to C1's. Cross-vendor subject and R57's second half.

Orders: **O1** Aheed / `demo-customer` / C1 only. **O2** Aheed / `demo-customer` / C1 **and** points.
**O3** Aheed / guest / C1. **O4** Aheed / `demo-customer` / C1 + points, left `PENDING_PAYMENT` for
the release rows. **O5** Aheed / `demo-customer` / C1, then `confirmPayment`, for the earn row.

Rows are ordered so that later ones may depend on earlier fixtures (R38 uses C2 exhausted by R29,
R50 follows R49). Run them in order.

| Req | How to verify |
|-----|---------------|
| R1  | `grep -nE "getPrisma\|@prisma/client\|fetch\(\|cookies\(\|headers\(" lib/discounts.ts` returns no code match (a match inside a comment is read and dismissed explicitly). `npx vitest run tests/discounts.test.ts` passes with `DATABASE_URL` unset in the environment. |
| R2  | Read the two exported type declarations in `lib/discounts.ts` and compare the member lists to R2's exactly — no extra member, none missing. |
| R3  | `grep -n "MIN_PAYABLE_PENCE" lib/discounts.ts` shows an import from `@/lib/loyalty`. `grep -nE "=\s*30\b" lib/discounts.ts` returns nothing. |
| R4  | Unit test asserting all four exact cases from R4. |
| R5  | Unit test asserting all four exact `(subtotalPence, value)` cases from R5. |
| R6  | Unit test asserting both exact cases from R6, confirming the raw value is returned before clamping. |
| R7  | Unit test: seven `evaluateCode` calls, one per condition, each asserting the exact reason string. Separately confirm by reading the function that no path returns `"UNKNOWN"` — that reason is the repository's to produce. |
| R8  | Unit test: three calls at the exact boundary (`now === startsAt`, `now === endsAt`, `subtotalPence === minSubtotalPence`), each asserting `ok: true`. |
| R9  | Unit test: with `endsAt: null`, `remainingRedemptions: null` and `maxPerCustomer: null`, no input in a randomised sweep of at least 100 cases produces `EXPIRED`, `USAGE_LIMIT_REACHED`, `SIGN_IN_REQUIRED` or `CUSTOMER_LIMIT_REACHED`. |
| R10 | Unit test: one input satisfying every refusal condition at once returns `"INACTIVE"`; removing conditions one at a time in the stated order yields the next reason each time. |
| R11 | Property test, ≥200 randomised inputs: every `ok: true` result satisfies `discountPence >= 1`, `discountPence <= subtotalPence`, and `subtotalPence + deliveryFeePence - discountPence >= 30`. |
| R12 | Unit test: `FIXED_AMOUNT` `value: 500` against `subtotalPence: 0, deliveryFeePence: 0` returns `{ ok: false, reason: "NO_HEADROOM" }` — assert the shape, not just falsiness. |
| R13 | `git diff origin/staging -- tests/loyalty.test.ts` shows only added cases, no edits to existing ones. `npx vitest run tests/loyalty.test.ts` passes. Add one case calling `clampRedemption` with `existingDiscountPence` omitted and assert it equals the value the neighbouring pre-existing case already asserts. |
| R14 | Property test, ≥200 randomised inputs including `E = 0`: `discountPence <= subtotalPence - E` and `subtotalPence + deliveryFeePence - E - discountPence >= 30`. |
| R15 | Same property test asserts `discountPence === pointsSpent * pencePerPointRedeemed` on every generated case with `E > 0`. |
| R16 | Unit test: `existingDiscountPence` equal to, and greater than, `subtotalPence` each return `{ pointsSpent: 0, discountPence: 0 }`. |
| R17 | Read `model DiscountCode` in `prisma/schema.prisma`; list its non-relation fields and compare to R17's list exactly, including which four are nullable. |
| R18 | `grep -n "@@unique(\[vendorId, code\])" prisma/schema.prisma` matches, and the model declares an `@@index` whose first element is `vendorId`. |
| R19 | `grep -n "usedCount" prisma/schema.prisma` returns nothing. |
| R20 | Read `model DiscountRedemption`; confirm the field list and that both `@@unique([orderId])` and `@@unique([codeId, userId, seq])` are present. |
| R21 | `git diff --name-only origin/staging -- prisma/migrations/` names exactly one new migration directory; `grep -nE "DROP\|ALTER TABLE \"Order\"" <that>/migration.sql` returns nothing. |
| R22 | `git diff origin/staging -- prisma/schema.prisma` — inside `model Order { … }` the only added line is the `DiscountRedemption` back-relation. No money column added. |
| R23 | `git diff origin/staging -- prisma/schema.prisma` introduces no `Json`. Read the three money fields and confirm each is `Int`; confirm a schema comment states a `PERCENTAGE` code's `value` is basis points. |
| R24 | `npx prisma migrate status` reports no failed and no pending migrations. `npm run typecheck` exits 0. |
| R25 | Read each exported writing function's signature in `lib/repositories/discounts.ts` and confirm `(db\|tx, vendorId, …)`. The fixture script calls them directly under `tsx` with no Workers context — every live row below depends on this, so R25 passing is a precondition, not an isolated check. |
| R26 | Read every Prisma query in `lib/repositories/discounts.ts` and confirm each `where` names `vendorId`. Reading, not grepping — a `where` spanning lines defeats a single-line grep. |
| R27 | Read `claimCode` and confirm the `updateMany` `where` contains `vendorId`, `isActive: true` and the `remainingRedemptions` guard, with `{ decrement: 1 }` in `data`, and that `count === 0` returns a refusal. |
| R28 | Fixture: place an order using C1 (`remainingRedemptions: null`). Afterwards `SELECT "remainingRedemptions" FROM "DiscountCode" WHERE id=C1;` is still `NULL`. |
| R29 | `Promise.all` of two `placeOrder` calls using C2 from two separate carts. Exactly one resolves with an order and one rejects with a `CheckoutError`. Then `SELECT "remainingRedemptions" FROM "DiscountCode" WHERE id=C2;` is `0` and `SELECT count(*) FROM "DiscountRedemption" WHERE "codeId"=C2;` is `1`. |
| R30 | Place two sequential orders by `demo-customer` using C1. `SELECT seq FROM "DiscountRedemption" WHERE "codeId"=C1 AND "userId"=<demo-customer> ORDER BY seq;` returns exactly `0, 1`. |
| R31 | `Promise.all` of two `placeOrder` calls by the **same** signed-in shopper using C3 (`maxPerCustomer: 1`), from two carts. Exactly one succeeds; `SELECT count(*) FROM "DiscountRedemption" WHERE "codeId"=C3 AND "userId"=<demo-customer>;` is `1`. |
| R32 | Record `remainingRedemptions` for C2 after R29. Call `failPayment(prisma, <the C2 order>, "test")`. Afterwards the `DiscountRedemption` row for that order is gone and `remainingRedemptions` is exactly one higher. Call `failPayment` again: it returns `false`, the row count is unchanged and `remainingRedemptions` has not risen a second time. |
| R33 | `grep -rn "discountRedemption.delete\|discountRedemption.deleteMany" lib/ features/` returns matches only inside `releaseCodeRedemption`. Read that function and confirm the comment explaining why this is a deletion rather than a reversal row. |
| R34 | Place an order using C1 (`remainingRedemptions: null`), then `failPayment` it. `SELECT "remainingRedemptions" FROM "DiscountCode" WHERE id=C1;` is still `NULL`. |
| R35 | `GET /checkout` under `npm run preview` with items in the cart: the body contains an `<input>` whose `name` is `discountCode`. Then submit the form with an unknown code via `node:http` and confirm the returned body contains the refusal message. |
| R36 | Read the `discountCode` field's declaration and doc comment on `PlaceOrderInput` in `lib/repositories/orders.ts`. |
| R37 | `grep -n "discountCode" features/checkout/place-order.ts` shows the form read and the pass-through. `grep -n "discountPence" features/checkout/place-order.ts` returns nothing. |
| R38 | Three fixture calls: an unknown code string, C4 (expired), and C2 after R29 exhausted it. Each rejects with a `CheckoutError` whose message names the reason. After all three: the `Order` row count is unchanged, every `Inventory.quantity` for the cart's products is unchanged, and `SELECT count(*) FROM "LoyaltyLedgerEntry" WHERE kind='REDEEM';` is unchanged. Record all three counts before starting. |
| R39 | O1: `SELECT "subtotalPence","discountPence" FROM "Order" WHERE id=O1;` — `discountPence` equals 10% of the subtotal floored. `SELECT "amountPence" FROM "DiscountRedemption" WHERE "orderId"=O1;` equals the same number. |
| R40 | O2: `Order.discountPence` equals `DiscountRedemption.amountPence` **plus** the absolute value of the `REDEEM` row's `points × pencePerPointRedeemed`. Confirm each of the two rows records only its own contribution, not the total. |
| R41 | Fixture with a £20.00 subtotal, C1 (10%) and a 300-point request at `pencePerPointRedeemed: 1`: `Order.discountPence` is `500`, `DiscountRedemption.amountPence` is `200`, and the `REDEEM` row is `-300`. A result of `200 + 270` would mean the percentage was computed after the points came off. |
| R42 | Fixture with subtotal + delivery summing to `100`, C2 (fixed `500`) and a points request: the placed order's `totalPence` is `>= 30`, and `subtotalPence - discountPence + deliveryFeePence === totalPence`. |
| R43 | With Aheed's `minimumOrderPence` and free-delivery threshold both set above the post-discount subtotal but at or below the pre-discount subtotal, an order using C1 still places successfully and its `deliveryFeePence` is `0`. |
| R44 | Fixture using C5 (`minSubtotalPence: 5000`) on a cart whose pre-discount subtotal is exactly `5000`, with points also requested: the order places and carries C5's discount. |
| R45 | Submit the checkout form twice for one cart via `node:http` against `npm run preview` (`{ setHost: false }`, `Host` set by hand). `SELECT count(*) FROM "DiscountRedemption" WHERE "orderId"=<that order>;` shows one row; the second submit returns the cart-empty error. |
| R46 | O3 (guest, C1): the order places, and `SELECT "userId" FROM "DiscountRedemption" WHERE "orderId"=O3;` is `NULL`. |
| R47 | Guest checkout using C3: rejects with a `CheckoutError` whose message corresponds to `SIGN_IN_REQUIRED`, and the `Order` row count is unchanged from before the call. |
| R48 | Place an order on the **Aheed** host using C6's code string (which exists only on SriMart). It is refused as `UNKNOWN`. Afterwards `SELECT "remainingRedemptions","isActive" FROM "DiscountCode" WHERE id=C6;` is unchanged. |
| R49 | O4 carries both a code and points. Record `remainingRedemptions`, the `DiscountRedemption` row, and the loyalty balance. Call `failPayment(prisma, O4, "test")` **once**. Afterwards: the `DiscountRedemption` row for O4 is gone, `remainingRedemptions` is one higher, and a `REVERSAL` row exists for O4 with the points restored — all three from the single call. |
| R50 | Call `failPayment(prisma, O4, "test")` again. It returns `false`; `remainingRedemptions`, the `DiscountRedemption` count and the `REVERSAL` count are all unchanged from after R49. |
| R51 | O5: after `confirmPayment`, read `subtotalPence` and `discountPence` from the order and the `EARN` row's `points`, `tierKey` and `multiplierBps`. Assert `points === computePointsEarned(subtotal - discount, pointsPerPoundEarned, multiplierBps)` by calling the real function with those numbers. |
| R52 | `GET /account/orders/{O2}` and `GET /checkout/{O2}` under `npm run preview` as O2's owner: both bodies contain a single discount line showing O2's full `discountPence`, and the four rendered money figures satisfy `subtotal - discount + delivery = total`. For the email, unit-test `sendOrderConfirmationEmail` with `vi.stubGlobal("fetch", spy)` (the `tests/email.test.ts` pattern) for an order carrying both sources, asserting the same identity in the HTML body and that the spy is called exactly once. |
| R53 | Four `node:http` requests to `/staff/discounts` with `Host` set: as the vendor `ADMIN` → `200`; as a platform `ADMIN` → `200`; as `demo-staff` (vendor `STAFF` only) → the refusal body, containing no create form; with no `Cookie` → compare status and `location` directly against `GET /staff/loyalty` under the same conditions rather than asserting a remembered value. |
| R54 | `grep -n "requireVendorRole" features/admin/discount-codes.ts` matches inside each exported action. Record the `DiscountCode` rows. POST the create payload and the deactivate payload, each with no `Cookie` and again with `demo-customer`'s session — four POSTs. Afterwards every `DiscountCode` row is unchanged and no response is a 500. |
| R55 | Five create POSTs as the vendor admin, one per invalid input in R55. Each response body contains an error message; after all five `SELECT count(*) FROM "DiscountCode";` is unchanged. |
| R56 | As Aheed's admin, POST the create payload with an extra `vendorId=<srimart-id>` field: the new row's `vendorId` is Aheed's and SriMart's rows are unchanged. Then, **from the SriMart host as a SriMart admin**, POST the same payload with `vendorId=<aheed-id>`: the new row's `vendorId` is SriMart's and Aheed's rows are unchanged. Both directions are required — one direction is exactly what #141 records as insufficient. |
| R57 | POST create with C1's existing code string as Aheed's admin: an error message, and `SELECT count(*) FROM "DiscountCode" WHERE "vendorId"=<aheed>;` is unchanged. Then POST the same code string from the SriMart host as SriMart's admin: it succeeds. |
| R58 | POST deactivate for C1 as Aheed's admin. `SELECT "isActive" FROM "DiscountCode" WHERE id=C1;` is `false`. Then place a checkout using C1: refused, with the message corresponding to `INACTIVE`. |
| R59 | Read `features/admin/discount-codes.ts` end to end and confirm no exported action updates any of the seven listed fields on an existing row. Read the rendered `/staff/discounts` body and confirm no form control is bound to those fields for an existing code. Do not grep for "edit" — it matches the comment recording the exclusion. |
| R60 | Read the rendered `/staff/discounts` body and note C1's displayed redemption count. Insert one `DiscountRedemption` row for C1 directly via the fixture script, re-request the page, and confirm the displayed count rose by exactly one with no other write. |
| R61 | `npm run db:seed` exits 0. `SELECT count(*) FROM "DiscountCode" dc JOIN "Vendor" v ON v.id=dc."vendorId" WHERE v.slug LIKE 'aheed%';` is `1` and the SriMart count is `0`. Run `npm run db:seed` again: exits 0, both counts unchanged. |
| R62 | `git diff --name-only origin/staging -- app/ features/ components/` lists the slice's new files; for each, confirm it contains neither `@/lib/db` nor `@prisma/client`. `npm run lint` exits 0. |
| R63 | `git diff origin/staging -- specs/architecture.md` is non-empty; read the money-identity bullet and confirm it names two discount contributors with code-before-points precedence, and that the multi-table-transaction bullet names the code claim. `npm run kms:validate` exits 0 — the front-matter `version`/`updated` were bumped alongside. |
| R64 | `git diff origin/staging -- specs/decisions/ADR-005-payments-money-flow.md` shows an added P5b implementation note and **no** change inside the `## Decision` section. `npm run kms:validate` exits 0. |
| R65 | `git diff origin/staging -- CHANGELOG.md` is non-empty and the new text sits under `## [Unreleased]`. Re-check this immediately before opening the PR: Gate 4's CI check diffs against the PR's **current** base, so another PR merging first can make an earlier diff vanish. |
| R66 | `npm run lint`, `npm run typecheck`, `npm run test`, `npm run format:check` each exit 0. On a Windows checkout treat a `format:check` complaint as suspect until confirmed against the committed blob (`git show HEAD:<file>`) — `core.autocrlf` makes Prettier flag files that are clean on the Linux CI runner. CI's `gates` run is the authority. |

**Before declaring Gate 3 met:** run `npm run kms:build-index` **last**, after every front-matter edit
and immediately before `git add`. The index embeds each artifact's `version`/`updated`, so bumping
any front-matter after the rebuild re-stales it, and CI's `gates` job rebuilds and diffs. P5a's
closeout burned a red CI run on exactly this (#132 tracks teaching `sdd:preclear` to check it).
