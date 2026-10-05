# #973, #957, #753, #972 — Checkout and cart honesty (requirements / acceptance criteria)

Slice 6 of the owner's mobile programme. Gate 1 was approved on 2026-10-04 and is recorded as a
comment on each issue. It builds on `#967` (`specs/2026-10-03-p956-967-add-feedback-referral-total/`),
which added `previewCode` and the pre-filled code preview. In one line: checkout checks a typed code
on Apply and shows points, and the summary follows both. A shopper's own referral code is refused.
Reorder and unpaid-order cancel name what they could not put back. `#748`'s R14 and R18 are driven
live. `plan.md` holds the reasoning.

"The checkout page" is `app/(storefront)/checkout/page.tsx`. "The form" is
`components/checkout/CheckoutForm.tsx`. "The summary" is `components/checkout/CheckoutSummary.tsx`.
`£x.xx` means `formatPrice` output (`components/product/format-price.ts`). `−` is U+2212, as in the
existing summary and total row. A string in backticks is exact, including its final punctuation.
`{…}` marks a value filled in.

## Part A — `#972`, own referral code

R1. `CodeRefusalReason` in `lib/discounts.ts` includes `"OWN_REFERRAL_CODE"`, and
    `refusalMessage("OWN_REFERRAL_CODE")` returns `You can't use your own referral code.`. No other
    reason's message changes.

R2. `previewCode` in `lib/repositories/discounts.ts` returns `{ ok: false, reason:
    "OWN_REFERRAL_CODE" }` when all three hold: (a) `extractReferralPrefix(normalisedCode)` is not
    `null`; (b) `extractReferrerUserId(row.description)` is not `null`; (c) `isSelfReferral(that id,
    input.userId)` is `true`. The check runs after the row is found and before `evaluateCode`, so it
    takes precedence over every `evaluateCode` reason, including `INACTIVE` and `EXPIRED`.
    `claimCode` reaches the same refusal through `previewCode`, writes nothing for it, and
    `placeOrder` raises a `CheckoutError` carrying R1's message.

R3. `previewCode` does not refuse with `OWN_REFERRAL_CODE` in these cases, and its result is the one
    it gave before this slice: (a) a `REF-` code whose description names a different user; (b) any
    code with `input.userId === null`; (c) a code without the `REF-` shape whose description starts
    with `Referral from user ` followed by the claiming user's id.

R4. No file under `prisma/` changes, and no migration is added.

## Part B — `#973`, typed code and points

R5. A request-scoped function in a `lib/` module outside `lib/repositories/` (for example
    `lib/checkout-preview-service.ts`) takes one raw code string. It returns `null` when the
    normalised code is empty, or when the shopper's cart is empty or has a merge pending. Otherwise
    it resolves the cart identity, the cart summary, the fulfilment method, `getShopperDeliveryRules`
    and the signed-in user id itself. It computes `computeTotals(lines, rules, 0, method)` and calls
    `getDiscountRepository().preview` with that subtotal and delivery fee. It returns
    `{ code, ok: true, discountPence }` or `{ code, ok: false, message: refusalMessage(reason) }`,
    where `code` is normalised. If the preview throws, it logs with `console.error` and returns
    `{ code, ok: false, message: "We couldn't check that code just now. It will be checked again
    when you continue to payment." }`.

R6. The checkout page gets its pre-filled code preview from R5's function. The page no longer
    defines `previewPrefilledCode`, and nothing else in `app/`, `features/` or `components/`
    previews a code. A thrown preview on page load still never breaks checkout: the page renders,
    and the field shows R5's fallback message.

R7. A new file `features/checkout/preview-code.ts` starts with `"use server"`. Its only export is
    `export async function previewDiscountCode(code: string)`, which returns R5's result. Its
    argument is the only client input. It reads no subtotal, fee, total or user id from the client.
    The result type is exported from a plain (non-`"use server"`) module.

R8. The form renders a button beside the code field: `type="button"`, attribute
    `data-discount-code-apply`, visible text `Apply`, accessible name `Apply discount code`. Clicking
    it with a field that is not blank after trimming calls `previewDiscountCode` once with the
    field's value. Clicking it with a blank field calls nothing. While a call is pending, the button
    is `disabled` and its visible text is `Checking…`. Pressing Enter in the code field does what
    clicking Apply does, and it does not submit the form (`placeOrderAction` is not called).

R9. The form holds one checked-code result, initialised from the page's pre-filled preview (`null`
    when there is none) and replaced by each `previewDiscountCode` answer. The result is *current*
    only while `normaliseCode(field value) === result.code` and no re-check (R14) is pending. Under
    the field, one element with `id="discountCode-note"` and attribute `data-discount-code-note`
    shows:
    - current and `ok`: `Code {CODE} applied: −£x.xx.`, not in the `text-danger` class;
    - current and refused: the result's `message`, in `text-danger`;
    - not current, field not blank, no call pending: `Press Apply to check this code.`;
    - a call pending, or the field blank: nothing (the element is absent).

    The input's `aria-describedby` is `discountCode-note` whenever the element is present, and is
    absent otherwise. The element sits inside a container with `aria-live="polite"` that is always
    rendered.

