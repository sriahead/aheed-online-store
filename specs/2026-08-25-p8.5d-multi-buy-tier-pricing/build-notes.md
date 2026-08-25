# P8.5d — Multi-buy Tier Pricing (build notes)

Build ran in the **main checkout** (`E:\GitRepositories\aheed-online-store`) on branch
`feature/p8.5d-multi-buy-tier-pricing`, cut from `origin/staging` at `c2564e9`. **No sub-agent
worktree was used** — `git worktree list` shows only the main checkout, and everything described
below is in this branch's history (`1dc2abb` spec, `c0c80f2` implementation).

## What changed and why

**`lib/tier-pricing.ts` (new) is the whole slice in one pure file.** Group/remainder arithmetic,
a clamp, a saving, and a threshold helper for the card badge. Every other change is plumbing that
routes an existing money path through it. It takes a structural `ProductTier` rather than a Prisma
row so a test, the seed and a repository can all hand it one.

**The clamp is not defensive padding.** `tieredLineTotalPence` returns
`Math.min(tiered, basePrice * quantity)`. Without it a staff typo — a group price *above* what the
units cost singly — would silently **overcharge a shopper for buying more**. The form refuses such
a tier too (`lib/catalogue-form.ts`), but form validation guards the typing path only; the clamp
guards every path, including a row written by the seed or by a future import.

**`ProductPriceTier`, one row per product**, enforced by `@@unique([vendorId, productId])` *and* a
bare `@unique` on `productId`. Both are needed and neither is redundant: Prisma refuses a 1-1
relation whose defining side is not itself unique (`P1012`, hit during the build), while the
composite is the index every vendor-scoped read actually queries through, since R12a requires
`vendorId` in the `where` rather than a bare `productId` lookup.

**`OrderItem` needed no schema change**, which was the pricing model's main payoff. It already had
`unitPricePence` *and* `lineTotalPence`; the latter was redundantly written as
`unitPricePence * quantity` (`lib/repositories/orders.ts:318` before this slice). It is now
independently load-bearing, and the two columns record different facts — what the product listed
at, and what the line actually charged. That is what makes an auto-applied multi-buy auditable
without inventing a second `DiscountRedemption` path (#273's lesson).

**`computeTotals` gained an optional `lineTotalPence` on `TotalsLine`.** The alternative — letting
callers compute tiered subtotals beside it — would have quietly falsified that function's own
docstring claim to be "the single place an order's money is decided". Absent means multiply, so
every pre-P8.5d call site is untouched; `tests/order-totals.test.ts` passes with **no existing case
modified**, which is R10's actual proof rather than a claim about it.

**Both money paths call the same function.** `lib/repositories/cart.ts`'s `decorate` and
`placeOrder`'s line construction are independent code paths over the same money — the slice's
biggest risk, called out in `plan.md` before any code was written. `placeOrder` reads tiers *inside*
its transaction, for the same reason it re-reads prices there: never trust what the page rendered.

**Persistent docs updated on this branch** (`specs/architecture.md`, 1.20.0 → 1.21.0): two new
bullets in §3.1 recording that `OrderItem.lineTotalPence` must never be re-derived from unit price
× quantity, and that a tier is a price rather than a discount — including the asymmetry that a tier
sits *inside* the subtotal the vendor minimum and free-delivery threshold are judged on, opposite to
codes and loyalty. `specs/roadmap.md` corrected per R21 (see Deviations).

## Decisions taken during the build

**Explicit tier queries rather than a `Product.priceTier` relation join.** The join would cost zero
extra queries and inherit vendor scoping for free from the already-scoped parent query. Explicit
reads were chosen anyway because this repo's tenant boundary is a *checkable* property, not an
inherited one: `tests/repository-vendor-scoping.test.ts` asserts that an exported function touching
a vendor-scoped model both takes a vendor id and uses it, and a relation join gives it nothing to
see. One extra indexed query per page buys a boundary that is provable rather than argued. The
reasoning is in `lib/repositories/product-tiers.ts`'s header so it is not re-litigated.

**Threaded `vendorId` through the private `findPage` helper.** It took a `Prisma.ProductWhereInput`
with `vendorId` buried inside it, which the tier lookup cannot read. Adding the explicit parameter
matches every other repository function's shape; the three call sites already had it to hand.

**Staff configuration on the existing product form, not a new `/staff` page.** A tier is 1-1 with a
product, so two number fields and a checkbox belong on that product's own form (reuse before
create). Its own `<section>` rather than more fields under "Price & stock", because "Was-price"
there marks *one unit* down and this prices a *group* — visually separating them is what stops an
admin reading them as alternatives. The cost is that nothing lists every running multi-buy at once;
filed as **#379** rather than improvised.

