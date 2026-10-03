# #956, #967 — Honest add-to-cart feedback and a checkout total that includes a pre-filled code (requirements / acceptance criteria)

Closes `#956` and `#967`, the third slice of the mobile programme (`plan.md`; Gate 1 recorded on
both issues, 2026-10-03). Part A makes every add-to-cart control report what the server actually
did, visibly and through one shared `role="status"` region, and gives each control a per-product
accessible name. Part B previews the cookie's pre-filled discount code at checkout without claiming
it, so the total shown includes it. No schema change, no migration, no new dependency.

**Conventions used below.** `{name}` is the product's name exactly as the product record holds it.
`{CODE}` is the code after `normaliseCode` (trimmed, upper-cased). Money is rendered by the existing
`formatPrice` (for example `£3.00`). "The region" means the shared cart-feedback element of R9.
"Preview" means `npm run preview` against the dev database, never `npm run dev`.

## Part A — add-to-cart outcome (server)

R1. `lib/cart-rules.ts` exports a type `AddOutcome` and a pure function
    `classifyAdd(current: number, delta: number, stock: number)`. It returns the quantity to write,
    or `null` for no write, together with an `AddOutcome`, as follows:
    (a) `delta` not an integer, below 1 or above 99: no write, `{ kind: "none", reason: "INVALID_QUANTITY" }`.
    (b) `stock <= 0`: no write, `{ kind: "none", reason: "SOLD_OUT" }`.
    (c) `current >= stock`: no write, `{ kind: "none", reason: "AT_STOCK_LIMIT", inCart: current }`.
    (d) `current + delta <= stock`: write `current + delta`,
        `{ kind: "added", added: delta, inCart: current + delta }`.
    (e) otherwise: write `stock`,
        `{ kind: "partial", added: stock - current, requested: delta, inCart: stock }`.
    `lib/cart-rules.ts` still imports nothing from `lib/db`.

R2. `addCartItem` in `lib/repositories/cart.ts` returns `Promise<AddOutcome>`, computed by
    `classifyAdd` from the stock it reads and the existing quantity it reads inside its
    `$transaction`. When `classifyAdd` returns no write, `addCartItem` makes no `cartItem.upsert`
    call. Specifically, when the cart already holds more than current stock, the cart's quantity is
    left unchanged (today it is lowered to stock).

R3. `CartRepository.addItem` (`lib/repositories/cart.ts`) and `getCartRepository().addItem`
    (`lib/cart-service.ts`) return `Promise<AddOutcome>`. `addToCart` in
    `features/cart/add-to-cart.ts` returns `Promise<AddOutcome>`. When `delta` fails R1(a), it returns
    `{ kind: "none", reason: "INVALID_QUANTITY" }` without calling the repository.
    `features/cart/add-to-cart.ts` still exports only async functions.

R4. `addCartItems` (Shop your list), `setCartQuantity` and `CartQuantityStepper` are unchanged:
    `git diff origin/staging -- components/cart/CartQuantityStepper.tsx` is empty, and the
    `addCartItems` and `setCartQuantity` function bodies in `lib/repositories/cart.ts` are textually
    unchanged.

## Part A — add-to-cart feedback (UI)

R5. `AddToCartButton` takes a required `productName: string` prop, and all three call sites pass
    the product's name: `ProductCard.tsx`, `QuickViewDrawer.tsx` and
    `app/(storefront)/products/[slug]/page.tsx`.

R6. Accessible names, in every variant that renders the control:
    (a) the `card` variant's Add button has `aria-label` equal to its `label` prop, which
        `ProductCard` passes as `Add {name} to cart`;
    (b) the pre-add quantity buttons in the `card` and `drawer` variants are named
        `Decrease quantity of {name}` and `Increase quantity of {name}`;
    (c) the disabled out-of-stock button in the `card`, `drawer` and `full` variants has
        `aria-label` `{name} is out of stock`. Its visible text stays `Out of stock`.
    The `icon` variant is unchanged.

R7. The region receives exactly one message per click of an add button, chosen by outcome:
    | Outcome | Message |
    |---|---|
    | `added` | `Added {name} to your cart ({inCart} in cart).` |
    | `partial` | `Only {added} of {requested} {name} added. That's all we have in stock ({inCart} in cart).` |
    | `none` / `SOLD_OUT` | `{name} is sold out. Nothing was added.` |
    | `none` / `AT_STOCK_LIMIT` | `Your cart already has all the {name} we have in stock ({inCart}). Nothing was added.` |
    | `none` / `INVALID_QUANTITY` | `{name} couldn't be added. Please try again.` |
    | the action rejects | `{name} couldn't be added. Please try again.` |

