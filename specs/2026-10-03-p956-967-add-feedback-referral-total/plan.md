---
id: p956-967-add-feedback-referral-total-plan
title: "#956, #967 — Honest add-to-cart feedback and a checkout total that includes a pre-filled code (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-03
visibility: internal
summary: Add to cart reports what the server actually did (added, fewer, nothing) visibly and to screen readers, with per-product button names. Checkout previews a cookie pre-filled code without claiming it, so the total shown includes it. No schema change.
tags: [storefront, cart, checkout, discounts, accessibility, mobile, p10]
related: [discovery-log, p958-959-mobile-checkout-plan, p960-962-mobile-browse-density-plan]
---

# #956, #967 — Honest add-to-cart feedback and a checkout total that includes a pre-filled code (plan)

Third slice of the owner's mobile programme (`docs/research/discovery-log.md` 1.7.0, seventh
Discover pass). `#956` came from that pass; `#967` was found during `#958`/`#959`'s build. Gate 1
was approved on 2026-10-03 and is recorded as a comment on each issue.

**Goal:** a shopper is never told something went into the cart that did not, and a referred
shopper sees the price they will actually pay before they reach Stripe.

## Part A — `#956`, add-to-cart feedback

### What is wrong today (verified 2026-10-03)

- `addCartItem` (`lib/repositories/cart.ts`) returns `void`. It returns early, writing nothing,
  when stock is 0. When the cart already holds all the stock, `clampQuantity` returns the current
  quantity and the same value is written back. A request above stock is silently reduced. When the
  cart holds **more** than current stock (stock fell after the add), an add *lowers* the cart's
  quantity to stock.
- `AddToCartButton` (`components/cart/AddToCartButton.tsx`) sets `added` whenever `addToCart`
  resolves, so all of the above read "Added". A rejected call has no catch and reaches the route
  error boundary.
- The `card` variant ignores its `label` prop, so every card's button is named "Add". The pre-add
  −/+ buttons in the `card` and `drawer` variants are all named "Decrease quantity" /
  "Increase quantity".
- There is no live region.

### A finding made while writing this spec, which shapes the design

On a product card, a *successful* add never shows "Added" at all. `addToCart` calls
`revalidateCartSurfaces()` (`revalidatePath("/", "layout")`), the listing re-renders with the
product's new `cartQuantity`, and `ProductCard` swaps `AddToCartButton` for
`CartQuantityStepper` (`product.inStock && cartQuantity > 0`). The button unmounts before or as
its `setAdded(true)` runs. The same re-render turns a just-sold-out card's button into the
disabled "Out of stock" one. **So any feedback rendered inside the card's button is unmounted
before anyone can see or hear it.** A live region inside the button would be unmounted too, and a
newly mounted live region does not reliably announce its initial content.

That is why the proposal's "show the real result on the button" becomes two parts here:

1. **A shared cart-feedback region**, one per page, rendered by a provider mounted in
   `StorefrontChrome` (the same shape as the existing `QuickViewProvider`). It is
   `role="status"`, visible as a short message pinned to the bottom of the viewport, and it clears
   itself after 4 seconds. Every `AddToCartButton` variant reports its outcome there. It lives
   outside every product card, so the card's swap to the stepper cannot unmount it.
2. **Button text** for the two variants that do not swap: `drawer` (quick view) and `full`
   (product page). They keep showing the result on the button as well.

This is the approved behaviour ("report what actually happened, visibly and to screen readers"),
delivered where it can survive. It is called out here because it is a visible UI element the
proposal did not name.

### What is built

