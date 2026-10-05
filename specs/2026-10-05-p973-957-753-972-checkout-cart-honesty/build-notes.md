# #973, #957, #753, #972 — Checkout and cart honesty (build notes)

Written at the end of Build (2026-10-05), before the pre-validation Clear. Built in the main
checkout (no worktree) on branch `feature/973-957-753-972-checkout-cart-honesty`, cut from
`origin/staging` at `010bfbf`. Commits: `bfbb7e4` (spec), `52b2a39` (`#972`, `#973`), `3b6f0c4`
(`#957`), a docs commit (shopper guide, KMS index), then this file and the CHANGELOG.

Gates run locally at the end of Build: `npm run lint`, `typecheck`, `format:check` and `build` each
exited 0. `npx vitest run`, run alone, exited 0 with **209 files, 2750 tests**. That is 206 files in
`tests/`, plus `tests/a11y/` (2) and `lib/config.test.ts`. That is local output, not validation; CI
is ground truth.

## What changed and why

**Part A — `#972` (R1–R4).**

- `lib/discounts.ts`: `"OWN_REFERRAL_CODE"` added to `CodeRefusalReason`. `refusalMessage` returns
  `You can't use your own referral code.`
- `lib/repositories/discounts.ts` `previewCode`: selects `description`. Straight after the
  `if (!row)` return and before `evaluateCode`, it refuses when `extractReferralPrefix(code)` is not
  null **and** `isSelfReferral(extractReferrerUserId(row.description), input.userId)`. `claimCode`
  is untouched and reaches the refusal through `previewCode`.
- Tests: `tests/discounts.test.ts` (the all-reasons list, plus the exact string) and
  `tests/discounts-preview.test.ts` (a new `describe` block covering own code in preview, in claim
  with no write, outranking `INACTIVE`, and R3 (a), (b) and (c)).

**Part B — `#973` (R5–R15).**

- `lib/checkout-code-preview.ts` (new, plain): the `CodePreview` type and `PREVIEW_FAILED_MESSAGE`.
- `lib/checkout-preview-service.ts` (new): `previewCheckoutCode(rawCode)`. A blank code, an empty
  cart or a pending merge returns `null`. Otherwise it resolves identity, cart summary, vendor,
  method, session and `getShopperDeliveryRules` itself, computes `computeTotals(…, 0, method)` and
  calls `getDiscountRepository().preview`. Any throw is logged and returns the fallback message as a
  refusal.
- `features/checkout/preview-code.ts` (new, `"use server"`): only `previewDiscountCode(code)`.
- `components/checkout/CheckoutPricing.tsx` (new, client): `CheckoutPricingProvider` and
  `useCheckoutPricing()`. It holds the code field, the points field, one checked-code result tagged
  with the basis it was priced against, `pending`, and a sequence ref so a late answer cannot
  overwrite a newer one. It derives `currentCode`, `codeDiscountPence`, `requestedPoints`, `points`
  (`clampRedemption` with `existingDiscountPence`) and `totalPence`. An effect re-runs the check
  when the basis no longer matches (R14). It also exports `parseRequestedPoints`, which copies
  `redeemPointsIntent`'s rule.
- `components/checkout/CheckoutForm.tsx`: reads the provider. It renders the Apply button (Enter
  calls `preventDefault` and then applies), the `aria-live="polite"` container holding
  `#discountCode-note`, a controlled points input with `[data-points-note]`, and the R12 notes in
  `[data-checkout-total]`. The props `initialDiscountCode`, `totalPence` and `prefilledCode`, and the
  exported `PrefilledCode` type, are **removed**. `redeemable` gains `pencePerPointRedeemed`.
- `components/checkout/CheckoutSummary.tsx`: now `"use client"`, and reads the provider. The `totals`
  and `discountLabel` props are removed. A local `totals` object keeps the Subtotal, delivery and
  Total markup textually unchanged. There are two conditional rows, `Discount ({CODE})` and
  `Points ({n})`.
