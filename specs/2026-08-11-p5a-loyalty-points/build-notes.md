# P5a — Loyalty points: earn, redeem, tiers, expiry & admin config (build notes)

Issue **#135**. Branch `feature/p5a-loyalty-points`. Spec commit `dd28cad`, implementation `f2cc03d`.

**Nothing in this slice has touched a real database.** The migration is written but deliberately
**not applied** — see "Known-shaky areas". Everything below was proven by unit tests, `tsc`, and
`next build`; none of it has met Postgres.

## What changed and why

### The money seam is the whole design

`computeTotals(lines, rules, discountPence = 0)` in `lib/order-totals.ts` is the only place an
order's money is decided, and it is called once, inside `placeOrder`'s transaction. Adding the
discount there rather than anywhere else is what makes the rest of the slice small: `Order`,
`Payment.amountPence` and the Stripe session amount all derive from its result, so **`lib/payments.ts`
and `app/api/webhooks/stripe/route.ts` needed no change at all**. If a future reader wonders why a
payments-adjacent feature touched no payment code, that's why.

The identity `subtotal − discount + delivery = total` now holds for every result the function
returns, and `tests/order-totals.test.ts` asserts it across a table rather than at one point.

**Ordering that matters and isn't obvious from the code:** the free-delivery threshold and the
vendor's `minimumOrderPence` are both evaluated against the subtotal *before* the discount.
`placeOrder` computes `preDiscount` first for exactly this reason. A shopper who put £30 of goods in
a basket earned free delivery by buying them; spending points must not retract it, and must not push
an otherwise-valid order under the store minimum.

### `LoyaltyAccount` exists because a `SUM()` cannot be compare-and-set

The spec called for an append-only ledger, and `LoyaltyLedgerEntry` is one. But a balance derived by
summing it cannot be guarded against a concurrent spend, and every other contended resource in this
codebase is guarded the same way — P3b's `Inventory.quantity`, P4b's `Order.status`. So
`LoyaltyAccount.balancePoints` is the compare-and-set anchor and the ledger is the record of what
moved. That is precisely the existing `Inventory` + `OrderItem` pairing, one domain over. It is
**not** a cache of the ledger and should not be "simplified" into one.

### `spendPoints` + `recordRedemption` are two functions for one reason

The guarded debit must happen **before** the `Order` row is created — otherwise an order could be
written carrying a discount whose points the shopper turned out not to have. But the ledger row needs
an `orderId` that only exists afterwards. Hence the split, both halves inside `placeOrder`'s single
transaction so they commit or roll back together. This is the least obvious shape in the slice and
the comment in `lib/repositories/loyalty.ts` says so.

### Three movements, three existing transactions

| Movement | Where | Guard |
|---|---|---|
| `REDEEM` | `placeOrder` | conditional `updateMany` on `balancePoints`/`lastActivityAt`/`vendorId` |
| `EARN` | `confirmPayment` | behind its existing `count === 0` status guard |
| `REVERSAL` | `releaseOrder` | existing-row check, plus the unique index |

All three are backstopped by `@@unique([orderId, kind])`, so a duplicate Stripe delivery or a double
submit is refused by Postgres rather than by a check someone has to remember.

### Expiry needed no infrastructure

`isLapsed(lastActivityAt, now, months)` is a comparison, not a job. `wrangler.toml` still declares no
cron triggers. The consequence worth knowing: a lapsed account's stored `balancePoints` is
**deliberately stale** until its next earn, which *sets* rather than increments it. Three places
cooperate — the read zeroes it, the redemption guard refuses it, the earn resets it — and changing
any one alone will desynchronise them.

### Files added

`lib/loyalty.ts` (pure), `lib/repositories/loyalty.ts` (all DB access),
`app/(storefront)/account/loyalty/page.tsx`, `app/(storefront)/staff/loyalty/page.tsx`,
`components/staff/LoyaltyConfigForm.tsx`, `features/admin/loyalty-config.ts`,
`tests/loyalty.test.ts`, `tests/order-confirmation-email.test.ts`, and the migration.

### The confirmation email was a forced correction, not a feature

`features/checkout/send-confirmation.ts` renders Subtotal / Delivery / Total. The moment an order can
carry a discount those stop adding up, and the customer receives an email whose arithmetic is
visibly wrong. `tests/order-confirmation-email.test.ts` parses the money back out of the rendered
HTML and asserts the **reconciliation**, not merely that a discount string appears. P4b's status
emails render only the total and are untouched.

## Decisions taken during the build

- **`Order.discountPence` is generic, not `pointsDiscountPence`.** P5b's discount codes reduce the
  same total; a points-specific column would force a second column and a second arithmetic rule.
- **Points spent are derived back from the capped pence**, never the other way round. Capping the
  discount while debiting the requested points would silently charge for points that bought nothing.
  This is why `clampRedemption` returns a pair and why R9 asserts their exact relationship.
- **A non-integer `requestedPoints` is rejected outright, not floored.** It can only come from a
  tampered or malformed form; reinterpreting it is how a fractional-points bug becomes a balance.
