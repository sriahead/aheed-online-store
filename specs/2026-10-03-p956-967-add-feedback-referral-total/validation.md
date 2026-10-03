# #956, #967 — Honest add-to-cart feedback and a checkout total that includes a pre-filled code (validation)

> **Testing Strategy (Lean 80/20 Model)**
> Provide enough testing to give confidence without creating unnecessary or duplicate tests. Avoid testing the same behaviour multiple times at different levels unless doing so provides additional confidence.
>
> **The Main Principle:**
> - **Build:** Did we build the component correctly?
> - **Validate:** Does the feature work correctly in the real system?
> - **Release:** Is the complete system safe, reliable, and ready for users?

## Testing Areas

This slice touches a cart write path, the checkout's displayed money, and accessibility, so it has
unit, component, and live preview checks. Pure rules (`classifyAdd`, `previewCode`) are unit tested.
The button, the region and the checkout field are component tested. The real cart, discount and
order behaviour is proven once in `npm run preview` against the dev database. **Never use
`npm run dev`** for R25–R29: it cannot load `@prisma/client/wasm` and silently renders an error
state.

## Setup for the live rows (R25–R29)

1. Stop any running preview and kill the whole `node`/`workerd` chain (CLAUDE.md, "Windows shell").
   Then run `npm run preview` and open the local URL it prints (call it `$BASE`). Use the Aheed
   host mapping the playbook describes (`docs/developer-portal/local-dev-playbook.md`).
2. Sign in to `/staff` as the dev store-admin demo account (credentials in `.dev.vars`/`secrets`,
   per `docs/developer-portal/env-setup.md` "Demo accounts").
3. **Trap:** a full `npx vitest run` writes fixture orders into the dev database (`#797`). Run the
   live rows before, or independently of, the full suite. Do not read leftover fixture orders as
   this slice's.
4. Read the region's text in the browser with
   `document.querySelector('[data-cart-feedback]').textContent` within 4 seconds of the click.
   It empties after that (R10).

## Validation Steps

