# P5b — Discount codes: engine, checkout application & staff admin (build notes)

Issue **#145**. Built against `specs/2026-08-11-p5b-discount-codes/requirements.md` (66 requirements).
Implementation commit `51c3455`; spec commit `6e81350`.

## What changed and why

**`lib/discounts.ts` — the pure rules.** No I/O, so every refusal reason, the percentage/fixed
arithmetic and the clamp are unit-testable with no database (11 tests). `MIN_PAYABLE_PENCE` is
*imported* from `@/lib/loyalty` rather than redefined or moved: it is arguably a payments constant,
but ADR-005's P5a note names `lib/loyalty.ts` as its home in writing, and relocating it would
invalidate a published ADR note for a cosmetic gain.

**Schema — two tables, one enum, and `Order` untouched.** The migration
(`20260811175844_p5b_discount_codes`) is `CREATE TYPE` + two `CREATE TABLE` + indexes + FKs. No
`DROP`, no `ALTER TABLE "Order"`. P5a's decision to make `discountPence` generic is what made this
possible; the link from an order to its code lives on `DiscountRedemption.orderId`.

**`DiscountCode.remainingRedemptions` counts DOWN.** This is the single most important thing to
understand about the schema and it is not a stylistic choice. The natural shape,
`usedCount < maxRedemptions`, is a **column-to-column comparison**, which Prisma cannot express in a
`where` clause — and `CLAUDE.md` forbids reaching for `$queryRaw` in application code. Counting down
turns the guard into `remainingRedemptions: { gt: 0 }`, a literal-to-column comparison identical to
P3b's `quantity: { gte: qty }` and P5a's `balancePoints: { gte: n }`. Postgres arithmetic on `NULL`
is `NULL`, so an unlimited code decrements to unlimited and needs no branch in the write. The
"times used" figure the admin list shows is **derived** from `DiscountRedemption` via `_count`, so
no second number exists that can disagree with the first.

**`DiscountRedemption.seq` makes the per-customer cap structural.** A count-then-write is a race two
concurrent checkouts by the same shopper both win. `seq` holds that shopper's zero-based use index
under `@@unique([codeId, userId, seq])`: both concurrent claims compute `seq = 0`, and the database
refuses the second, rolling back its whole transaction including its `remainingRedemptions`
decrement. Guests carry a null `userId` and repeated `NULL`s do not collide in a Postgres unique
index — which is correct, because a code with a per-customer cap refuses guests outright.

**Checkout wiring (`lib/repositories/orders.ts`).** The claim happens first, against the
pre-discount subtotal, then `spendPoints` receives `existingDiscountPence` so points fill only the
headroom the code left. `computeTotals` is called once with the sum. `releaseOrder` now calls
`releaseCodeRedemption` beside `reverseRedemption`, so an abandoned checkout gives the use back.

**`clampRedemption` gained an optional `existingDiscountPence` defaulting to `0`.** Every P5a case in
`tests/loyalty.test.ts` runs unmodified and still passes, which is the proof the default reproduces
the old behaviour.

**Admin.** `/staff/discounts` (vendor-ADMIN, mirroring `/staff/loyalty`) with create, list and
deactivate. Both actions call `requireVendorRole("ADMIN")` themselves — a server action is a public
endpoint at a stable id, so the page's gate protects the page, not the endpoint.

**Seed.** One `WELCOME10` for Aheed (10% off, min £15, unlimited total, one per customer), none for
SriMart. Verified live on staging after seeding.

## Decisions taken during the build

- **An invalid code fails the checkout; an invalid points value does not.** The spec called for this
  and `plan.md` argues it, but the *implementation* shape was open: `discountCodeIntent` returns
  `null` for an empty field (not an error — no code is not a bad code), while anything non-empty and
  unusable raises `CheckoutError("DISCOUNT_CODE", …)`. Rejected: mirroring
  `redeemPointsIntent`'s swallow-everything posture, which would charge full price for an order the
  shopper believes is discounted.