- **`MIN_PAYABLE_PENCE = 30` lives in `lib/loyalty.ts`, not the payment adapter.** It is Stripe's GBP
  floor, but what it protects is the redemption rule. Recorded in ADR-005 because a future reader
  will look there first.
- **`pencePerPointRedeemed` has a floor of 1 in the admin form.** Zero would debit points for no
  discount and is a divisor in the clamp.
- **Eligible spend excludes both delivery and the discount.** Excluding the discount is the
  load-bearing half: without it redeemed points would re-earn points, a slow value leak with no
  obvious symptom.
- **`/staff/loyalty` is ADMIN-only, while `/staff/orders` admits STAFF.** Advancing an order is a
  packing-floor action; changing the earn rate is an owner decision with money attached. Matches the
  mockup, which gates its Loyalty Config tab on `permissionRole === 'admin'`.
- **Tier edits are keyed by `key`, not row `id`.** The key is already unique per vendor, so a
  submitted value cannot address another vendor's row even before the repository scopes the write.
- **The account page's loyalty link is conditional on `loyaltyEnabled`.** The first version always
  rendered it and let the page 404; a link to a 404 is worse than no link.
- **Seed upserts tiers with an `update` branch**, so a re-seed resets tuned values to the declared
  baseline. Intended for staging; called out because it is a real behaviour, not an oversight.
- **`getLoyaltyConfig` falls back to the schema defaults** when a vendor has no `VendorConfig` row,
  matching `fetchVendorProfile`'s deploy-before-seed posture rather than crashing a checkout.

## Deviations from the spec

**One, and it is a correction to the spec's own check rather than to the artifact.**

**R24's validation row was rewritten at Build.** It grepped the whole `migration.sql` for `DROP`,
`SET NOT NULL` and `ALTER TYPE` and required zero matches. The migration's header comment explains
*why* it contains none of those, so all three greps returned `1` — matching the rationale, not a
defect. The only way to "pass" as written would have been to delete the most useful comment in the
file. The row now strips comment lines (`grep -v '^\s*--'`) before counting, which targets the syntax
that would actually constitute the defect. Verified: `DROP: 0, SET NOT NULL: 0, ALTER TYPE: 0,
CREATE TABLE: 3`. Same class as P4a's R5/R27 and P4b's R23 — the third slice running to hit it, which
is itself worth noting.

No requirement was weakened, and no code was shaped to suit a check.

## Known-shaky areas

**1. The migration is unapplied, and that is deliberate.** R25 records `Order`/`OrderItem`/
`OrderStatusEvent` counts *before* migrating and compares after. Applying it during Build would have
destroyed the before-state. `npx prisma migrate status` currently reports
`20260811120000_p5a_loyalty_points` as the one pending migration. **Validation must apply it** — and
it is the largest migration since P3b (three tables, one enum, seven columns), so it is the row to
watch rather than an afterthought.

**2. Nothing has run against Postgres.** Every DB-touching claim in this slice is currently a claim.
Specifically unproven: that `spendPoints`'s `updateMany` WHERE composes correctly in real SQL
(`tests/orders.test.ts` asserts the *shape* of the `where` object against a hand-written double, not
its behaviour); that `@@unique([orderId, kind])` actually rejects a second EARN; that
`windowSpendPence`'s status filter matches what a real order set contains.

**3. The concurrency guarantee (R31) has never seen concurrency.** The unit test simulates a lost
race by making the double return `count: 0`. That proves the *handling* is right and says nothing
about whether the race is actually prevented. This needs a genuine `Promise.all` double-spend against
real Postgres — the same test that surprised P4b by passing.

**4. The lapse/reset triangle.** Read zeroes, guard refuses, earn resets. R41's "earn against a
lapsed account sets rather than increments" is the branch most likely to be wrong, and the one whose
failure is quietest — a shopper silently keeping points that should have expired. Exercise it with a
hand-set `lastActivityAt`, both sides of the boundary.

**5. `Tx` typing is structural, not verified.** `type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0]`
makes the loyalty functions accept either a client or a transaction client. It compiles; whether
Prisma's real interactive-transaction client satisfies every call site is a runtime question.

**6. Guest-order earning (R43) relies on `WebhookOrder.userId`,** newly added to
`findOrderForWebhook`'s select. If that select were wrong, guests would silently earn nothing —
which is also the correct behaviour, so a passing-looking result proves nothing here. Check a
signed-in order earns *and* a guest order doesn't, in the same run.

**7. The admin form's tier parsing pairs `tierKey` with `tierThresholdPence`/`tierMultiplierBps`
positionally.** `validation.md`'s preamble already warns that a `<select>` is a form field too and
that repeated fields must be serialised in document order — this form is exactly that shape. Two
tiers are seeded, so a positional bug would swap Silver's and Gold's numbers rather than erroring.

**8. `#104` still blocks end-to-end email.** R61 is provable structurally (rendered HTML, one send)
and **not** provable to a real inbox in any environment. Record it as such rather than as a pass.