| Req | Testing Area | How to verify |
|-----|--------------|---------------|
| R1  | Unit | Read `lib/cart-rules.ts`: `AddOutcome` and `classifyAdd` are exported with the five branches in R1's order. `grep -n "lib/db" lib/cart-rules.ts` prints nothing. Branch behaviour is proven by R20's test. |
| R2  | Unit | Read `addCartItem` in `lib/repositories/cart.ts`: its return type is `Promise<AddOutcome>`. `classifyAdd` is called with the quantity read inside `$transaction`. `cartItem.upsert` sits behind a non-null write quantity. Behaviour is proven by R21's test. |
| R3  | Unit | Read the three signatures: `CartRepository.addItem`, `getCartRepository().addItem` and `addToCart` all return `Promise<AddOutcome>`. In `features/cart/add-to-cart.ts`, the delta check precedes `getCartRepository()`. Read every `export` in that file: each one is `export async function` (a `type` import is fine; an exported constant, type or class is a fail). |
| R4  | Regression | `git diff origin/staging -- components/cart/CartQuantityStepper.tsx` prints nothing. `git diff origin/staging -- lib/repositories/cart.ts`: no hunk falls inside the `addCartItems` or `setCartQuantity` function bodies. |
| R5  | Unit | `npm run typecheck` exits 0 (the prop is required, so a missing call site fails). `grep -n "productName=" components/product/ProductCard.tsx components/product/QuickViewDrawer.tsx "app/(storefront)/products/[slug]/page.tsx"` shows one `AddToCartButton` usage in each file. |
| R6  | Unit | Read `AddToCartButton.tsx`: (a) the card Add button's `aria-label` is the `label` prop; (b) the four pre-add minus/plus buttons (card and drawer) are named `Decrease quantity of ` / `Increase quantity of ` followed by the product name; (c) the three disabled out-of-stock buttons are named with the product name followed by ` is out of stock`, and their visible text is `Out of stock`. The `icon` variant is behaviourally unchanged. |
| R7  | Component | R22's test passes, with one assertion per row of R7's table matching the string exactly. |
| R8  | Component | R22's test passes for the `full` variant. Read `AddToCartButton.tsx` for the `drawer` strings and the 1500/4000 ms durations. The card's `Added` text is gated on `outcome.kind === "added"`. |
| R9  | Component | R22's rejected-call case passes: the region shows the rejection message, the button shows `Try again`, and the button is not `disabled` afterwards. No error is thrown out of the render. |
| R10 | E2E | Read `components/layout/StorefrontChrome.tsx`: the provider appears exactly once. Run `grep -rn "data-cart-feedback" components "app/(storefront)" "app/(landing)"`. It matches only the region's own component and comments (do not search `app/` whole: the generated runbook `app/(admin)/staff/runbook/docs.ts` quotes the docs). In preview, on any category page, `document.querySelectorAll('[data-cart-feedback]').length === 1`. The element has `role="status"` and `aria-atomic="true"`, and `getComputedStyle(el).position === "fixed"`. While empty, `el.textContent === ""` and its height is 0 or it has class `sr-only`. After an add the text is present; 4 s later it is empty. |
| R11 | E2E | Read the script diff for the `documentScrollWidth` and `cartFeedback` fields. Run `npx tsx scripts/verify-mobile-layout.ts --base $BASE --path /categories/<a category with stock> --widths 360 --add-first`. It exits 0. The 360 object has a non-empty `cartFeedback.text`, `cartFeedback.left >= 0`, `cartFeedback.right <= 360` and `documentScrollWidth <= 360`. |
| R12 | Unit | R23's test passes, including its throw-on-write fake. Read `previewCode`: no write method is called. |
| R13 | Unit | Read `claimCode`: it calls `previewCode`, and its only remaining Prisma call is `discountCode.updateMany`. `git diff origin/staging -- tests/discounts-repository.test.ts` prints nothing. `npx vitest run tests/discounts-repository.test.ts` passes. |
| R14 | Unit | Read `lib/discounts-service.ts` for `preview`. `npx vitest run tests/repository-purity.test.ts tests/repository-client-injection.test.ts` passes. |
| R15 | Unit | Read `app/(storefront)/checkout/page.tsx`: the trimmed-cookie guard; the preview's `userId` is `signedInUserId`; its inputs come from a `computeTotals(…, 0, …)` call; the `ok` path passes `discountPence` into `computeTotals`; a `try`/`catch` falls back to pre-discount totals with no refusal; and `fulfilmentProgress` takes the pre-discount `subtotalPence`. Live behaviour is R27/R28. |
| R16 | E2E | Covered live by R27 (summary line and total). The no-cookie case: in preview, clear `aheed_referral_code` and load `/checkout`. The summary has no `Discount (` text. |
| R17 | Component | R24's test passes: (a), then (b) after the input changes to another value, then (a) again after it changes back in lower case. Live (a) is covered by R27. |
| R18 | Component | R24's refused-preview case passes: `[data-discount-code-note]` shows the message, and the input's `aria-describedby` equals the note's `id`. Live, it is covered by R28. |
| R19 | E2E | Covered by R27's "`0 used · 5 left` after three loads" and R29's "`1 used · 4 left` after submit". |
| R20 | Unit | `npx vitest run <the classifyAdd test file>` passes. Read it for cases covering R1(a) with delta 0, 100 and 1.5, plus (b), (c) with `current > stock`, (d) and (e). |
| R21 | Unit | `npx vitest run <the addCartItem test file>` passes. Read it for a no-`upsert` assertion in each of the four named `none` cases. |
| R22 | Component | `npx vitest run <the AddToCartButton test file>` passes. Read it for the six R7 rows, R8 `full` texts, the rejection case and the R6(a) name. |
| R23 | Unit | `npx vitest run <the previewCode test file>` passes. Read it for the seven named scenarios compared against `claimCode`, and for a fake whose write methods throw. |
| R24 | Component | `npx vitest run <the CheckoutForm test file>` passes. Read it for the match / edit / lower-case re-match sequence and the refused case. |
| R25 | E2E | In preview, at `/staff/inventory` set a chosen in-stock product's stock to 2. Empty the cart. Open that product's quick view, set the quantity to 5 and click add. The region reads exactly R25(a)'s message with the product's name, and `/cart` holds 2. Open quick view again and add 1. The region reads `Your cart already has all the {name} we have in stock (2). Nothing was added.`, and `/cart` still holds 2. Keep quick view open on a second product with stock. In another tab, set its stock to 0. Back in the first tab, click add. The region reads `{name} is sold out. Nothing was added.`, and `/cart` does not contain it. Restore both stocks afterwards. |
| R26 | E2E | In preview at a desktop width, empty the cart, open a category page and click Add on an in-stock card. The region reads `Added {name} to your cart (1 in cart).`, and that card now shows the stepper (its minus button is named `Remove ` plus the product name plus ` from cart`). Then save `curl -s $BASE/categories/<slug>` to a file and extract every `aria-label="Add … to cart"` value from it (for example with `grep -o`). No value appears twice, and the number of values equals the number of in-stock cards on that page. |
| R27 | E2E | At `/staff/discounts`, create `SPEC967A`: fixed amount £3.00, minimum 0, max per customer blank, remaining redemptions 5. In a fresh guest browser profile, add at least £5.00 of goods. Visit `$BASE/?ref=SPEC967A`, then `/checkout`. The summary shows `Discount (SPEC967A)` and `−£3.00`. `[data-checkout-summary-total]` and `[data-checkout-total]` (read through `textContent`; the latter is `md:hidden` but in the DOM) both equal subtotal − £3.00 + delivery, as shown in the summary's own rows. Reload `/checkout` twice more. `/staff/discounts` shows `SPEC967A` with `0 used · 5 left`. |
| R28 | E2E | Create `SPEC967B`: fixed £3.00, minimum 0, max per customer 1, remaining redemptions blank. As a guest with a cart, visit `$BASE/?ref=SPEC967B`, then `/checkout`. `[data-discount-code-note]` reads `Please sign in to use that discount code.`, and the summary has no `Discount (` line. Sign in as a dev demo shopper and visit `/?ref=SPEC967B`, then `/checkout`. The summary shows `Discount (SPEC967B)` and `−£3.00`. |
| R29 | E2E | Continue R27's guest session. Note `[data-checkout-total]`'s figure and fill the checkout with a deliverable dev address. Submit. You are redirected to Stripe's test checkout, and its amount equals the noted figure. Then, at `/staff/orders`, open the new order. Its total equals the noted figure, and `/staff/discounts` shows `SPEC967A` with `1 used · 4 left`. Payment does not need to be completed. Afterwards, deactivate `SPEC967A` and `SPEC967B`. |
| R30 | Docs | Read `docs/shopper-help/shopping-guide.md`, section `## Cart & Checkout`: it has the two statements of R30. |
| R31 | Docs | Read `docs/developer-portal/app-conventions.md`: a section names `data-cart-feedback` and gives the `ProductCard` → `CartQuantityStepper` swap as the reason. |
| R32 | Process | `GH_TOKEN=$(gh auth token -u sriahead) gh issue list --search "isSelfReferral in:body" --state open` lists the issue. It appears in `gh project item-list 2 --owner sriahead --format json --limit 600` with Phase P10 and Status Backlog. `build-notes.md` cites its number. |
| R33 | Unit | `npx vitest run tests/vendor-neutral-copy.test.ts` passes. Read the new strings in R7, R8, R17 and R18: none names a vendor or a grocery item. |
| R34 | Docs | `npm run kms:validate` exits 0. `npm run kms:check-generated` exits 0. Run `npm run kms:assemble:internal`, then `cd kms/site-internal && npx next build --webpack; echo "exit=$?"`. The printed exit is 0, read directly, not through `tail`. |
| R35 | Process | `git diff origin/staging -- CHANGELOG.md` adds an entry naming `#956` and `#967`. |
| R36 | Regression | `npm run lint`, `npm run typecheck`, `npm run format:check` and `npm run build` each exit 0. Then run `npx vitest run` alone (not beside or straight after the build). It exits 0, and its summary's file count equals the number of test files with no "failed to start" or worker error. CI on the PR (`gates`, `quality/quality`, `quality/kms`) is green, and CI is ground truth. |
