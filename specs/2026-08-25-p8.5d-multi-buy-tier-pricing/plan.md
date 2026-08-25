---
id: p8-5d-multi-buy-tier-pricing-plan
title: "P8.5d — Multi-buy Tier Pricing (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-08-25
visibility: internal
summary: Group multi-buy pricing ("3 for £10") as a per-product price, not a discount — exact integer arithmetic with remainder units at base price, honoured identically by the cart and by placeOrder, leaving the DiscountCode engine and its redemption audit trail untouched.
tags: [p8.5, pricing, cart, checkout, staff-panel, merchandising]
related: [p8-5c-curated-bundles-plan, p8-5a-product-card-upgrade-plan]
---

# P8.5d — Multi-buy Tier Pricing (plan)

## Why this slice exists

P8.5's brief asks for "Bulk Multi-Buy Tier Pricing" — badging such as *"Buy 2 × 5kg Basmati for
£16.50"*. The badge is trivial. The pricing does not exist: `DiscountKind` has exactly two members,
`DiscountCode` **requires** a code (`@@unique([vendorId, code])`, and `lib/discounts.ts:44`
normalises one on both the create and the lookup path), so there is no path that reduces a charge
without a shopper typing something.

P8.5c shipped its bundle cards with **no savings claim at all** for precisely this reason
(`lib/bundle-pricing.ts:9-16` says so in the file). This slice is the pricing mechanism that was
missing — though, per the scope ruling below, it is deliberately not yet wired to bundles.

**Goal:** a vendor can run an auto-applied multi-buy on a product, the shopper sees it on the card
and in the cart, and the checkout charges it — with the discounts engine untouched.

## The decision that most shapes this slice: a multi-buy is a PRICE, not a DISCOUNT

The obvious route is a codeless `DiscountCode` with a quantity predicate — that is how #348 was
originally written, and it is how #147 ("auto-applied promotions with no code entered") frames the
problem. **It was examined against the live engine at `/propose` (2026-08-25) and rejected** on three
independent counts, any one of which is disqualifying:

1. **`DiscountRedemption` has `@@unique([orderId])`** (`prisma/schema.prisma:819`). An order carries
   at most one redemption row. A shopper who types a valid code *and* qualifies for a multi-buy could
   not have both recorded. Widening that constraint means reopening the per-customer-cap concurrency
   guarantee `@@unique([codeId, userId, seq])` provides — the single most carefully-reasoned property
   in P5b (`lib/repositories/discounts.ts:146-151`).
2. **`evaluateCode` is subtotal-scoped, not line-scoped** (`lib/discounts.ts:110`). Every input it
   takes is an order-level figure. A quantity predicate on *one product* is not expressible in it at
   all — it would need a parallel evaluator that shares the name but not the shape.
3. **#348's own scope forbids it**: an auto-applied tier "must not create a second way to record a
   redemption that bypasses the transaction". #273 exists because two `DiscountRedemption` rows were
   once hand-inserted around that path and rendered a discount line on orders that were never
   discounted.

A multi-buy genuinely *is* a price. Modelling it as one means the discounts engine is not touched,
and — the part that makes this cheap — **`OrderItem` already stores `unitPricePence` and
`lineTotalPence` as separate columns** (`prisma/schema.prisma:617-619`). Today the second is
redundant, written as `line.unitPricePence * line.quantity` (`lib/repositories/orders.ts:318`). Under
this slice it becomes load-bearing and the per-order audit record already exists, with no schema
change to `OrderItem` at all.

## The arithmetic: group multibuy, remainder at base

Ruled by the human at `/propose`. A tier is **`groupQuantity` units for `groupPricePence`**. A cart
quantity divides into whole groups priced at the group total; leftover units charge `basePrice`.

```
qty 7, tier = 3 for £10.00, base £4.00
  2 groups × 3 units = £20.00
  1 remainder unit   =  £4.00
  line total         = £24.00   (vs £28.00 at base)   saving £4.00
```

**Chosen over a per-unit tier price ("buy 3+, each costs £Y") because it is exact at every
quantity.** "Buy 3 for the price of 2" on a £5 item is `groupPricePence = 1000`, exactly. The
per-unit model computes `1000 / 3 = 333p` and charges £9.99 — a penny short, on every group,
visibly, forever. Integer pence end to end, nothing rounds, nothing floors, matching CLAUDE.md's
money rule. The rejected model is recorded here because "why not just store a reduced unit price?"
is the first question any reader will ask.