**Clearing both number fields deletes the row; unticking the checkbox keeps it.** Two distinct
intents, both reachable, because a seasonal multi-buy should be switchable back on without being
retyped. `updateProductForVendor` therefore branches to `upsertProductTier` or `deleteProductTier`
inside its existing transaction.

**Group quantity must be ≥ 2, refused in three places.** A "group" of 1 is a straight markdown,
which is what `Product.originalPrice` already is. The form explains it, `isTierApplicable` refuses
it, and `tierThresholdQuantity` returns null for it — so a bad row cannot price a line or advertise
a badge even if it reaches the database by some path the form does not cover.

**Seed fixtures chosen to differ deliberately.** Aheed gets "2 for £16.50" on Basmati — the P8.5
brief's own worked example, and evenly divisible. SriMart gets "3 for £35.00", which is **not**
divisible by 3, so a live check exercises the exact case a per-unit tier price could never represent
(`3500 / 3`). A one-vendor seed is the gap #276 exists for.

**`tests/orders.test.ts`'s fake Prisma returns an empty tier list by default.** So the 49
pre-existing cases keep asserting base-price totals unchanged rather than being adjusted to fit new
behaviour; the three new tiered cases opt in via `state.priceTiers`.

## Deviations from the spec

**One, and it is a correction the spec asked for rather than a departure from it.** R21 required
`specs/roadmap.md` to stop claiming P8.5d discharges #147. The roadmap now carries a fuller
correction than "delete the clause": it states what the claim was, why it was wrong (a per-product
quantity tier never touches `DiscountCode`, while #147's own example is order-level and
discovery-based), that #147/#146/#148/#149 all stay open, and what this slice *does* contribute —
answers to #147's three open questions for the quantity case. Written that way because a bare
deletion loses the reasoning, and #348's body previously carried the same wrong claim in bold, which
is exactly the text that gets copied into a PR body at `/ship`.

Nothing else deviates. Every requirement R1–R25 (plus R12a) was built as written.

## Known-shaky areas

**1. Cart display versus checkout — look here first.** These are two independent code paths
(`lib/repositories/cart.ts` and `lib/repositories/orders.ts`) over the same money. They now call the
same function, but **no unit test comparing either path to itself can prove they agree** — that is
precisely why R13 requires a live basket through `npm run preview` with the cart's displayed
subtotal compared against the `Order.subtotalPence` actually written. If anything in this slice is
wrong, this is where it will show.

**2. R15 (code stacking) was never exercised end to end.** The stacking behaviour is *structural* —
`claimCode` receives `preDiscount.subtotalPence`, which is now tiered, so a percentage code
necessarily computes from the tiered figure. But no test and no live run has actually placed an
order with both a tier and a discount code. Structural inevitability is an argument, not evidence.

**3. R20's SriMart half is unverified in this environment.** The seed creates tiers for both
vendors, but `SEED_SRIMART_HOST` and `SEED_AHEED_HOST` are unset locally, so SriMart is not seeded
at all and its `seedPriceTiers` call never ran. Aheed's tier seeded cleanly (`seeded 1 multi-buy
tier(s)`). No hostname was invented to force it — CLAUDE.md forbids inventing infrastructure.
Verifying this needs both env vars set against a database where a SriMart host is real.

**4. The `ProductCard` badge renders in a `.skew-card-price` container.** It carries that class so
the P8.5a counter-skew applies, matching the price row above it. Verified by build and by reading,
**not** by looking at a rendered page — R16/R17 need real rendered output, and per CLAUDE.md a
token/geometry change can look right in source and wrong in a browser.

**5. `migrate dev` is a trap on this repo right now (#378), unrelated to this slice.** A checksum
drift on `20260820200500_p8_image_needs_review` makes `prisma migrate dev` demand a full dev-DB
reset, whose only offered remedy destroys the seed data. This slice's migration was generated
read-only via `migrate diff` and applied with `migrate deploy`, which worked cleanly — the dev
branch is fully migrated and healthy. Use `npm run db:migrate`, not `db:migrate:dev`.

**6. The migration deliberately omits three `DROP INDEX` statements** that `migrate diff` emitted
for the `pg_trgm` trigram indexes. Applying them verbatim would have destroyed order and customer
search. The migration file names all three so a regeneration does not silently reintroduce them, and
`specs/architecture.md` §3.1 now records that its own warning about this fired for real.

## Deferred items, all tracked

- **#377** — bundle-scoped tiers (the basket-matching problem). P8.5c's bundle cards keep showing no
  savings claim until this is decided at its own `/propose`.
- **#378** — the `migrate dev` checksum drift above.
- **#379** — tier scheduling (blocked on **#363**, vendor timezone) and a catalogue-wide view of
  running multi-buys.

All three are on Project #2 with Phase `P8`.
