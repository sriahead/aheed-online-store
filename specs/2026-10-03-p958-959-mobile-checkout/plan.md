---
id: p958-959-mobile-checkout-plan
title: "#958, #959 — Mobile checkout: autofill tokens, step numbers, total before payment (plan)"
audience: [dev]
type: spec
status: draft
version: "1.0.0"
updated: 2026-10-03
visibility: internal
summary: Checkout and sign-in fields get autocomplete tokens (WCAG 1.3.5). Checkout step numbers are counted from the sections actually shown. On mobile the order total sits just above a button relabelled "Continue to payment". No schema or server change.
tags: [storefront, checkout, mobile, accessibility, auth, p10]
related: [app-conventions, discovery-log, p960-962-mobile-browse-density-plan]
---

# #958, #959 — Mobile checkout (plan)

Slice 2 of the mobile programme. It comes from the seventh Discover pass
(`docs/research/discovery-log.md` 1.7.0, 2026-10-02), which filed both issues. Slice 1
(`specs/2026-10-02-p960-962-mobile-browse-density/`) made browsing denser. This slice fixes the
last step: the checkout form a shopper fills in on a phone.

- **#958:** no checkout or sign-in field carries an `autocomplete` token. That is a WCAG 2.2
  SC 1.3.5 (AA) failure. It also means a phone cannot offer the shopper's saved name, phone,
  address or password, so a guest types about eight fields on a small keyboard.
- **#959:** the numbered section headings repeat or skip in most configurations (1, 2, 3, 3 or
  1, 3, 3), because the numbers are hardcoded ternaries. Below `md` the order summary stacks
  under the form, so the total appears only after the submit button.

The owner approved this scope at `/propose` on 2026-10-03, and chose the "total row above the
button" placement over moving the whole summary or adding a sticky bottom bar.

**Goal:** a shopper on a phone can let the browser fill their details, sees step numbers that
count 1, 2, 3… with no gaps or repeats, and sees the order total immediately before the button
that sends them to pay.

## Scope (this slice)

### 1. Autocomplete tokens (#958)

`components/checkout/CheckoutForm.tsx`:

| Field (`name`) | Token |
|---|---|
| `recipientName` | `name` |
| `email` | `email` |
| `phone` | `tel` |
| `line1` | `address-line1` |
| `line2` | `address-line2` |
| `city` | `address-level2` |
| `county` | `address-level1` |
| `postcode` | `postal-code` |

`address-level2` is the post town and `address-level1` the county; that is how the HTML
standard maps UK addresses. `discountCode` keeps `autoComplete="off"`. `redeemPoints`, `notes` and
the read-only `email-display` input are not the shopper's personal data to autofill, so they are
left alone.

`features/auth/components/`:

| Form | Inputs in document order |
|---|---|
| `LoginForm.tsx` | `email`, `current-password` |
| `RegisterForm.tsx` | `name`, `email`, `new-password` |
| `ResetPasswordForm.tsx` | `new-password` |
| `ForgotPasswordForm.tsx` | `email` |

The issue did not list `ForgotPasswordForm`. It has an email field, so it is included.

A guard test, `tests/autocomplete-tokens.test.ts`, reads these five source files and fails if a
token is removed or changed. A new section in `docs/developer-portal/app-conventions.md` states
the rule for future forms and names that test.

**Two existing behaviours must still work, and neither needs new code:**

