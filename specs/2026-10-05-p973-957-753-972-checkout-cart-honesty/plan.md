---
id: p973-957-753-972-checkout-cart-honesty-plan
title: "#973, #957, #753, #972 — Checkout and cart honesty (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-05
visibility: internal
summary: Checkout checks a typed discount code on Apply and shows points in the total, and the order summary follows both. A shopper's own referral code is refused. Reorder and unpaid-order cancel name what they could not put back. R14/R18 from #748 are driven live in a browser. No schema change.
tags: [storefront, checkout, cart, discounts, loyalty, referrals, p10]
related: [p956-967-add-feedback-referral-total-plan, p979-655-storefront-finish-plan, discovery-log]
---

# #973, #957, #753, #972 — Checkout and cart honesty (plan)

Sixth slice of the owner's mobile programme. Gate 1 was approved by the owner on 2026-10-04 and is
recorded as a comment on each of the four issues ("slice 6, Checkout and cart honesty"). It runs
after slice 5 (`#979`/`#655`, PR #984), which is on `staging`.

**Goal:** the total a shopper sees at checkout is the total they will pay, whatever code or points
they enter. And a basket rebuilt from a past or cancelled order says what it left out.

## Part A — `#972`, a shopper's own referral code

### What is wrong today (verified 2026-10-05)

- Referral codes are ordinary `DiscountCode` rows. `ensureReferralDiscountCode`
  (`lib/referrals-service.ts`) creates them with code `generateReferralCode(userId)` (`REF-` plus 8
  characters), description `Referral from user <userId>`, £5.00 off, £20 minimum,
  `maxPerCustomer: 1`.
- `previewCode` (`lib/repositories/discounts.ts`, since `#967`) never checks who owns a code.
  `claimCode` calls `previewCode`, so a signed-in shopper can redeem their own code once.
- `isSelfReferral`, `isUsersOwnReferralCode` and `extractReferrerUserId` (`lib/referrals.ts`) are
  defined and called nowhere.

### What is built

- A new `CodeRefusalReason`, `OWN_REFERRAL_CODE`, with its own message.
- `previewCode` selects the row's `description` and refuses when the code has the `REF-` shape
  (`extractReferralPrefix` is not null) **and** `extractReferrerUserId(description)` equals the
  claiming `userId` (`isSelfReferral`). The check runs straight after the lookup, before
  `evaluateCode`, so it outranks every other reason: no fix is open to the shopper, so telling them
  their basket is too small first would be misleading.
- `claimCode` calls `previewCode`, so `placeOrder` refuses the same code with the same message, and
  the checkout preview (Part B) shows it before submit.

**Why the description, not `isUsersOwnReferralCode`:** `generateReferralCode` keeps only the first 8
characters of the user id, so two users can derive the same code. `ensureReferralDiscountCode`
upserts with `update: {}`, so the row belongs to whoever created it first, and the description names
that person. Comparing the generated code would refuse the second user a code that is not theirs.
Requiring the `REF-` shape as well means an admin-made code whose description happens to start with
`Referral from user` is not affected.

A real foreign key for the owner would be cleaner, but it is a schema change, and the owner approved
the description route (the issue's first option).

## Part B — `#973`, live preview of a typed code and of points

### What is wrong today

`#967` previews only the code pre-filled from the referral cookie. A typed code is checked only on
submit. Points never appear in any shown total. The order summary (`CheckoutSummary`, a Server
Component) is beside the form from `md` up, and it keeps the pre-filled code's discount after the
shopper edits the field. The mobile total row (`[data-checkout-total]`) follows the field but falls
back to the pre-discount total with "comes off before payment" notes.

### What is built

1. **One shared preview function in `lib/`.** The page's module-level `previewPrefilledCode` moves
   to a request-scoped service module (`lib/`, not `lib/repositories/`). It takes a raw code and
   works out the rest itself: the cart identity, the cart summary, the fulfilment method, the
   shopper's delivery rules (the same `getShopperDeliveryRules` the page uses) and the signed-in user
   id. It previews against the pre-discount subtotal and delivery fee, as before. The page and the
   new action both call it, so the two cannot price a code differently. The page already has those
   figures, so on page load it reads the cart and delivery rules twice when a cookie code is
   present. That is a few extra reads on one route, and it buys a single pricing path, so the cost
   is accepted.
2. **A server action, `previewDiscountCode(code)`,** in a new `"use server"` file. It takes only the
   code string, so no money comes from the client. Its result type lives in a plain module, because
   a `"use server"` file may export only async functions.
3. **An Apply control** beside the code field. Pressing Enter in the field does the same thing and
   does **not** submit the order. Today, Enter in that field would place the order.
4. **One "checked code" result in the form's state**, starting from the page's pre-filled preview.
   It counts only while the field, normalised, still equals the checked code. That keeps the
   `#967` behaviour: editing the field drops the discount until the shopper applies again.
5. **Points in the total.** The points field becomes tracked. The discount shown is
   `clampRedemption` (`lib/loyalty.ts`, a pure module), called with the same inputs `spendPoints`
   gives it in `placeOrder`: the pre-discount subtotal and delivery fee, the balance the page already
   passes, and the current code's discount as `existingDiscountPence`. The `redeemable` prop gains
   `pencePerPointRedeemed`.
6. **The summary follows the form.** A small client provider wraps the form and the summary on the
   checkout page and holds the code result and the points request. `CheckoutSummary`'s money rows
   and total render from it. The item list does not change. The summary gets separate rows for the
   code (`Discount (CODE)`) and the points (`Points (N)`). This removes `#967`'s accepted limitation.
7. **A re-check when the basis changes.** The page re-renders from the server after a method switch,
   or after a cart change made from the header's drawer. The pre-discount subtotal or delivery fee it
   passes can then differ from the figures the checked code was priced against. When that happens,
   the form runs the action again for the checked code, and it shows the code as not yet applied
   until the answer arrives. Without this, a percentage code would keep a discount priced for the
   old basket.

### Why the client may compute the total

The shown total is `subtotal − (code + points) + delivery`, which is exactly `computeTotals` once
both discounts are clamped. Both clamps are the server's own pure functions: the code amount comes
from the server action, and the points come from `clampRedemption`. `placeOrder` still recomputes
everything from the database. A preview is a snapshot, not a hold: another checkout can take a
code's last use first, and `claimCode`'s compare-and-set stays authoritative.

### An accepted exposure

The action tells a caller whether a code exists, without needing a full checkout form. That oracle
exists today through `placeOrderAction`, which returns the refusal message. The new action still
needs a non-empty cart (it previews nothing without one). Codes are written to be shared, and there
is no rate limit on either path. Recorded here, not mitigated.

## Part C — `#957`, a notice when a reorder or a cancel puts back less

### What is wrong today

- `reorderItems` (`features/orders/reorder-items.ts`) drops lines whose product was deleted
  (`productId === null`), passes the rest to `addItems` and redirects to `/cart` with no message.
- `addCartItems` (`lib/repositories/cart.ts`) skips every product with no stock (inactive, out of
  stock, or not this vendor's) and clamps the rest with `clampQuantity`. It returns `void`.
  `clampQuantity` can also **lower** a line already in the cart when the cart holds more than the
  current stock. That is the same fault `#956` removed from the single add.
- `cancelOrder` (`features/checkout/cancel-order.ts`) puts an unpaid order's lines back through the
  same `addItems`, with the same silence.

### What is built

- **`addCartItems` returns a report:** one entry per merged product line, with `requested`, `added`
  and a `kind` (`added`, `partial`, `unavailable` or `at_limit`). It is computed inside the existing
  transaction from the quantity read there, so it describes the writes that really happen. The
  write rule changes in one way only: a line is never written at or below its current quantity. The
  four callers (bundle, Shop your list, reorder, cancel) all benefit. The bundle and list actions
  keep ignoring the return value.
  - This **reverses `P8.5c`'s choice** recorded in `features/cart/add-bundle-to-cart.ts`, which kept
    `addCartItems` returning `void` so as not to reshape a shared write path. That choice was right
    for one caller. With two more callers needing the same answer, a return value is cheaper than
    three copies of a stock pre-read, and a pre-read cannot see the quantity already in the cart.
    The bundle action's own pre-read and notice are **unchanged** here.
- **A plain module, `lib/restore-notice.ts`,** builds and parses the redirect URL. It reuses the
  bundle notice's approach: the state travels in the query string, so it needs no cookie, no table
  and no expiry. The format is fixed in `requirements.md` so a validator can build a URL by hand.
- **`reorderItems` and `cancelOrder`** turn the report, plus any deleted-product lines (reported as
  unavailable, under their order-snapshot `productName`), into that URL. When everything went in,
  they redirect to plain `/cart`, as today.
- **`/cart` renders the notice** through a new `RestoreNotice` component, beside the existing bundle
  notice, which is unchanged.

**Query-string spoofing, accepted as in `P8.5c`:** anyone can link to `/cart?restored=…` with names
of their choosing, and the notice will show them. React escapes the text, so this is content, not
markup. The parser caps the entry count and name length so such a link cannot fill the page.

**Not substitutes.** Offering a replacement product overlaps with `#606` and is larger than this
slice. Gate 1 approved the notice only.

## Part D — `#753`, R14 and R18 driven in a real browser

`#748`'s R14 (typed contact fields survive a Delivery/Click & Collect switch at checkout) and R18 (a
new postcode does not force Click & Collect back to Delivery) were checked by reading the code and
with curl, never in a browser. This slice changes `CheckoutForm` again (a tracked code field, a
tracked points field, a new provider around it), so it is the right place to drive both live. The
R14 check is widened to cover the new state: a typed and applied code must also survive the switch,
re-checked against the new delivery fee.

If either fails, the defect is fixed in this slice, through `/fix`, as `#753` says.

## Deliberately excluded

- **Substitutes for unavailable reorder lines** (`#606` territory), as above.
- **A schema foreign key for a referral code's owner.** It needs a migration and was not approved.
- **Rate-limiting code checks.** See "An accepted exposure".
- **The bundle notice's own text and its pre-read** in `add-bundle-to-cart.ts`. They are not
  migrated to the new report. A later tidy-up can do that.
- **Shop your list's review screen.** It ignores the new report. It already shows availability
  before the add.
- **The order number in the reorder notice heading.** The shopper has just pressed Reorder on that
  order's page, and carrying it would add a parameter for no new information.
- **Holding a code between the preview and payment.** `claimCode` decides at submit, as today.
- **`#981`, `#982`, `#983`** (slice 5 follow-ups) and **`#955`** (slice 7).

## Open items carried forward

- **Live points proof depends on the dev data.** The dev database's demo shopper must hold a
  balance at or above the vendor's `minRedeemPoints`. There is no staff control for granting points.
  If the balance is too low, the live points row is reported as unverified, and the component test
  (R13) is the only proof. It must not be counted as a pass.
- **Real-device checks** (iOS Safari, Android Chrome) of the Apply control and the Enter key are
  post-deploy evidence. No issue tracks them.
