# #956, #967 — Honest add-to-cart feedback and a checkout total that includes a pre-filled code (build notes)

Written at the end of Build (2026-10-03), before the pre-validation Clear. Built in the main
checkout (no worktree), on branch `feature/956-967-add-feedback-referral-total`, cut from
`origin/staging` at `8455890`. Commits: `fceca89` (spec), `06d33c7` (R11 amendment), `23e4559`
(implementation, tests, docs), then this file and the CHANGELOG.

## What changed and why

**Part A — `#956`.**

- `lib/cart-rules.ts`: `AddOutcome`, `MAX_ADD_QUANTITY` (99), `isValidAddDelta` and the pure
  `classifyAdd(current, delta, stock)`, which returns `{ write, outcome }`. `clampQuantity` is
  unchanged and still used by `addCartItems`/`setCartQuantity`.
- `lib/repositories/cart.ts` `addCartItem`: refuses `INVALID_QUANTITY` and `SOLD_OUT` **before**
  `ensureCart`, so a refused add never creates a `Cart` row. Inside the existing `$transaction` it
  classifies from the quantity read there and upserts only when `write !== null`. The transaction
  returns the outcome. `CartRepository.addItem` is typed `Promise<AddOutcome>`. `lib/cart-service.ts`
  needed no edit (it returns whatever `addCartItem` returns).
- `features/cart/add-to-cart.ts`: validates `delta` first (before the guest cookie is issued) and
  returns the outcome. It still exports only one `async function`; `AddOutcome` is imported as a type
  from `lib/cart-rules.ts`.