**Consequence worth stating plainly:** a tiered line's effective unit price is fractional, so
`unitPricePence * quantity` is no longer the line total. Every place that computes line money has to
learn this, which is what R6–R10 are about.

## Stacking with discount codes

Ruled by the human at `/propose`: **tiers stack with codes, and the code applies to the
tier-reduced subtotal.** One rule — *tiers price the goods, codes discount the subtotal.* A 10% code
on a basket tiered to £16.50 takes £1.65.

This needs no new `CodeRefusalReason`, no better-of-two comparison, and no interaction logic, because
by the time `claimCode` runs the subtotal is already tiered. The two alternatives (code judged on the
pre-tier subtotal; tier suppressing codes outright) were presented and lost — the first makes a
code's face value disagree with the subtotal shown next to it, the second costs a new refusal reason
and a shopper-facing explanation of why their code "did nothing".

## The consequence this slice must state rather than let someone discover

**A tier lands *inside* the subtotal, so it shifts what `minimumOrderPence` and the free-delivery
threshold are judged against.** This is the opposite of how loyalty and codes behave.

`placeOrder` computes `preDiscount = computeTotals(lines, rules)` and checks the vendor minimum
against it (`lib/repositories/orders.ts:184-187`), with a comment explaining that both the minimum
and the free-delivery threshold are judged on *what the shopper bought*, not what they paid after
spending points. A tier is not a deduction from what they bought — it **is** what they bought it for.
So a tiered basket is judged on the tiered figure, and a shopper whose multi-buy drops them under the
vendor minimum is genuinely under it.

This is a deliberate consequence of the pricing model, not an oversight, and R11 pins it so a future
reader cannot mistake it for one.

## Scope (this slice)

- **New model `ProductPriceTier`**, vendor-scoped: `vendorId`, `productId`, `groupQuantity`,
  `groupPricePence`, `isActive`, `createdAt`/`updatedAt`; `@@unique([vendorId, productId])`,
  `@@index([vendorId, isActive])`. Migration generated by datamodel diff — no hand-authored DDL.
  - **Exactly one tier row per product**, enforced by the unique index. Two concurrent multi-buys on
    one product ("3 for £10" *and* "5 for £15") would make the line total an optimal-packing problem
    with more than one defensible answer; one row per product makes the arithmetic unambiguous by
    construction. Changing a multi-buy means editing the row — safe, because orders snapshot
    `lineTotalPence` and never recompute.
- **`lib/tier-pricing.ts`** — pure, DB-free, unit-tested, in the same shape as `lib/bundle-pricing.ts`,
  `lib/order-totals.ts`, `lib/cart-rules.ts` and `lib/discounts.ts`. Holds the group/remainder
  arithmetic, the never-charge-more-than-base clamp, and the saving figure.