- `app/(storefront)/checkout/page.tsx`: `previewPrefilledCode` is deleted, and the page calls
  `previewCheckoutCode(initialDiscountCode)`. `CheckoutPricingProvider` wraps the grid holding the
  form and the summary. `fulfilmentProgress` now takes `preDiscount.subtotalPence`; it took
  `totals.subtotalPence` before, which was always the pre-discount subtotal anyway, since
  `computeTotals` never changes the subtotal.
- Tests: `tests/checkout-code-apply.test.tsx` (new, R13 and R14, 11 tests).
  `tests/checkout-prefilled-code.test.tsx` was rewritten to render through the provider, with the
  removed "comes off before payment" note replaced by the R12 strings.

**Part C — `#957` (R16–R21).**

- `lib/cart-rules.ts`: `BulkAddKind`, `BulkAddLine` and the pure `classifyBulkAdd(existing,
  requested, stock)`, which is `clampQuantity` plus "never write at or below `existing`".
- `lib/repositories/cart.ts` `addCartItems`: returns `BulkAddLine[]` in merged-line order. It
  classifies inside `$transaction` from the quantity read there. With no stock on any line it
  returns all `unavailable` without creating a cart. `CartRepository.addItems` is typed
  `Promise<BulkAddLine[]>`. `lib/cart-service.ts` needed no edit.
- `lib/restore-notice.ts` (new, plain): `buildRestoreNoticeUrl(source, lines)` and
  `parseRestoreNotice(params)`, in R17's format, with the caps (50 entries, 120-character names).
- `lib/restore-lines.ts` (new, plain): `restoredLines(items, addItems)`. Deleted-product lines
  (empty `productId`) become `unavailable` under `productName`, and live lines go through `addItems`
  and are named back by `productId`. Shared by both actions.
- `features/orders/reorder-items.ts` and `features/checkout/cancel-order.ts`: both redirect to
  `buildRestoreNoticeUrl(...)`. In `cancelOrder`, only the `PENDING_PAYMENT` branch changes the
  destination, which defaults to `/cart`.
- `components/cart/RestoreNotice.tsx` (new) and `app/(storefront)/cart/page.tsx`: the notice is
  rendered above the merge prompt, after the unchanged bundle notice.
- Tests: `tests/cart-bulk-add-report.test.ts` (new, 9 tests) and `tests/restore-notice.test.tsx`
  (new: builder, parser rules, `restoredLines`, and the component copy).

**Docs:** `docs/shopper-help/shopping-guide.md` 1.4.0. The "Discounts" bullet now covers Apply and
Enter. "Referral links" gains the own-code sentence. A new "Reordering" bullet is under
"Cart & Checkout". "Redeeming Points" now says the total updates. `docs/developer-portal/app-conventions.md` 1.5.0 adds a bulk-add bullet and a new
"Checkout pricing (`#973`)" section. `ARTIFACT_INDEX.md` and
`app/(admin)/staff/runbook/docs.ts` were regenerated.