- `components/cart/CartFeedback.tsx` (new): `CartFeedbackProvider` plus `useCartFeedback()`. The
  `[data-cart-feedback]` region is always mounted (`role="status"`, `aria-atomic="true"`,
  `position: fixed`, bottom, `z-[60]` so it sits above the quick-view drawer's `z-50`). The message
  pill renders only while there is text, so the empty region has height 0. It empties 4000 ms after
  the latest message. The default context (no provider) is a no-op, so existing component tests
  that render `AddToCartButton` bare still work.
- `components/cart/add-feedback-copy.ts` (new): `addFeedbackMessage` (R7's table) and
  `addFeedbackButtonText` (R8's short texts). `null` means a rejected call.
- `components/cart/AddToCartButton.tsx`: required `productName`; the `added` boolean became a
  `flash` state (`added` / `other` with text / null) with one timer, cleared on unmount; a
  `try`/`catch` around `addToCart`; one `announce()` per click; the R6 names. The `icon` variant is
  behaviourally unchanged (it isn't used by any call site).
- Call sites: `ProductCard.tsx`, `QuickViewDrawer.tsx` and `app/(storefront)/products/[slug]/page.tsx`
  pass `productName`.
- `components/layout/StorefrontChrome.tsx` mounts the provider (see Deviations for where).
- `scripts/verify-mobile-layout.ts`: `documentScrollWidth` on every object; `cartFeedback`
  (`{ text, left, right }` of the region's pill, or `null`) on the first width's object when
  `--add-first` is passed. Its `CLICK_FIRST_ADD` still matches the card button by visible text
  ("Add"), which is unchanged; only the accessible name changed.

**Part B — `#967`.**

- `lib/repositories/discounts.ts`: `previewCode(db, vendorId, input: ClaimCodeInput)` →
  `PreviewResult` (`{ ok: true } & ClaimedCode` or `{ ok: false, reason }`). It is `claimCode`'s old
  read half moved verbatim (lookup, the `#696` `seq`/`uses` split, `evaluateCode`). `claimCode` now
  calls it and keeps only the compare-and-set `updateMany`. `tests/discounts-repository.test.ts` is
  untouched and passes.
- `lib/discounts-service.ts`: `getDiscountRepository().preview(input)` over `getPrisma()` (HTTP; it
  opens no transaction).
- `app/(storefront)/checkout/page.tsx`: `preDiscount = computeTotals(lines, rules, 0, method)`; a
  module-level `previewPrefilledCode()` normalises the cookie, previews it with `signedInUserId`
  against `preDiscount.subtotalPence`/`deliveryFeePence`, and returns `{ code, ok, discountPence }`,
  `{ code, ok: false, message }` or `null` (no cookie, or the preview threw, which is logged with
  `console.error`). `totals` is recomputed with the discount only when `ok`. `CheckoutForm` now gets
  `totalPence={preDiscount.totalPence}` (always the pre-code total) plus `prefilledCode` (carrying the
  discounted `totalPence` when `ok`). `CheckoutSummary` gets `discountLabel` `Discount (CODE)` when
  `ok`.
- `components/checkout/CheckoutForm.tsx`: exports the `PrefilledCode` type. The code input is now
  controlled (`value` + `onChange`) from `useState(initialDiscountCode ?? "")`. `appliedCode` /
  `refusedCode` are derived by comparing `normaliseCode(value)` with `prefilledCode.code`. The
  `[data-discount-code-note]` paragraph has `id="discountCode-note"`, referenced by
  `aria-describedby` only while shown. `discountCode` was already excluded from the form's
  `localStorage` restore (`delete details.discountCode`), so the controlled input does not fight it.
- `components/checkout/CheckoutSummary.tsx`: optional `discountLabel`, default `"Discount"`.

**Tests (all new):** `tests/cart-add-outcome.test.ts` (R20, R21; 17 tests),
`tests/add-to-cart-feedback.test.tsx` (R22; 12), `tests/discounts-preview.test.ts` (R23; 8),
`tests/checkout-prefilled-code.test.tsx` (R24; 3).

**Docs:** `docs/shopper-help/shopping-guide.md` 1.2.0 (two new bullets, "What was added" and
"Referral links"); `docs/developer-portal/app-conventions.md` 1.4.0 (new section
"Add-to-cart feedback (`#956`)"). `ARTIFACT_INDEX.md` and the runbook `docs.ts` regenerated.

**Issues filed:** `#972` (self-referral, R32) and `#973` (live preview of a typed code and of
points, deferred from `#967`). Both are on Project #2, Phase P10, Status Backlog.

## Decisions taken during the build

- **Refusals before `ensureCart`.** `INVALID_QUANTITY` and `SOLD_OUT` return before any cart
  lookup or creation, rather than inside the transaction, so a refused add doesn't create an empty
  `Cart` row for a guest. `classifyAdd` repeats both checks, which keeps it total and testable on
  its own.
- **The delta is validated twice:** in the action (so a bad client value never issues a guest
  cookie or touches the repository) and in the repository (which is callable from scripts).
- **Re-announcing identical messages:** `announce()` empties the region and refills it on a 0 ms
  timeout, so two identical messages in a row (two sold-out clicks) each change the text.
- **The card's visible text** is still `Add`/`Added`. On a card, any non-`added` outcome leaves the
  visible text at `Add`, and the region carries the message.
- **The `full` variant's `aria-label` stays `label`** while a non-`added` text shows, so the
  accessible name is stable and the region does the announcing.
- **No logger:** the preview failure uses `console.error`, the same as
  `app/(storefront)/error.tsx`; it reaches Workers Logs.

## Deviations from the spec

1. **Provider placement (R10).** R10 says the provider wraps "the same subtree `QuickViewProvider`
   wraps". It is mounted one level further in: inside the `brandStyle(profile.primitives)` div,
   wrapping the header, page, footer and floating elements. The region is painted with
   `bg-primary`, and `brandStyle()` sets that token inline on that div. Outside it, the token falls
   back to `:root`, so SriMart would get Aheed's colour (CLAUDE.md, "Design tokens & per-vendor
   branding"). It is still rendered exactly once, outside every `ProductCard`, `AddToCartButton` and
   `QuickViewDrawer`, which is what R10 exists to guarantee.
2. **R11 timing amended** in its own commit, `06d33c7`, before the script was changed. "Read within
   1 s of the click" became "read as soon as the region has text (polled up to 10 s)", because the
   text appears only once the server action returns.
3. **`shopping-guide.md` still carries `#968`'s wrong sentence.** Its "Discounts" bullet says codes
   are applied in the cart. R30's statements were added as new bullets beside it rather than fixing
   that line, because `#968` is out of this slice's scope. A validator reading R30 should find both
   statements present. The pre-existing contradiction is `#968`'s to fix.

## Known-shaky areas

- **R27–R29 (the money path) have never run live.** Unit and component tests prove `previewCode`
  equals `claimCode` against fakes, and the form's switching. The real page → `previewCode` →
  `computeTotals` path, the cookie decoding (`RewardsLauncher` writes it with
  `encodeURIComponent`; codes are `[A-Z0-9-]` so this is expected to be harmless), the
  `0 used · 5 left` no-write check, and the order total equal to the Stripe amount are all unproven.
- **The checkout page's preview has no unit test**; R15 is checked by reading. Look at the `ok` /
  refused / `null` branching and that `CheckoutForm.totalPence` is the **pre-discount** total.
- **The desktop summary does not follow field edits** (accepted in `plan.md`, now `#973`). Don't
  log it as a defect; check only that the label names the code.
- **R25(c), the stale-page sold-out case,** depends on the drawer's `inStock` having been true at
  render. If the quick view refetches stock on open, open it before zeroing the stock in the other
  tab.
- **A smoke run only, not validation:** under `npm run preview` (`http://localhost:8787`),
  `/categories/fruit-veg` returned 200, with one `data-cart-feedback` and no duplicate
  `aria-label="Add … to cart"` values. `MSYS_NO_PATHCONV=1 npx tsx scripts/verify-mobile-layout.ts
  --base http://localhost:8787 --path /categories/fruit-veg --widths 360 --add-first --then
  /checkout` printed `documentScrollWidth: 360` and `cartFeedback: { text: "Added Baby Spinach 200g
  to your cart (1 in cart).", left: 16, right: 344 }`, and `/checkout` rendered.
  **Git Bash trap:** without `MSYS_NO_PATHCONV=1`, `--path /categories/…` is rewritten into a
  Windows path, and the script refuses it with a message saying so.
- **`#797`:** a full `npx vitest run` writes fixture orders into the dev database. Run R25–R29
  before the full suite, or don't read those orders as this slice's.