- **A pure outcome rule** in `lib/cart-rules.ts`: `classifyAdd(current, delta, stock)` returns
  the quantity to write (or none) and an `AddOutcome`:
  - `added`: the whole request went in.
  - `partial`: some went in, limited by stock.
  - `none` with a reason: `SOLD_OUT` (stock 0), `AT_STOCK_LIMIT` (the cart already holds at least
    all the stock), or `INVALID_QUANTITY` (a delta that is not an integer from 1 to 99, the
    picker's own bound).
  In every `none` case **nothing is written**, which removes the "add lowers the quantity"
  behaviour above.
  The type lives in this plain module, not in the `"use server"` file, because such a file may
  export only async functions.
- `addCartItem` returns the `AddOutcome`, computed inside its existing transaction from the
  quantity it reads there. `CartRepository.addItem`, `getCartRepository().addItem` and the
  `addToCart` server action return it too. `addToCart` validates `delta` before touching the
  repository.
- `AddToCartButton` takes a required `productName` prop, catches a rejected call as an `error`
  outcome, and sends one message per outcome to the shared region. The card's Add button uses
  `label` as its accessible name. The pre-add −/+ and the disabled "Out of stock" button name the
  product. The exact strings are in `requirements.md`.

### On the issue's open question (pre-add quantity picker)

Unchanged, by owner decision at Gate 1. `#961` already hides the picker below `sm`, and the card
already becomes `CartQuantityStepper` after the first add.

## Part B — `#967`, the checkout total and a pre-filled code

### What is wrong today

`app/(storefront)/checkout/page.tsx` pre-fills the code field from the `aheed_referral_code`
cookie but passes `0` as the discount to `computeTotals`. The summary and `#959`'s mobile total row
show the total before the code. `placeOrder` applies the code, so Stripe shows a lower amount than
the page did. Codes cannot be checked without being used: `claimCode`
(`lib/repositories/discounts.ts`) looks a code up, evaluates it and decrements
`remainingRedemptions` in one function.

Referral codes are ordinary `DiscountCode` rows (`ensureReferralDiscountCode`), created with
`maxPerCustomer: 1` and a £20 minimum. **So a guest holding a referral code is refused today**
(`SIGN_IN_REQUIRED`), and finds out only on submitting. Showing the refusal at render time fixes
that discovery point too, at no extra cost.

### What is built

- **`previewCode(db, vendorId, input)`** in `lib/repositories/discounts.ts`: the lookup, the
  per-customer use count and `evaluateCode`, with no write. `claimCode` calls it and then does
  only its compare-and-set decrement, so a preview and a real claim cannot disagree. The
  `seq`/`uses` split from `#696` moves into it unchanged. `getDiscountRepository()` gets a
  `preview` method.
- **The checkout page** previews the cookie's code, when one is present, against the
  pre-discount subtotal and delivery fee — the same figures `placeOrder` claims against. A valid
  code's discount goes into `computeTotals`. `CheckoutSummary` labels the line with the code. A
  refused code's `refusalMessage` is shown under the field. A preview that throws is treated as no
  cookie, so a database blip can never break checkout.
- **The code field becomes tracked** in `CheckoutForm`. The mobile total row shows the discounted
  total only while the field still holds the pre-filled code, after `normaliseCode`. Once the
  shopper edits it, the row shows the pre-discount total and today's note. The refusal message
  likewise shows only while the field holds the pre-filled code.

### A known limitation, accepted

`CheckoutSummary` is a Server Component, so on `md` and wider (where it sits beside the form and
the mobile total row is hidden) it keeps showing the pre-filled code's discount even if the
shopper edits the field. Its line is labelled with the code (`Discount (REF-…)`), so it says which
code the figure assumes, and `placeOrder` charges whatever code is actually submitted. Making the
summary react to the field means moving it into the client tree; that is not worth it for an
edited referral code.

## Deliberately excluded

- **Live checking of a code the shopper types.** Only the cookie's pre-filled code is previewed.
  An "Apply" button with a server round-trip is a larger feature, with no issue.
- **Loyalty points in the displayed total.** Points stay out of the shown total, as today. The
  note still says points come off before payment.
- **Self-referral.** `isSelfReferral` in `lib/referrals.ts` is defined but called nowhere, so a
  shopper's own `REF-` code is not refused. Observed while writing this spec; **file it as its own
  issue at `/build-notes`**, not fixed here.
- **`CartQuantityStepper`'s writes.** It already reverts on failure and names the product. Its
  `setQuantity` path is not `addCartItem` and is unchanged.
- **The guest token on a refused add.** `addToCart` issues a guest cookie before it knows whether
  anything is added (no `Cart` row is created). Existing, harmless, unchanged.
- **`#964`** (44px tap token on the remaining controls), **`#966`** (postcode autocomplete) and
  **`#968`** (shopper guide says codes go in the cart). These are separate mobile follow-ups.
- **`addCartItems`** (Shop your list's bulk add). It has its own review screen and is unchanged.

## Open items carried forward

- Real-device screen-reader checks (VoiceOver, TalkBack) of the announcement. This slice proves
  the region's role, placement and text in the DOM; how a given reader voices it is post-deploy
  evidence.
- The self-referral issue above, to be filed at `/build-notes`.
