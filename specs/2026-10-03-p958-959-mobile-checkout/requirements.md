# #958, #959 — Mobile checkout (requirements / acceptance criteria)

These close **#958** (checkout and sign-in fields have no `autocomplete` tokens) and **#959**
(checkout step numbers repeat or skip, and on mobile the total sits below the submit button).
Both come from the seventh Discover pass (`docs/research/discovery-log.md`, 2026-10-02). They were
approved at `/propose` on 2026-10-03, with the owner choosing a mobile-only total row above the
button.

In one line: every field that collects the shopper's own data carries the right token; section
numbers are counted from the sections actually rendered; and below `md` a total row sits directly
above a button now labelled "Continue to payment". The reasoning, both token tables and the
section table are in `plan.md`. Read its sections 1 to 5 before validating.

**Definitions used below:**

- **`M`** means `npx tsx scripts/verify-mobile-layout.ts`. It prints one JSON object per width.
  In Git Bash, pass `--path` and `--then` values **without** a leading slash (see the script's own
  refusal message).
- **Aheed** is `http://localhost:8787` and **SriMart** is `http://srimart.localhost:8787`, both
  under `npm run preview` (never `npm run dev`; the checkout page reads the database).
- **Aheed checkout run** means `M --base http://localhost:8787 --path categories/fruit-veg
  --add-first --then checkout --widths <list>`. **SriMart checkout run** is the same with the
  SriMart base and `--path categories/sri-electronics`.
- **Below `md`** means under 768px wide.
- **Document coordinates** means `getBoundingClientRect()` plus `window.scrollY`, so values on one
  page can be compared regardless of scroll.

## Measuring instrument

R1. `scripts/verify-mobile-layout.ts` accepts `--then <path>`. With `--add-first`, once the
    first card's item is in the cart, every width (the first included) is measured at `<path>`
    rather than `--path`. `--then` without `--add-first` exits 2 with a usage message. A run
    without `--then` behaves as before this slice. `package.json` gains no dependency.
R2. Every printed object carries a `formInputs` key. It is an array, in document order, of every
    `input` element inside a `form` whose `type` is not `hidden`, each as
    `{ id, name, type, autocomplete }`. `autocomplete` is the element's `autocomplete` attribute
    exactly as written, or `null` when absent.
R3. Every printed object carries a `checkout` key. It is `null` when the page has no
    `[data-checkout-form]`. Otherwise it is an object with:
    - `headings`: the trimmed `textContent` of each `h2` inside `[data-checkout-form]`, in document
      order.
    - `totalRow`: `null` if there is no `[data-checkout-total]`, else
      `{ displayed, top, bottom, text }`.
    - `submit`: `{ top, bottom, text }` for the form's `button[type=submit]`.
    - `summaryTop`: the top of `[data-checkout-summary]`, or `null`.
    - `summaryTotal`: the trimmed text of `[data-checkout-summary-total]`, or `null`.

    `displayed` is true only when computed `display` is not `none` and the box has non-zero width
    and height. Positions are document coordinates in CSS px. The script prints no pass/fail
    verdict.

## Autocomplete tokens (#958)

R4. In `components/checkout/CheckoutForm.tsx`, the inputs named `recipientName`, `email`,
    `phone`, `line1`, `line2`, `city`, `county` and `postcode` carry `autoComplete` values `name`,
    `email`, `tel`, `address-line1`, `address-line2`, `address-level2`, `address-level1` and
    `postal-code` respectively. `discountCode` keeps `autoComplete="off"`. No other input in that
    file gains or changes an `autoComplete` attribute.
R5. In `features/auth/components/`, the `<input>` elements carry these `autoComplete` values in
    document order: `LoginForm.tsx` `email`, `current-password`; `RegisterForm.tsx` `name`,
    `email`, `new-password`; `ResetPasswordForm.tsx` `new-password`; `ForgotPasswordForm.tsx`
    `email`. Each file has exactly that many `<input` elements.
R6. `tests/autocomplete-tokens.test.ts` exists and asserts R4 and R5 by reading those five source
    files. For each auth file it asserts the exact ordered list of tokens. For `CheckoutForm.tsx`
    it asserts each named input's token. Deleting any single one of those `autoComplete`
    attributes makes the test fail.
R7. An Aheed checkout run at width 390 shows, in `formInputs`, the R4 token on every one of the
    eight named inputs that the page renders, and `recipientName`, `email` and `phone` are always
    among them. The address inputs render only when the method is Delivery. With no postcode
    cookie, a vendor that offers collection may default to Click & Collect
    (`lib/fulfilment-service.ts`, `defaultFulfilmentMethod`). The five address tokens are
    therefore also checked live in R9's browser session, where Delivery is selected.
R8. `M --base http://localhost:8787 --path login --widths 390` shows `formInputs` tokens `email`,
    `current-password` in that order. `--path register` shows `name`, `email`, `new-password`.
    `--path forgot-password` shows `email`.
R9. In `CheckoutForm.tsx`, the `line1` input still carries
    `list={streetSuggestions.length > 0 ? "line1-street-suggestions" : undefined}`, and the
    `<datalist id="line1-street-suggestions">` and its "Streets near this postcode:" hint are
    unchanged. In a browser under `npm run preview`, on Aheed's checkout with **Delivery**
    selected (if the Fulfilment Method section is shown), enter postcode `MK17 8NL` and press
    **Find Address**. The hint paragraph lists at least one street, and `#line1` has both
    `list="line1-street-suggestions"` and `autocomplete="address-line1"`. In the same session,
    `#line2`, `#city`, `#county` and `#postcode` carry `address-line2`, `address-level2`,
    `address-level1` and `postal-code`. `MK17 8NL` returned three streets at #764's validation
    (2026-09-16). If the lookup returns no streets here, the row is **blocked by environment**
    (reference data not synced) and is reported as such, not passed.
