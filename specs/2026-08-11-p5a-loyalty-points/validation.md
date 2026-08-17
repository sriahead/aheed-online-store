# P5a — Loyalty points: earn, redeem, tiers, expiry & admin config (validation)

**Pre-flight, before any row below.** Three environment facts, each of which has already produced a
confidently wrong result in this repo:

1. **Confirm `.env` and `.dev.vars` point at the same Neon project** (issue **#119** says they do
   not). `npm run preview` reads `.dev.vars`; every fixture and inspection script reads `.env`. If
   they differ, every live row below validates against a database the app is not running on, and the
   results look entirely plausible. Compare both `DATABASE_URL`/`DIRECT_URL` hosts *before*
   starting — `CLAUDE.md`'s config section documents the precedence: the Cloudflare request context
   wins under preview, so `.dev.vars` is what the app reads.
2. **Use `npm run preview`, never `npm run dev`,** for every row that touches the database — plain
   `next dev` cannot load `@prisma/client/wasm` and renders a silent error state.
3. **On Windows, stop a previous `npm run preview` properly.** Orphaned `node`/`workerd` processes
   hold file locks and the next build fails confusingly; `Stop-Process` them before retrying.

**Fixtures.** Build them with a plain `tsx` script. `placeOrder(prisma, vendorId, input)`,
`confirmPayment(prisma, orderNumber)` and `failPayment(prisma, orderNumber, reason)` all take their
client explicitly (P3b R9a / P3c), and R60 requires this slice's loyalty functions to do the same —
that is what lets every write below be driven outside a request.

- **F1** — Aheed, placed by `demo-customer` with **no** redemption, then `confirmPayment`. Produces
  the first `EARN` and the balance every redemption row spends.
- **F2** — Aheed, placed by `demo-customer` **with** a redemption, left at `PENDING_PAYMENT`. The
  `REDEEM` subject; later released to become the `REVERSAL` subject.
- **F3** — SriMart, placed by the same user. Cross-vendor isolation subject.
- **F4** — Aheed, placed as a **guest** (`guestEmail` set, `userId` null), then confirmed. Guest
  rows.
- **F5** — Aheed, a second redeeming order for the concurrency and idempotency rows.
- **F6** — Aheed, placed with no redemption and then released without ever being confirmed. R45's
  "no `REDEEM` to reverse" subject.
- **A-lapsed** — after F1, an inspection script sets that `LoyaltyAccount.lastActivityAt` to 13
  months ago to make the account lapsed on demand. Record the original value and restore it between
  rows that need a live account.

**Accounts** come from `npm run demo:accounts`: `demo-customer@example.com` (plain shopper),
`demo-staff@example.com` (vendor `STAFF`, platform `CUSTOMER`), `demo-admin@example.com` (platform
`ADMIN`). R52 needs a user holding vendor **`ADMIN`** who is **not** a platform admin — confirm
whether `demo:accounts` creates one and, if not, insert a `VendorMembership` row with
`role = "ADMIN"` for `demo-staff` in the fixture script and say so in the write-up.

**Authenticated requests, headlessly.** Sign in against the running preview, capture the session
cookie, reuse it. The vendor is resolved from the request host, so use `node:http` with
`{ setHost: false }` and set `Host` yourself — `fetch`/undici **silently drops a caller-set `Host`
header**, landing every request on `/coming-soon` and looking like a broken app. To drive a server
action, parse the rendered form's `<input>` **and** `<select>` elements whole, in document order, and
read `name`/`value` out of each — `$ACTION_REF_1` renders with no `value` attribute, and a parser
requiring `value="..."` drops it, producing a bare `500` with an empty body.