- **Street suggestions (#764).** `line1` carries `list="line1-street-suggestions"`, a datalist of
  nearby street names, plus a visible "Streets near this postcode: …" hint. Adding
  `autocomplete="address-line1"` must not remove either. The visible hint is plain text, so the
  suggestion is never lost even if a browser prefers its autofill list over the datalist.
- **A postcode autofilled from outside the delivery area.** The page is priced from the
  `delivery-postcode` cookie, and the form sends that quote as `quotedDeliveryRules`.
  `place-order` already refuses when the address postcode resolves to different charges (#890).
  Autofill is just another way of typing a different postcode, so this slice does not touch
  `features/checkout/` or the delivery modules.

The lookup's `fillIfUntouched` only writes `city`/`county` when the field is empty, so it does not
overwrite a value the browser autofilled.

### 2. Step numbers (#959)

A new plain module, `lib/checkout-sections.ts` (not `"use server"`), exports a pure function.
Given `offerCollection`, `method`, `offerDeliverySlots` and whether loyalty is redeemable, it
returns the ordered keys of the sections the form renders. It applies the same conditions the JSX
uses today:

| Key | Rendered when | Heading title |
|---|---|---|
| `fulfilment` | `offerCollection` | Fulfilment Method |
| `contact` | always | Contact information |
| `address` | `method === "DELIVERY"` | Delivery address & instructions |
| `time` | `(method === "DELIVERY" && offerDeliverySlots) \|\| method === "COLLECTION"` | Choose a Time |
| `loyalty` | `redeemable` | Loyalty points |
| `discount` | always | Discount code |

A section's number is its 1-based position in that list. Every heading renders as `N. Title`.
**Fulfilment Method is numbered too**; it is the only section that had no number before. The
hardcoded ternaries (`{offerCollection ? "1" : "1"}` and the rest) are removed.

The numbers stay, rather than being dropped. On a phone they are the only progress cue.

### 3. Total above the button, on mobile (#959)

`app/(storefront)/checkout/page.tsx` already computes `totals` once through `computeTotals`, and
`CheckoutSummary` renders them. The page now also passes `totals.totalPence` to `CheckoutForm` as
a new `totalPence` prop. The form renders a row immediately before the submit button. The row
carries `data-checkout-total` and the class `md:hidden`, and shows:

- `Total` and `formatPrice(totalPence)`, from `components/product/format-price.ts`, the same
  formatter `CheckoutSummary` uses.
- One line of explanation. With loyalty redeemable: **"Any discount code or points you use come
  off before payment."** Without: **"Any discount code you enter comes off before payment."**

The note is there because the shown total can't include a code or points typed into this form.
Both are validated on the server inside `place-order`. Stripe's hosted page then shows the exact
amount. The full `CheckoutSummary` keeps its position and content. At `md` and wider it is
already beside the form, so the row is hidden there.

`CheckoutSummary`'s Total `<dd>` gets a `data-checkout-summary-total` attribute so the measuring
script can compare the two amounts.

### 3a. The checkout page overflowed every narrow screen (added at Build)

Found during Build's first measurement on 2026-10-03, and already present before this slice. At
390px both vendors reported `viewportWidth` 961 on `/checkout`, and 1272 at 768px. The form and
summary grid (`grid gap-6 md:grid-cols-[1fr_18rem]`) has an implicit `auto` column below `md` and
`1fr` at `md`. Neither can shrink below its content's min-content width. `SlotPicker`'s day strip
(`components/checkout/SlotPicker.tsx`) holds about 14 non-shrinking day buttons, roughly 900px,
so the column grew to about 944px. Chrome then rendered the whole page zoomed out, with tiny text,
on any phone. The strip's own `overflow-x-auto` never engaged.

The fix is one class on the page grid: `grid-cols-1 md:grid-cols-[minmax(0,1fr)_18rem]`. It is in
this slice, as R18a, because without it the mobile checkout this slice exists to fix still renders
at the wrong scale, and R18's measurements would describe a zoomed-out page. `SlotPicker` itself is
unchanged.

### 4. Button label

"Place order" becomes **"Continue to payment"**, and the pending label "Placing order…" becomes
**"Continuing to payment…"**. In every deployed environment `place-order` redirects to Stripe's
hosted Checkout (`features/checkout/place-order.ts`, `placed.redirectUrl`). The label is not
"Pay £X" because the amount can still change on the server after submission (discovery-log
challenge, 2026-10-02). Locally and in CI, where `STRIPE_SECRET_KEY` is unset, the stub adapter
lands on the order page instead. That is a dev-only path and does not change the label.

### 5. Measuring instrument

`scripts/verify-mobile-layout.ts` (slice 1) gets two additions. It still measures and never
judges.

- **`--then <path>`**, only with `--add-first`. Once the first card's item is in the cart, every
  width is measured at `<path>` instead of `--path`. That is how it reaches `/checkout`, which
  redirects an empty cart to `/cart`. Without `--then` its behaviour is unchanged.
- **Two new keys on every printed object:**
  - `formInputs`: every non-hidden `input` inside a `form`, in document order, as
    `{ id, name, type, autocomplete }`.
  - `checkout`: `null` unless the page has `[data-checkout-form]`. Otherwise it holds the form's
    `h2` texts, the total row's position and text, the submit button's position and text, and the
    summary's top and Total text.

The checkout form gets `data-checkout-form` and the summary `<aside>` gets
`data-checkout-summary`, in the same way slice 1 added `[data-product-grid]`.

### 6. Shopper guide

`docs/shopper-help/shopping-guide.md`, "Cart & Checkout", gains one bullet. It says the browser
can fill in saved details, the total is shown above **Continue to payment**, and the exact amount,
after any code or points, is shown on the secure payment page.

## Deliberately excluded

- **#956** (add-to-cart feedback) and **#964** (the 44px `tap` token on the remaining controls)
  are later slices.
- **The `tap` token on checkout controls.** The submit button is already full width and about
  48px tall. Sizing the radios and "Find Address" belongs to #964.
- **The referral-cookie discount code is not reflected in the shown total.** The page passes
  `0` as the discount to `computeTotals` even when `initialDiscountCode` pre-fills the field. That
  was already true of `CheckoutSummary`. The new note covers it honestly, and pricing a code before
  submission would be a server change.
- **`shipping`/`billing` section prefixes** on the address tokens (`shipping address-line1`).
  Plain tokens satisfy SC 1.3.5 and match the issue. Prefixes are a refinement with no measured
  need.
- **`name` attributes on the auth forms' controlled inputs.** Password managers key on the
  `autocomplete` token. Adding `name` changes nothing they submit, since those forms submit from React state, not
  from form fields.
- **A total row at `md` and wider**, or a sticky bar. The owner chose the mobile-only row.
- **The shopper guide's existing claim that a promotional code is applied "in your cart".** The
  field is on the checkout page. Correcting it is a separate copy fix; this slice only adds its
  own bullet.
- **Hardcoded `£` in `formatPrice`** (#654) is unchanged; the row reuses the existing formatter.

## Open items carried forward

- **#442** (accessibility launch validation) has not run. This slice fixes one SC 1.3.5 failure
  it would have found, but it does not audit the rest of the form.
- How Safari on iOS and Chrome on Android actually offer autofill can only be confirmed on real
  devices. Validation checks the tokens in the DOM and the datalist in desktop Chrome. Real-device
  confirmation is post-deploy evidence, not a gate.