R8. Button text for the `drawer` and `full` variants after a click, by outcome. `added` shows
    today's text (`Added to cart` for `drawer`, `Added` for `full`) for 1500 ms. `partial` shows
    `Only {added} added`. `SOLD_OUT` shows `Sold out`. `AT_STOCK_LIMIT` shows `All in cart`.
    `INVALID_QUANTITY` and a rejected action show `Try again`. Each non-`added` text shows for
    4000 ms. Afterwards the button returns to its normal label. The `card` variant's visible text
    shows `Added` only for an `added` outcome, never for any other outcome.

R9. A rejected `addToCart` call is caught inside `AddToCartButton`. It produces R7's and R8's
    rejection text and does not reach a route error boundary, and the button is enabled again
    afterwards.

R10. The region is one element carrying `data-cart-feedback`, `role="status"` and
     `aria-atomic="true"`. It is rendered by a provider component that `StorefrontChrome.tsx`
     renders exactly once, wrapping the same subtree `QuickViewProvider` wraps. It is not rendered
     inside `ProductCard`, `AddToCartButton` or `QuickViewDrawer`. It stays in the DOM when empty.
     When empty it has no text and no visible box: its rendered height is 0, or it carries an
     `sr-only` class. It is `position: fixed` near the bottom of the viewport. It shows its latest
     message, and a new message replaces the previous one. It empties 4000 ms after its latest
     message.

R11. `scripts/verify-mobile-layout.ts` additionally prints, for each width, `documentScrollWidth`
     (`document.documentElement.scrollWidth`). With `--add-first` it also prints `cartFeedback`:
     the region's text and its `left`/`right`, read as soon as the region has text after the
     click (polled for up to 10 s, since the text appears only once the server action returns). Its `--add-first`
     click still finds the first card's Add button. Run at width 360 with `--add-first` against a
     category page in preview, it reports a non-empty `cartFeedback.text`, `cartFeedback.left >= 0`,
     `cartFeedback.right <= 360` and `documentScrollWidth <= 360`.

## Part B — preview a pre-filled code at checkout

R12. `lib/repositories/discounts.ts` exports `previewCode(db, vendorId, input)`, taking the same
     `code`, `userId`, `subtotalPence`, `deliveryFeePence` and optional `now` fields as
     `ClaimCodeInput`. It returns either `{ ok: false, reason: CodeRefusalReason }` or
     `{ ok: true, codeId, discountPence, seq }`. It performs reads only: no `create`, `update`,
     `updateMany`, `upsert`, `delete` or `deleteMany` call on any model.

R13. `claimCode` obtains its lookup, `seq`/`uses` counts and evaluation by calling `previewCode`.
     Its only remaining database work is the `remainingRedemptions` compare-and-set `updateMany`.
     `git diff origin/staging -- tests/discounts-repository.test.ts` is empty, and that file passes.

R14. `getDiscountRepository()` in `lib/discounts-service.ts` has a
     `preview(input): Promise<PreviewResult>` method. It calls `previewCode` with `getPrisma()` and
     the current vendor id. `tests/repository-purity.test.ts` and
     `tests/repository-client-injection.test.ts` pass.

R15. `app/(storefront)/checkout/page.tsx`, when the `aheed_referral_code` cookie holds a non-empty
     value after trimming, previews it with the signed-in user's id (`null` for a guest), against
     `subtotalPence` and `deliveryFeePence` from `computeTotals(lines, rules, 0, method)`. When the
     preview is `ok`, the page's totals are `computeTotals(lines, rules, discountPence, method)`.
     Otherwise they are the pre-discount totals. A throwing preview is caught: the page renders the
     pre-discount totals and no refusal message. The minimum-order and free-delivery banners are
     computed from the pre-discount subtotal, as today.

R16. With an `ok` preview, `CheckoutSummary` shows a discount line labelled `Discount ({CODE})`
     with amount `−{discountPence}`, and its `[data-checkout-summary-total]` shows
     `subtotal − discount + delivery`. Without a preview, or with a refused one, the summary renders
     exactly as today.

R17. `CheckoutForm`'s code input keeps `name="discountCode"`, `id="discountCode"` and its initial
     value from the cookie. Its current value is tracked in component state. The pre-filled code
     "matches" while `normaliseCode(currentValue)` equals `{CODE}`. Below `md`:
     (a) with an `ok` preview and a match, `[data-checkout-total]` shows the discounted total and
         a line `Includes code {CODE} (−{discountPence}).`; when the shopper also has redeemable
         points, a second line `Any points you use come off before payment.`;
     (b) with no preview, a refused preview, or no match, `[data-checkout-total]` shows the
         pre-discount total and today's note text, unchanged.

R18. With a refused preview and a match, an element `[data-discount-code-note]` directly under the
     input shows `refusalMessage(reason)` for that reason, and the input's `aria-describedby`
     references it. With no match, or no refused preview, the element is absent.

R19. Rendering `/checkout` with a pre-filled code does not change that code's
     `remainingRedemptions` or create a `DiscountRedemption` row. Submitting the checkout still
     claims the code through `claimCode` exactly as today.