R10. The checkout page passes `pencePerPointRedeemed` inside `redeemable`. The points input is
     tracked. Its *requested* value follows `redeemPointsIntent`'s rule in
     `features/checkout/place-order.ts`: trimmed, `Number()`, and anything that is not a positive
     integer counts as 0. The shown points result is `clampRedemption({ requestedPoints,
     balancePoints, pencePerPointRedeemed, minRedeemPoints, subtotalPence, deliveryFeePence,
     existingDiscountPence })`. The subtotal and delivery fee are the page's pre-discount figures.
     `existingDiscountPence` is the current R9 code's `discountPence` when it is current and `ok`,
     otherwise 0. An element with attribute `data-points-note` under the points field shows:
     - requested 0: nothing (the element is absent);
     - `pointsSpent === requested`: `{n} points: −£x.xx`;
     - `0 < pointsSpent < requested`: `{pointsSpent} of {requested} points can be used on this
       order: −£x.xx`;
     - `pointsSpent === 0` with requested > 0: `Those points can't be used on this order.`

R11. A client provider wraps both the form and the summary on the checkout page, and holds R9's
     result and R10's points request. The summary's figures render from it. For the pre-discount
     totals `T` the page computed, code discount `C` (R9's current `ok` `discountPence`, else 0) and
     points discount `P` (R10's `discountPence`):
     - `[data-checkout-summary-total]` and the total in `[data-checkout-total]` both show
       `formatPrice(T.subtotalPence − C − P + T.deliveryFeePence)`. That value equals
       `computeTotals(lines, rules, C + P, method).totalPence`.
     - The summary shows a row `Discount ({CODE})` with `−£x.xx` only when `C > 0`, and a row
       `Points ({pointsSpent})` with `−£x.xx` only when `P > 0`, between Subtotal and the delivery
       row.
     - The summary's item list, Subtotal row and delivery row are unchanged.

R12. `[data-checkout-total]` shows these notes, in this order, and no others:
     - `Includes code {CODE} (−£x.xx).` when `C > 0`;
     - `Includes {pointsSpent} points (−£x.xx).` when `P > 0`;
     - `Your code isn't included until you press Apply.` when the field is not blank and R9's result
       is not current.

     The strings `Any discount code you enter comes off before payment.`, `Any discount code or
     points you use come off before payment.` and `Any points you use come off before payment.` no
     longer appear in `components/`.

R13. A component test file renders the provider, the form and the summary together, with
     `previewDiscountCode` mocked. It passes and covers: Apply with an `ok` answer (R9 note, R11
     rows and both totals); a refused answer; editing the field after an `ok` answer (discount
     dropped, the R9 "Press Apply" note and the R12 note shown); Enter in the field (the mock is
     called and the form's submit handler is not); a blank-field click (the mock is not called);
     the three R10 note states; and a code plus points where the code's discount reduces the points
     that fit (proving `existingDiscountPence` is passed).

R14. When the pre-discount `subtotalPence` or `deliveryFeePence` the page passes differs from the
     figures the current checked code was priced against, and that code is not blank, the form calls
     `previewDiscountCode` again for it. Until the answer arrives, the code is not current (R9). R13's
     test file covers this by re-rendering with a changed delivery fee: the mock is called a second
     time, and the shown total uses the second answer.

R15. `features/checkout/place-order.ts`, `claimCode`'s body and `spendPoints` are unchanged by this
     slice, apart from R2's path through `previewCode`.

## Part C — `#957`, reorder and cancel notice

R16. `addCartItems` in `lib/repositories/cart.ts` returns one report entry per merged product line
     (after `sumLinesByProduct`): `{ productId, requested, added, kind }`, where `kind` is `"added"`,
     `"partial"`, `"unavailable"` or `"at_limit"`. It is computed inside the existing transaction
     from the quantity read there:
     - stock (from `stockMap`) ≤ 0: `unavailable`, `added` 0, no write;
     - otherwise `next = clampQuantity(existing, requested, stock)`. If `next ≤ existing`, the result
       is `at_limit`, `added` 0, and nothing is written (an existing line is never lowered).
       Otherwise `next` is written, `added = next − existing`, and the kind is `added` when
       `added === requested`, else `partial`.

     When no line has stock, no cart is created (as today) and every entry is `unavailable`.
     `CartRepository.addItems` and `getCartRepository().addItems` return this report.
     `features/cart/add-bundle-to-cart.ts` and `features/cart/add-list-to-cart.ts` are unchanged.

R17. A plain module `lib/restore-notice.ts` exports a builder and a parser for this URL format:
     `/cart?restored={source}&of={n}&lines={entries}`. `source` is `reorder` or `cancelled`, and `n`
     is the number of distinct lines the action tried to restore (deleted-product lines included).
     `entries` is the non-`added` lines joined by `|`, each as `{k}~{added}~{requested}~{name}`, with
     `k` being `u` (unavailable), `p` (partial) or `h` (at limit). Every `|` in a name is replaced by
     `/` before joining. Query values are URL-encoded. When no line is non-`added`, the builder
     returns exactly `/cart`. The parser:
     - returns no notice unless `restored` is `reorder` or `cancelled` and at least one entry is
       valid;
     - splits each entry on its first three `~` only, so a name may contain `~`;
     - drops an entry whose `k` is not `u`, `p` or `h`, whose counts are not non-negative integers,
       whose name is empty after trimming, or which is `p` without `0 < added < requested`;
     - keeps the first 50 valid entries, and cuts each name to 120 characters;
     - uses `n = k` (the kept entry count) when `of` is missing, not an integer, or less than `k`.

R18. `reorderItems` reports each order line with `productId === null` as `u`, using the item's
     `productName` and `quantity`. It sends the other lines through `addItems` and maps their report
     entries back to `productName` by `productId`. It redirects to R17's URL with
     `restored=reorder`. When every line went in in full, it redirects to `/cart`, as today.

R19. `cancelOrder` does the same with `restored=cancelled`, only inside its existing
     `PENDING_PAYMENT` branch. Every other path still redirects to plain `/cart`.

R20. `/cart` renders R17's parsed notice through a component `components/cart/RestoreNotice.tsx`: an
     element with `role="status"` and attribute `data-restore-notice`, containing:
     - a heading: for `reorder`, `{k} of {n} {item|items} from your past order couldn't be added in
       full:`; for `cancelled`, `{k} of {n} {item|items} from your cancelled order couldn't be put
       back in full:`. `item` is used when `n` is 1;
     - one list item per entry: `u` → `{name}: not available right now`; `p` → `{name}: only
       {added} of {requested} added, limited stock`; `h` → `{name}: none added, your cart already
       holds all we have in stock`;
     - when `k < n`, a final line `Everything else is in your cart.`

     With no valid notice, nothing with `data-restore-notice` renders. The bundle notice
     (`?unavailable=`) renders exactly as before.

R21. Unit tests pass and cover: R16's four kinds plus the no-lowering case (cart holds 5, stock 4,
     reorder adds 1: no write, `at_limit`) and the no-stock-anywhere case (no cart created); R17's
     round trip plus each parser rule; and R20's strings for `reorder` and `cancelled`, including
     `n` = 1 and the `k < n` trailing line.

## Part D — `#753`, live browser checks

R22. In a real browser (the Claude in Chrome extension or an interactive Chrome, not curl or a
     script), under `npm run preview`, with a vendor offering both methods:
     (a) `#748` R14, widened. On `/checkout`, type a full name and a phone number. Type a valid code
         and apply it. Switch Delivery → Click & Collect, then back. After each switch settles, the
         name, phone and code fields still hold what was typed, and the code is shown as applied
         again (R9's applied note), with a total that matches the summary for the method now
         selected.
     (b) `#748` R18. In the header, choose Click & Collect, open the postcode control and submit a
         different deliverable postcode. Once the transition settles, the header and `/checkout`
         both still show Click & Collect.

     A failure is fixed in this slice through `/fix`.

## Live checks (Parts A–C)

R23. Live under `npm run preview`: a typed code is checked on Apply. Both totals then include it, an
     edit removes it, and the order placed after Apply is charged the shown total.

R24. Live: a signed-in shopper's own `REF-` code is refused with R1's message, both when pre-filled
     from `/?ref=` and when typed and applied, and on submit. A different shopper's code is not
     refused for that reason.

R25. Live: a reorder with one product deactivated and one product with less stock than ordered lands
     on `/cart` with R20's notice naming both, and the cart holds the stock-limited quantity.

R26. Live: cancelling an unpaid order whose product was deactivated after it was placed lands on
     `/cart` with R20's `cancelled` notice naming it.

R27. Live: points. When the dev demo shopper's balance is at least the vendor's `minRedeemPoints`,
     entering points updates both totals and the R10 note, and the order placed is charged the shown
     total. When it is not, R27 is reported as unverified, not as a pass.

## Docs, copy and gates

R28. `docs/shopper-help/shopping-guide.md` states all four of these: (a) a code is checked by
     pressing **Apply** (or Enter), and the total then includes it, or the reason it can't be used
     is shown; (b) a shopper's own referral code can't be used on their own orders; (c) the
     checkout total updates as points are entered, up to what the order can take; (d) after a
     reorder or a cancelled payment, the cart lists anything that could not be added in full. The
     guide's existing "Referral links" bullet stays true.

R29. `npx vitest run tests/vendor-neutral-copy.test.ts` passes. No new string in R1, R5, R8–R12 or
     R20 names a vendor or a grocery item.

R30. `npm run kms:validate` and `npm run kms:check-generated` exit 0, and a real Next build of
     `kms/site-internal` exits 0 after `npm run kms:assemble:internal`.

R31. `CHANGELOG.md` updated (Gate 4), with an entry naming `#973`, `#957`, `#753` and `#972`.

R32. `lint`, `typecheck`, `test`, `format:check` and `build` all remain green after this slice.