| Req | How to verify |
|-----|---------------|
| R1  | `grep -nE "getPrisma\|@prisma/client\|fetch\(\|cookies\(\|headers\(" lib/loyalty.ts` prints nothing outside comments. `npm run test -- loyalty` passes with `DATABASE_URL` unset. |
| R2  | Unit test asserts `MIN_PAYABLE_PENCE === 30` and `DEFAULT_MULTIPLIER_BPS === 10000` by value, imported from `@/lib/loyalty`. |
| R3  | Unit test: `eligibleSpendPence({subtotalPence:1000,discountPence:300}) === 700`; `({subtotalPence:1000,discountPence:0}) === 1000`; `({subtotalPence:300,discountPence:900}) === 0` (not `-600`). |
| R4  | Unit test asserts each of the five `(eligibleSpendPence, pointsPerPoundEarned, multiplierBps)` cases named in R4 by exact value. |
| R5  | Unit test: `computePointsEarned(99,1,10000) === 0`, `computePointsEarned(0,1,10000) === 0`, `computePointsEarned(-500,1,10000) === 0`. |
| R6  | Unit test: with `pointsExpiryMonths` `null`, `isLapsed` returns `false` for a `lastActivityAt` 10 years in the past; with any `pointsExpiryMonths`, `isLapsed(null, now, 12) === false`. |
| R7  | Unit test with a fixed `now`: `isLapsed(now − 12 months, now, 12) === false` and `isLapsed(now − 12 months − 1 day, now, 12) === true`. Construct both dates from the same `now` so the test is not clock-dependent. |
| R8  | Unit test: `visibleBalance(500, now − 13 months, now, 12) === 0` and `visibleBalance(500, now − 1 month, now, 12) === 500`. Then loop a table of inputs asserting `visibleBalance(...) === (isLapsed(...) ? 0 : balancePoints)`, deriving the invariant rather than restating the two constants. |
| R9  | Unit test loops a table of at least 12 `clampRedemption` inputs — spanning zero, below-minimum, over-balance, over-subtotal and the min-payable-floor cases — and asserts for **every** result that `discountPence === pointsSpent * pencePerPointRedeemed`. |
| R10 | Unit test: `requestedPoints` of `0`, `-50` and `10.5` each return `{pointsSpent:0,discountPence:0}`; and with `minRedeemPoints:100` a `requestedPoints:50` returns `{0,0}`. |
| R11 | Unit test: with `balancePoints:100` and `requestedPoints:5000`, `pointsSpent <= 100`; with `subtotalPence:200`, `balancePoints:10000`, `pencePerPointRedeemed:1`, `discountPence <= 200`. |
| R12 | Unit test asserts the exact case in R12: `{requestedPoints:10000, balancePoints:10000, pencePerPointRedeemed:1, minRedeemPoints:0, subtotalPence:100, deliveryFeePence:0}` returns `{pointsSpent:70, discountPence:70}`. Then a property loop over the R9 table asserting `subtotalPence - discountPence + deliveryFeePence >= 30` for every result. |
| R13 | Unit test with tiers `[{key:"SILVER",thresholdPence:5000,multiplierBps:12500},{key:"GOLD",thresholdPence:10000,multiplierBps:15000}]`: `resolveTier(t, 4999) === null`, `resolveTier(t, 5000).key === "SILVER"`, `resolveTier(t, 20000).key === "GOLD"`, `resolveTier([], 99999) === null`. |
| R14 | `grep -n "discountPence" lib/order-totals.ts` shows it in the `OrderTotals` interface and in the returned object. Unit test destructures `discountPence` from a `computeTotals` result. |
| R15 | Unit test loops a table of at least 8 `computeTotals` inputs (varying subtotal, discount, threshold and fee) asserting `subtotalPence - discountPence + deliveryFeePence === totalPence` for every result. |
| R16 | Unit test asserts the exact case in R16: threshold `3000`, lines summing to `3000`, discount `500` → `deliveryFeePence === 0` and `totalPence === 2500`. Also assert threshold `3000`, subtotal `2900`, discount `0` → `deliveryFeePence` equals the configured fee, so the row proves the *before-discount* ordering rather than just "free delivery works". |
| R17 | `git diff origin/staging -- tests/order-totals.test.ts` shows **no** modification to any pre-existing test case (added cases are fine, edited expectations are not). `npm run test -- order-totals` exits 0. |
| R18 | In the fixture script, call `placeOrder` for an Aheed cart whose subtotal is exactly `minimumOrderPence` while redeeming enough points to drop the total below it. The call **succeeds** (no `BELOW_MINIMUM`), and the created order's `discountPence` is non-zero. Then confirm the inverse still fires: a cart below `minimumOrderPence` with no redemption throws `CheckoutError` with code `BELOW_MINIMUM`. |
| R19 | `grep -n "model LoyaltyLedgerEntry\|model LoyaltyAccount\|model VendorLoyaltyTier\|enum LoyaltyEntryKind" prisma/schema.prisma` matches all four. The enum block contains exactly `EARN`, `REDEEM`, `REVERSAL` and no other value. |
| R20 | Read the `LoyaltyLedgerEntry` block: it declares `vendorId`, `userId`, `orderId`, `kind`, `points Int`, `tierKey String?`, `multiplierBps Int?` and `@@unique([orderId, kind])`. Confirm `points` is a plain `Int` with no `@default`, so a signed value is storable. |
| R21 | Read the two model blocks: `LoyaltyAccount` declares `@@unique([vendorId, userId])` plus `balancePoints`, `lifetimePoints`, `lastActivityAt`; `VendorLoyaltyTier` declares `@@unique([vendorId, key])` plus `thresholdPence`, `multiplierBps`. |
| R22 | `grep -n "discountPence" prisma/schema.prisma` shows `discountPence Int @default(0)` inside `model Order`. `git diff origin/staging -- prisma/schema.prisma` adds no other field to `model Order` (new back-relation lines from the new models are expected and are not new fields). |
| R23 | Read the `VendorConfig` block: all six fields present, `loyaltyEnabled Boolean @default(false)`, `pointsExpiryMonths Int?`, and every other numeric field carrying an `@default(...)`. |
| R24 | `ls prisma/migrations/` shows exactly one new directory vs `origin/staging`. Then, **against SQL statements only** — pipe through `grep -v '^\s*--'` first — `grep -c "DROP"` prints `0`, `grep -c "SET NOT NULL"` prints `0`, `grep -c "ALTER TYPE"` prints `0` (the new enum is a `CREATE TYPE`), and `grep -c "CREATE TABLE"` prints `3`. **Corrected at Build.** The original row grepped the whole file, and the migration's header comment explains *why* the migration contains no `DROP`, no `SET NOT NULL` and no `ALTER TYPE` — so the unfiltered greps each returned `1`, matching the rationale rather than a defect, and the only way to "pass" would have been to delete the most useful comment in the file. Same class as P4a's R5/R27 and P4b's R23. Stripping comment lines targets the syntax that would actually constitute the defect. |
| R25 | Before migrating, record `SELECT count(*) FROM "Order";`, `"OrderItem"` and `"OrderStatusEvent"`. Run `npm run db:migrate` (uses `DIRECT_URL`); it exits 0. Then `SELECT count(*) FROM "Order" WHERE "discountPence" <> 0;` returns `0`, and all three counts are unchanged. |
| R26 | `npx prisma migrate status` prints that the database schema is up to date, with no drift and no pending migrations. |
| R27 | Read `features/checkout/place-order.ts`: every `form.get(...)`/`required(...)`/`optional(...)` call names a contact, address or points field — no field named for a price, discount, subtotal or total. Reading the action is the authority here; a grep for "discount" would match the comment recording this rule. Then POST the real checkout form with an **added** `discountPence=9999` field: the created order's `discountPence` is unaffected by it. |
| R28 | Read the redemption block inside `placeOrder`'s `$transaction`: the balance it clamps against comes from a `tx.loyaltyAccount` read, not from `input`. Live: submit the checkout form with `redeemPoints` set to `balance + 5000`; the created order's `discountPence` equals the clamp of the **actual** balance, not the submitted number. |
| R29 | Read the `updateMany` in the redemption block: its `where` names `vendorId`, `userId`, `balancePoints: { gte: ... }` and a `lastActivityAt` comparison. Live: run the fixture with the account forced to `balancePoints = 0` and `redeemPoints` > 0 — the order is created with `discountPence = 0` and `SELECT count(*) FROM "LoyaltyLedgerEntry" WHERE "orderId"=<new>;` returns `0`. |
| R30 | After creating F2 with a redemption of N points: `SELECT kind, points, "orderId" FROM "LoyaltyLedgerEntry" WHERE "orderId"=F2;` returns exactly one row, `kind='REDEEM'`, `points = -N`. `LoyaltyAccount.balancePoints` fell by exactly N versus the value recorded immediately before. |
| R31 | Record the balance. Fire two `placeOrder` calls for F5-shaped carts **concurrently** with `Promise.all`, each redeeming the full balance. Afterwards `SELECT count(*) FROM "LoyaltyLedgerEntry" WHERE kind='REDEEM' AND "orderId" IN (<both>);` returns `1`, `SELECT "balancePoints" FROM "LoyaltyAccount" WHERE ...;` is `>= 0`, and the sum of the two orders' `discountPence` equals the single redemption's value. A genuine `Promise.all` race, not two sequential calls. |
| R32 | Create F4 as a guest with `redeemPoints` submitted as a large number. The created order has `discountPence = 0` and `SELECT count(*) FROM "LoyaltyLedgerEntry" WHERE "orderId"=F4;` returns `0`. |
| R33 | Call `placeOrder` for F3 (SriMart) as the same user, redeeming points they hold **at Aheed**. F3's `discountPence` is `0`, no ledger entry exists for F3, and the Aheed `LoyaltyAccount.balancePoints` is unchanged. |
| R34 | Set the account lapsed (**A-lapsed**), then place an Aheed order redeeming points. `discountPence` is `0` and no ledger entry is written. Restore `lastActivityAt` afterwards. |
| R35 | With SriMart's `loyaltyEnabled = false`, `GET /checkout` on the SriMart host as a signed-in shopper → the body contains no `name="redeemPoints"` input. Then POST that host's checkout form with `redeemPoints` added by hand: the created order's `discountPence` is `0` and no ledger entry exists. |
| R36 | Signed in as `demo-customer` on the **Aheed** host with a balance ≥ `minRedeemPoints`, `GET /checkout` → the body contains an `<input>` with `name="redeemPoints"` and renders the same number `visibleBalance` returns for that account. Then set the account's `balancePoints` below `minRedeemPoints` and re-request: the input is absent. |
| R37 | Call `confirmPayment(prisma, F1)`. `SELECT kind, points FROM "LoyaltyLedgerEntry" WHERE "orderId"=F1;` returns exactly one row with `kind='EARN'` and `points > 0`. Read `confirmPayment`: the ledger write sits between the `$transaction(` opening and its closing brace, alongside the `Order` update. |
| R38 | For F2 (which carries a discount), compute the expected value by hand: `computePointsEarned(subtotalPence - discountPence, pointsPerPoundEarned, multiplierBps)`. Confirm the F1/F2 `EARN` rows' `points` equal that expected number, and specifically that an order whose `deliveryFeePence` is non-zero earns nothing for it — verified by comparing two orders with identical subtotals and different delivery fees, which must earn identical points. |
| R39 | Call `confirmPayment(prisma, F1)` a second time. It returns `false`, `SELECT count(*) FROM "LoyaltyLedgerEntry" WHERE "orderId"=F1 AND kind='EARN';` still returns `1`, and `LoyaltyAccount.balancePoints` is unchanged from the value recorded after the first call. |
| R40 | Configure Aheed with two tiers and place/confirm an order whose eligible spend clears the higher threshold: the `EARN` row's `tierKey` equals that tier's key and `multiplierBps` equals its multiplier. Then place/confirm one below every threshold: `tierKey IS NULL` and `multiplierBps = 10000`. |
| R41 | Set **A-lapsed** with a known stale `balancePoints` (e.g. `500`). Place and confirm a new Aheed order earning `E` points. Afterwards `balancePoints = E` exactly (not `500 + E`), and `lastActivityAt` is within seconds of now. |
| R42 | With a non-lapsed account, record `balancePoints` and `lifetimePoints`. Place and confirm an order earning `E`. Both rose by exactly `E` and `lastActivityAt` advanced. |
| R43 | Confirm F4 (the guest order). `SELECT count(*) FROM "LoyaltyLedgerEntry" WHERE "orderId"=F4;` returns `0` and no `LoyaltyAccount` row was created. |
| R44 | Record the balance after F2's redemption of N. Call `failPayment(prisma, F2, "test")`. Afterwards `SELECT kind, points FROM "LoyaltyLedgerEntry" WHERE "orderId"=F2 AND kind='REVERSAL';` returns one row with `points = +N`, and `balancePoints` rose by exactly N. |
| R45 | Record every `LoyaltyAccount` row. Call `failPayment(prisma, F6, "test")` — F6 has no `REDEEM`. Afterwards no `REVERSAL` row exists for F6 and every `LoyaltyAccount` row is byte-for-byte unchanged. |
| R46 | Call `failPayment(prisma, F2, "test")` a second time. It returns `false`, `SELECT count(*) FROM "LoyaltyLedgerEntry" WHERE "orderId"=F2 AND kind='REVERSAL';` still returns `1`, and `balancePoints` is unchanged from the value recorded after R43. |
| R47 | `node:http` `GET /account/loyalty` with `Host` set and no cookie → the same status and `location` that `GET /account/orders` returns under the same conditions. Compare the two responses directly rather than asserting a remembered value. |
| R48 | Signed in as `demo-customer` on the Aheed host, `GET /account/loyalty` → `200`. The body contains the balance as rendered by `visibleBalance`, its pound value, the lifetime total, and either the tier name or the no-tier copy. Cross-check each number against `SELECT "balancePoints", "lifetimePoints" FROM "LoyaltyAccount" WHERE ...;`. |
| R49 | The same response body contains F1's and F2's ledger movements with their signs, newest first. It contains **no** entry belonging to another vendor — verified by inserting a SriMart ledger entry for the same user in the fixture and confirming its points value does not appear. Extract the rendered dates in body order and confirm they descend. |
| R50 | `GET /account/loyalty` on the **SriMart** host (`loyaltyEnabled = false`) as a signed-in shopper → `404`. |
| R51 | `GET /account/orders/{F2}` and `GET /checkout/{F2}` as F2's owner → both bodies contain a discount line showing F2's `discountPence`. `GET /account/orders/{F1}` (discount `0`) → the body contains no discount line. |
| R52 | `GET /staff/loyalty` as the vendor-`ADMIN` user → `200` with the config form present. As `demo-staff` (vendor `STAFF` only) → the staff-only refusal, and the body contains no `name="pointsPerPoundEarned"` input. As `demo-admin` (platform `ADMIN`) → `200`. |
| R53 | `grep -n "requireVendorRole" features/admin/*loyalty*` matches inside the action file itself. POST the config form's exact payload with **no `Cookie` header**, then with `demo-customer`'s session: after both, `SELECT * FROM "VendorConfig" WHERE "vendorId"=<aheed>;` is unchanged. Confirm the refusal is returned as data — the response is not a 500. |
| R54 | As the vendor admin, submit the form with each of the six fields changed to a new valid value. Re-query `VendorConfig` for Aheed: all six equal the submitted values. |
| R55 | Submit changed `thresholdPence` and `multiplierBps` for an existing tier; re-query `VendorLoyaltyTier` and confirm both persisted. Then confirm no create/delete control ships: the rendered `/staff/loyalty` body contains no add/delete tier button, and the action file exposes no code path that calls `create`/`delete`/`deleteMany` on `vendorLoyaltyTier`. Read the action to establish this — a grep for the word "tier" alone would match the comment recording the exclusion. |
| R56 | Replay the R53 payload with an added `vendorId=<srimart-id>` field, and again with an added tier `id` belonging to SriMart. After both, SriMart's `VendorConfig` and `VendorLoyaltyTier` rows are unchanged. Then submit the same payload from the **SriMart host** as a SriMart admin and confirm Aheed's rows are unchanged. **Reverse leg verified 2026-08-17 (#141)**, once `demo-srimart-admin@example.com` existed to make it possible — see that issue for why the verification method changed: a repository-level live check against staging (`vendorConfig.update({ where: { vendorId: <srimart-id> }, ... })` leaves Aheed's row's `updatedAt` untouched) rather than an interactive browser sign-in, which the assistant cannot perform even for a non-sensitive `@example.com` demo account. Combined with `tests/vendor-rbac.test.ts`, which already proves `requireVendorRole`'s `vendorId` has no path from submitted form data, this closes R56's concern in both directions. |
| R57 | Submit `pointsPerPoundEarned=-1`, then `pencePerPointRedeemed=0`, then `minRedeemPoints=abc`. Each returns an error message in the response body, and after all three `SELECT * FROM "VendorConfig" WHERE "vendorId"=<aheed>;` equals the values recorded before. |
| R58 | `npm run db:seed` exits 0. `SELECT "loyaltyEnabled" FROM "VendorConfig" v JOIN "Vendor" ON ... WHERE slug='aheed…';` is `true` and SriMart's is `false`. `SELECT count(*) FROM "VendorLoyaltyTier" WHERE "vendorId"=<aheed>;` is `>= 2`. Run `npm run db:seed` a second time: it exits 0 and the `VendorLoyaltyTier` and `VendorConfig` row counts are unchanged. |
| R59 | `git diff --name-only origin/staging -- app/ features/ components/` lists the slice's new files; for each, confirm it contains neither `@/lib/db` nor `@prisma/client`. `npm run lint` exits 0, which is where ADR-004 slice 2's no-direct-Prisma rule is enforced. |
| R60 | `grep -n "export async function" lib/repositories/loyalty.ts` shows the transactional functions taking `prisma` and `vendorId` as their first arguments. The fixture script calls them directly via `tsx` with no Workers context — R60 passing is a precondition for R29–R46, which all run through that script. Read each query in the file and confirm every `where` names `vendorId`. |
| R61 | Unit test (`vi.stubGlobal("fetch", spy)`, the pattern already in `tests/email.test.ts`): calling `sendOrderConfirmationEmail` for an order with `discountPence: 500` produces an HTML body containing a discount line with `£5.00`, and the three money lines it renders satisfy `subtotal - discount + delivery = total`; the same call with `discountPence: 0` produces a body containing no discount line. Live cross-check: confirm F2 (which carries a discount) under `npm run preview` and read the Resend attempt logged in the console. Assert the fetch spy is called exactly **once** per confirmation, so this row cannot pass by adding a second email. |
| R62 | `git diff origin/staging -- specs/architecture.md` is non-empty; the file states the identity `subtotal - discount + delivery = total`, and its multi-table-transaction bullet (currently "Order placement decrements stock…") names the points movement. `npm run kms:validate` exits 0 — the front-matter `version`/`updated` were bumped alongside. |
| R63 | `specs/decisions/ADR-005-payments-money-flow.md` contains a P5a implementation-note section naming `MIN_PAYABLE_PENCE` and stating the discount is applied before session creation. `git diff origin/staging -- specs/decisions/ADR-005-payments-money-flow.md` shows **no** change inside the `## Decision` section — the note is additive. `npm run kms:validate` exits 0. |
| R64 | `git diff origin/staging -- CHANGELOG.md` is non-empty and the new text sits under `## [Unreleased]`. Re-check this immediately before opening the PR: Gate 4's CI check diffs against the PR's **current** base, so another PR merging first can make an earlier diff vanish. |
| R65 | `npm run lint`, `npm run typecheck`, `npm run test`, `npm run format:check` each exit 0. On a Windows checkout, treat a `format:check` complaint as suspect until confirmed against the committed blob (`git show HEAD:<file>`) — `core.autocrlf` makes Prettier flag files that are clean on the Linux CI runner. CI's `gates` run is the authority. |