## Tests

R20. A test file exercises `classifyAdd` for every branch of R1, including a delta of 0, 100 and
     1.5, and `current > stock`.

R21. A test file drives `addCartItem` with fake clients and asserts that it returns the R1
     outcome, and that it makes no `cartItem.upsert` call for `SOLD_OUT`, `AT_STOCK_LIMIT`
     (including `current > stock`) and `INVALID_QUANTITY`.

R22. A component test renders `AddToCartButton` with `addToCart` mocked, under the cart-feedback
     provider. For each outcome row of R7 it asserts the region's text, and for the `full` variant
     R8's button text. It covers a rejected call (R9), and asserts the `card` variant's Add button
     name (R6a).

R23. A test file asserts R12: `previewCode` returns the same `ok`/`reason`/`discountPence` as
     `claimCode` for each of these: unknown code, inactive, expired, below minimum, guest with a
     per-customer cap (`SIGN_IN_REQUIRED`), customer limit reached, and a valid code. Its fake
     client throws on any write method, and `previewCode` still resolves.

R24. A component test renders `CheckoutForm` with an `ok` pre-filled preview. It asserts R17(a)'s
     total and line, then R17(b)'s pre-discount total after the input changes to another value,
     then R17(a) again after the input changes back to the code in lower case. With a refused
     preview it asserts R18.

## Live proof (preview, dev database)

R25. In preview, a product with stock 2 shows, via the quick-view drawer:
     (a) quantity 5: `Only 2 of 5 {name} added. That's all we have in stock (2 in cart).` in the
         region, and the cart holds 2;
     (b) adding 1 more: the `AT_STOCK_LIMIT` message, and the cart still holds 2;
     (c) the product's stock set to 0 from `/staff/inventory` in a second tab, then adding from the
         still-open first tab: `{name} is sold out. Nothing was added.`, with the cart unchanged.

R26. In preview, on a category page at a desktop width, clicking a card's Add for an in-stock
     product not in the cart puts `Added {name} to your cart (1 in cart).` in the region, and the
     card then shows `CartQuantityStepper`. The fetched HTML of that category page has one
     `aria-label="Add … to cart"` per in-stock card not in the cart, and no two are identical.

R27. In preview, as a guest with a cart whose subtotal is at least £5.00 and a code `SPEC967A`
     (created at `/staff/discounts`: fixed £3.00, no minimum, no per-customer cap, 5 uses), visiting
     `/?ref=SPEC967A` then `/checkout` shows R16's `Discount (SPEC967A)` line of `−£3.00`. Both
     `[data-checkout-summary-total]` and `[data-checkout-total]` show `subtotal − 300 + delivery`.
     After `/checkout` has been loaded three times, the `/staff/discounts` row for `SPEC967A` still
     reads `0 used · 5 left`.

R28. In preview, as a guest with code `SPEC967B` (fixed £3.00, `maxPerCustomer` 1), `/checkout`
     shows `Please sign in to use that discount code.` under the field and the pre-discount total.
     Signed in as a dev demo shopper who has not used `SPEC967B`, the same cookie shows the
     `−£3.00` discount.

R29. In preview, submitting the R27 guest checkout with `SPEC967A` creates an order whose total,
     as shown on `/staff/orders` for that order, equals the `[data-checkout-total]` figure displayed
     just before submitting. The `SPEC967A` row then reads `1 used · 4 left`.

## Documentation and gates

R30. `docs/shopper-help/shopping-guide.md` states, in its cart/checkout material, that adding to
     the cart confirms how many were actually added (including when fewer or none were), and that
     a code pre-filled from a referral link is shown in the checkout total, or its reason for not
     applying is shown under the field.

R31. `docs/developer-portal/app-conventions.md` has a section stating that add-to-cart feedback is
     reported through the shared cart-feedback region (`data-cart-feedback`) and not only inside
     the button. It gives the reason: `ProductCard` swaps the button for `CartQuantityStepper` on
     the re-render that follows a successful add.

R32. A follow-up issue exists for self-referral not being refused (`isSelfReferral` is called
     nowhere). It is on Project #2 with Phase P10 and Status Backlog, and this slice's
     `build-notes.md` cites it.

R33. `npx vitest run tests/vendor-neutral-copy.test.ts` passes. No new user-facing string names
     a vendor or a grocery item.

R34. `npm run kms:validate` exits 0. `npm run kms:check-generated` exits 0. And
     `npm run kms:assemble:internal` followed by `npx next build --webpack` in `kms/site-internal`
     exits 0, read from the build's own exit status, not through a pipe.

R35. `CHANGELOG.md` has an entry naming #956 and #967 (Gate 4).

R36. `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm run build` exit 0.
     `npx vitest run`, run alone, exits 0, and its summary reports no file that failed to start.