R10. `git diff --name-only origin/staging -- features/checkout lib/delivery-pricing.ts
    lib/fulfilment-service.ts prisma` prints nothing. `lib/delivery-pricing.ts` holds
    `encodeDeliveryQuote`. The `place-order` refusal for a postcode
    priced differently from the quote (#890) is unchanged by this slice.

## Step numbers (#959)

R11. `lib/checkout-sections.ts` exists, does not start with `"use server"`, and exports a pure
    function. It takes `{ offerCollection, method, offerDeliverySlots, hasRedeemable }` and returns
    the ordered array of section keys rendered, using exactly the conditions in `plan.md` §2's
    table, in that table's order. It also exports each key's heading title as given in that table.
R12. `tests/checkout-sections.test.ts` covers all 16 combinations of `offerCollection` (true or
    false) × `method` (`DELIVERY` or `COLLECTION`) × `offerDeliverySlots` × `hasRedeemable`. For
    each it asserts the exact key list, so numbers are always 1 to n with no repeat or gap. Among
    those, it names these cases with these exact lists:
    - collection offered, delivery, slots on, no loyalty: `fulfilment, contact, address, time,
      discount`
    - the same with loyalty: `fulfilment, contact, address, time, loyalty, discount`
    - collection offered, Click & Collect, no loyalty: `fulfilment, contact, time, discount`
    - collection not offered, delivery, slots off, no loyalty: `contact, address, discount`
R13. Every section `h2` in `CheckoutForm.tsx` gets its number from R11's function, rendered as
    `N. Title`, including Fulfilment Method. `grep -nE '\? "[0-9]" : "[0-9]"'
    components/checkout/CheckoutForm.tsx` prints nothing.
R14. An Aheed checkout run and a SriMart checkout run at width 390 each print `checkout.headings`
    where the n-th entry starts with `n. ` for every n. Each list's titles equal the list R11's
    function returns for that vendor's configuration (`offerCollection`, `offerDeliverySlots`),
    the method the page rendered, and `hasRedeemable` false, since the script is a guest. The
    method is the checked Fulfilment Method radio, or Delivery when that section is absent.
R15. If Aheed's dev configuration has `offerCollection` true, choosing **Click & Collect** on its
    checkout in a browser renders headings that read `1. Fulfilment Method`, `2. Contact
    information`, `3. Choose a Time`, `4. Discount code`. If it is false, this row is satisfied by
    R12 alone, and the validator records the configuration it found.

## Total above the button (#959)

R16. `app/(storefront)/checkout/page.tsx` passes `totals.totalPence` to `CheckoutForm` as a
    `totalPence` prop. That is the same `totals` object it passes to `CheckoutSummary`, and the
    page does not compute a second total.
R17. `CheckoutForm` renders an element with `data-checkout-total` whose class list contains
    `md:hidden`. It is the last element before the submit button, and it contains the word
    `Total` and `formatPrice(totalPence)`. Below it, the note reads exactly "Any discount code or
    points you use come off before payment." when `redeemable` is non-null, and exactly "Any
    discount code you enter comes off before payment." otherwise. The form element carries
    `data-checkout-form`. `CheckoutSummary`'s `<aside>` carries `data-checkout-summary`, and its
    Total `<dd>` carries `data-checkout-summary-total`.
R18. Aheed and SriMart checkout runs at widths `360,390` each show: `checkout.totalRow.displayed`
    is `true`; `totalRow.bottom` ≤ `submit.top`; `submit.bottom` ≤ `summaryTop`; and the amount
    in `totalRow.text` (its `£` figure) equals `summaryTotal`.
R19. Aheed and SriMart checkout runs at widths `768,1280` each show `checkout.totalRow.displayed`
    `false` and a non-null `summaryTop`.

## Button label

R20. The submit button reads `Continue to payment`, and `Continuing to payment…` while pending.
    No `.tsx` file under `components`, `app` or `features` contains the string literals
    `"Place order"` or `"Placing order…"` (double quotes included). A code comment naming the old
    label is allowed. An Aheed checkout run at 390 shows `checkout.submit.text` equal to
    `Continue to payment`.

## Documentation and gates

R21. `docs/developer-portal/app-conventions.md` has a new section stating that every input
    collecting the user's own data (name, contact, address, credentials) carries the matching
    HTML `autocomplete` token, citing WCAG 2.2 SC 1.3.5, and naming
    `tests/autocomplete-tokens.test.ts` as the guard. The front-matter `version` is bumped and
    `updated` changed.
R22. `docs/shopper-help/shopping-guide.md`'s "Cart & Checkout" section has a bullet stating that
    the browser can fill in saved details, the total shows above **Continue to payment**, and the
    exact amount after any code or points is shown on the secure payment page. The front-matter
    `version` is bumped and `updated` changed.
R23. `npx vitest run tests/vendor-neutral-copy.test.ts` passes. None of the new user-facing
    strings in R17 and R20 names a vendor, a product or a trade.
R24. `CHANGELOG.md` has an entry naming #958 and #959 (Gate 4).
R25. `npm run lint`, `npm run typecheck`, `npm run format:check`, `npx vitest run` (run alone),
    `npm run build`, `npm run kms:validate`, and `npm run kms:assemble:internal` followed by the
    Next build in `kms/site-internal` all exit 0. CI on the PR (`quality / quality`,
    `quality / kms`, `docs-gates`) is green.