- **`CheckoutError` gained a `DISCOUNT_CODE` code** rather than reusing `BELOW_MINIMUM` for the
  minimum-spend refusal. The two mean different things to a shopper (the *order* minimum vs the
  *code's* minimum) and collapsing them would produce a misleading message.
- **`DiscountClaimError` is a separate error class in the repository**, translated to `CheckoutError`
  at the call site in `orders.ts`. `lib/repositories/discounts.ts` importing `CheckoutError` from
  `orders.ts` would create an import cycle, since `orders.ts` imports the discount repository.
- **`releaseCodeRedemption` uses `findFirst({ where: { orderId, vendorId } })`, not `findUnique`.**
  `orderId` is unique so `findUnique` would work, but R26 requires every `where` in the file to name
  `vendorId`, and a vendor-less read has no place in this layer.
- **Unique-violation detection is `error.code === "P2002"` via a structural check**, not
  `instanceof Prisma.PrismaClientKnownRequestError`. Importing the client's error classes into a
  Workers-runtime module invites the same conditional-exports problem `CLAUDE.md` records for
  `@prisma/client` vs `@prisma/client/wasm`.
- **The seed's discount upsert has an empty `update` branch**, deliberately unlike the tier upsert
  directly above it, which *does* update. A tier threshold is pure configuration, so a re-seed
  resetting it to the declared baseline is intended; `remainingRedemptions` counts down as real
  shoppers use it, so rewriting it would silently refill a partly-claimed code and hand back uses
  that were already spent.
- **The checkout's discount field is always rendered**, unlike the loyalty section which is omitted
  when the vendor has loyalty off. There is no `discountsEnabled` flag to consult (see `plan.md`);
  hiding the field would leave a shopper holding a valid code with nowhere to type it.
- **Percentage values are entered as basis points in the admin form**, with the unit stated in the
  label, rather than as a percentage converted on submit. It matches `VendorLoyaltyTier.multiplierBps`
  and keeps one integer unit end to end; a conversion layer is where a factor-of-100 bug lives.

## Deviations from the spec

Three, all of which are **corrections made to the spec itself** during the build rather than
undocumented drift in the code. Each is committed in `51c3455` alongside the implementation.

1. **R5's fourth arithmetic case was wrong.** The spec asserted
   `computeCodeDiscountPence(999, 3333) === 333`; the correct floor of `332.9667` is **332**. The
   requirement now carries the corrected value and states why that case exists (it is the one that
   distinguishes flooring from rounding).
2. **R25 was unsatisfiable as written.** It required *every* exported writing function to take the
   Prisma client as its first argument. ADR-004 slice 2's ESLint guard forbids `@/lib/db` in the
   feature layer, so a server action cannot supply a client — which is exactly why P5a's
   `saveLoyaltySettings(vendorId, …)` has the shape it does. ESLint caught this at build. R25 is now
   scoped to the three **transactional** functions (`claimCode`, `recordCodeRedemption`,
   `releaseCodeRedemption`), where the testability the requirement exists for actually lives, and the
   admin path goes through `createCodeForVendor` / `deactivateCodeForVendor` wrappers that resolve
   Prisma internally.
3. **R19 grepped for the absence of a bare word.** It asserted `usedCount` does not appear in
   `prisma/schema.prisma` — but the model's doc comment uses the word twice, explaining why the
   column is absent and why the counter runs downward. Passing the check as written would have
   required deleting the rationale. This is the trap `specs/sdd-workflow.md` records P4a hitting
   twice; retargeted at `^\s*usedCount\s+Int`, the syntax that would actually constitute the defect.

## Known-shaky areas

Ranked by where I would look first.

1. **The per-customer race (R31) has never been run.** The `seq` + unique-index mechanism is
   reasoned, not observed: no concurrent same-shopper claim has been executed against real Postgres.
   The failure mode if it is wrong is a unique violation surfacing as a bare 500 rather than a
   refusal message, or — worse — both claims succeeding. Drive it with `Promise.all` and two carts.
2. **The global cap race (R29) is likewise unobserved.** More likely to be right (it is the exact
   `updateMany` shape used twice before), but it is the guarantee that matters most.
3. **`NULL` decrement/increment behaviour (R28, R33, R34) is asserted from Postgres semantics, not
   from a run.** If Prisma emits something other than `SET col = col - 1` for `decrement`, an
   unlimited code could acquire a number. Cheap to check and would be silently wrong.
4. **Stacking arithmetic end to end (R41).** The unit tests cover `clampRedemption` in isolation and
   `evaluateCode` in isolation; nothing has yet proven the *composition* produces `200 + 300 = 500`
   on a real order. R41's concrete numbers exist to catch a percentage computed after the points
   came off.
5. **Nothing in this slice has touched `npm run preview`.** Every live check so far was a `tsx`
   script against staging plus `next build`. The checkout form, the refusal message rendering (R35)
   and the whole `/staff/discounts` surface have been type-checked and built but never rendered.
6. **The admin cross-vendor replay (R56) must be run in BOTH directions.** #141 records P5a testing
   only one. The reverse direction — SriMart admin targeting Aheed's id — is the half that was
   missed last time.
7. **`format:check` is unreliable on this Windows checkout.** It flags 15 files, none of them this
   slice's; `lib/order-totals.ts`'s committed blob passes Prettier cleanly when checked inside the
   repo, and the working-tree copy has CRLF terminators from `core.autocrlf`. CI is the authority.
   (A first attempt to verify this by copying the blob to `/tmp` was meaningless — outside the repo
   `.prettierrc` does not apply, so Prettier ran at width 80 instead of 100.)
8. **The confirmation email's discount line (R52) cannot be proven at inbox level** — **#104**,
   inherited, unchanged by this slice.