- **`lib/repositories/product-tiers.ts`** — pure functions taking `prisma` and `vendorId` explicitly,
  with `lib/product-tiers-service.ts` as the sibling facade if a request-scoped one is needed.
  `tests/repository-purity.test.ts` enforces this whole-file at import level with no allowlist
  (#252 / P8.1b).
- **`computeTotals` gains an optional explicit line total** on `TotalsLine`, defaulting to
  `unitPricePence * quantity` so every existing caller is unchanged. `lib/order-totals.ts`'s own
  docstring calls it "the single place an order's money is decided" — extending it keeps that true,
  where computing tiered totals beside it would quietly make it false.
- **Cart honours the tier** — `lib/repositories/cart.ts:216-218` (`lineTotalPence`) and `:266`
  (`subtotalPence`).
- **Checkout honours the tier** — `placeOrder`'s line construction
  (`lib/repositories/orders.ts:170-177`), flowing into `computeTotals` and `OrderItem.lineTotalPence`.
- **`ProductCard` badge** — "3 for £10.00" when an active tier exists.
- **Cart line saving** — the applied per-line saving, shown where the shopper is deciding.
- **Staff configuration through the existing `ProductForm`**, not a new page — a tier is 1:1 with a
  product, so the product's own edit form is where it belongs (reuse before create).
- **Seed data for both vendors, SriMart included** — a one-vendor seed is exactly the gap that makes
  per-vendor rendering bugs invisible (#276).

## The failure mode this slice is most likely to ship

**Cart display and checkout compute line money on two entirely independent code paths** —
`lib/repositories/cart.ts:218` and `lib/repositories/orders.ts:318`. They agree today only because
both happen to write `unitPrice × quantity`. A tier applied to one and not the other produces a cart
that shows £24.00 and a card that charges £28.00, and **no unit test comparing either path to itself
would catch it**.

Both must consume the same `lib/tier-pricing.ts` function, and R9 verifies the two agree *live*
against a real basket under `npm run preview` rather than by reading the code. This is the row to
run first and trust least.

## Deliberately excluded

- **Bundle-scoped tiers.** Ruled out at `/propose`. A bundle expands into ordinary cart lines
  (P8.5c), so a bundle tier is a basket-matching problem — which units are "in" the bundle when the
  cart holds those products for other reasons too, what happens when the shopper edits one line
  down, what happens when two bundles share a product. That is a second engine on top of this one.
  **P8.5c's bundle cards keep showing a derived total with no savings claim**, exactly as they ship
  today. Tracked as its own issue at `/build-notes`.
- **Tier scheduling (`startsAt`/`endsAt`).** `isActive` only. Dates would re-open the vendor-timezone
  question that **#363** tracks — the vendor timezone is still a hardcoded constant, and P8.5f just
  finished fixing a campaign date bug caused by exactly that. Adding a second date-windowed entity
  before #363 is resolved buys a known bug.
- **Multiple concurrent tiers per product.** See the unique-index reasoning above.
- **Category-scoped or basket-wide tiers.** A tier attaches to one product.
- **#147, #146, #148, #149.** None are discharged — see below.
- **Reversal on refund or cancellation.** A tier is priced into `OrderItem.lineTotalPence`, so it
  needs no reversal path of its own; that must not be mistaken for having resolved **#151**, which
  stays blocked on ADR-005's undecided refund policy.
- **A tier badge on `DepartmentHero`'s spotlight product.** The hero renders its own price block
  (`components/layout/DepartmentHero.tsx:214-217`); adding a third price concept there is a
  merchandising decision this slice has no ruling for.

## This slice does NOT discharge #147 — and the roadmap says it does

`specs/roadmap.md:100` states that P8.5d "closes #147", and #348's body said the same in bold until
it was rewritten at `/propose`. **Both were wrong, and the roadmap line is corrected on this branch
(R20).**

#147's canonical example is *"10% off everything this weekend"* — an **order-level, discovery-based**
promotion inside the discounts engine, where the checkout queries for applicable active promotions
rather than looking one up by name. A product-scoped quantity tier that never touches `DiscountCode`
delivers none of that machinery.

What this slice *does* do is answer #147's three open questions for the quantity case, which makes
the remainder cheaper to build later:

| #147 asks | This slice's answer |
|---|---|
| What if two auto promotions both apply? | Unreachable — one tier row per product, one product per line. |
| Does an auto promotion stack with a typed code? | Yes; the code applies to the tier-reduced subtotal. |
| Does an auto promotion consume `remainingRedemptions`? | Not applicable — a tier is not a `DiscountCode` and writes no `DiscountRedemption`. |

This matters beyond bookkeeping: **#174/#214** is this repo's recorded accident where a closing
keyword inside a quotation closed an issue that had to stay open, and P8.1b's `plan.md` overstated a
phase closure that `/document` had to walk back. R21 exists so this slice's PR does not repeat
either.

## Open items carried forward

- **Whether a later slice absorbs #146** (discount codes scoped to a category or product) is
  unchanged by this one. P8.5c's `plan.md` recorded it as a `/spec` question for P8.5d; the answer is
  **no** — per-product *pricing* and per-product *code scoping* turned out to share no machinery,
  because this slice never touches `DiscountCode`. Recorded so the question is not re-asked a third
  time.
- **#363** (vendor timezone as a hardcoded constant) blocks tier scheduling, as above.
- **A staff view listing every active multi-buy across the catalogue.** Configuration lives on each
  product's form, so there is no one page answering "what am I currently running?". Deferred; it
  needs a UI decision and this slice already carries schema, pricing, cart, checkout, card and admin
  surfaces.