**Issues filed** (Project #2, Phase P10, Backlog): `#987` (two users can derive the same referral
code; the owner is only a description string), `#988` (code checks are an unthrottled existence
oracle), `#989` (the bundle notice could use `addCartItems`' report).

## Decisions taken during the build

- **The provider owns the state, and the form and summary need it.** `CheckoutForm` and
  `CheckoutSummary` throw if rendered without `CheckoutPricingProvider`. This was chosen over a
  form-local fallback, because a fallback would let the two drift apart again, which is the defect
  `#973` removes. Only the checkout page renders either component.
- **`previewCheckoutCode` resolves the cart itself, inside its `try`.** A failure reading the cart
  therefore also becomes the R5 fallback message, not a thrown page. On page load this reads the cart
  and delivery rules a second time when a cookie code is present (accepted in `plan.md`).
- **"Current" requires `pending` to be false,** for any pending check, not only R14's re-check. The
  spec's R9 sets the note to absent while a call is pending. Treating an in-flight Apply as not
  current is the simpler, consistent reading.
- **R14 re-check is an effect,** with `// eslint-disable-next-line react-hooks/set-state-in-effect`.
  `eslint --report-unused-disable-directives` confirms the directive is needed. The effect waits for
  `!pending`, and each answer stores the basis it was priced at, so it cannot loop.
- **`restoredLines` puts live lines first, then deleted ones,** not in the original order. The
  notice lists the short lines in that order.
- **The points input is controlled from `"0"`,** matching the old `defaultValue={0}`. It is still
  excluded from the `localStorage` restore (`delete details.redeemPoints`), as before.
- **The Apply button** uses `min-h-tap lg:min-h-0`, the `#964` tap convention, and the "Find Address"
  button's colours.
- `lib/repositories/discounts.ts` now imports `lib/referrals.ts`, which imports
  `components/product/format-price`, a pure module. `tests/repository-purity.test.ts` and
  `tests/repository-client-injection.test.ts` pass.

## Deviations from the spec

None. Two readings a validator might query:

1. **R11's "item list, Subtotal row and delivery row are unchanged".** Their JSX is textually
   unchanged; they still read `totals.subtotalPence`, `totals.deliveryFeePence` and
   `totals.totalPence`. `totals` is now a local object built from the provider, not a prop, and the
   file gained `"use client"`. The diff shows the new header and props, not those rows.
2. **R17's "query values are URL-encoded".** The builder uses `URLSearchParams`, which writes `|`
   as `%7C`, leaves `~` literal, and writes a space as `+`. The parser reads through
   `searchParams`, so a hand-built URL with `%20` or `+` for spaces parses the same way. R20's
   `%7C`-separated example was checked under preview.

## Known-shaky areas

- **Nothing in Part B has run live with Apply.** It is proven by component tests with a mocked
  action. Smoke only: under `npm run preview`, `scripts/verify-mobile-layout.ts --widths 390
  --add-first --then /checkout` rendered `/checkout` through the provider with
  `documentScrollWidth` 390, and `[data-checkout-total]` and the summary total both `£1.39`. The real
  server action round trip, the session lookup in `previewCheckoutCode`, and R22–R24 are unproven.
- **R14 in a real browser.** A method switch calls `setFulfilmentMethod`, then the server re-renders
  and the provider receives a new `basis`. The re-check depends on the provider **not remounting**.
  If the page remounts it, client state (the typed code, the applied result) is lost, and that is
  `#753`'s R14 failing. R22(a) is exactly this check. Look there first.
- **Points (R27).** Dev data may not have a balance at or above the minimum; see `plan.md`. Also, the
  points input keeps `max={balancePoints}`. Typing more than the balance shows the
  `{spent} of {requested}` note, but native validation then blocks submit until the value is lowered.
  That predates this slice and is unchanged.
- **The cancel path (R26)** needs `Order.confirmationToken`. Read it from the dev DB with a scratch
  script (`validation.md`, step 5). Also, `cancelUnpaid` releases stock **before** the restore, so
  only a deactivated product (not an out-of-stock one) reliably produces a `u` line.
- **`at_limit` on reorder** is reported for a product the cart already holds at stock, even though
  the shopper may consider that fine. The copy says so neutrally (`none added, your cart already
  holds all we have in stock`).
- **Smoke checks under preview (not validation):** `/cart?restored=reorder&of=3&lines=u~0~2~Alpha%7Cp~1~3~Beta`
  rendered R20's four strings exactly. `restored=bogus` rendered no `data-restore-notice`.
  `?unavailable=Foo%7CBar` still rendered the bundle heading. `/checkout` with no cart still
  redirects 307 to `/cart`.
- **`#797`:** the full `npx vitest run` above wrote fixture orders into the dev database. Do not read
  those orders as this slice's when running R25 and R26.
